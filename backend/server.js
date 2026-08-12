const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// Environment Verification
const requiredEnv = [
    'DATABASE_URL',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD_HASH',
    'GEMINI_API_KEY',
    'ALLOWED_ORIGINS',
    'NODE_ENV'
];
for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
        console.error(`FATAL CONFIGURATION ERROR: Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Custom Security Headers Middleware (OWASP/Helmet alternative)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Prevents clickjacking
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevents MIME-sniffing
    res.setHeader('X-XSS-Protection', '1; mode=block'); // XSS Filter protection
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); // Prevents referrer leaks
    next();
});

// CORS Middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
        const isAllowed = allowedOrigins.includes(origin) || 
                          (process.env.NODE_ENV === 'development' && 
                           (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
                            /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
                            /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
                            /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/.test(origin)));
        if (isAllowed) {
            res.header('Access-Control-Allow-Origin', origin);
        }
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Database-backed session verification middleware
const requireAuth = async (req, res, next) => {
    // Allow CORS preflight requests
    if (req.method === 'OPTIONS') {
        return next();
    }
    
    // Allow login endpoint without auth
    if (req.path === '/auth/login' || req.originalUrl === '/api/auth/login') {
        return next();
    }

    // Allow deprecated endpoints to bypass auth so they return 410 Gone immediately
    const deprecated = ['/sales', '/purchase-invoices', '/sales-returns', '/purchase-returns', '/payments', '/vendor-payments'];
    if (req.method === 'POST' && (deprecated.includes(req.path) || deprecated.some(p => req.originalUrl === `/api${p}`))) {
        return next();
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing session token' });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const sessionRes = await pool.query(
            "SELECT username, expires_at, revoked_at FROM active_sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()",
            [tokenHash]
        );

        if (sessionRes.rows.length === 0) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
        }

        // Update last_used_at in background
        pool.query("UPDATE active_sessions SET last_used_at = NOW() WHERE token_hash = $1", [tokenHash]).catch(err => {});

        req.username = sessionRes.rows[0].username;
        next();
    } catch (err) {
        console.error('Session validation failed:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

app.use('/api', requireAuth);

// Prevent browser caching during development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const { Pool } = require('pg');

// Initialize PostgreSQL Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper to initialize the DB table

async function insertAuditLog(client, { tableName, recordId, action, oldData, newData, req, transactionId }) {
    await client.query(`
        INSERT INTO audit_logs (
            table_name, record_id, action, old_data, new_data,
            performed_by_id, performed_by_name, ip_address, user_agent, 
            transaction_id, request_method, endpoint
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
        tableName, 
        recordId, 
        action, 
        oldData ? JSON.stringify(oldData) : null, 
        newData ? JSON.stringify(newData) : null,
        req.username || 'System',
        req.username || 'System',
        req.ip,
        req.get('User-Agent'),
        transactionId,
        req.method,
        req.originalUrl || req.url
    ]);
}

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS store (
                id SERIAL PRIMARY KEY,
                data JSONB NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT);
            CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, name TEXT);
            CREATE TABLE IF NOT EXISTS tag_settings (id TEXT PRIMARY KEY, data JSONB);
            
            CREATE TABLE IF NOT EXISTS document_sequences (
                id SERIAL PRIMARY KEY,
                document_type TEXT NOT NULL,
                prefix TEXT NOT NULL,
                financial_year TEXT NOT NULL DEFAULT 'ALL',
                current_number INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT unique_doc_fy UNIQUE (document_type, financial_year)
            );
            
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                code TEXT, item_name TEXT, hsn TEXT, unit TEXT, category TEXT, description TEXT,
                sale_price NUMERIC, purchase_price NUMERIC, gst_tax NUMERIC, opening_stock NUMERIC,
                stock_value NUMERIC, opening_stock_date DATE, low_stock_warning NUMERIC
            );
            
            CREATE TABLE IF NOT EXISTS vendors (
                id TEXT PRIMARY KEY,
                vendor_name TEXT, contact_person TEXT, phone_number TEXT, email TEXT,
                gst_treatment TEXT, gstin TEXT, pan_number TEXT, opening_balance NUMERIC,
                as_of_date DATE, bill_address TEXT, bill_city TEXT, bill_state TEXT,
                bill_pincode TEXT, bill_country TEXT, ship_address TEXT, ship_city TEXT,
                ship_state TEXT, ship_pincode TEXT, ship_country TEXT, pending_to_pay NUMERIC,
                vendor_credit_balance NUMERIC NOT NULL DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                customer_name TEXT, contact_person TEXT, phone_number TEXT, email TEXT,
                gst_treatment TEXT, gstin TEXT, pan_number TEXT, opening_balance NUMERIC,
                as_of_date DATE, bill_address TEXT, bill_city TEXT, bill_state TEXT,
                bill_pincode TEXT, bill_country TEXT, ship_address TEXT, ship_city TEXT,
                ship_state TEXT, ship_pincode TEXT, ship_country TEXT, pending_to_receive NUMERIC
            );
            
            CREATE TABLE IF NOT EXISTS purchase_invoices (
                id TEXT PRIMARY KEY,
                pi_no TEXT UNIQUE, date DATE, ref_no TEXT, due_date DATE, payment_terms TEXT,
                vendor_id TEXT, vendor_name TEXT, sub_total NUMERIC, discount_percent NUMERIC,
                discount_amount NUMERIC, total_tax NUMERIC, amount NUMERIC, paid_amount NUMERIC,
                pending_to_pay NUMERIC, note TEXT, items JSONB
            );
            
            DO $$
            BEGIN
                BEGIN
                    ALTER TABLE purchase_invoices ADD COLUMN items JSONB;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD COLUMN pending_to_pay NUMERIC;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD COLUMN paid_amount NUMERIC;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD COLUMN note TEXT;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD CONSTRAINT purchase_invoices_pi_no_key UNIQUE (pi_no);
                EXCEPTION WHEN duplicate_table OR others THEN NULL;
                END;
                
                -- Fix Units Table
                BEGIN
                    ALTER TABLE units ADD COLUMN unit_prefix TEXT;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;
                BEGIN
                    ALTER TABLE units ADD COLUMN accept_decimal BOOLEAN;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;

                -- Fix Items Table
                BEGIN ALTER TABLE items ADD COLUMN name TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN category_name TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN unit_name TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN gst_rate TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN cess NUMERIC; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN tax_type TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN tax_amount NUMERIC; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN selling_price NUMERIC; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN mrp NUMERIC; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN stock NUMERIC; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN minimum_stock NUMERIC; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN location TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN purchase_tax_type TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN selling_tax_type TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN conversions JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE items ADD COLUMN images JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
                
                BEGIN
                    ALTER TABLE items ADD CONSTRAINT items_code_key UNIQUE (code);
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
                
                BEGIN
                    ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_invoice_no_key UNIQUE (invoice_no);
                EXCEPTION WHEN OTHERS THEN NULL;
                END;

                -- Alter Vendors Table
                BEGIN
                    ALTER TABLE vendors ADD COLUMN vendor_credit_balance NUMERIC NOT NULL DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;
                BEGIN
                    ALTER TABLE vendors ADD COLUMN vendor_advance_balance NUMERIC NOT NULL DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;

                -- Alter Purchase Returns Table
                BEGIN
                    ALTER TABLE purchase_returns ADD COLUMN invoice_id TEXT REFERENCES purchase_invoices(id);
                EXCEPTION WHEN duplicate_column OR OTHERS THEN NULL;
                END;
                BEGIN
                    ALTER TABLE purchase_returns ADD COLUMN vendor_credit NUMERIC DEFAULT 0;
                EXCEPTION WHEN duplicate_column OR OTHERS THEN NULL;
                END;
                BEGIN
                    ALTER TABLE purchase_returns ADD COLUMN cash_received NUMERIC DEFAULT 0;
                EXCEPTION WHEN duplicate_column OR OTHERS THEN NULL;
                END;
                BEGIN
                    ALTER TABLE purchase_returns ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
                EXCEPTION WHEN duplicate_column OR OTHERS THEN NULL;
                END;
                BEGIN
                    ALTER TABLE purchase_returns ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
                EXCEPTION WHEN duplicate_column OR OTHERS THEN NULL;
                END;
                BEGIN
                    ALTER TABLE purchase_returns ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
                EXCEPTION WHEN duplicate_column OR OTHERS THEN NULL;
                END;

                -- Alter Customers Table
                BEGIN
                    ALTER TABLE customers ADD COLUMN customer_advance_balance NUMERIC NOT NULL DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END;
                
            END $$;
            
            CREATE TABLE IF NOT EXISTS sales_invoices (
                id TEXT PRIMARY KEY,
                invoice_no TEXT UNIQUE, date DATE, ref_no TEXT, due_date DATE, payment_terms TEXT,
                customer_id TEXT, customer_name TEXT, sub_total NUMERIC, discount_percent NUMERIC,
                discount_amount NUMERIC, total_tax NUMERIC, amount NUMERIC, paid_amount NUMERIC,
                pending_to_receive NUMERIC, note TEXT, items JSONB
            );

            CREATE TABLE IF NOT EXISTS sales_returns (
                id TEXT PRIMARY KEY,
                return_no TEXT UNIQUE, date DATE, invoice_no TEXT, customer_id TEXT, customer_name TEXT, 
                sub_total NUMERIC, discount_amount NUMERIC, total_tax NUMERIC, grand_total NUMERIC, 
                refund_amount NUMERIC, store_credit NUMERIC, items JSONB
            );

            CREATE TABLE IF NOT EXISTS purchase_returns (
                id TEXT PRIMARY KEY,
                return_no TEXT UNIQUE, date DATE, invoice_no TEXT, vendor_id TEXT, vendor_name TEXT, 
                sub_total NUMERIC, discount_amount NUMERIC, total_tax NUMERIC, grand_total NUMERIC, 
                refund_amount NUMERIC, store_credit NUMERIC, items JSONB,
                invoice_id TEXT REFERENCES purchase_invoices(id),
                vendor_credit NUMERIC DEFAULT 0,
                cash_received NUMERIC DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS customer_receipts (
                id TEXT PRIMARY KEY,
                receipt_no TEXT UNIQUE NOT NULL,
                date DATE NOT NULL,
                customer_id TEXT NOT NULL REFERENCES customers(id),
                reference_type TEXT NOT NULL,
                amount NUMERIC NOT NULL CHECK (amount > 0),
                allocated_amount NUMERIC NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
                advance_amount NUMERIC NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
                payment_mode TEXT NOT NULL,
                reference_no TEXT,
                reference_date DATE,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT chk_allocated_amt CHECK (allocated_amount <= amount),
                CONSTRAINT chk_advance_amt CHECK (advance_amount <= amount)
            );
            CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer ON customer_receipts(customer_id);

            CREATE TABLE IF NOT EXISTS customer_receipt_allocations (
                id TEXT PRIMARY KEY,
                receipt_id TEXT NOT NULL REFERENCES customer_receipts(id) ON DELETE CASCADE,
                invoice_id TEXT NOT NULL REFERENCES sales_invoices(id),
                allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_allocations_receipt ON customer_receipt_allocations(receipt_id);
            CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON customer_receipt_allocations(invoice_id);

            CREATE TABLE IF NOT EXISTS vendor_payments (
                id TEXT PRIMARY KEY,
                payment_no TEXT UNIQUE NOT NULL,
                date DATE NOT NULL,
                vendor_id TEXT NOT NULL REFERENCES vendors(id),
                reference_type TEXT NOT NULL,
                amount NUMERIC NOT NULL CHECK (amount > 0),
                allocated_amount NUMERIC NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
                advance_amount NUMERIC NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
                payment_mode TEXT NOT NULL,
                reference_no TEXT,
                reference_date DATE,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT chk_v_allocated_amt CHECK (allocated_amount <= amount),
                CONSTRAINT chk_v_advance_amt CHECK (advance_amount <= amount)
            );
            CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);

            CREATE TABLE IF NOT EXISTS vendor_payment_allocations (
                id TEXT PRIMARY KEY,
                payment_id TEXT NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
                purchase_invoice_id TEXT NOT NULL REFERENCES purchase_invoices(id),
                allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_v_allocations_payment ON vendor_payment_allocations(payment_id);
            CREATE INDEX IF NOT EXISTS idx_v_allocations_invoice ON vendor_payment_allocations(purchase_invoice_id);

            CREATE TABLE IF NOT EXISTS active_sessions (
                id TEXT PRIMARY KEY,
                token_hash TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                last_used_at TIMESTAMPTZ DEFAULT NOW(),
                revoked_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_active_sessions_hash ON active_sessions(token_hash);

            -- Phase 2 Database Migrations (Audit Fields and Capture Snapshots)
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS store_credit_applied NUMERIC NULL;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS receivable_reduction NUMERIC NULL;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

            ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS payable_reduction NUMERIC NULL;
            ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

            ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

            ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

            ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
        `);
        
        const res = await pool.query('SELECT COUNT(*) FROM store');
        if (parseInt(res.rows[0].count) === 0) {
            const defaultData = { categories: [], units: [], items: [], customers: [], sales: [], invoice_counter: 1, payments: [], payment_counter: 1, tagSettings: {}, vendors: [], purchase_invoices: [] };
            await pool.query('INSERT INTO store (id, data) VALUES (1, $1)', [defaultData]);
        }
        console.log('PostgreSQL Database initialized successfully!');
    } catch (err) {
        console.error('Error initializing PostgreSQL:', err);
    }
}
initDB();

// Helper to read DB
async function readDB() {
    try {
        const res = await pool.query('SELECT data FROM store WHERE id = 1');
        return res.rows[0].data;
    } catch (err) {
        console.error('Error reading from PostgreSQL:', err);
        return { categories: [], units: [], items: [], customers: [], sales: [], invoice_counter: 1, payments: [], payment_counter: 1, tagSettings: {}, vendors: [], purchase_invoices: [] };
    }
}

// Helper to write DB
async function writeDB(data) {
    try {
        await pool.query('UPDATE store SET data = $1 WHERE id = 1', [data]);
        return true;
    } catch (err) {
        console.error('Error writing to PostgreSQL:', err);
        return false;
    }
}

// Secure Error Helper (prevents detail leakage to client)
function sendError(res, err, friendlyMessage = 'Internal server error') {
    console.error('SERVER ERROR:', err);
    res.status(500).json({ error: friendlyMessage });
}

// API Endpoints

const loginAttempts = new Map();

const loginRateLimiter = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const limit = 5;

    const attempts = loginAttempts.get(ip) || { count: 0, windowStart: now };

    if (now - attempts.windowStart > windowMs) {
        attempts.count = 0;
        attempts.windowStart = now;
    }

    if (attempts.count >= limit) {
        return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    }

    req.attemptsObj = attempts;
    req.clientIp = ip;
    next();
};

// Authentication Login API
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    const { username, password } = req.body;
    
    const isValidUser = (username === process.env.ADMIN_USERNAME);
    const isValidPass = isValidUser && bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH);

    if (isValidUser && isValidPass) {
        // Reset rate limit attempts on successful login
        loginAttempts.delete(req.clientIp);

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const sessionId = generateId();
        
        // 8 hours expiry
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

        try {
            await pool.query(
                "INSERT INTO active_sessions (id, token_hash, username, expires_at) VALUES ($1, $2, $3, $4)",
                [sessionId, tokenHash, username, expiresAt]
            );
            res.json({ success: true, token });
        } catch (err) {
            console.error('Session persistence failed:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        // Increment rate limit attempts
        const attempts = req.attemptsObj;
        attempts.count += 1;
        loginAttempts.set(req.clientIp, attempts);

        res.status(401).json({ error: 'Invalid username or password' });
    }
});

// Authentication Logout API
app.post('/api/auth/logout', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing session token' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await pool.query(
            "UPDATE active_sessions SET revoked_at = NOW() WHERE token_hash = $1",
            [tokenHash]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Logout failed:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Core Settings / Counters (still in JSON store)
app.get('/api/invoice-counter', async (req, res) => {
    try {
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^INV', '', 'g') AS INTEGER)) as max_val FROM sales_invoices WHERE invoice_no ~ '^INV[0-9]+$'");
        const maxVal = parseInt(result.rows[0].max_val) || 0;
        
        const db = await readDB();
        const jsonCounter = db.invoice_counter || 1;
        
        const nextCounter = Math.max(jsonCounter, maxVal + 1);
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching invoice counter:', e);
        res.json({ counter: (await readDB()).invoice_counter || 1 });
    }
});
app.post('/api/invoice-counter', async (req, res) => {
    const db = await readDB(); db.invoice_counter = parseInt(req.body.counter) || 1; await writeDB(db);
    res.json({ success: true, counter: db.invoice_counter });
});

app.get('/api/return-counter', async (req, res) => {
    try {
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^RET', '', 'g') AS INTEGER)) as max_val FROM sales_returns WHERE return_no ~ '^RET[0-9]+$'");
        const maxVal = parseInt(result.rows[0].max_val) || 0;
        
        const db = await readDB();
        const jsonCounter = db.return_counter || 1;
        
        const nextCounter = Math.max(jsonCounter, maxVal + 1);
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching return counter:', e);
        res.json({ counter: (await readDB()).return_counter || 1 });
    }
});
app.post('/api/return-counter', async (req, res) => {
    const db = await readDB(); db.return_counter = parseInt(req.body.counter) || 1; await writeDB(db);
    res.json({ success: true, counter: db.return_counter });
});


app.get('/api/pret-counter', async (req, res) => {
    try {
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^PRET', '', 'g') AS INTEGER)) as max_val FROM purchase_returns WHERE return_no ~ '^PRET[0-9]+$'");
        const maxVal = parseInt(result.rows[0].max_val) || 0;
        const db = await readDB();
        const jsonCounter = db.pret_counter || 1;
        const nextCounter = Math.max(jsonCounter, maxVal + 1);
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching pret counter:', e);
        res.json({ counter: (await readDB()).pret_counter || 1 });
    }
});
app.post('/api/pret-counter', async (req, res) => {
    const db = await readDB(); db.pret_counter = parseInt(req.body.counter) || 1; await writeDB(db);
    res.json({ success: true, counter: db.pret_counter });
});

app.get('/api/payment-counter', async (req, res) => res.json({ counter: (await readDB()).payment_counter || 1 }));
app.post('/api/payment-counter', async (req, res) => {
    const db = await readDB(); db.payment_counter = parseInt(req.body.counter) || 1; await writeDB(db);
    res.json({ success: true, counter: db.payment_counter });
});

app.get('/api/pi-counter', async (req, res) => res.json({ counter: (await readDB()).pi_counter || 1 }));
app.post('/api/pi-counter', async (req, res) => {
    const db = await readDB(); db.pi_counter = parseInt(req.body.counter) || 1; await writeDB(db);
    res.json({ success: true, counter: db.pi_counter });
});

app.get('/api/vendor-payment-counter', async (req, res) => res.json({ counter: (await readDB()).vendor_payment_counter || 1 }));
app.post('/api/vendor-payment-counter', async (req, res) => {
    const db = await readDB(); db.vendor_payment_counter = parseInt(req.body.counter) || 1; await writeDB(db);
    res.json({ success: true, counter: db.vendor_payment_counter });
});

app.get('/api/settings/tag', async (req, res) => res.json((await readDB()).tagSettings || {}));
app.post('/api/settings/tag', async (req, res) => {
    const db = await readDB(); db.tagSettings = req.body; await writeDB(db);
    res.json({ success: true });
});

app.get('/api/payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT cr.id, cr.receipt_no as "arNo", cr.date, c.customer_name as "customerName", 
            c.phone_number as "mobile", 
            COALESCE(c.bill_address, '') || ', ' || COALESCE(c.bill_city, '') as "address",
            cr.amount, cr.allocated_amount as "allocatedAmount", cr.advance_amount as "advanceAmount", 
            cr.payment_mode as "paymentMode", cr.reference_no as "referenceNo", cr.reference_date as "referenceDate",
            cr.note, cr.status, cr.created_at as "createdAt",
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'invoiceNo', si.invoice_no,
                        'date', si.date,
                        'amount', si.amount,
                        'allocated', cra.allocated_amount
                    )
                 ) FROM customer_receipt_allocations cra
                 JOIN sales_invoices si ON si.id = cra.invoice_id
                 WHERE cra.receipt_id = cr.id),
                '[]'::json
            ) as invoices
            FROM customer_receipts cr
            JOIN customers c ON c.id = cr.customer_id
            WHERE cr.status = 'ACTIVE'
        `);
        const dbReceipts = result.rows.map(r => {
            if (r.date) {
                const d = new Date(r.date);
                r.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            r.invoices = (r.invoices || []).map(inv => {
                if (inv.date) {
                    const d = new Date(inv.date);
                    inv.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
                }
                return inv;
            });
            return {
                id: r.id,
                arNo: r.arNo,
                date: r.date,
                customerName: r.customerName,
                mobile: r.mobile,
                address: r.address,
                amount: parseFloat(r.amount) || 0,
                discount: 0,
                invoices: r.invoices
            };
        });

        // Merge with legacy payments
        const db = await readDB();
        const legacyPayments = db.payments || [];
        res.json([...dbReceipts, ...legacyPayments]);
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});
app.post('/api/payments', async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

app.get('/api/vendor-payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT vp.id, vp.payment_no as "pmtNo", vp.date, v.vendor_name as "vendorName",
            vp.vendor_id as "vendorId",
            vp.amount as "paidAmount", vp.allocated_amount as "allocatedAmount", vp.advance_amount as "advanceAmount",
            vp.payment_mode as "paymentMode", vp.reference_no as "referenceNo", vp.reference_date as "referenceDate",
            vp.note, vp.status, vp.created_at as "createdAt",
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'piNo', pi.pi_no,
                        'date', pi.date,
                        'amount', pi.amount,
                        'allocated', vpa.allocated_amount
                    )
                 ) FROM vendor_payment_allocations vpa
                 JOIN purchase_invoices pi ON pi.id = vpa.purchase_invoice_id
                 WHERE vpa.payment_id = vp.id),
                '[]'::json
            ) as invoices
            FROM vendor_payments vp
            JOIN vendors v ON v.id = vp.vendor_id
            WHERE vp.status = 'ACTIVE'
        `);

        const dbPayments = result.rows.map(p => {
            if (p.date) {
                const d = new Date(p.date);
                p.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            p.invoices = (p.invoices || []).map(inv => {
                if (inv.date) {
                    const d = new Date(inv.date);
                    inv.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
                }
                return inv;
            });
            return {
                id: p.id,
                pmtNo: p.pmtNo,
                date: p.date,
                vendorId: p.vendorId,
                vendorName: p.vendorName,
                paidAmount: parseFloat(p.paidAmount) || 0,
                discount: 0,
                invoices: p.invoices
            };
        });

        // Merge with legacy payments
        const db = await readDB();
        const legacyPayments = db.vendor_payments || [];
        res.json([...dbPayments, ...legacyPayments]);
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});
app.post('/api/vendor-payments', async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

// Helper for generating IDs
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}

// 1. Categories
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT name FROM categories');
        res.json(result.rows);
    } catch (e) {
        console.error(e); res.json([]);
    }
});
app.post('/api/categories', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM categories');
        const categories = req.body;
        for (let c of categories) {
            await client.query('INSERT INTO categories (id, name) VALUES ($1, $2)', [generateId(), c.name]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        sendError(res, e, 'Failed to save categories');
    } finally {
        client.release();
    }
});

// 2. Units
app.get('/api/units', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, unit_prefix as "unitPrefix", accept_decimal as "acceptDecimal" FROM units');
        res.json(result.rows);
    } catch (e) {
        console.error(e); res.json([]);
    }
});
app.post('/api/units', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM units');
        const units = req.body;
        for (let u of units) {
            await client.query('INSERT INTO units (id, name, unit_prefix, accept_decimal) VALUES ($1, $2, $3, $4)', 
                [generateId(), u.name, u.unitPrefix || '', u.acceptDecimal === true]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        sendError(res, e, 'Failed to save units');
    } finally {
        client.release();
    }
});

// 3. Items
app.get('/api/items', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, code, name, category_name as "category", unit_name as "unit", hsn, gst_rate as "gstRate", 
            cess, tax_type as "taxType", tax_amount as "taxAmount", purchase_price as "purchasePrice", purchase_price as "purchaseAmount",
            selling_price as "sellingPrice", selling_price as "sellingAmount", mrp, stock, minimum_stock as "minimumStock", 
            location as "itemLocation", purchase_tax_type as "purchaseTaxType", selling_tax_type as "sellingTaxType", 
            conversions, images
            FROM items
        `);
        res.json(result.rows);
    } catch (e) {
        console.error(e); res.json([]);
    }
});
app.post('/api/items', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const items = req.body;
        const incomingCodes = [];
        
        for (let i of items) {
            incomingCodes.push(i.code);
            await client.query(`
                INSERT INTO items (
                    id, code, name, category_name, unit_name, hsn, gst_rate, cess, 
                    tax_type, tax_amount, purchase_price, selling_price, mrp, 
                    stock, minimum_stock, location, purchase_tax_type, selling_tax_type, 
                    conversions, images
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name, category_name = EXCLUDED.category_name, unit_name = EXCLUDED.unit_name, hsn = EXCLUDED.hsn, 
                    gst_rate = EXCLUDED.gst_rate, cess = EXCLUDED.cess, tax_type = EXCLUDED.tax_type, tax_amount = EXCLUDED.tax_amount, 
                    purchase_price = EXCLUDED.purchase_price, selling_price = EXCLUDED.selling_price, mrp = EXCLUDED.mrp, 
                    stock = EXCLUDED.stock, minimum_stock = EXCLUDED.minimum_stock, location = EXCLUDED.location, 
                    purchase_tax_type = EXCLUDED.purchase_tax_type, selling_tax_type = EXCLUDED.selling_tax_type, 
                    conversions = EXCLUDED.conversions, images = EXCLUDED.images
            `, [
                i.id || generateId(), i.code, i.name, i.category || null, i.unit || null, i.hsn || '', i.gstRate || '', parseFloat(i.cess) || 0,
                i.taxType || '', parseFloat(i.taxAmount) || 0, parseFloat(i.purchasePrice || i.purchaseAmount) || 0, parseFloat(i.sellingPrice || i.sellingAmount) || 0,
                parseFloat(i.mrp) || 0, parseFloat(i.stock) || 0, parseFloat(i.minimumStock) || 0, i.itemLocation || '',
                i.purchaseTaxType || '', i.sellingTaxType || '', JSON.stringify(i.conversions || []), JSON.stringify(i.images || [])
            ]);
        }
        
        if (incomingCodes.length > 0) {
            await client.query('DELETE FROM items WHERE NOT (code = ANY($1))', [incomingCodes]);
        } else {
            await client.query('DELETE FROM items');
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        sendError(res, e, 'Failed to save items');
    } finally {
        client.release();
    }
});

// 4. Vendors
app.get('/api/vendors', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, vendor_name as "vendorName", contact_person as "contactPerson", phone_number as "phoneNumber", email, gst_treatment as "gstTreatment", 
            gstin, pan_number as "panNumber", opening_balance as "openingBalance", as_of_date as "asOfDate", bill_address as "billAddress", bill_city as "billCity", 
            bill_state as "billState", bill_pincode as "billPinCode", bill_country as "billCountry", ship_address as "shipAddress", ship_city as "shipCity", 
            ship_state as "shipState", ship_pincode as "shipPinCode", ship_country as "shipCountry", pending_to_pay as "pendingToPay",
            vendor_credit_balance as "vendorCreditBalance", vendor_advance_balance as "vendorAdvanceBalance"
            FROM vendors
        `);
        // We will fetch transactions from JSON for now, or just send empty array and rely on invoices?
        // SPH Software stores transactions array in the vendor object. We will just send [] and it will compute from invoices later if needed,
        // Actually, we must preserve the JSON backwards compatibility!
        const db = await readDB();
        const jsonVendors = db.vendors || [];
        const vendors = result.rows.map(v => {
            if (v.asOfDate) {
                const d = new Date(v.asOfDate);
                v.asOfDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            const jv = jsonVendors.find(x => String(x.id) === String(v.id));
            v.transactions = jv ? jv.transactions : [];
            return v;
        });
        res.json(vendors);
    } catch (e) {
        console.error(e); res.json([]);
    }
});
app.post('/api/vendors', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const vendors = req.body;
        const incomingIds = [];
        
        for (let v of vendors) {
            const vid = v.id || generateId();
            incomingIds.push(vid);
            let parsedDate = v.asOfDate;
            if (parsedDate && parsedDate.includes('/')) {
               const parts = parsedDate.split('/');
               if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDate) {
               parsedDate = null;
            }
            await client.query(`
                INSERT INTO vendors (
                    id, vendor_name, contact_person, phone_number, email, gst_treatment, 
                    gstin, pan_number, opening_balance, as_of_date, bill_address, bill_city, 
                    bill_state, bill_pincode, bill_country, ship_address, ship_city, 
                    ship_state, ship_pincode, ship_country, pending_to_pay, vendor_credit_balance, vendor_advance_balance
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
                ON CONFLICT (id) DO UPDATE SET
                    vendor_name = EXCLUDED.vendor_name, contact_person = EXCLUDED.contact_person, phone_number = EXCLUDED.phone_number, email = EXCLUDED.email, 
                    gst_treatment = EXCLUDED.gst_treatment, gstin = EXCLUDED.gstin, pan_number = EXCLUDED.pan_number, opening_balance = EXCLUDED.opening_balance, 
                    as_of_date = EXCLUDED.as_of_date, bill_address = EXCLUDED.bill_address, bill_city = EXCLUDED.bill_city, bill_state = EXCLUDED.bill_state, 
                    bill_pincode = EXCLUDED.bill_pincode, bill_country = EXCLUDED.bill_country, ship_address = EXCLUDED.ship_address, ship_city = EXCLUDED.ship_city, 
                    ship_state = EXCLUDED.ship_state, ship_pincode = EXCLUDED.ship_pincode, ship_country = EXCLUDED.ship_country, pending_to_pay = EXCLUDED.pending_to_pay,
                    vendor_credit_balance = EXCLUDED.vendor_credit_balance, vendor_advance_balance = EXCLUDED.vendor_advance_balance
            `, [
                vid, v.vendorName || 'Unknown Vendor', v.contactPerson || '', v.phoneNumber || '', v.email || '', v.gstTreatment || '',
                v.gstin || '', v.panNumber || '', parseFloat(v.openingBalance) || 0, parsedDate, v.billAddress || '', v.billCity || '',
                v.billState || '', v.billPinCode || '', v.billCountry || '', v.shipAddress || '', v.shipCity || '',
                v.shipState || '', v.shipPinCode || '', v.shipCountry || '', parseFloat(v.pendingToPay) || 0, parseFloat(v.vendorCreditBalance) || 0, parseFloat(v.vendorAdvanceBalance) || 0
            ]);
        }
        
        if (incomingIds.length > 0) {
            await client.query('DELETE FROM vendors WHERE NOT (id = ANY($1))', [incomingIds]);
        } else {
            await client.query('DELETE FROM vendors');
        }
        
        await client.query('COMMIT');
        
        // Also save to JSON for transactions backwards compatibility
        const db = await readDB(); db.vendors = vendors; await writeDB(db);
        
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        sendError(res, e, 'Failed to save vendors');
    } finally {
        client.release();
    }
});

// 5. Customers
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, customer_name as "name", contact_person as "contactPerson", phone_number as "mobile", email, gst_treatment as "gstTreatment", 
            gstin, pan_number as "pan", opening_balance as "openingBalance", as_of_date as "asOfDate", bill_address as "address", bill_city as "city", 
            bill_state as "state", bill_pincode as "pin", bill_country as "country", ship_address as "shipAddress", ship_city as "shipCity", 
            ship_state as "shipState", ship_pincode as "shipPinCode", ship_country as "shipCountry", pending_to_receive as "pendingToReceive",
            store_credit_balance as "storeCreditBalance", customer_advance_balance as "customerAdvanceBalance"
            FROM customers
        `);
        const db = await readDB();
        const jsonCustomers = db.customers || [];
        const customers = result.rows.map(c => {
            if (c.asOfDate) {
                const d = new Date(c.asOfDate);
                c.asOfDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            const jc = jsonCustomers.find(x => String(x.id) === String(c.id));
            c.transactions = jc ? jc.transactions : [];
            return c;
        });
        res.json(customers);
    } catch (e) {
        console.error(e); res.json([]);
    }
});
app.post('/api/customers', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const customers = req.body;
        const incomingIds = [];
        
        for (let c of customers) {
            const cid = c.id || generateId();
            incomingIds.push(cid);
            let parsedDate = c.asOfDate;
            if (parsedDate && parsedDate.includes('/')) {
               const parts = parsedDate.split('/');
               if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDate) {
               parsedDate = null;
            }
            const actualName = c.name || c.customerName || 'Unknown Customer';
            const actualMobile = c.mobile || c.phoneNumber || '';
            const actualAddress = c.address || c.billAddress || '';
            const actualCity = c.city || c.billCity || '';
            const actualState = c.state || c.billState || '';
            const actualPin = c.pin || c.billPinCode || '';
            const actualCountry = c.country || c.billCountry || '';
            const actualPan = c.pan || c.panNumber || '';

            await client.query(`
                INSERT INTO customers (
                    id, customer_name, contact_person, phone_number, email, gst_treatment, 
                    gstin, pan_number, opening_balance, as_of_date, bill_address, bill_city, 
                    bill_state, bill_pincode, bill_country, ship_address, ship_city, 
                    ship_state, ship_pincode, ship_country, pending_to_receive, customer_advance_balance
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                ON CONFLICT (id) DO UPDATE SET
                    customer_name = EXCLUDED.customer_name, contact_person = EXCLUDED.contact_person, phone_number = EXCLUDED.phone_number, email = EXCLUDED.email, 
                    gst_treatment = EXCLUDED.gst_treatment, gstin = EXCLUDED.gstin, pan_number = EXCLUDED.pan_number, opening_balance = EXCLUDED.opening_balance, 
                    as_of_date = EXCLUDED.as_of_date, bill_address = EXCLUDED.bill_address, bill_city = EXCLUDED.bill_city, bill_state = EXCLUDED.bill_state, 
                    bill_pincode = EXCLUDED.bill_pincode, bill_country = EXCLUDED.bill_country, ship_address = EXCLUDED.ship_address, ship_city = EXCLUDED.ship_city, 
                    ship_state = EXCLUDED.ship_state, ship_pincode = EXCLUDED.ship_pincode, ship_country = EXCLUDED.ship_country, pending_to_receive = EXCLUDED.pending_to_receive,
                    customer_advance_balance = EXCLUDED.customer_advance_balance
            `, [
                cid, actualName, c.contactPerson || '', actualMobile, c.email || '', c.gstTreatment || '',
                c.gstin || '', actualPan, parseFloat(c.openingBalance) || 0, parsedDate, actualAddress, actualCity,
                actualState, actualPin, actualCountry, c.shipAddress || '', c.shipCity || '',
                c.shipState || '', c.shipPinCode || '', c.shipCountry || '', parseFloat(c.pendingToReceive) || 0, parseFloat(c.customerAdvanceBalance) || 0
            ]);
        }
        
        if (incomingIds.length > 0) {
            await client.query('DELETE FROM customers WHERE NOT (id = ANY($1))', [incomingIds]);
        } else {
            await client.query('DELETE FROM customers');
        }
        
        await client.query('COMMIT');
        
        const db = await readDB(); db.customers = customers; await writeDB(db);
        
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        sendError(res, e, 'Failed to save customers');
    } finally {
        client.release();
    }
});

// 6. Purchase Invoices
app.get('/api/purchase-invoices', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, pi_no as "piNo", date, ref_no as "refNo", due_date as "dueDate", payment_terms as "paymentTerms", vendor_id as "vendorId", vendor_name as "vendorName", 
            sub_total as "subTotal", discount_percent as "discountPercent", discount_amount as "discountAmount", total_tax as "totalTax", amount, 
            paid_amount as "paidAmount", pending_to_pay as "pendingToPay", note, items
            FROM purchase_invoices
        `);
        // Format dates correctly to DD/MM/YYYY
        const invoices = result.rows.map(pi => {
            if (pi.date) {
                const d = new Date(pi.date);
                pi.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            if (pi.dueDate) {
                const d = new Date(pi.dueDate);
                pi.dueDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            return pi;
        });
        res.json(invoices);
    } catch (e) {
        console.error(e); res.json([]);
    }
});
app.post('/api/purchase-invoices', async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

// 7. Sales Invoices
app.get('/api/sales', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, invoice_no as "invoiceNumber", date, ref_no as "refNo", due_date as "dueDate", payment_terms as "paymentTerms", customer_id as "customerId", customer_name as "customerName", 
            sub_total as "subTotal", discount_percent as "discountPercent", discount_amount as "discountAmount", total_tax as "totalTax", amount as "grandTotal", 
            paid_amount as "receivedAmount", pending_to_receive as "pendingToReceive", note, items
            FROM sales_invoices
        `);
        const invoices = result.rows.map(s => {
            if (s.date) {
                const d = new Date(s.date);
                s.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            if (s.dueDate) {
                const d = new Date(s.dueDate);
                s.dueDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            return s;
        });
        res.json(invoices);
    } catch (e) {
        console.error(e); res.json([]);
    }
});

// Atomic Sales Invoice Creation Endpoint
app.post('/api/sales/create', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            date,
            refNo,
            dueDate,
            paymentTerms,
            customerId,
            customerName,
            subTotal,
            discount,
            taxAmount,
            grandTotal: clientGrandTotal,
            receivedAmount: clientReceivedAmount,
            items,
            manualInvoiceNumber,
            applyStoreCredit,     // boolean — user chose to apply credit
            requestedCredit       // amount the frontend believes is available (advisory only)
        } = req.body;

        // 1. Validation of Input Financials & Items
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Invoice must contain at least one line item');
        }

        for (const it of items) {
            const qty = parseFloat(it.qty);
            if (isNaN(qty) || qty <= 0) {
                throw new Error(`Invalid quantity (${it.qty}) for item: ${it.name || it.code}`);
            }
        }

        const parsedSubTotal = parseFloat(subTotal) || 0;
        const parsedDiscount = parseFloat(discount) || 0;
        const parsedTaxAmount = parseFloat(taxAmount) || 0;
        const grandTotal = parseFloat(clientGrandTotal) || 0;
        const receivedAmount = parseFloat(clientReceivedAmount) || 0;

        if (grandTotal < 0) {
            throw new Error('Grand total cannot be negative');
        }
        if (receivedAmount < 0) {
            throw new Error('Received amount cannot be negative');
        }
        if (receivedAmount > grandTotal) {
            throw new Error('Received amount cannot exceed grand total');
        }

        const netUnpaid = Math.max(0, grandTotal - receivedAmount);

        // 2. Generate Final Invoice Number Atomically using document_sequences
        let finalInvoiceNo = manualInvoiceNumber;
        if (!finalInvoiceNo) {
            // Lock and fetch sequence row for sales_invoice
            let seqRes = await client.query(
                `SELECT current_number FROM document_sequences WHERE document_type = 'sales_invoice' AND financial_year = 'ALL' FOR UPDATE`
            );

            let nextNum = 1;
            if (seqRes.rows.length === 0) {
                // Determine max existing from sales_invoices table to prevent collisions
                const maxRes = await client.query(
                    `SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^INV', '', 'g') AS INTEGER)) as max_val FROM sales_invoices WHERE invoice_no ~ '^INV[0-9]+$'`
                );
                const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
                nextNum = maxExisting + 1;

                await client.query(
                    `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number) VALUES ('sales_invoice', 'INV', 'ALL', $1) ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number`,
                    [nextNum]
                );
            } else {
                nextNum = (parseInt(seqRes.rows[0].current_number) || 0) + 1;
                // Safeguard check against existing table max
                const maxRes = await client.query(
                    `SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^INV', '', 'g') AS INTEGER)) as max_val FROM sales_invoices WHERE invoice_no ~ '^INV[0-9]+$'`
                );
                const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
                if (maxExisting >= nextNum) {
                    nextNum = maxExisting + 1;
                }

                await client.query(
                    `UPDATE document_sequences SET current_number = $1, updated_at = NOW() WHERE document_type = 'sales_invoice' AND financial_year = 'ALL'`,
                    [nextNum]
                );
            }

            finalInvoiceNo = 'INV' + String(nextNum).padStart(3, '0');
        }

        // 3. Deterministic Stock Row Locking & Stock Validation
        // Extract distinct item codes and sort alphabetically to eliminate deadlock risk
        const itemCodes = [...new Set(items.map(i => String(i.code)))].sort();

        // Lock item rows in exact deterministic sorted order
        const dbItemsRes = await client.query(
            `SELECT code, name, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE`,
            [itemCodes]
        );

        const dbItemsMap = new Map();
        dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.code), r));

        // Group total requested qty per item code in this invoice
        const requestedQtyMap = new Map();
        items.forEach(it => {
            const code = String(it.code);
            const currentReq = requestedQtyMap.get(code) || 0;
            requestedQtyMap.set(code, currentReq + parseFloat(it.qty));
        });

        // Validate stock availability
        for (const [code, reqQty] of requestedQtyMap.entries()) {
            const dbItem = dbItemsMap.get(code);
            if (!dbItem) {
                throw new Error(`Item code "${code}" not found in inventory`);
            }
            const currentStock = parseFloat(dbItem.stock) || 0;
            if (currentStock < reqQty) {
                throw new Error(`Insufficient stock for item "${dbItem.name || code}". Available: ${currentStock}, Requested: ${reqQty}`);
            }
        }

        // 4. Deduct Stock
        for (const [code, reqQty] of requestedQtyMap.entries()) {
            await client.query(
                `UPDATE items SET stock = stock - $1 WHERE code = $2`,
                [reqQty, code]
            );
        }

        // 5. Parse Dates
        let parsedDate = date;
        if (parsedDate && parsedDate.includes('/')) {
            const parts = parsedDate.split('/');
            if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDate) {
            parsedDate = new Date().toISOString().split('T')[0];
        }

        let parsedDueDate = dueDate;
        if (parsedDueDate && parsedDueDate.includes('/')) {
            const parts = parsedDueDate.split('/');
            if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDueDate) {
            parsedDueDate = null;
        }

        const sid = generateId();

        // 6. Handle Store Credit consumption (if requested) — lock customer BEFORE invoice insert
        let creditUsed = 0;
        let finalGrandTotal = grandTotal; // grandTotal already includes credit reduction from frontend

        if (applyStoreCredit && customerId && String(customerId) !== 'walk-in') {
            // Lock customer row to read authoritative store_credit_balance
            const custCreditRes = await client.query(
                `SELECT id, pending_to_receive, store_credit_balance FROM customers WHERE id = $1 FOR UPDATE`,
                [customerId]
            );

            if (custCreditRes.rows.length > 0) {
                const availableCredit = parseFloat(custCreditRes.rows[0].store_credit_balance) || 0;
                // creditUsed = min(requestedCredit, actualAvailable, invoiceTotal pre-credit)
                const invoicePreCreditTotal = parseFloat(subTotal) - parseFloat(discount || 0) + parseFloat(taxAmount || 0);
                creditUsed = Math.min(
                    parseFloat(requestedCredit) || 0,
                    availableCredit,
                    Math.max(0, invoicePreCreditTotal)
                );
                creditUsed = Math.max(0, creditUsed);

                if (creditUsed > 0) {
                    await client.query(
                        `UPDATE customers SET store_credit_balance = COALESCE(store_credit_balance, 0) - $1 WHERE id = $2`,
                        [creditUsed, customerId]
                    );
                }
            }
        }

        // Recalculate grand total and outstanding after backend-validated credit deduction
        // grandTotal from frontend already has credit applied — use backend creditUsed as the source of truth
        // If no credit or credit matches: grandTotal stands. If backend creditUsed differs, recalculate.
        const invoicePreCreditTotal = Math.round((parseFloat(subTotal) || 0) - (parseFloat(discount) || 0) + (parseFloat(taxAmount) || 0));
        const backendGrandTotal = Math.max(0, invoicePreCreditTotal - creditUsed);
        const backendNetUnpaid = Math.max(0, backendGrandTotal - receivedAmount);

        // 7. Insert Sales Invoice WITHOUT ON CONFLICT DO UPDATE
        await client.query(
            `INSERT INTO sales_invoices (
                id, invoice_no, date, ref_no, due_date, payment_terms, customer_id, customer_name,
                sub_total, discount_percent, discount_amount, total_tax, amount,
                paid_amount, pending_to_receive, note, items, store_credit_applied
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
                sid, finalInvoiceNo, parsedDate, refNo || '', parsedDueDate, paymentTerms || '',
                customerId || null, customerName || 'Walk In Customer', parsedSubTotal, 0,
                parsedDiscount, parsedTaxAmount, backendGrandTotal, receivedAmount, backendNetUnpaid,
                '', JSON.stringify(items), creditUsed
            ]
        );

        // 8. Update Customer Outstanding Balance (customer already locked above if credit used)
        if (customerId && String(customerId) !== 'walk-in') {
            if (!applyStoreCredit) {
                // Lock customer if not already locked (no credit path)
                await client.query(
                    `SELECT id FROM customers WHERE id = $1 FOR UPDATE`,
                    [customerId]
                );
            }
            if (backendNetUnpaid > 0) {
                await client.query(
                    `UPDATE customers SET pending_to_receive = COALESCE(pending_to_receive, 0) + $1 WHERE id = $2`,
                    [backendNetUnpaid, customerId]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, invoiceNumber: finalInvoiceNo, id: sid, creditUsed });

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '40P01') {
            return sendError(res, e, 'Transaction deadlock detected. Please try saving again.');
        } else if (e.code === '55P03') {
            return sendError(res, e, 'System is busy updating inventory for these items. Please try again.');
        } else if (e.code === '23505') {
            return sendError(res, e, 'Invoice number collision detected. Please try saving again.');
        }
        sendError(res, e, e.message || 'Failed to create sales invoice');
    } finally {
        client.release();
    }
});

// Atomic Purchase Invoice Creation Endpoint
app.post('/api/purchases/create', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            date,
            refNo,
            dueDate,
            paymentTerms,
            vendorId: requestedVendorId,
            vendorName,
            subTotal,
            discount,
            taxAmount,
            grandTotal: clientGrandTotal,
            paidAmount: clientPaidAmount,
            items,
            manualPiNumber
        } = req.body;

        // 1. Validation of Input Financials & Items
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Invoice must contain at least one line item');
        }

        if (!vendorName) {
            throw new Error('Vendor is required');
        }

        for (const it of items) {
            const qty = parseFloat(it.qty);
            const rate = parseFloat(it.rate);
            if (isNaN(qty) || qty <= 0) {
                throw new Error(`Invalid quantity (${it.qty}) for item: ${it.name || it.code}`);
            }
            if (isNaN(rate) || rate < 0) {
                throw new Error(`Invalid rate (${it.rate}) for item: ${it.name || it.code}`);
            }
        }

        const parsedSubTotal = parseFloat(subTotal) || 0;
        const parsedDiscount = parseFloat(discount) || 0;
        const parsedTaxAmount = parseFloat(taxAmount) || 0;
        const grandTotal = parseFloat(clientGrandTotal) || 0;
        const paidAmount = parseFloat(clientPaidAmount) || 0;

        if (grandTotal < 0) throw new Error('Grand total cannot be negative');
        if (paidAmount < 0) throw new Error('Paid amount cannot be negative');
        if (paidAmount > grandTotal) throw new Error('Paid amount cannot exceed grand total');

        const netUnpaid = Math.max(0, grandTotal - paidAmount);

        // 2. Generate Final PI Number Atomically using document_sequences
        let finalPiNo = manualPiNumber;
        if (!finalPiNo) {
            // Lock and fetch sequence row for purchase_invoice
            let seqRes = await client.query(
                `SELECT current_number FROM document_sequences WHERE document_type = 'purchase_invoice' AND financial_year = 'ALL' FOR UPDATE`
            );

            let nextNum = 1;
            if (seqRes.rows.length === 0) {
                // Determine max existing from purchase_invoices table to prevent collisions
                const maxRes = await client.query(
                    `SELECT MAX(CAST(REGEXP_REPLACE(pi_no, '^\\D+', '', 'g') AS INTEGER)) as max_val FROM purchase_invoices WHERE pi_no ~ '\\d+'`
                );
                const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
                nextNum = maxExisting + 1;

                await client.query(
                    `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number) VALUES ('purchase_invoice', 'PI', 'ALL', $1) ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number`,
                    [nextNum]
                );
            } else {
                nextNum = (parseInt(seqRes.rows[0].current_number) || 0) + 1;
                // Safeguard check against existing table max
                const maxRes = await client.query(
                    `SELECT MAX(CAST(REGEXP_REPLACE(pi_no, '^\\D+', '', 'g') AS INTEGER)) as max_val FROM purchase_invoices WHERE pi_no ~ '\\d+'`
                );
                const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
                if (maxExisting >= nextNum) {
                    nextNum = maxExisting + 1;
                }

                await client.query(
                    `UPDATE document_sequences SET current_number = $1, updated_at = NOW() WHERE document_type = 'purchase_invoice' AND financial_year = 'ALL'`,
                    [nextNum]
                );
            }

            finalPiNo = 'PI-' + String(nextNum).padStart(3, '0');
        }

        // 3. Handle Items (Creation of New Items & Concurrency-safe locking of Existing Items)
        const finalItemsList = [];
        const existingItemsToUpdate = [];

        for (const it of items) {
            if (it.isNew) {
                // Generate a unique code
                const newItemCode = 'ITEM' + Date.now().toString().slice(-6) + Math.floor(Math.random()*1000);
                
                await client.query(
                    `INSERT INTO items (
                        id, code, name, category_name, unit_name, hsn, gst_rate, cess, 
                        tax_type, tax_amount, purchase_price, selling_price, mrp, 
                        stock, minimum_stock, location, purchase_tax_type, selling_tax_type, 
                        conversions, images
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
                    [
                        generateId(), newItemCode, it.name, it.category || null, it.unit || 'Nos', it.hsn || '', it.tax || '0', 0,
                        '', 0, parseFloat(it.rate) || 0, parseFloat(it.rate) || 0, parseFloat(it.rate) || 0,
                        parseFloat(it.qty) || 0, 0, '', '', '',
                        JSON.stringify([]), JSON.stringify([])
                    ]
                );
                
                finalItemsList.push({
                    code: newItemCode,
                    name: it.name,
                    qty: it.qty,
                    unit: it.unit || 'Nos',
                    rate: it.rate,
                    discount: it.discount || 0,
                    tax: it.tax || '0'
                });
            } else {
                existingItemsToUpdate.push(it);
                finalItemsList.push({
                    code: it.code,
                    name: it.name,
                    qty: it.qty,
                    unit: it.unit,
                    rate: it.rate,
                    discount: it.discount || 0,
                    tax: it.tax || '0'
                });
            }
        }

        // Lock existing items in deterministic sorted order
        if (existingItemsToUpdate.length > 0) {
            const itemCodes = [...new Set(existingItemsToUpdate.map(i => String(i.code)))].sort();
            
            const dbItemsRes = await client.query(
                `SELECT code, name, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE`,
                [itemCodes]
            );

            const dbItemsMap = new Map();
            dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.code), r));

            // Aggregate quantity by item code
            const requestedQtyMap = new Map();
            existingItemsToUpdate.forEach(it => {
                const code = String(it.code);
                const currentReq = requestedQtyMap.get(code) || 0;
                requestedQtyMap.set(code, currentReq + parseFloat(it.qty));
            });

            // Validate existing codes
            for (const code of requestedQtyMap.keys()) {
                if (!dbItemsMap.has(code)) {
                    throw new Error(`Existing item code "${code}" not found in inventory`);
                }
            }

            // Perform stock increments
            for (const [code, reqQty] of requestedQtyMap.entries()) {
                await client.query(
                    `UPDATE items SET stock = stock + $1 WHERE code = $2`,
                    [reqQty, code]
                );
            }
        }

        // 4. Resolve Vendor (by stable ID or create new — never by name) - Lock Vendor AFTER Items
        let vendorIdToUse = null;

        if (requestedVendorId) {
            // EXISTING VENDOR PATH: lock and update by primary key only
            const vRes = await client.query(
                `SELECT id, pending_to_pay FROM vendors WHERE id = $1 FOR UPDATE`,
                [requestedVendorId]
            );

            if (vRes.rows.length === 0) {
                throw new Error(`Vendor ID "${requestedVendorId}" not found. Cannot create invoice for a non-existent vendor.`);
            }

            vendorIdToUse = vRes.rows[0].id;

            await client.query(
                `UPDATE vendors SET pending_to_pay = COALESCE(pending_to_pay, 0) + $1 WHERE id = $2`,
                [netUnpaid, vendorIdToUse]
            );
        } else {
            // NEW VENDOR PATH: no vendorId supplied, create vendor inside this transaction
            if (!vendorName) {
                throw new Error('Vendor name is required when creating a new vendor');
            }
            vendorIdToUse = generateId();
            const { gstinNo, panNo, billAddress, billCity, billState, billPincode, shipAddress, shipCity, shipState, shipPincode } = req.body;
            await client.query(
                `INSERT INTO vendors (
                    id, vendor_name, contact_person, phone_number, email,
                    gst_treatment, gstin, pan_number, opening_balance,
                    as_of_date, bill_address, bill_city, bill_state,
                    bill_pincode, bill_country, ship_address, ship_city,
                    ship_state, ship_pincode, ship_country, pending_to_pay
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
                [
                    vendorIdToUse, vendorName, '', '', '',
                    '', gstinNo || '', panNo || '', 0,
                    null, billAddress || '', billCity || '', billState || '',
                    billPincode || '', '', shipAddress || '', shipCity || '',
                    shipState || '', shipPincode || '', '', netUnpaid
                ]
            );
        }

        // 5. Parse Dates
        let parsedDate = date;
        if (parsedDate && parsedDate.includes('/')) {
            const parts = parsedDate.split('/');
            if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDate) {
            parsedDate = new Date().toISOString().split('T')[0];
        }

        let parsedDueDate = dueDate;
        if (parsedDueDate && parsedDueDate.includes('/')) {
            const parts = parsedDueDate.split('/');
            if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDueDate) {
            parsedDueDate = null;
        }

        const piId = generateId();

        // 6. Insert Purchase Invoice record without ON CONFLICT DO UPDATE
        await client.query(
            `INSERT INTO purchase_invoices (
                id, pi_no, date, ref_no, due_date, payment_terms, vendor_id, vendor_name,
                sub_total, discount_percent, discount_amount, total_tax, amount,
                paid_amount, pending_to_pay, note, items
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
                piId, finalPiNo, parsedDate, refNo || '', parsedDueDate, paymentTerms || 'None',
                vendorIdToUse, vendorName, parsedSubTotal, 0,
                parsedDiscount, parsedTaxAmount, grandTotal, paidAmount, netUnpaid,
                req.body.note || req.body.piNote || '', JSON.stringify(finalItemsList)
            ]

        );

        await client.query('COMMIT');
        res.json({ success: true, piNo: finalPiNo, id: piId });

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '40P01') {
            return sendError(res, e, 'Transaction deadlock detected. Please try saving again.');
        } else if (e.code === '55P03') {
            return sendError(res, e, 'System is busy updating inventory for these items. Please try again.');
        } else if (e.code === '23505') {
            return sendError(res, e, 'Purchase invoice number collision detected. Please try saving again.');
        }
        sendError(res, e, e.message || 'Failed to create purchase invoice');
    } finally {
        client.release();
    }
});
app.post('/api/sales', async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

// 8a. Atomic Sales Return Creation
app.post('/api/sales-returns/create', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            invoiceId,          // stable sales_invoices.id — REQUIRED
            customerId,         // stable customers.id — null for walk-in
            items: returnItems, // [{code, qty}] — what the customer is returning
            date,
            refundAmount: clientRefundAmount, // cash actually given back (from UI)
            note
        } = req.body;

        // ── 1. Validate basic inputs ──────────────────────────────────────────
        if (!invoiceId) throw new Error('Original invoice ID is required');
        if (!returnItems || !Array.isArray(returnItems) || returnItems.length === 0)
            throw new Error('At least one item must be returned');

        for (const it of returnItems) {
            const qty = parseFloat(it.qty);
            if (isNaN(qty) || qty <= 0)
                throw new Error(`Invalid return quantity (${it.qty}) for item: ${it.code}`);
        }

        // ── 2. Lock original Sales Invoice by stable ID ───────────────────────
        const invRes = await client.query(
            `SELECT id, invoice_no, customer_id, discount_amount, total_tax, amount, items, status
             FROM sales_invoices WHERE id = $1 FOR UPDATE`,
            [invoiceId]
        );
        if (invRes.rows.length === 0)
            throw new Error(`Original Sales Invoice ID "${invoiceId}" not found`);

        const originalInvoice = invRes.rows[0];
        if (originalInvoice.status === 'CANCELLED') {
            throw new Error('Cannot create transaction against a cancelled Sales Invoice.');
        }
        const originalItems = typeof originalInvoice.items === 'string'
            ? JSON.parse(originalInvoice.items)
            : (originalInvoice.items || []);

        // ── 3. Validate customer matches original invoice ─────────────────────
        const origCustomerId = originalInvoice.customer_id;
        const isWalkIn = !origCustomerId || String(origCustomerId) === 'walk-in';

        if (isWalkIn) {
            if (customerId && String(customerId) !== 'walk-in')
                throw new Error('Original invoice was a walk-in sale. Cannot assign an account customer to this return.');
        } else {
            if (!customerId || String(customerId) !== String(origCustomerId))
                throw new Error(`Customer mismatch. Original invoice customer: ${origCustomerId}, supplied: ${customerId}`);
        }

        // Build a map of original sold items: code → {qty, rate, disc, taxPercent, sellingTaxType}
        const origItemMap = new Map();
        for (const oi of originalItems) {
            const code = String(oi.code);
            const existing = origItemMap.get(code) || { qty: 0, rate: parseFloat(oi.rate) || 0, disc: parseFloat(oi.disc) || 0, taxPercent: parseFloat(oi.taxPercent) || 0, sellingTaxType: oi.sellingTaxType || 'without' };
            existing.qty += parseFloat(oi.qty) || 0;
            origItemMap.set(code, existing);
        }

        // ── 4. Validate returned items exist on original invoice ──────────────
        for (const it of returnItems) {
            if (!origItemMap.has(String(it.code)))
                throw new Error(`Item code "${it.code}" was not sold on invoice ${originalInvoice.invoice_no}`);
        }

        // ── 5. Load previous ACTIVE returns & aggregate returned qty ──────────
        const prevReturnsRes = await client.query(
            `SELECT items FROM sales_returns WHERE invoice_id = $1 AND status = 'ACTIVE'`,
            [invoiceId]
        );
        const previouslyReturnedQty = new Map();
        for (const row of prevReturnsRes.rows) {
            const ritems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
            for (const ri of ritems) {
                const code = String(ri.code);
                previouslyReturnedQty.set(code, (previouslyReturnedQty.get(code) || 0) + parseFloat(ri.qty));
            }
        }

        // ── 6. Aggregate requested return qty by code & validate over-return ─
        const requestedReturnQty = new Map();
        for (const it of returnItems) {
            const code = String(it.code);
            requestedReturnQty.set(code, (requestedReturnQty.get(code) || 0) + parseFloat(it.qty));
        }

        for (const [code, reqQty] of requestedReturnQty.entries()) {
            const origData = origItemMap.get(code);
            const alreadyReturned = previouslyReturnedQty.get(code) || 0;
            const availableToReturn = (origData?.qty || 0) - alreadyReturned;
            if (reqQty > availableToReturn) {
                throw new Error(`Over-return for item "${code}": originally sold ${origData?.qty}, already returned ${alreadyReturned}, requested ${reqQty} (max returnable: ${availableToReturn})`);
            }
        }

        // ── 7. Generate Return Number Atomically ──────────────────────────────
        let seqRes = await client.query(
            `SELECT current_number FROM document_sequences WHERE document_type = 'sales_return' AND financial_year = 'ALL' FOR UPDATE`
        );
        let nextReturnNum = 1;
        if (seqRes.rows.length === 0) {
            const maxRes = await client.query(
                `SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^RET', '', 'g') AS INTEGER)) as max_val FROM sales_returns WHERE return_no ~ '^RET[0-9]+$'`
            );
            nextReturnNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
            await client.query(
                `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number) VALUES ('sales_return', 'RET', 'ALL', $1) ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number`,
                [nextReturnNum]
            );
        } else {
            nextReturnNum = (parseInt(seqRes.rows[0].current_number) || 0) + 1;
            const maxRes = await client.query(
                `SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^RET', '', 'g') AS INTEGER)) as max_val FROM sales_returns WHERE return_no ~ '^RET[0-9]+$'`
            );
            const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
            if (maxExisting >= nextReturnNum) nextReturnNum = maxExisting + 1;
            await client.query(
                `UPDATE document_sequences SET current_number = $1, updated_at = NOW() WHERE document_type = 'sales_return' AND financial_year = 'ALL'`,
                [nextReturnNum]
            );
        }
        const finalReturnNo = 'RET' + String(nextReturnNum).padStart(3, '0');

        // ── 8. Lock Inventory Rows in deterministic code order ────────────────
        const returnCodes = [...requestedReturnQty.keys()].sort();
        await client.query(
            `SELECT code, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE`,
            [returnCodes]
        );

        // ── 9. Restore Stock ──────────────────────────────────────────────────
        for (const [code, qty] of requestedReturnQty.entries()) {
            await client.query(
                `UPDATE items SET stock = stock + $1 WHERE code = $2`,
                [qty, code]
            );
        }

        // ── 10. Recalculate Return Financials from original invoice snapshot ──
        //        Proportional calculation: each returned line uses its original rate/disc/tax
        //        Global invoice discount is split proportionally
        const originalGlobalDisc = parseFloat(originalInvoice.discount_amount) || 0;

        // Calculate original sub-total (sum of all original line finalAmts) for ratio
        let origSubTotal = 0;
        for (const oi of originalItems) {
            const oQty = parseFloat(oi.qty) || 0;
            const oRate = parseFloat(oi.rate) || 0;
            const oDisc = parseFloat(oi.disc) || 0;
            origSubTotal += (oQty * oRate) - oDisc;
        }

        const calcLineTax = (finalAmt, taxPct, sellingTaxType) => {
            if (taxPct <= 0) return 0;
            if (sellingTaxType === 'with') return finalAmt * (taxPct / (100 - taxPct));
            return finalAmt * (taxPct / 100);
        };

        let returnSubTotal = 0;
        let returnTaxTotal = 0;
        const returnLineItems = [];

        for (const [code, retQty] of requestedReturnQty.entries()) {
            const orig = origItemMap.get(code);
            const returnFraction = retQty / orig.qty;
            const lineAmount = retQty * orig.rate;
            const lineItemDisc = returnFraction * orig.disc;
            const lineFinalAmt = lineAmount - lineItemDisc;
            const lineTax = calcLineTax(lineFinalAmt, orig.taxPercent, orig.sellingTaxType);

            returnSubTotal += lineFinalAmt;
            returnTaxTotal += lineTax;

            // Find original item name for snapshot
            const origLineItem = originalItems.find(oi => String(oi.code) === code);
            returnLineItems.push({
                code,
                name: origLineItem?.name || code,
                qty: retQty,
                unit: origLineItem?.unit || '',
                rate: orig.rate,
                disc: lineItemDisc,
                taxPercent: orig.taxPercent,
                taxAmount: lineTax
            });
        }

        // Proportional global discount
        let proportionalGlobalDisc = 0;
        if (originalGlobalDisc > 0 && origSubTotal > 0) {
            proportionalGlobalDisc = originalGlobalDisc * (returnSubTotal / origSubTotal);
        }

        // Apply proportional discount effect on tax (same as SPH invoice logic)
        if (returnSubTotal > 0 && proportionalGlobalDisc > 0) {
            const discountRatio = (returnSubTotal - proportionalGlobalDisc) / returnSubTotal;
            returnTaxTotal = returnTaxTotal * discountRatio;
        }

        const returnAfterDisc = returnSubTotal - proportionalGlobalDisc;
        const rawReturnTotal = returnAfterDisc + returnTaxTotal;
        const returnGrandTotal = Math.round(rawReturnTotal);

        // ── 11. Parse date & Prepare for Customer Allocation ───────────────────
        let parsedReturnDate = date;
        if (parsedReturnDate && parsedReturnDate.includes('/')) {
            const parts = parsedReturnDate.split('/');
            if (parts.length === 3) parsedReturnDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedReturnDate) {
            parsedReturnDate = new Date().toISOString().split('T')[0];
        }

        // ── 12. Financial Allocation & Customer Financial Update ─────────────
        let receivableReduction = 0;
        let amountAfterReceivable = returnGrandTotal;
        let cashRefundAmount = 0;
        let storeCreditCreated = 0;

        if (isWalkIn) {
            // For Walk-in returns: receivableReduction = 0, storeCreditCreated = 0, cashRefundAmount = returnGrandTotal
            receivableReduction = 0;
            amountAfterReceivable = returnGrandTotal;
            cashRefundAmount = returnGrandTotal;
            storeCreditCreated = 0;
        } else {
            // Account Customer Lock & Exact Allocation Order
            const custRes = await client.query(
                `SELECT id, pending_to_receive, store_credit_balance FROM customers WHERE id = $1 FOR UPDATE`,
                [customerId]
            );
            if (custRes.rows.length === 0)
                throw new Error(`Customer ID "${customerId}" not found`);

            const currentPending = parseFloat(custRes.rows[0].pending_to_receive) || 0;
            const requestedCashRefund = Math.max(0, parseFloat(clientRefundAmount) || 0);

            // Allocation Step 1: Outstanding absorption
            receivableReduction = Math.min(returnGrandTotal, currentPending);
            // Allocation Step 2: Remaining return value after outstanding is cleared
            amountAfterReceivable = returnGrandTotal - receivableReduction;
            // Allocation Step 3: Cash refund capped by remaining return value
            cashRefundAmount = Math.min(requestedCashRefund, amountAfterReceivable);
            // Allocation Step 4: Net Store Credit created
            storeCreditCreated = amountAfterReceivable - cashRefundAmount;

            // Invariant check: receivableReduction + cashRefundAmount + storeCreditCreated MUST equal returnGrandTotal
            const totalAllocated = receivableReduction + cashRefundAmount + storeCreditCreated;
            if (Math.abs(totalAllocated - returnGrandTotal) > 0.01) {
                throw new Error(`Internal Allocation Invariant Violation: ${totalAllocated} != ${returnGrandTotal}`);
            }

            // Update Account Customer Balances
            await client.query(
                `UPDATE customers SET
                    pending_to_receive   = COALESCE(pending_to_receive, 0) - $1,
                    store_credit_balance = COALESCE(store_credit_balance, 0) + $2
                 WHERE id = $3`,
                [receivableReduction, storeCreditCreated, customerId]
            );
        }

        // ── 13. Insert Sales Return ───────────────────────────────────────────
        const returnId = generateId();
        await client.query(
            `INSERT INTO sales_returns (
                id, return_no, invoice_id, invoice_no, date,
                customer_id, customer_name,
                sub_total, discount_amount, total_tax, grand_total,
                refund_amount, store_credit, status, created_at, updated_at, items
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW(),$15)`,
            [
                returnId, finalReturnNo, invoiceId, originalInvoice.invoice_no, parsedReturnDate,
                isWalkIn ? null : customerId,
                req.body.customerName || '',
                returnSubTotal, proportionalGlobalDisc, returnTaxTotal, returnGrandTotal,
                cashRefundAmount, storeCreditCreated, 'ACTIVE',
                JSON.stringify(returnLineItems)
            ]
        );


        await client.query('COMMIT');
        res.json({
            success: true,
            returnNo: finalReturnNo,
            id: returnId,
            returnGrandTotal,
            storeCreditCreated,
            cashRefundAmount
        });

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '40P01') return sendError(res, e, 'Transaction deadlock detected. Please try again.');
        if (e.code === '55P03') return sendError(res, e, 'System is busy. Please try again.');
        if (e.code === '23505') return sendError(res, e, 'Duplicate return number. Please try again.');
        sendError(res, e, e.message || 'Failed to create sales return');
    } finally {
        client.release();
    }
});

// POST /api/purchase-returns/create
app.post('/api/purchase-returns/create', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            invoiceId,          // stable purchase_invoices.id
            vendorId,           // stable vendors.id
            items: returnItems, // [{code, qty}]
            cashReceived: requestedCashReceivedInput,
            date,
            note
        } = req.body;

        // 1. Basic validation
        if (!invoiceId) throw new Error('Original Purchase Invoice ID is required');
        if (!vendorId) throw new Error('Vendor ID is required');
        if (!returnItems || !Array.isArray(returnItems) || returnItems.length === 0) {
            throw new Error('At least one item must be returned');
        }

        let requestedCashReceived = 0;
        if (requestedCashReceivedInput !== undefined && requestedCashReceivedInput !== null) {
            const parsed = parseFloat(requestedCashReceivedInput);
            if (isNaN(parsed) || parsed < 0 || isNaN(Number(requestedCashReceivedInput))) {
                throw new Error('Invalid cash received value');
            }
            requestedCashReceived = parsed;
        }

        // 2. Lock original Purchase Invoice
        const piRes = await client.query(
            `SELECT id, pi_no, vendor_id, vendor_name, sub_total, discount_percent, discount_amount, total_tax, amount, items, status
             FROM purchase_invoices WHERE id = $1 FOR UPDATE`,
            [invoiceId]
        );
        if (piRes.rows.length === 0) {
            throw new Error(`Original Purchase Invoice with ID "${invoiceId}" not found`);
        }
        const originalInvoice = piRes.rows[0];
        if (originalInvoice.status === 'CANCELLED') {
            throw new Error('Cannot create transaction against a cancelled Purchase Invoice.');
        }

        // 3. Validate vendor relationship
        if (String(originalInvoice.vendor_id) !== String(vendorId)) {
            throw new Error(`Vendor mismatch. Original invoice vendor: ${originalInvoice.vendor_id}, supplied: ${vendorId}`);
        }

        const originalItems = typeof originalInvoice.items === 'string'
            ? JSON.parse(originalInvoice.items)
            : (originalInvoice.items || []);

        // Build a map of original purchased items: code -> {qty, rate, disc, taxPercent, name, unit}
        const origItemMap = new Map();
        for (const oi of originalItems) {
            const code = String(oi.code || oi.hsn);
            const rate = parseFloat(oi.rate) || 0;
            const discount = parseFloat(oi.disc || oi.discount) || 0;
            const taxPercent = parseFloat(oi.taxPercent || oi.tax) || 0;
            const existing = origItemMap.get(code) || { qty: 0, rate, discount, taxPercent, name: oi.name, unit: oi.unit };
            existing.qty += parseFloat(oi.qty) || 0;
            origItemMap.set(code, existing);
        }

        // Validate items exist on original PI and quantity is valid
        for (const it of returnItems) {
            const code = String(it.code);
            const qty = parseFloat(it.qty);
            if (!code) throw new Error('Item code is required');
            if (isNaN(qty) || qty <= 0 || isNaN(Number(it.qty))) {
                throw new Error(`Invalid return quantity (${it.qty}) for item: ${code}`);
            }
            if (!origItemMap.has(code)) {
                throw new Error(`Item code "${code}" was not purchased on the original invoice ${originalInvoice.pi_no}`);
            }
        }

        // 4. Duplicate Item Aggregation
        const requestedReturnQty = new Map();
        for (const it of returnItems) {
            const code = String(it.code);
            const qty = parseFloat(it.qty);
            requestedReturnQty.set(code, (requestedReturnQty.get(code) || 0) + qty);
        }

        // 5. Lock document_sequences for prefix='PRET' and document_type='purchase_return' (FOR UPDATE)
        let seqRes = await client.query(
            `SELECT current_number FROM document_sequences WHERE document_type = 'purchase_return' AND financial_year = 'ALL' FOR UPDATE`
        );
        let nextReturnNum = 1;
        if (seqRes.rows.length === 0) {
            const maxRes = await client.query(
                `SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^PRET', '', 'g') AS INTEGER)) as max_val FROM purchase_returns WHERE return_no ~ '^PRET[0-9]+$'`
            );
            nextReturnNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
            await client.query(
                `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number) VALUES ('purchase_return', 'PRET', 'ALL', $1) ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number`,
                [nextReturnNum]
            );
        } else {
            nextReturnNum = (parseInt(seqRes.rows[0].current_number) || 0) + 1;
            const maxRes = await client.query(
                `SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^PRET', '', 'g') AS INTEGER)) as max_val FROM purchase_returns WHERE return_no ~ '^PRET[0-9]+$'`
            );
            const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
            if (maxExisting >= nextReturnNum) {
                nextReturnNum = maxExisting + 1;
            }
            await client.query(
                `UPDATE document_sequences SET current_number = $1, updated_at = NOW() WHERE document_type = 'purchase_return' AND financial_year = 'ALL'`,
                [nextReturnNum]
            );
        }
        const finalReturnNo = 'PRET' + String(nextReturnNum).padStart(3, '0');

        // 6. Lock affected item rows sorted by code ASC
        const returnCodes = [...requestedReturnQty.keys()].sort();
        const dbItemsRes = await client.query(
            `SELECT code, name, stock, purchase_tax_type FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE`,
            [returnCodes]
        );
        const dbItemsMap = new Map();
        dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.code), r));

        // 7. Load previous ACTIVE purchase returns & aggregate returned quantities
        const prevReturnsRes = await client.query(
            `SELECT items FROM purchase_returns WHERE invoice_id = $1 AND status = 'ACTIVE'`,
            [invoiceId]
        );
        const previouslyReturnedQty = new Map();
        for (const row of prevReturnsRes.rows) {
            const ritems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
            for (const ri of ritems) {
                const code = String(ri.code);
                previouslyReturnedQty.set(code, (previouslyReturnedQty.get(code) || 0) + parseFloat(ri.qty));
            }
        }

        // 8. Cumulative over-return validation
        for (const [code, reqQty] of requestedReturnQty.entries()) {
            const orig = origItemMap.get(code);
            const alreadyReturned = previouslyReturnedQty.get(code) || 0;
            const remainingReturnable = orig.qty - alreadyReturned;
            if (reqQty > remainingReturnable) {
                throw new Error(`Over-return for item "${code}": originally purchased ${orig.qty}, already returned ${alreadyReturned}, requested ${reqQty} (max returnable: ${remainingReturnable})`);
            }
        }

        // 9. Physical Stock Safety Validation
        for (const [code, reqQty] of requestedReturnQty.entries()) {
            const dbItem = dbItemsMap.get(code);
            if (!dbItem) {
                throw new Error(`Item code "${code}" not found in inventory`);
            }
            const currentStock = parseFloat(dbItem.stock) || 0;
            if (currentStock < reqQty) {
                throw new Error(`Insufficient stock for item "${dbItem.name || code}". Available: ${currentStock}, Requested return: ${reqQty}`);
            }
        }

        // Deduct Stock
        for (const [code, reqQty] of requestedReturnQty.entries()) {
            await client.query(
                `UPDATE items SET stock = stock - $1 WHERE code = $2`,
                [reqQty, code]
            );
        }

        // 10. Financial Calculation
        // Original sub-total of the purchase invoice to split global discount
        let origSubTotal = 0;
        for (const oi of originalItems) {
            const oQty = parseFloat(oi.qty) || 0;
            const oRate = parseFloat(oi.rate) || 0;
            const oDisc = parseFloat(oi.disc || oi.discount) || 0;
            origSubTotal += (oQty * oRate) - oDisc;
        }

        const calcLineTax = (finalAmt, taxPct, purchaseTaxType) => {
            if (taxPct <= 0) return 0;
            if (purchaseTaxType === 'with') {
                return finalAmt * (taxPct / (100 - taxPct));
            }
            return finalAmt * (taxPct / 100);
        };

        let returnSubTotal = 0;
        let returnTaxTotal = 0;
        const returnLineItems = [];

        for (const [code, retQty] of requestedReturnQty.entries()) {
            const orig = origItemMap.get(code);
            const dbItem = dbItemsMap.get(code);
            const purchaseTaxType = dbItem?.purchase_tax_type || 'without';

            // Proportional calculation
            const returnFraction = retQty / orig.qty;
            const lineAmount = retQty * orig.rate;
            const lineItemDisc = returnFraction * orig.discount;
            const lineFinalAmt = lineAmount - lineItemDisc;
            const lineTax = calcLineTax(lineFinalAmt, orig.taxPercent, purchaseTaxType);

            returnSubTotal += lineFinalAmt;
            returnTaxTotal += lineTax;

            returnLineItems.push({
                code,
                name: orig.name || code,
                qty: retQty,
                unit: orig.unit || '',
                rate: orig.rate,
                disc: lineItemDisc,
                taxPercent: orig.taxPercent,
                taxAmount: lineTax,
                purchaseTaxType
            });
        }

        // Proportional global discount split
        const originalGlobalDisc = parseFloat(originalInvoice.discount_amount) || 0;
        let proportionalGlobalDisc = 0;
        if (originalGlobalDisc > 0 && origSubTotal > 0) {
            proportionalGlobalDisc = originalGlobalDisc * (returnSubTotal / origSubTotal);
        }

        // Apply proportional discount ratio on tax (gst)
        if (returnSubTotal > 0 && proportionalGlobalDisc > 0) {
            const discountRatio = (returnSubTotal - proportionalGlobalDisc) / returnSubTotal;
            returnTaxTotal = returnTaxTotal * discountRatio;
        }

        const returnAfterDisc = returnSubTotal - proportionalGlobalDisc;
        const rawReturnTotal = returnAfterDisc + returnTaxTotal;
        const returnGrandTotal = Math.round(rawReturnTotal);

        // 11. Lock Vendor Row
        const vendorRes = await client.query(
            `SELECT id, pending_to_pay, vendor_credit_balance FROM vendors WHERE id = $1 FOR UPDATE`,
            [vendorId]
        );
        if (vendorRes.rows.length === 0) {
            throw new Error(`Vendor ID "${vendorId}" not found`);
        }
        const currentPendingToPay = parseFloat(vendorRes.rows[0].pending_to_pay) || 0;
        const currentVendorCredit = parseFloat(vendorRes.rows[0].vendor_credit_balance) || 0;

        // 12. Vendor Financial Allocation
        const payableReduction = Math.min(returnGrandTotal, currentPendingToPay);
        const amountAfterPayable = returnGrandTotal - payableReduction;
        const cashReceivedFromVendor = Math.min(requestedCashReceived, amountAfterPayable);
        const vendorCreditCreated = amountAfterPayable - cashReceivedFromVendor;

        // Allocation invariant validation
        const totalAllocated = payableReduction + cashReceivedFromVendor + vendorCreditCreated;
        if (Math.abs(totalAllocated - returnGrandTotal) > 0.01) {
            throw new Error(`Allocation Invariant Violation: calculated ${totalAllocated} does not equal grand total ${returnGrandTotal}`);
        }

        // Update vendor balances
        const newPendingToPay = currentPendingToPay - payableReduction;
        const newVendorCredit = currentVendorCredit + vendorCreditCreated;
        await client.query(
            `UPDATE vendors SET pending_to_pay = $1, vendor_credit_balance = $2 WHERE id = $3`,
            [newPendingToPay, newVendorCredit, vendorId]
        );

        // Parse date
        let parsedReturnDate = date;
        if (parsedReturnDate && parsedReturnDate.includes('/')) {
            const parts = parsedReturnDate.split('/');
            if (parts.length === 3) parsedReturnDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedReturnDate) {
            parsedReturnDate = new Date().toISOString().split('T')[0];
        }

        // 13. Insert Purchase Return
        const returnId = generateId();
        await client.query(
            `INSERT INTO purchase_returns (
                id, return_no, invoice_id, invoice_no, date, vendor_id, vendor_name,
                sub_total, discount_amount, total_tax, grand_total, refund_amount, store_credit,
                vendor_credit, cash_received, status, created_at, updated_at, items
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW(), $17)`,
            [
                returnId,
                finalReturnNo,
                invoiceId,
                originalInvoice.pi_no,
                parsedReturnDate,
                vendorId,
                originalInvoice.vendor_name,
                returnSubTotal,
                proportionalGlobalDisc,
                returnTaxTotal,
                returnGrandTotal,
                cashReceivedFromVendor,         // refund_amount for legacy display
                0,                               // store_credit set to 0 for new returns
                vendorCreditCreated,             // authoritative vendor_credit field
                cashReceivedFromVendor,          // authoritative cash_received field
                'ACTIVE',
                JSON.stringify(returnLineItems)
            ]
        );

        await client.query('COMMIT');
        res.json({
            success: true,
            returnNo: finalReturnNo,
            id: returnId,
            returnGrandTotal,
            vendorCreditCreated,
            cashReceivedFromVendor
        });

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '40P01') return sendError(res, e, 'Transaction deadlock detected. Please try saving again.');
        if (e.code === '55P03') return sendError(res, e, 'System is busy updating inventory. Please try again.');
        if (e.code === '23505') return sendError(res, e, 'Duplicate return number. Please try saving again.');
        sendError(res, e, e.message || 'Failed to create purchase return');
    } finally {
        client.release();
    }
});

app.post('/api/receipts/create', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            customerId,
            amount: amountInput,
            date,
            referenceType,
            paymentMode,
            referenceNo,
            referenceDate,
            note,
            allocations: rawAllocations
        } = req.body;

        // 1. Basic validation
        if (!customerId) throw new Error('Customer ID is required');
        const amount = parseFloat(amountInput);
        if (isNaN(amount) || amount <= 0 || isNaN(Number(amountInput))) {
            throw new Error('Amount must be a valid number greater than 0');
        }
        if (!date) throw new Error('Date is required');
        if (!['AGAINST_REFERENCE', 'ON_ACCOUNT', 'ADVANCE'].includes(referenceType)) {
            throw new Error('Invalid reference type');
        }
        if (!['CASH', 'BANK', 'UPI', 'CARD'].includes(paymentMode)) {
            throw new Error('Invalid payment mode');
        }

        let allocatedAmount = 0;
        let advanceAmount = amount;
        let allocationsToSave = [];
        let uniqueInvoiceIds = [];

        // 2. Lock affected Sales Invoices in deterministic sorted order first (to match hierarchy)
        if (referenceType === 'AGAINST_REFERENCE') {
            if (!rawAllocations || !Array.isArray(rawAllocations) || rawAllocations.length === 0) {
                throw new Error('Allocations are required for Against Reference');
            }

            // Aggregate duplicate invoice allocations
            const aggMap = new Map();
            for (const alloc of rawAllocations) {
                const invId = String(alloc.invoiceId);
                const allocAmt = parseFloat(alloc.allocatedAmount);
                if (!invId) throw new Error('Invoice ID is required for allocation');
                if (isNaN(allocAmt) || allocAmt <= 0 || isNaN(Number(alloc.allocatedAmount))) {
                    throw new Error(`Invalid allocation amount (${alloc.allocatedAmount}) for invoice: ${invId}`);
                }
                aggMap.set(invId, (aggMap.get(invId) || 0) + allocAmt);
            }

            // Lock affected Sales Invoices in deterministic sorted order
            uniqueInvoiceIds = Array.from(aggMap.keys()).sort();
            const invRes = await client.query(
                "SELECT id, invoice_no, customer_id, amount, paid_amount, pending_to_receive, status FROM sales_invoices WHERE id = ANY($1) FOR UPDATE",
                [uniqueInvoiceIds]
            );

            const invMap = new Map(invRes.rows.map(row => [row.id, row]));

            // Validate invoice details and allocations
            for (const [invId, reqAmt] of aggMap.entries()) {
                const invoice = invMap.get(invId);
                if (!invoice) {
                    throw new Error(`Sales Invoice with ID "${invId}" not found`);
                }
                if (invoice.status === 'CANCELLED') {
                    throw new Error('Cannot create transaction against a cancelled Sales Invoice.');
                }
                if (String(invoice.customer_id) !== String(customerId)) {
                    throw new Error(`Invoice ${invoice.invoice_no} does not belong to the selected customer`);
                }

                const currentPaid = parseFloat(invoice.paid_amount) || 0;
                const currentTotal = parseFloat(invoice.amount) || 0;
                const remaining = Math.max(0, currentTotal - currentPaid);

                if (reqAmt > remaining) {
                    throw new Error(`Allocation of ${reqAmt} exceeds remaining outstanding balance of ${remaining} on invoice ${invoice.invoice_no}`);
                }

                allocatedAmount += reqAmt;
                allocationsToSave.push({
                    invoiceId: invId,
                    allocatedAmount: reqAmt,
                    newPaid: currentPaid + reqAmt,
                    newPending: remaining - reqAmt
                });
            }

            if (allocatedAmount > amount) {
                throw new Error(`Sum of allocations (${allocatedAmount}) cannot exceed receipt amount (${amount})`);
            }

            advanceAmount = amount - allocatedAmount;
        }

        // 3. Generate Receipt number atomically
        let seqRes = await client.query(
            "SELECT current_number FROM document_sequences WHERE prefix = 'AR' AND document_type = 'customer_receipt' FOR UPDATE"
        );
        if (seqRes.rows.length === 0) {
            await client.query(
                "INSERT INTO document_sequences (prefix, document_type, current_number) VALUES ('AR', 'customer_receipt', 1) ON CONFLICT DO NOTHING"
            );
            seqRes = await client.query(
                "SELECT current_number FROM document_sequences WHERE prefix = 'AR' AND document_type = 'customer_receipt' FOR UPDATE"
            );
        }
        const currentSeqNum = parseInt(seqRes.rows[0].current_number) || 1;
        const receiptNo = `AR${String(currentSeqNum).padStart(3, '0')}`;
        await client.query(
            "UPDATE document_sequences SET current_number = $1 WHERE prefix = 'AR' AND document_type = 'customer_receipt'",
            [currentSeqNum + 1]
        );

        // 4. Lock customer row LAST (complying with SI -> DS -> CU hierarchy)
        const custRes = await client.query(
            "SELECT id, customer_name, pending_to_receive, customer_advance_balance FROM customers WHERE id = $1 FOR UPDATE",
            [customerId]
        );
        if (custRes.rows.length === 0) {
            throw new Error('Customer not found');
        }
        const customer = custRes.rows[0];

        // 5. Validate allocations + advance = amount
        if (Math.abs((allocatedAmount + advanceAmount) - amount) > 0.0001) {
            throw new Error('Allocation total and advance amount must equal the receipt amount');
        }

        const receiptId = generateId();

        // 6. Insert receipt
        await client.query(`
            INSERT INTO customer_receipts (
                id, receipt_no, date, customer_id, reference_type, amount, 
                allocated_amount, advance_amount, payment_mode, reference_no, reference_date, note, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')
        `, [
            receiptId, receiptNo, date, customerId, referenceType, amount,
            allocatedAmount, advanceAmount, paymentMode, referenceNo || null,
            referenceDate ? referenceDate : null, note || ''
        ]);

        // 7. Insert allocation rows and update Sales Invoices
        for (const alloc of allocationsToSave) {
            await client.query(`
                INSERT INTO customer_receipt_allocations (id, receipt_id, invoice_id, allocated_amount)
                VALUES ($1, $2, $3, $4)
            `, [generateId(), receiptId, alloc.invoiceId, alloc.allocatedAmount]);

            await client.query(`
                UPDATE sales_invoices 
                SET paid_amount = $1, pending_to_receive = $2
                WHERE id = $3
            `, [alloc.newPaid, alloc.newPending, alloc.invoiceId]);
        }

        // 8. Update Customer Balances
        const currentPending = parseFloat(customer.pending_to_receive) || 0;
        const currentAdvance = parseFloat(customer.customer_advance_balance) || 0;

        const newPending = currentPending - allocatedAmount;
        if (newPending < 0) {
            throw new Error(`Inconsistent data: Customer outstanding balance would become negative (${newPending})`);
        }
        const newAdvance = currentAdvance + advanceAmount;

        await client.query(`
            UPDATE customers
            SET pending_to_receive = $1, customer_advance_balance = $2
            WHERE id = $3
        `, [newPending, newAdvance, customerId]);

        await client.query('COMMIT');
        res.json({ success: true, receiptNo, receiptId, allocatedAmount, advanceAmount });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Customer Receipt creation failed:', err);
        if (err.code || err.stack.includes('pg') || err.message.includes('connect')) {
            res.status(500).json({ error: 'An unexpected database error occurred' });
        } else {
            res.status(400).json({ error: err.message });
        }
    } finally {
        client.release();
    }
});

app.post('/api/vendor-payments/create', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            vendorId,
            amount: amountInput,
            date,
            referenceType,
            paymentMode,
            referenceNo,
            referenceDate,
            note,
            allocations: rawAllocations
        } = req.body;

        // 1. Basic validation
        if (!vendorId) throw new Error('Vendor ID is required');
        const amount = parseFloat(amountInput);
        if (isNaN(amount) || amount <= 0 || isNaN(Number(amountInput))) {
            throw new Error('Amount must be a valid number greater than 0');
        }
        if (!date) throw new Error('Date is required');
        if (!['AGAINST_REFERENCE', 'ON_ACCOUNT', 'ADVANCE'].includes(referenceType)) {
            throw new Error('Invalid reference type');
        }
        if (!['CASH', 'BANK', 'UPI', 'CARD'].includes(paymentMode)) {
            throw new Error('Invalid payment mode');
        }

        let allocatedAmount = 0;
        let advanceAmount = amount;
        let allocationsToSave = [];

        // 2. Lock affected Purchase Invoices first if AGAINST_REFERENCE to prevent deadlocks
        if (referenceType === 'AGAINST_REFERENCE') {
            if (!rawAllocations || !Array.isArray(rawAllocations) || rawAllocations.length === 0) {
                throw new Error('Allocations are required for Against Reference');
            }

            // Aggregate duplicate invoice allocations
            const aggMap = new Map();
            for (const alloc of rawAllocations) {
                const invId = String(alloc.invoiceId);
                const allocAmt = parseFloat(alloc.allocatedAmount);
                if (!invId) throw new Error('Invoice ID is required for allocation');
                if (isNaN(allocAmt) || allocAmt <= 0 || isNaN(Number(alloc.allocatedAmount))) {
                    throw new Error(`Invalid allocation amount (${alloc.allocatedAmount}) for invoice: ${invId}`);
                }
                aggMap.set(invId, (aggMap.get(invId) || 0) + allocAmt);
            }

            // Lock affected Purchase Invoices in deterministic sorted order
            const uniqueInvoiceIds = Array.from(aggMap.keys()).sort();
            const invRes = await client.query(
                "SELECT id, pi_no, vendor_id, amount, paid_amount, pending_to_pay, status FROM purchase_invoices WHERE id = ANY($1) FOR UPDATE",
                [uniqueInvoiceIds]
            );

            const invMap = new Map(invRes.rows.map(row => [row.id, row]));

            // Validate invoice details and allocations
            for (const [invId, reqAmt] of aggMap.entries()) {
                const invoice = invMap.get(invId);
                if (!invoice) {
                    throw new Error(`Purchase Invoice with ID "${invId}" not found`);
                }
                if (invoice.status === 'CANCELLED') {
                    throw new Error('Cannot create transaction against a cancelled Purchase Invoice.');
                }
                if (String(invoice.vendor_id) !== String(vendorId)) {
                    throw new Error(`Invoice ${invoice.pi_no} does not belong to the selected vendor`);
                }

                const currentPaid = parseFloat(invoice.paid_amount) || 0;
                const currentPending = parseFloat(invoice.pending_to_pay) || 0;

                if (reqAmt > currentPending) {
                    throw new Error(`Allocation of ${reqAmt} exceeds remaining outstanding balance of ${currentPending} on invoice ${invoice.pi_no}`);
                }

                allocatedAmount += reqAmt;
                allocationsToSave.push({
                    invoiceId: invId,
                    allocatedAmount: reqAmt,
                    newPaid: currentPaid + reqAmt,
                    newPending: currentPending - reqAmt
                });
            }

            if (allocatedAmount > amount) {
                throw new Error(`Sum of allocations (${allocatedAmount}) cannot exceed payment amount (${amount})`);
            }

            advanceAmount = amount - allocatedAmount;
        }

        // 3. Lock/generate sequence
        let seqRes = await client.query(
            "SELECT current_number FROM document_sequences WHERE prefix = 'PMT' AND document_type = 'vendor_payment' FOR UPDATE"
        );
        if (seqRes.rows.length === 0) {
            await client.query(
                "INSERT INTO document_sequences (prefix, document_type, current_number) VALUES ('PMT', 'vendor_payment', 1) ON CONFLICT DO NOTHING"
            );
            seqRes = await client.query(
                "SELECT current_number FROM document_sequences WHERE prefix = 'PMT' AND document_type = 'vendor_payment' FOR UPDATE"
            );
        }
        const currentSeqNum = parseInt(seqRes.rows[0].current_number) || 1;
        const paymentNo = `PMT${String(currentSeqNum).padStart(3, '0')}`;
        await client.query(
            "UPDATE document_sequences SET current_number = $1 WHERE prefix = 'PMT' AND document_type = 'vendor_payment'",
            [currentSeqNum + 1]
        );

        // 4. Lock Vendor row
        const vendorRes = await client.query(
            "SELECT id, vendor_name, pending_to_pay, vendor_advance_balance FROM vendors WHERE id = $1 FOR UPDATE",
            [vendorId]
        );
        if (vendorRes.rows.length === 0) {
            throw new Error('Vendor not found');
        }
        const vendor = vendorRes.rows[0];

        // 5. Validate allocations + advance = amount
        if (Math.abs((allocatedAmount + advanceAmount) - amount) > 0.0001) {
            throw new Error('Allocation total and advance amount must equal the payment amount');
        }

        const paymentId = generateId();

        // 6. Insert vendor payment
        await client.query(`
            INSERT INTO vendor_payments (
                id, payment_no, date, vendor_id, reference_type, amount, 
                allocated_amount, advance_amount, payment_mode, reference_no, reference_date, note, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')
        `, [
            paymentId, paymentNo, date, vendorId, referenceType, amount,
            allocatedAmount, advanceAmount, paymentMode, referenceNo || null,
            referenceDate ? referenceDate : null, note || ''
        ]);

        // 7. Insert allocation rows and update Purchase Invoices
        for (const alloc of allocationsToSave) {
            await client.query(`
                INSERT INTO vendor_payment_allocations (id, payment_id, purchase_invoice_id, allocated_amount)
                VALUES ($1, $2, $3, $4)
            `, [generateId(), paymentId, alloc.invoiceId, alloc.allocatedAmount]);

            await client.query(`
                UPDATE purchase_invoices 
                SET paid_amount = $1, pending_to_pay = $2
                WHERE id = $3
            `, [alloc.newPaid, alloc.newPending, alloc.invoiceId]);
        }

        // 8. Update Vendor Balances
        const currentPending = parseFloat(vendor.pending_to_pay) || 0;
        const currentAdvance = parseFloat(vendor.vendor_advance_balance) || 0;

        const newPending = currentPending - allocatedAmount;
        if (newPending < 0) {
            throw new Error(`Inconsistent data: Vendor outstanding balance would become negative (${newPending})`);
        }
        const newAdvance = currentAdvance + advanceAmount;

        await client.query(`
            UPDATE vendors
            SET pending_to_pay = $1, vendor_advance_balance = $2
            WHERE id = $3
        `, [newPending, newAdvance, vendorId]);

        await client.query('COMMIT');
        res.json({ success: true, paymentNo, paymentId, allocatedAmount, advanceAmount });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Vendor Payment creation failed:', err);
        if (err.code || err.stack.includes('pg') || err.message.includes('connect')) {
            res.status(500).json({ error: 'An unexpected database error occurred' });
        } else {
            res.status(400).json({ error: err.message });
        }
    } finally {
        client.release();
    }
});

// 8. Sales Returns
app.get('/api/sales-returns', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, return_no as "returnNo", date, invoice_no as "invoiceNo", invoice_id as "invoiceId",
            customer_id as "customerId", customer_name as "customerName", 
            sub_total as "subTotal", discount_amount as "discountAmount", total_tax as "totalTax", grand_total as "grandTotal", 
            refund_amount as "refundAmount", store_credit as "storeCredit",
            status, created_at as "createdAt", items
            FROM sales_returns
        `);
        const returns = result.rows.map(r => {
            if (r.date) {
                const d = new Date(r.date);
                r.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            return r;
        });
        res.json(returns);
    } catch (e) {
        console.error(e); res.json([]);
    }
});

app.post('/api/sales-returns', async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});


// Purchase Returns API
app.get('/api/purchase-returns', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, return_no as "returnNo", date, invoice_no as "invoiceNo", invoice_id as "invoiceId", vendor_id as "vendorId", vendor_name as "vendorName", 
            sub_total as "subTotal", discount_amount as "discountAmount", total_tax as "totalTax", grand_total as "grandTotal", 
            refund_amount as "refundAmount", store_credit as "storeCredit", vendor_credit as "vendorCredit", cash_received as "cashReceived",
            status, created_at as "createdAt", items
            FROM purchase_returns
        `);
        const returns = result.rows.map(r => {
            if (r.date) {
                const d = new Date(r.date);
                r.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            return r;
        });
        res.json(returns);
    } catch (e) {
        console.error(e); res.json([]);
    }
});

app.post('/api/purchase-returns', async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

// 13. AI Invoice Extraction
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'), false);
        }
        cb(null, true);
    }
});

app.post('/api/ai/extract-invoice', (req, res, next) => {
    upload.single('invoiceFile')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'Gemini API Key is not configured' });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No invoice file uploaded' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Robust Fallback Array: Try these models in order if one fails (404, 503, etc.)
        const modelsToTry = [
            process.env.GEMINI_MODEL,
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-2.0-flash",
            "gemini-flash-latest",
            "gemini-3.1-pro-preview"
        ].filter(Boolean); // removes undefined if GEMINI_MODEL isn't set

        const prompt = `You are an expert accounting assistant. Extract the structured invoice data from the provided image or PDF.
Return ONLY a valid JSON object matching the following structure:
{
  "vendor": { "name": "", "gstin": "", "address": "", "phone": "" },
  "invoice": { "invoiceNo": "", "invoiceDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD" },
  "items": [
    { "name": "", "description": "", "hsn": "", "qty": 0, "unit": "Nos", "rate": 0.0, "discount": 0.0, "taxPercent": 0, "taxAmount": 0.0, "totalAmount": 0.0 }
  ],
  "summary": { "subTotal": 0.0, "discount": 0.0, "afterDiscount": 0.0, "cgst": 0.0, "sgst": 0.0, "total": 0.0, "roundOff": 0.0, "grandTotal": 0.0 }
}
Do not include any markdown formatting like \`\`\`json. Return only the raw JSON string.`;

        let responseResult = null;
        let lastError = null;

        // Try each model until one succeeds
        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting AI extraction with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                responseResult = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: req.file.buffer.toString('base64'),
                            mimeType: req.file.mimetype
                        }
                    }
                ]);
                break; // Success! Exit the loop.
            } catch (err) {
                console.warn(`Model ${modelName} failed:`, err.message);
                lastError = err;
            }
        }

        if (!responseResult) {
            throw new Error(`All fallback AI models failed. Last error: ${lastError.message}`);
        }

        let jsonString = responseResult.response.text();
        jsonString = jsonString.replace(/^```json\n?/, '').replace(/```\n?$/, '').trim();
        const extractedData = JSON.parse(jsonString);

        res.json({ success: true, data: extractedData });
    } catch (error) {
        sendError(res, error, 'AI Extraction service failed');
    }
});

// 1. POST /api/receipts/:id/cancel
app.post('/api/receipts/:id/cancel', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const receiptId = req.params.id;
    const { reason } = req.body;
    const cancelledBy = req.username || 'System';

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock customer_receipts row (Lock 1)
        const receiptRes = await client.query(
            "SELECT id, status, customer_id, reference_type, amount, allocated_amount, advance_amount FROM customer_receipts WHERE id = $1 FOR UPDATE",
            [receiptId]
        );
        if (receiptRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Customer receipt not found' });
        }
        const receipt = receiptRes.rows[0];

        // Double-cancellation protection
        if (receipt.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This receipt is already cancelled' });
        }

        // Fetch allocations to get the sales invoices affected
        const allocRes = await client.query(
            "SELECT invoice_id, allocated_amount FROM customer_receipt_allocations WHERE receipt_id = $1",
            [receiptId]
        );

        let uniqueInvoiceIds = [];
        if (receipt.reference_type === 'AGAINST_REFERENCE' && allocRes.rows.length > 0) {
            uniqueInvoiceIds = [...new Set(allocRes.rows.map(a => String(a.invoice_id)))].sort();
        }

        // 2. Lock affected Sales Invoices in deterministic sorted order (Lock 2)
        let invMap = new Map();
        if (uniqueInvoiceIds.length > 0) {
            const invRes = await client.query(
                "SELECT id, invoice_no, paid_amount, pending_to_receive FROM sales_invoices WHERE id = ANY($1) FOR UPDATE",
                [uniqueInvoiceIds]
            );
            invMap = new Map(invRes.rows.map(r => [r.id, r]));
        }

        // 3. Lock Customer row (Lock 3)
        const custRes = await client.query(
            "SELECT id, pending_to_receive, customer_advance_balance FROM customers WHERE id = $1 FOR UPDATE",
            [receipt.customer_id]
        );
        if (custRes.rows.length === 0) {
            throw new Error('Customer not found');
        }
        const customer = custRes.rows[0];

        const receiptAllocatedAmt = parseFloat(receipt.allocated_amount) || 0;
        const receiptAdvanceAmt = parseFloat(receipt.advance_amount) || 0;

        // Invariant check: customer advance balance must be sufficient to revert
        const currentCustAdvance = parseFloat(customer.customer_advance_balance) || 0;
        if (currentCustAdvance < receiptAdvanceAmt) {
            throw new Error(`Insufficient customer advance balance. Available: ${currentCustAdvance}, Required: ${receiptAdvanceAmt}`);
        }

        // 4. Perform reversals
        // Revert allocations
        for (const alloc of allocRes.rows) {
            const inv = invMap.get(alloc.invoice_id);
            if (!inv) {
                throw new Error(`Sales Invoice with ID "${alloc.invoice_id}" not found`);
            }
            const allocatedVal = parseFloat(alloc.allocated_amount) || 0;
            
            // Revert Invoice balances
            await client.query(
                "UPDATE sales_invoices SET paid_amount = COALESCE(paid_amount, 0) - $1, pending_to_receive = COALESCE(pending_to_receive, 0) + $1 WHERE id = $2",
                [allocatedVal, inv.id]
            );
            
            // Revert Customer outstanding receivable
            await client.query(
                "UPDATE customers SET pending_to_receive = COALESCE(pending_to_receive, 0) + $1 WHERE id = $2",
                [allocatedVal, customer.id]
            );
        }

        // Revert Customer Advance Balance
        await client.query(
            "UPDATE customers SET customer_advance_balance = COALESCE(customer_advance_balance, 0) - $1 WHERE id = $2",
            [receiptAdvanceAmt, customer.id]
        );

        // Update Receipt Status
        await client.query(
            `UPDATE customer_receipts SET 
                status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2
             WHERE id = $3`,
            [cancelledBy, reason, receiptId]
        );

        
        await insertAuditLog(client, {
            tableName: 'customer_receipts',
            recordId: receiptId,
            action: 'CANCEL',
            oldData: receipt,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Customer receipt cancelled successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to cancel customer receipt' });
    } finally {
        client.release();
    }
});

// 2. POST /api/vendor-payments/:id/cancel
app.post('/api/vendor-payments/:id/cancel', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const paymentId = req.params.id;
    const { reason } = req.body;
    const cancelledBy = req.username || 'System';

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock vendor_payments row (Lock 1)
        const paymentRes = await client.query(
            "SELECT id, status, vendor_id, reference_type, amount, allocated_amount, advance_amount FROM vendor_payments WHERE id = $1 FOR UPDATE",
            [paymentId]
        );
        if (paymentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Vendor payment not found' });
        }
        const payment = paymentRes.rows[0];

        // Double-cancellation protection
        if (payment.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This payment is already cancelled' });
        }

        // Fetch allocations to get the purchase invoices affected
        const allocRes = await client.query(
            "SELECT purchase_invoice_id, allocated_amount FROM vendor_payment_allocations WHERE payment_id = $1",
            [paymentId]
        );

        let uniqueInvoiceIds = [];
        if (payment.reference_type === 'AGAINST_REFERENCE' && allocRes.rows.length > 0) {
            uniqueInvoiceIds = [...new Set(allocRes.rows.map(a => String(a.purchase_invoice_id)))].sort();
        }

        // 2. Lock affected Purchase Invoices in deterministic sorted order (Lock 2)
        let invMap = new Map();
        if (uniqueInvoiceIds.length > 0) {
            const invRes = await client.query(
                "SELECT id, pi_no, paid_amount, pending_to_pay FROM purchase_invoices WHERE id = ANY($1) FOR UPDATE",
                [uniqueInvoiceIds]
            );
            invMap = new Map(invRes.rows.map(r => [r.id, r]));
        }

        // 3. Lock Vendor row (Lock 3)
        const vendorRes = await client.query(
            "SELECT id, pending_to_pay, vendor_advance_balance FROM vendors WHERE id = $1 FOR UPDATE",
            [payment.vendor_id]
        );
        if (vendorRes.rows.length === 0) {
            throw new Error('Vendor not found');
        }
        const vendor = vendorRes.rows[0];

        const paymentAllocatedAmt = parseFloat(payment.allocated_amount) || 0;
        const paymentAdvanceAmt = parseFloat(payment.advance_amount) || 0;

        // Invariant check: vendor advance balance must be sufficient to revert
        const currentVendorAdvance = parseFloat(vendor.vendor_advance_balance) || 0;
        if (currentVendorAdvance < paymentAdvanceAmt) {
            throw new Error(`Insufficient vendor advance balance. Available: ${currentVendorAdvance}, Required: ${paymentAdvanceAmt}`);
        }

        // 4. Perform reversals
        // Revert allocations
        for (const alloc of allocRes.rows) {
            const inv = invMap.get(alloc.purchase_invoice_id);
            if (!inv) {
                throw new Error(`Purchase Invoice with ID "${alloc.purchase_invoice_id}" not found`);
            }
            const allocatedVal = parseFloat(alloc.allocated_amount) || 0;
            
            // Revert Invoice balances
            await client.query(
                "UPDATE purchase_invoices SET paid_amount = COALESCE(paid_amount, 0) - $1, pending_to_pay = COALESCE(pending_to_pay, 0) + $1 WHERE id = $2",
                [allocatedVal, inv.id]
            );
            
            // Revert Vendor outstanding payable
            await client.query(
                "UPDATE vendors SET pending_to_pay = COALESCE(pending_to_pay, 0) + $1 WHERE id = $2",
                [allocatedVal, vendor.id]
            );
        }

        // Revert Vendor Advance Balance
        await client.query(
            "UPDATE vendors SET vendor_advance_balance = COALESCE(vendor_advance_balance, 0) - $1 WHERE id = $2",
            [paymentAdvanceAmt, vendor.id]
        );

        // Update Payment Status
        await client.query(
            `UPDATE vendor_payments SET 
                status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2
             WHERE id = $3`,
            [cancelledBy, reason, paymentId]
        );

        
        await insertAuditLog(client, {
            tableName: 'vendor_payments',
            recordId: paymentId,
            action: 'CANCEL',
            oldData: payment,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Vendor payment cancelled successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to cancel vendor payment' });
    } finally {
        client.release();
    }
});

// 3. POST /api/sales-returns/:id/cancel
// PUT /api/sales-returns/:id (Full Edit)
app.put('/api/sales-returns/:id', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const returnId = req.params.id;
    const {
        date,
        customerId,
        invoiceId,
        invoiceNo,
        grandTotal: clientGrandTotal,
        refundAmount: clientRefundAmount,
        storeCredit: clientStoreCredit,
        items
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Transaction Initialization & Locking
        const retRes = await client.query(
            "SELECT * FROM sales_returns WHERE id = $1 FOR UPDATE",
            [returnId]
        );
        if (retRes.rows.length === 0) {
            throw new Error('Sales Return not found');
        }
        const oldRet = retRes.rows[0];

        if (updatedAt) {
            const dbUpdatedAt = new Date(oldRet.updated_at).getTime();
            const reqUpdatedAt = new Date(updatedAt).getTime();
            if (dbUpdatedAt !== reqUpdatedAt && !isNaN(dbUpdatedAt) && !isNaN(reqUpdatedAt)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'This transaction has been modified by another user.\nPlease refresh the document and try again.' });
            }
        }

        // 2. Validation & Restrictions Check
        if (oldRet.status === 'CANCELLED') {
            throw new Error('Cannot edit a cancelled return.');
        }

        if (customerId && String(customerId) !== String(oldRet.customer_id)) {
            throw new Error('Changing the Customer is not permitted. Please cancel this transaction and create a new one.');
        }

        // Validate new items
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Return must contain at least one line item');
        }
        for (const it of items) {
            const qty = parseFloat(it.qty);
            if (isNaN(qty) || qty <= 0) {
                throw new Error(`Invalid quantity (${it.qty}) for item: ${it.name || it.code}`);
            }
        }

        const grandTotal = parseFloat(clientGrandTotal) || 0;
        const refundAmount = parseFloat(clientRefundAmount) || 0;
        const storeCredit = parseFloat(clientStoreCredit) || 0;

        if (grandTotal < 0) throw new Error('Grand total cannot be negative');
        if (refundAmount < 0) throw new Error('Refund amount cannot be negative');
        if (storeCredit < 0) throw new Error('Store credit cannot be negative');
        if (Math.abs(grandTotal - (refundAmount + storeCredit)) > 0.01) {
            throw new Error('Refund + Store Credit must equal Grand Total');
        }

        // Parse Dates
        let parsedDate = date;
        if (parsedDate && parsedDate.includes('/')) {
            const parts = parsedDate.split('/');
            if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDate) {
            parsedDate = new Date().toISOString().split('T')[0];
        }

        // 3. Delta Calculation (Items)
        const oldItems = typeof oldRet.items === 'string' ? JSON.parse(oldRet.items) : oldRet.items;
        const itemDeltas = new Map(); 

        for (const oldIt of oldItems) {
            const itemId = String(oldIt.id || oldIt.item_id);
            const qty = parseFloat(oldIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) - qty);
            }
        }

        for (const newIt of items) {
            const itemId = String(newIt.id || newIt.item_id || newIt.item?.id);
            const qty = parseFloat(newIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) + qty);
            }
        }

        for (const [itemId, delta] of itemDeltas.entries()) {
            if (Math.abs(delta) < 0.0001) itemDeltas.delete(itemId);
        }

        // 4. Stock Validation
        const itemIds = Array.from(itemDeltas.keys()).sort();
        if (itemIds.length > 0) {
            const dbItemsRes = await client.query(
                `SELECT id, code, name, stock FROM items WHERE id = ANY($1::text[]) ORDER BY id ASC FOR UPDATE`,
                [itemIds]
            );

            const dbItemsMap = new Map();
            dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.id), r));

            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemId);
                if (!dbItem) throw new Error(`Item ID "${itemId}" not found in inventory`);
                
                const currentStock = parseFloat(dbItem.stock) || 0;
                if (currentStock + deltaQty < 0) {
                    throw new Error(`Insufficient stock for item "${dbItem.name}". Available: ${currentStock}`);
                }
            }

            // Apply Stock Deltas
            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                await client.query(`UPDATE items SET stock = stock + $1 WHERE id = $2`, [deltaQty, itemId]);
            }
        }

        // 5. Applying New Financial Effects (Store Credit)
        const actualCustomerId = oldRet.customer_id;
        const oldStoreCredit = parseFloat(oldRet.store_credit) || 0;

        if (actualCustomerId && String(actualCustomerId) !== 'walk-in') {
            await client.query(`SELECT id FROM customers WHERE id = $1 FOR UPDATE`, [actualCustomerId]);
            const creditDelta = storeCredit - oldStoreCredit;
            if (Math.abs(creditDelta) > 0.0001) {
                await client.query(`UPDATE customers SET store_credit_balance = COALESCE(store_credit_balance, 0) + $1 WHERE id = $2`, [creditDelta, actualCustomerId]);
            }
        }

        // 6. Update Document
        const updateQuery = `
            UPDATE sales_returns SET
                date = $1, invoice_id = $2, invoice_no = $3,
                grand_total = $4, refund_amount = $5, store_credit = $6,
                items = $7, updated_at = NOW()
            WHERE id = $8 RETURNING *
        `;
        const updateRes = await client.query(updateQuery, [
            parsedDate, invoiceId || null, invoiceNo || '', grandTotal, refundAmount, storeCredit,
            JSON.stringify(items), returnId
        ]);
        const newRet = updateRes.rows[0];

        // 7. Audit Logging
        await insertAuditLog(client, { tableName: 'sales_returns', recordId: returnId, action: 'UPDATE', oldData: oldRet, newData: newRet, req, transactionId });
        await client.query('COMMIT');
        res.json({ success: true, data: newRet });

    } catch (e) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: e.message || 'Failed to update Sales Return' });
    } finally {
        client.release();
    }
});

// PUT /api/purchase-returns/:id (Full Edit)
app.put('/api/purchase-returns/:id', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const returnId = req.params.id;
    const {
        date, vendorId, invoiceId, invoiceNo,
        grandTotal: clientGrandTotal, refundAmount: clientRefundAmount, storeCredit: clientStoreCredit, items, updatedAt
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const retRes = await client.query("SELECT * FROM purchase_returns WHERE id = $1 FOR UPDATE", [returnId]);
        if (retRes.rows.length === 0) throw new Error('Purchase Return not found');
        const oldRet = retRes.rows[0];

        if (updatedAt) {
            const dbUpdatedAt = new Date(oldRet.updated_at).getTime();
            const reqUpdatedAt = new Date(updatedAt).getTime();
            if (dbUpdatedAt !== reqUpdatedAt && !isNaN(dbUpdatedAt) && !isNaN(reqUpdatedAt)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'This transaction has been modified by another user.\nPlease refresh the document and try again.' });
            }
        }

        if (oldRet.status === 'CANCELLED') throw new Error('Cannot edit a cancelled return.');
        
        if (vendorId && String(vendorId) !== String(oldRet.vendor_id)) {
            throw new Error('Changing the Vendor is not permitted. Please cancel this transaction and create a new one.');
        }

        if (!items || !Array.isArray(items) || items.length === 0) throw new Error('Return must contain at least one line item');
        for (const it of items) {
            const qty = parseFloat(it.qty);
            if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity (${it.qty}) for item: ${it.name || it.code}`);
        }

        const grandTotal = parseFloat(clientGrandTotal) || 0;
        const refundAmount = parseFloat(clientRefundAmount) || 0;
        const storeCredit = parseFloat(clientStoreCredit) || 0;

        if (grandTotal < 0 || refundAmount < 0 || storeCredit < 0) throw new Error('Amounts cannot be negative');
        if (Math.abs(grandTotal - (refundAmount + storeCredit)) > 0.01) throw new Error('Refund + Store Credit must equal Grand Total');

        let parsedDate = date;
        if (parsedDate && parsedDate.includes('/')) {
            const parts = parsedDate.split('/');
            if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDate) {
            parsedDate = new Date().toISOString().split('T')[0];
        }

        const oldItems = typeof oldRet.items === 'string' ? JSON.parse(oldRet.items) : oldRet.items;
        const itemDeltas = new Map(); 

        for (const oldIt of oldItems) {
            const itemId = String(oldIt.id || oldIt.item_id);
            const qty = parseFloat(oldIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) - qty);
            }
        }

        for (const newIt of items) {
            const itemId = String(newIt.id || newIt.item_id || newIt.item?.id);
            const qty = parseFloat(newIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) + qty);
            }
        }

        for (const [itemId, delta] of itemDeltas.entries()) {
            if (Math.abs(delta) < 0.0001) itemDeltas.delete(itemId);
        }

        const itemIds = Array.from(itemDeltas.keys()).sort();
        if (itemIds.length > 0) {
            const dbItemsRes = await client.query(`SELECT id, code, name, stock FROM items WHERE id = ANY($1::text[]) ORDER BY id ASC FOR UPDATE`, [itemIds]);
            const dbItemsMap = new Map();
            dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.id), r));

            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemId);
                if (!dbItem) throw new Error(`Item ID "${itemId}" not found in inventory`);
                const currentStock = parseFloat(dbItem.stock) || 0;
                if (currentStock - deltaQty < 0) throw new Error(`Insufficient stock for item "${dbItem.name}". Available: ${currentStock}`);
            }

            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                await client.query(`UPDATE items SET stock = stock - $1 WHERE id = $2`, [deltaQty, itemId]);
            }
        }

        // Store credit on vendor
        const actualVendorId = oldRet.vendor_id;
        const oldStoreCredit = parseFloat(oldRet.store_credit) || 0;

        if (actualVendorId) {
            await client.query(`SELECT id FROM vendors WHERE id = $1 FOR UPDATE`, [actualVendorId]);
            const creditDelta = storeCredit - oldStoreCredit;
            if (Math.abs(creditDelta) > 0.0001) {
                await client.query(`UPDATE vendors SET store_credit_balance = COALESCE(store_credit_balance, 0) + $1 WHERE id = $2`, [creditDelta, actualVendorId]);
            }
        }

        const updateQuery = `
            UPDATE purchase_returns SET
                date = $1, invoice_id = $2, invoice_no = $3,
                grand_total = $4, refund_amount = $5, store_credit = $6,
                items = $7, updated_at = NOW()
            WHERE id = $8 RETURNING *
        `;
        const updateRes = await client.query(updateQuery, [
            parsedDate, invoiceId || null, invoiceNo || '', grandTotal, refundAmount, storeCredit,
            JSON.stringify(items), returnId
        ]);
        const newRet = updateRes.rows[0];

        await insertAuditLog(client, { tableName: 'purchase_returns', recordId: returnId, action: 'UPDATE', oldData: oldRet, newData: newRet, req, transactionId });
        await client.query('COMMIT');
        res.json({ success: true, data: newRet });

    } catch (e) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: e.message || 'Failed to update Purchase Return' });
    } finally {
        client.release();
    }
});


app.post('/api/sales-returns/:id/cancel', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const returnId = req.params.id;
    const { reason } = req.body;
    const cancelledBy = req.username || 'System';

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock sales_returns row (Lock 1)
        const returnRes = await client.query(
            "SELECT id, return_no, invoice_id, customer_id, store_credit, receivable_reduction, status, items FROM sales_returns WHERE id = $1 FOR UPDATE",
            [returnId]
        );
        if (returnRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sales Return not found' });
        }
        const salesReturn = returnRes.rows[0];

        // Double-cancellation protection
        if (salesReturn.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This return is already cancelled' });
        }

        // Snapshot nullability verification (historical non-cancellable check)
        if (salesReturn.receivable_reduction === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This historical record cannot be cancelled because its original credit allocation was not captured.' });
        }

        // 2. Lock original Sales Invoice (Lock 2)
        const invoiceRes = await client.query(
            "SELECT id, invoice_no FROM sales_invoices WHERE id = $1 FOR UPDATE",
            [salesReturn.invoice_id]
        );
        if (invoiceRes.rows.length === 0) {
            throw new Error('Original Sales Invoice not found');
        }

        const returnItems = typeof salesReturn.items === 'string'
            ? JSON.parse(salesReturn.items)
            : (salesReturn.items || []);

        const returnCodes = [...new Set(returnItems.map(i => String(i.code)))].sort();

        // 3. Lock target Items in deterministic sorted order (Lock 3)
        let dbItemsMap = new Map();
        if (returnCodes.length > 0) {
            const dbItemsRes = await client.query(
                "SELECT code, name, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE",
                [returnCodes]
            );
            dbItemsMap = new Map(dbItemsRes.rows.map(r => [r.code, r]));
        }

        // 4. Lock Customer row (Lock 4)
        const custRes = await client.query(
            "SELECT id, pending_to_receive, store_credit_balance FROM customers WHERE id = $1 FOR UPDATE",
            [salesReturn.customer_id]
        );
        if (custRes.rows.length === 0) {
            throw new Error('Customer not found');
        }
        const customer = custRes.rows[0];

        const storeCreditToRevert = parseFloat(salesReturn.store_credit) || 0;
        const currentStoreCredit = parseFloat(customer.store_credit_balance) || 0;

        // Store credit safety check
        if (currentStoreCredit < storeCreditToRevert) {
            throw new Error(`Insufficient customer store credit balance. Available: ${currentStoreCredit}, Required: ${storeCreditToRevert}`);
        }

        // 5. Perform Reversals
        // Revert Stock
        for (const item of returnItems) {
            await client.query(
                "UPDATE items SET stock = stock - $1 WHERE code = $2",
                [parseFloat(item.qty), item.code]
            );
        }

        // Revert Customer pending_to_receive and store_credit_balance
        await client.query(
            `UPDATE customers SET 
                pending_to_receive = COALESCE(pending_to_receive, 0) + $1,
                store_credit_balance = COALESCE(store_credit_balance, 0) - $2
             WHERE id = $3`,
            [parseFloat(salesReturn.receivable_reduction), storeCreditToRevert, customer.id]
        );

        // Update Sales Return status
        await client.query(
            `UPDATE sales_returns SET 
                status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2
             WHERE id = $3`,
            [cancelledBy, reason, returnId]
        );

        
        await insertAuditLog(client, {
            tableName: 'sales_returns',
            recordId: returnId,
            action: 'CANCEL',
            oldData: returnDoc,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Sales Return cancelled successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to cancel sales return' });
    } finally {
        client.release();
    }
});

// 4. POST /api/purchase-returns/:id/cancel
app.post('/api/purchase-returns/:id/cancel', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const returnId = req.params.id;
    const { reason } = req.body;
    const cancelledBy = req.username || 'System';

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock purchase_returns row (Lock 1)
        const returnRes = await client.query(
            "SELECT id, return_no, invoice_id, vendor_id, vendor_credit, payable_reduction, status, items FROM purchase_returns WHERE id = $1 FOR UPDATE",
            [returnId]
        );
        if (returnRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Purchase Return not found' });
        }
        const purchaseReturn = returnRes.rows[0];

        // Double-cancellation protection
        if (purchaseReturn.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This return is already cancelled' });
        }

        // Snapshot nullability verification (historical non-cancellable check)
        if (purchaseReturn.payable_reduction === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This historical record cannot be cancelled because its original credit allocation was not captured.' });
        }

        // 2. Lock original Purchase Invoice (Lock 2)
        const invoiceRes = await client.query(
            "SELECT id, pi_no FROM purchase_invoices WHERE id = $1 FOR UPDATE",
            [purchaseReturn.invoice_id]
        );
        if (invoiceRes.rows.length === 0) {
            throw new Error('Original Purchase Invoice not found');
        }

        const returnItems = typeof purchaseReturn.items === 'string'
            ? JSON.parse(purchaseReturn.items)
            : (purchaseReturn.items || []);

        const returnCodes = [...new Set(returnItems.map(i => String(i.code)))].sort();

        // 3. Lock target Items in deterministic sorted order (Lock 3)
        let dbItemsMap = new Map();
        if (returnCodes.length > 0) {
            const dbItemsRes = await client.query(
                "SELECT code, name, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE",
                [returnCodes]
            );
            dbItemsMap = new Map(dbItemsRes.rows.map(r => [r.code, r]));
        }

        // 4. Lock Vendor row (Lock 4)
        const vendorRes = await client.query(
            "SELECT id, pending_to_pay, vendor_credit_balance FROM vendors WHERE id = $1 FOR UPDATE",
            [purchaseReturn.vendor_id]
        );
        if (vendorRes.rows.length === 0) {
            throw new Error('Vendor not found');
        }
        const vendor = vendorRes.rows[0];

        const vendorCreditToRevert = parseFloat(purchaseReturn.vendor_credit) || 0;
        const currentVendorCredit = parseFloat(vendor.vendor_credit_balance) || 0;

        // Vendor credit safety check
        if (currentVendorCredit < vendorCreditToRevert) {
            throw new Error(`Insufficient vendor credit balance. Available: ${currentVendorCredit}, Required: ${vendorCreditToRevert}`);
        }

        // 5. Perform Reversals
        // Revert Stock (re-add since return deducted it)
        for (const item of returnItems) {
            await client.query(
                "UPDATE items SET stock = stock + $1 WHERE code = $2",
                [parseFloat(item.qty), item.code]
            );
        }

        // Revert Vendor pending_to_pay and vendor_credit_balance
        await client.query(
            `UPDATE vendors SET 
                pending_to_pay = COALESCE(pending_to_pay, 0) + $1,
                vendor_credit_balance = COALESCE(vendor_credit_balance, 0) - $2
             WHERE id = $3`,
            [parseFloat(purchaseReturn.payable_reduction), vendorCreditToRevert, vendor.id]
        );

        // Update Purchase Return status
        await client.query(
            `UPDATE purchase_returns SET 
                status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2
             WHERE id = $3`,
            [cancelledBy, reason, returnId]
        );

        
        await insertAuditLog(client, {
            tableName: 'purchase_returns',
            recordId: returnId,
            action: 'CANCEL',
            oldData: returnDoc,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Purchase Return cancelled successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to cancel purchase return' });
    } finally {
        client.release();
    }
});

// 5. POST /api/sales/:id/cancel
app.post('/api/sales/:id/cancel', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const invoiceId = req.params.id;
    const { reason } = req.body;
    const cancelledBy = req.username || 'System';

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock sales_invoices row (Lock 1)
        const invoiceRes = await client.query(
            "SELECT id, invoice_no, customer_id, pending_to_receive, store_credit_applied, status, items FROM sales_invoices WHERE id = $1 FOR UPDATE",
            [invoiceId]
        );
        if (invoiceRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sales Invoice not found' });
        }
        const invoice = invoiceRes.rows[0];

        // Double-cancellation protection
        if (invoice.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This invoice is already cancelled' });
        }

        // Snapshot nullability verification (historical non-cancellable check)
        if (invoice.store_credit_applied === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This historical record cannot be cancelled because its original credit allocation was not captured.' });
        }

        // Dependency validation (Active Customer Receipts)
        const activeReceiptsRes = await client.query(
            `SELECT COUNT(*) FROM customer_receipt_allocations cra
             JOIN customer_receipts cr ON cra.receipt_id = cr.id
             WHERE cra.invoice_id = $1 AND cr.status = 'ACTIVE'`,
            [invoiceId]
        );
        if (parseInt(activeReceiptsRes.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot cancel invoice. Active customer receipts are allocated against this invoice.' });
        }

        // Dependency validation (Active Sales Returns)
        const activeReturnsRes = await client.query(
            "SELECT COUNT(*) FROM sales_returns WHERE invoice_id = $1 AND status = 'ACTIVE'",
            [invoiceId]
        );
        if (parseInt(activeReturnsRes.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot cancel invoice. Active sales returns exist for this invoice.' });
        }

        const invoiceItems = typeof invoice.items === 'string'
            ? JSON.parse(invoice.items)
            : (invoice.items || []);

        const itemCodes = [...new Set(invoiceItems.map(i => String(i.code)))].sort();

        // 2. Lock target Items in deterministic sorted order (Lock 2)
        let dbItemsMap = new Map();
        if (itemCodes.length > 0) {
            const dbItemsRes = await client.query(
                "SELECT code, name, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE",
                [itemCodes]
            );
            dbItemsMap = new Map(dbItemsRes.rows.map(r => [r.code, r]));
        }

        // 3. Lock Customer row (Lock 3)
        const isWalkIn = !invoice.customer_id || String(invoice.customer_id) === 'walk-in';
        let customer = null;
        if (!isWalkIn) {
            const custRes = await client.query(
                "SELECT id, pending_to_receive, store_credit_balance FROM customers WHERE id = $1 FOR UPDATE",
                [invoice.customer_id]
            );
            if (custRes.rows.length === 0) {
                throw new Error('Customer not found');
            }
            customer = custRes.rows[0];
        }

        // 4. Perform Reversals
        // Revert Stock (re-add since sale deducted it)
        for (const item of invoiceItems) {
            await client.query(
                "UPDATE items SET stock = stock + $1 WHERE code = $2",
                [parseFloat(item.qty), item.code]
            );
        }

        if (!isWalkIn && customer) {
            const pendingToReceiveToRevert = parseFloat(invoice.pending_to_receive) || 0;
            const storeCreditToRestore = parseFloat(invoice.store_credit_applied) || 0;
            
            // Revert Customer outstanding and restore store credit
            await client.query(
                `UPDATE customers SET 
                    pending_to_receive = COALESCE(pending_to_receive, 0) - $1,
                    store_credit_balance = COALESCE(store_credit_balance, 0) + $2
                 WHERE id = $3`,
                [pendingToReceiveToRevert, storeCreditToRestore, customer.id]
            );
        }

        // Update Sales Invoice status
        await client.query(
            `UPDATE sales_invoices SET 
                status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2
             WHERE id = $3`,
            [cancelledBy, reason, invoiceId]
        );

        
        await insertAuditLog(client, {
            tableName: 'sales_invoices',
            recordId: invoiceId,
            action: 'CANCEL',
            oldData: invoice,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Sales Invoice cancelled successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to cancel sales invoice' });
    } finally {
        client.release();
    }
});

// 6. POST /api/purchases/:id/cancel
app.post('/api/purchases/:id/cancel', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const invoiceId = req.params.id;
    const { reason } = req.body;
    const cancelledBy = req.username || 'System';

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock purchase_invoices row (Lock 1)
        const invoiceRes = await client.query(
            "SELECT id, pi_no, vendor_id, pending_to_pay, status, items FROM purchase_invoices WHERE id = $1 FOR UPDATE",
            [invoiceId]
        );
        if (invoiceRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Purchase Invoice not found' });
        }
        const invoice = invoiceRes.rows[0];

        // Double-cancellation protection
        if (invoice.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This invoice is already cancelled' });
        }

        // Dependency validation (Active Vendor Payments)
        const activePaymentsRes = await client.query(
            `SELECT COUNT(*) FROM vendor_payment_allocations vpa
             JOIN vendor_payments vp ON vpa.payment_id = vp.id
             WHERE vpa.purchase_invoice_id = $1 AND vp.status = 'ACTIVE'`,
            [invoiceId]
        );
        if (parseInt(activePaymentsRes.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot cancel invoice. Active vendor payments are allocated against this invoice.' });
        }

        // Dependency validation (Active Purchase Returns)
        const activeReturnsRes = await client.query(
            "SELECT COUNT(*) FROM purchase_returns WHERE invoice_id = $1 AND status = 'ACTIVE'",
            [invoiceId]
        );
        if (parseInt(activeReturnsRes.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot cancel invoice. Active purchase returns exist for this invoice.' });
        }

        const invoiceItems = typeof invoice.items === 'string'
            ? JSON.parse(invoice.items)
            : (invoice.items || []);

        const itemCodes = [...new Set(invoiceItems.map(i => String(i.code || i.hsn)))].sort();

        // 2. Lock target Items in deterministic sorted order (Lock 2)
        let dbItemsMap = new Map();
        if (itemCodes.length > 0) {
            const dbItemsRes = await client.query(
                "SELECT code, name, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE",
                [itemCodes]
            );
            dbItemsMap = new Map(dbItemsRes.rows.map(r => [r.code, r]));
        }

        // Stock Safety Validation (prevent negative stock on reversal)
        for (const item of invoiceItems) {
            const code = String(item.code || item.hsn);
            const dbItem = dbItemsMap.get(code);
            if (!dbItem) {
                throw new Error(`Item ${item.name || code} not found in inventory`);
            }
            const currentStock = parseFloat(dbItem.stock) || 0;
            const requiredToDeduct = parseFloat(item.qty) || 0;
            if (currentStock < requiredToDeduct) {
                throw new Error(`Insufficient stock for item "${dbItem.name || code}" to reverse purchase. Available: ${currentStock}, Required: ${requiredToDeduct}`);
            }
        }

        // 3. Lock Vendor row (Lock 3)
        const custRes = await client.query(
            "SELECT id, pending_to_pay FROM vendors WHERE id = $1 FOR UPDATE",
            [invoice.vendor_id]
        );
        if (custRes.rows.length === 0) {
            throw new Error('Vendor not found');
        }
        const vendor = custRes.rows[0];

        // 4. Perform Reversals
        // Revert Stock (deduct since purchase added it)
        for (const item of invoiceItems) {
            const code = String(item.code || item.hsn);
            await client.query(
                "UPDATE items SET stock = stock - $1 WHERE code = $2",
                [parseFloat(item.qty), code]
            );
        }

        // Revert Vendor pending_to_pay
        const pendingToPayToRevert = parseFloat(invoice.pending_to_pay) || 0;
        await client.query(
            "UPDATE vendors SET pending_to_pay = COALESCE(pending_to_pay, 0) - $1 WHERE id = $2",
            [pendingToPayToRevert, vendor.id]
        );

        // Update Purchase Invoice status
        await client.query(
            `UPDATE purchase_invoices SET 
                status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2
             WHERE id = $3`,
            [cancelledBy, reason, invoiceId]
        );

        
        await insertAuditLog(client, {
            tableName: 'purchase_invoices',
            recordId: purchaseId,
            action: 'CANCEL',
            oldData: invoice,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Purchase Invoice cancelled successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to cancel purchase invoice' });
    } finally {
        client.release();
    }
});

// PUT /api/sales/:id (Full Edit)
app.put('/api/sales/:id', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const invoiceId = req.params.id;
    const {
        date,
        refNo,
        dueDate,
        paymentTerms,
        customerId,
        subTotal,
        discount,
        taxAmount,
        grandTotal: clientGrandTotal,
        receivedAmount: clientReceivedAmount,
        items,
        updatedAt
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Transaction Initialization & Locking
        const invRes = await client.query(
            "SELECT * FROM sales_invoices WHERE id = $1 FOR UPDATE",
            [invoiceId]
        );
        if (invRes.rows.length === 0) {
            throw new Error('Sales Invoice not found');
        }
        const oldInv = invRes.rows[0];

        if (updatedAt) {
            const dbUpdatedAt = new Date(oldInv.updated_at).getTime();
            const reqUpdatedAt = new Date(updatedAt).getTime();
            if (dbUpdatedAt !== reqUpdatedAt && !isNaN(dbUpdatedAt) && !isNaN(reqUpdatedAt)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'This transaction has been modified by another user.\nPlease refresh the document and try again.' });
            }
        }

        // 2. Validation & Restrictions Check
        if (oldInv.status === 'CANCELLED') {
            throw new Error('Cannot edit a cancelled invoice.');
        }

        const receiptsCheck = await client.query(
            "SELECT COUNT(*) as count FROM customer_receipt_allocations WHERE invoice_id = $1",
            [invoiceId]
        );
        if (parseInt(receiptsCheck.rows[0].count) > 0) {
            throw new Error('Cannot edit invoice: Receipts are already allocated to this invoice.');
        }

        const returnsCheck = await client.query(
            "SELECT COUNT(*) as count FROM sales_returns WHERE invoice_id = $1 AND status = 'ACTIVE'",
            [invoiceId]
        );
        if (parseInt(returnsCheck.rows[0].count) > 0) {
            throw new Error('Cannot edit invoice: Sales Returns are linked to this invoice.');
        }
        
        // Ensure customer identity cannot be changed
        if (customerId && String(customerId) !== String(oldInv.customer_id)) {
            throw new Error('Changing the Customer is not permitted. Please cancel this transaction and create a new one.');
        }

        // Validate new items
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Invoice must contain at least one line item');
        }
        for (const it of items) {
            const qty = parseFloat(it.qty);
            if (isNaN(qty) || qty <= 0) {
                throw new Error(`Invalid quantity (${it.qty}) for item: ${it.name || it.code}`);
            }
        }

        const parsedSubTotal = parseFloat(subTotal) || 0;
        const parsedDiscount = parseFloat(discount) || 0;
        const parsedTaxAmount = parseFloat(taxAmount) || 0;
        const grandTotal = parseFloat(clientGrandTotal) || 0;
        const receivedAmount = parseFloat(clientReceivedAmount) || 0;

        if (grandTotal < 0) throw new Error('Grand total cannot be negative');
        if (receivedAmount < 0) throw new Error('Received amount cannot be negative');
        if (receivedAmount > grandTotal) throw new Error('Received amount cannot exceed grand total');
        
        const netUnpaid = Math.max(0, grandTotal - receivedAmount);

        // Parse Dates
        let parsedDate = date;
        if (parsedDate && parsedDate.includes('/')) {
            const parts = parsedDate.split('/');
            if (parsedDate.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDate) {
            parsedDate = new Date().toISOString().split('T')[0];
        }

        let parsedDueDate = dueDate;
        if (parsedDueDate && parsedDueDate.includes('/')) {
            const parts = parsedDueDate.split('/');
            if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDueDate) {
            parsedDueDate = null;
        }

        // 3. Delta Calculation (Items using primary key ID)
        const oldItems = typeof oldInv.items === 'string' ? JSON.parse(oldInv.items) : oldInv.items;
        
        const itemDeltas = new Map(); // key: item id, value: qty delta (new - old)

        for (const oldIt of oldItems) {
            const itemId = String(oldIt.id || oldIt.item_id);
            const qty = parseFloat(oldIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) - qty);
            }
        }

        for (const newIt of items) {
            const itemId = String(newIt.id || newIt.item_id || newIt.item?.id);
            const qty = parseFloat(newIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) + qty);
            }
        }

        // Clean up 0 deltas
        for (const [itemId, delta] of itemDeltas.entries()) {
            if (Math.abs(delta) < 0.0001) itemDeltas.delete(itemId);
        }

        // 4. Stock Validation
        const itemIds = Array.from(itemDeltas.keys()).sort();
        if (itemIds.length > 0) {
            const dbItemsRes = await client.query(
                `SELECT id, code, name, stock FROM items WHERE id = ANY($1::text[]) ORDER BY id ASC FOR UPDATE`,
                [itemIds]
            );

            const dbItemsMap = new Map();
            dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.id), r));

            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemId);
                if (!dbItem) {
                    throw new Error(`Item ID "${itemId}" not found in inventory`);
                }
                const currentStock = parseFloat(dbItem.stock) || 0;
                // For sales, deltaQty > 0 means we need to take MORE from stock.
                if (currentStock - deltaQty < 0) {
                    throw new Error(`Insufficient stock for item "${dbItem.name}". Available: ${currentStock}, Edit requires deducting additional: ${deltaQty}`);
                }
            }

            // Apply Stock Deltas
            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                await client.query(
                    `UPDATE items SET stock = stock - $1 WHERE id = $2`,
                    [deltaQty, itemId]
                );
            }
        }

        // 5. Applying New Financial Effects
        const oldNetUnpaid = parseFloat(oldInv.pending_to_receive) || 0;
        const actualCustomerId = oldInv.customer_id;
        
        if (actualCustomerId && String(actualCustomerId) !== 'walk-in') {
            await client.query(`SELECT id FROM customers WHERE id = $1 FOR UPDATE`, [actualCustomerId]);
            const netUnpaidDelta = netUnpaid - oldNetUnpaid;
            if (Math.abs(netUnpaidDelta) > 0.0001) {
                await client.query(
                    `UPDATE customers SET pending_to_receive = COALESCE(pending_to_receive, 0) + $1 WHERE id = $2`,
                    [netUnpaidDelta, actualCustomerId]
                );
            }
        }

        // 6. Update the Document (do NOT update customer_id, customer_name)
        const updateQuery = `
            UPDATE sales_invoices SET
                date = $1, ref_no = $2, due_date = $3, payment_terms = $4,
                sub_total = $5, discount_amount = $6, total_tax = $7, amount = $8,
                paid_amount = $9, pending_to_receive = $10, items = $11,
                updated_at = NOW()
            WHERE id = $12 RETURNING *
        `;
        const updateVals = [
            parsedDate, refNo || '', parsedDueDate, paymentTerms || '',
            parsedSubTotal, parsedDiscount, parsedTaxAmount, grandTotal,
            receivedAmount, netUnpaid, JSON.stringify(items),
            invoiceId
        ];
        const updateRes = await client.query(updateQuery, updateVals);
        const newInv = updateRes.rows[0];

        // 7. Audit Logging
        await insertAuditLog(client, {
            tableName: 'sales_invoices',
            recordId: invoiceId,
            action: 'UPDATE',
            oldData: oldInv,
            newData: newInv,
            req,
            transactionId
        });

        await client.query('COMMIT');
        res.json({ success: true, data: newInv });

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '40P01') {
            return res.status(400).json({ error: 'Transaction deadlock detected. Please try saving again.' });
        } else if (e.code === '55P03') {
            return res.status(400).json({ error: 'System is busy updating inventory for these items. Please try again.' });
        }
        res.status(400).json({ error: e.message || 'Failed to update transaction' });
    } finally {
        client.release();
    }
});


// PATCH /api/sales/:id
app.patch('/api/sales/:id', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const invoiceId = req.params.id;
    const allowedFields = ['refNo', 'dueDate', 'paymentTerms', 'note'];
    
    // Check if empty body
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'No fields provided for update' });
    }

    // Verify all keys are in the allowlist
    for (const key of Object.keys(req.body)) {
        if (!allowedFields.includes(key)) {
            return res.status(400).json({ error: `Field '${key}' is prohibited from editing.` });
        }
    }

    const { refNo, dueDate, paymentTerms, note } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock Sales Invoice first
        const invRes = await client.query(
            "SELECT id, status FROM sales_invoices WHERE id = $1 FOR UPDATE",
            [invoiceId]
        );
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sales Invoice not found' });
        }

        if (invRes.rows[0].status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot edit metadata on a cancelled invoice.' });
        }

        // Process fields to update
        const updates = [];
        const values = [];
        let idx = 1;

        if (refNo !== undefined) {
            updates.push(`ref_no = $${idx++}`);
            values.push(refNo || '');
        }
        if (dueDate !== undefined) {
            let parsedDueDate = dueDate;
            if (parsedDueDate && parsedDueDate.includes('/')) {
                const parts = parsedDueDate.split('/');
                if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDueDate) {
                parsedDueDate = null;
            }
            updates.push(`due_date = $${idx++}`);
            values.push(parsedDueDate);
        }
        if (paymentTerms !== undefined) {
            updates.push(`payment_terms = $${idx++}`);
            values.push(paymentTerms || '');
        }
        if (note !== undefined) {
            updates.push(`note = $${idx++}`);
            values.push(note || '');
        }

        if (updates.length > 0) {
            updates.push(`updated_at = NOW()`);
            values.push(invoiceId);
            const queryStr = `UPDATE sales_invoices SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
            const result = await client.query(queryStr, values);
            
            await insertAuditLog(client, {
                tableName: 'sales_invoices',
                recordId: invoiceId,
                action: 'PATCH',
                oldData: invRes.rows[0],
                newData: result.rows[0],
                req,
                transactionId
            });
            await client.query('COMMIT');
            return res.json({ success: true, data: result.rows[0] });
        } else {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No valid update fields specified' });
        }

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to update sales invoice metadata' });
    } finally {
        client.release();
    }
});

// PUT /api/purchases/:id (Full Edit)
app.put('/api/purchases/:id', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const invoiceId = req.params.id;
    const {
        date,
        refNo,
        dueDate,
        paymentTerms,
        vendorId,
        subTotal,
        discount,
        taxAmount,
        grandTotal: clientGrandTotal,
        paidAmount: clientPaidAmount,
        items
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Transaction Initialization & Locking
        const invRes = await client.query(
            "SELECT * FROM purchase_invoices WHERE id = $1 FOR UPDATE",
            [invoiceId]
        );
        if (invRes.rows.length === 0) {
            throw new Error('Purchase Invoice not found');
        }
        const oldInv = invRes.rows[0];

        if (updatedAt) {
            const dbUpdatedAt = new Date(oldInv.updated_at).getTime();
            const reqUpdatedAt = new Date(updatedAt).getTime();
            if (dbUpdatedAt !== reqUpdatedAt && !isNaN(dbUpdatedAt) && !isNaN(reqUpdatedAt)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'This transaction has been modified by another user.\nPlease refresh the document and try again.' });
            }
        }

        // 2. Validation & Restrictions Check
        if (oldInv.status === 'CANCELLED') {
            throw new Error('Cannot edit a cancelled invoice.');
        }

        const paymentsCheck = await client.query(
            "SELECT COUNT(*) as count FROM vendor_payment_allocations WHERE invoice_id = $1",
            [invoiceId]
        );
        if (parseInt(paymentsCheck.rows[0].count) > 0) {
            throw new Error('Cannot edit invoice: Vendor Payments are already allocated to this invoice.');
        }

        const returnsCheck = await client.query(
            "SELECT COUNT(*) as count FROM purchase_returns WHERE invoice_id = $1 AND status = 'ACTIVE'",
            [invoiceId]
        );
        if (parseInt(returnsCheck.rows[0].count) > 0) {
            throw new Error('Cannot edit invoice: Purchase Returns are linked to this invoice.');
        }

        if (vendorId && String(vendorId) !== String(oldInv.vendor_id)) {
            throw new Error('Changing the Vendor is not permitted. Please cancel this transaction and create a new one.');
        }

        // Validate new items
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Invoice must contain at least one line item');
        }
        for (const it of items) {
            const qty = parseFloat(it.qty);
            if (isNaN(qty) || qty <= 0) {
                throw new Error(`Invalid quantity (${it.qty}) for item: ${it.name || it.code}`);
            }
        }

        const parsedSubTotal = parseFloat(subTotal) || 0;
        const parsedDiscount = parseFloat(discount) || 0;
        const parsedTaxAmount = parseFloat(taxAmount) || 0;
        const grandTotal = parseFloat(clientGrandTotal) || 0;
        const paidAmount = parseFloat(clientPaidAmount) || 0;

        if (grandTotal < 0) throw new Error('Grand total cannot be negative');
        if (paidAmount < 0) throw new Error('Paid amount cannot be negative');
        if (paidAmount > grandTotal) throw new Error('Paid amount cannot exceed grand total');
        
        const netUnpaid = Math.max(0, grandTotal - paidAmount);

        // Parse Dates
        let parsedDate = date;
        if (parsedDate && parsedDate.includes('/')) {
            const parts = parsedDate.split('/');
            if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDate) {
            parsedDate = new Date().toISOString().split('T')[0];
        }

        let parsedDueDate = dueDate;
        if (parsedDueDate && parsedDueDate.includes('/')) {
            const parts = parsedDueDate.split('/');
            if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!parsedDueDate) {
            parsedDueDate = null;
        }

        // 3. Delta Calculation (Items using primary key ID)
        const oldItems = typeof oldInv.items === 'string' ? JSON.parse(oldInv.items) : oldInv.items;
        
        const itemDeltas = new Map(); 

        for (const oldIt of oldItems) {
            const itemId = String(oldIt.id || oldIt.item_id);
            const qty = parseFloat(oldIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) - qty);
            }
        }

        for (const newIt of items) {
            const itemId = String(newIt.id || newIt.item_id || newIt.item?.id);
            const qty = parseFloat(newIt.qty) || 0;
            if(itemId !== "undefined") {
                itemDeltas.set(itemId, (itemDeltas.get(itemId) || 0) + qty);
            }
        }

        // Clean up 0 deltas
        for (const [itemId, delta] of itemDeltas.entries()) {
            if (Math.abs(delta) < 0.0001) itemDeltas.delete(itemId);
        }

        // 4. Stock Validation
        const itemIds = Array.from(itemDeltas.keys()).sort();
        if (itemIds.length > 0) {
            const dbItemsRes = await client.query(
                `SELECT id, code, name, stock FROM items WHERE id = ANY($1::text[]) ORDER BY id ASC FOR UPDATE`,
                [itemIds]
            );

            const dbItemsMap = new Map();
            dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.id), r));

            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemId);
                if (!dbItem) {
                    throw new Error(`Item ID "${itemId}" not found in inventory`);
                }
                const currentStock = parseFloat(dbItem.stock) || 0;
                // For purchases, deltaQty < 0 means we took TOO MUCH away.
                if (currentStock + deltaQty < 0) {
                    throw new Error(`Insufficient stock for item "${dbItem.name}". Available: ${currentStock}, Edit requires deducting additional: ${Math.abs(deltaQty)}`);
                }
            }

            // Apply Stock Deltas
            for (const [itemId, deltaQty] of itemDeltas.entries()) {
                await client.query(
                    `UPDATE items SET stock = stock + $1 WHERE id = $2`,
                    [deltaQty, itemId]
                );
            }
        }

        // 5. Applying New Financial Effects
        const oldNetUnpaid = parseFloat(oldInv.pending_to_pay) || 0;
        const actualVendorId = oldInv.vendor_id;
        
        if (actualVendorId) {
            await client.query(`SELECT id FROM vendors WHERE id = $1 FOR UPDATE`, [actualVendorId]);
            const netUnpaidDelta = netUnpaid - oldNetUnpaid;
            if (Math.abs(netUnpaidDelta) > 0.0001) {
                await client.query(
                    `UPDATE vendors SET pending_to_pay = COALESCE(pending_to_pay, 0) + $1 WHERE id = $2`,
                    [netUnpaidDelta, actualVendorId]
                );
            }
        }

        // 6. Update the Document
        const updateQuery = `
            UPDATE purchase_invoices SET
                date = $1, ref_no = $2, due_date = $3, payment_terms = $4,
                sub_total = $5, discount_amount = $6, total_tax = $7, amount = $8,
                paid_amount = $9, pending_to_pay = $10, items = $11,
                updated_at = NOW()
            WHERE id = $12 RETURNING *
        `;
        const updateVals = [
            parsedDate, refNo || '', parsedDueDate, paymentTerms || '',
            parsedSubTotal, parsedDiscount, parsedTaxAmount, grandTotal,
            paidAmount, netUnpaid, JSON.stringify(items),
            invoiceId
        ];
        const updateRes = await client.query(updateQuery, updateVals);
        const newInv = updateRes.rows[0];

        // 7. Audit Logging
        await insertAuditLog(client, {
            tableName: 'purchase_invoices',
            recordId: invoiceId,
            action: 'UPDATE',
            oldData: oldInv,
            newData: newInv,
            req,
            transactionId
        });

        await client.query('COMMIT');
        res.json({ success: true, data: newInv });

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '40P01') {
            return res.status(400).json({ error: 'Transaction deadlock detected. Please try saving again.' });
        } else if (e.code === '55P03') {
            return res.status(400).json({ error: 'System is busy updating inventory for these items. Please try again.' });
        }
        res.status(400).json({ error: e.message || 'Failed to update transaction' });
    } finally {
        client.release();
    }
});


// PATCH /api/purchases/:id
app.patch('/api/purchases/:id', async (req, res) => {
    const transactionId = crypto.randomUUID();
    const invoiceId = req.params.id;
    const allowedFields = ['refNo', 'dueDate', 'paymentTerms', 'note'];

    // Check if empty body
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'No fields provided for update' });
    }

    // Verify all keys are in the allowlist
    for (const key of Object.keys(req.body)) {
        if (!allowedFields.includes(key)) {
            return res.status(400).json({ error: `Field '${key}' is prohibited from editing.` });
        }
    }

    const { refNo, dueDate, paymentTerms, note } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock Purchase Invoice first
        const invRes = await client.query(
            "SELECT id, status FROM purchase_invoices WHERE id = $1 FOR UPDATE",
            [invoiceId]
        );
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Purchase Invoice not found' });
        }

        if (invRes.rows[0].status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot edit metadata on a cancelled invoice.' });
        }

        // Process fields to update
        const updates = [];
        const values = [];
        let idx = 1;

        if (refNo !== undefined) {
            updates.push(`ref_no = $${idx++}`);
            values.push(refNo || '');
        }
        if (dueDate !== undefined) {
            let parsedDueDate = dueDate;
            if (parsedDueDate && parsedDueDate.includes('/')) {
                const parts = parsedDueDate.split('/');
                if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDueDate) {
                parsedDueDate = null;
            }
            updates.push(`due_date = $${idx++}`);
            values.push(parsedDueDate);
        }
        if (paymentTerms !== undefined) {
            updates.push(`payment_terms = $${idx++}`);
            values.push(paymentTerms || '');
        }
        if (note !== undefined) {
            updates.push(`note = $${idx++}`);
            values.push(note || '');
        }

        if (updates.length > 0) {
            updates.push(`updated_at = NOW()`);
            values.push(invoiceId);
            const queryStr = `UPDATE purchase_invoices SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
            const result = await client.query(queryStr, values);
            
            await insertAuditLog(client, {
                tableName: 'purchase_invoices',
                recordId: invoiceId,
                action: 'PATCH',
                oldData: invRes.rows[0],
                newData: result.rows[0],
                req,
                transactionId
            });
            await client.query('COMMIT');
            return res.json({ success: true, data: result.rows[0] });
        } else {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No valid update fields specified' });
        }

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Failed to update purchase invoice metadata' });
    } finally {
        client.release();
    }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start HTTP server on port 3000 (Local Dev)
if (require.main === module) {
    app.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`==================================================`);
        console.log(`  SPH Billing Server running at:`);
        console.log(`  Local:   http://localhost:${HTTP_PORT}`);
        console.log(`==================================================`);
    });
}

// Export for Vercel Serverless Functions
module.exports = app;
