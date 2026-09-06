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

const compression = require('compression');

const app = express();
const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;

// Configure Express trust proxy for Vercel/reverse-proxies (trusted upstream hop)
app.set('trust proxy', 1);

// Performance & Compression Middleware
app.use(compression({
    level: 6,
    threshold: 1024, // Compress responses above 1KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// Body Parsing Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Modern Security Headers Middleware (OWASP/Helmet compliant)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Prevents clickjacking
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevents MIME-sniffing
    res.setHeader('X-XSS-Protection', '0'); // Modern OWASP recommendation to disable buggy legacy XSS auditor
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); // Prevents referrer leaks
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()'); // Permits same-origin barcode scanner, blocks mic & geolocation
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // Conditional HSTS: only enforce on HTTPS / production to avoid breaking local dev
    if (req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// Strict CORS Middleware (No wildcards)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
        const isDev = process.env.NODE_ENV === 'development';
        const isAllowed = allowedOrigins.includes(origin) || 
                          (isDev && 
                           (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
                            /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
                            /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
                            /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/.test(origin)));
        if (isAllowed) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Vary', 'Origin');
        }
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key, x-admin-key');
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
    
    // Allow public health and login endpoints without auth
    if (req.path === '/health' || req.originalUrl === '/api/health' || req.path === '/api/health') {
        return next();
    }
    if (req.path === '/auth/login' || req.originalUrl === '/api/auth/login') {
        return next();
    }

    // Secure database initialization endpoint: in production disabled, in dev requires admin session or x-admin-key header
    if (req.path === '/init-db' || req.originalUrl === '/api/init-db') {
        if (process.env.NODE_ENV === 'production') {
            return res.status(404).json({ error: 'Endpoint disabled in production' });
        }
        const setupKey = req.headers['x-admin-key'];
        if (setupKey && setupKey === process.env.ADMIN_PASSWORD_HASH) {
            req.user = { id: 'usr_admin_default', username: process.env.ADMIN_USERNAME || 'admin', role: 'ADMIN' };
            req.username = req.user.username;
            return next();
        }
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
        const sessionRes = await pool.query(`
            SELECT s.username, s.user_id, s.role, s.expires_at, s.revoked_at, u.role as user_role, u.status as user_status, u.id as db_user_id
            FROM active_sessions s
            LEFT JOIN users u ON (s.user_id = u.id OR (s.user_id IS NULL AND u.username = s.username))
            WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
        `, [tokenHash]);

        if (sessionRes.rows.length === 0) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
        }

        const sessionRow = sessionRes.rows[0];
        if (sessionRow.user_status && sessionRow.user_status !== 'ACTIVE') {
            return res.status(401).json({ error: 'Unauthorized: Account is deactivated' });
        }

        // Enforce verified role from users table: never silently upgrade unassigned or pre-RBAC sessions to ADMIN
        const resolvedRole = sessionRow.user_role;
        if (!resolvedRole) {
            return res.status(401).json({ error: 'Unauthorized: Session role unverified. Please log in again.' });
        }

        // Update last_used_at in background
        pool.query("UPDATE active_sessions SET last_used_at = NOW() WHERE token_hash = $1", [tokenHash]).catch(err => {});

        req.user = {
            id: sessionRow.db_user_id || sessionRow.user_id,
            username: sessionRow.username,
            role: resolvedRole
        };
        req.username = sessionRow.username;
        next();
    } catch (err) {
        console.error('Session validation failed:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Role-based access control middleware
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid session role' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Forbidden: Access restricted. Required role: ${allowedRoles.join(' or ')}`
            });
        }
        next();
    };
};

app.use('/api', requireAuth);

// Prevent browser caching during development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const { Pool } = require('pg');

// Initialize PostgreSQL Pool (optimized for Vercel Serverless + Neon)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.PG_MAX_POOL_SIZE ? parseInt(process.env.PG_MAX_POOL_SIZE) : (process.env.VERCEL ? 3 : 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: (process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech'))) ? { rejectUnauthorized: false } : false
});

pool.on('connect', (client) => {
    client.on('error', (err) => {
        console.warn('PostgreSQL client error (handled):', err.message);
    });
});

pool.on('error', (err) => {
    console.warn('Unexpected error on idle PostgreSQL client (auto-reconnected):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception caught:', err);
});

// ── Public Uptime & Health Check Endpoint (Phase 4C) ────────────────────────
app.get(['/api/health', '/health'], async (req, res) => {
    const timeoutMs = process.env.HEALTH_CHECK_TIMEOUT_MS ? parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS) : 5000;
    let dbStatus = 'disconnected';
    let latencyMs = null;
    const startTime = Date.now();

    try {
        const dbPromise = pool.query('SELECT 1 AS alive');
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database ping timed out')), timeoutMs)
        );

        await Promise.race([dbPromise, timeoutPromise]);
        latencyMs = Date.now() - startTime;
        dbStatus = 'connected';

        return res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime_seconds: Math.floor(process.uptime()),
            database: {
                status: dbStatus,
                latency_ms: latencyMs
            }
        });
    } catch (err) {
        const elapsed = Date.now() - startTime;
        console.warn('[Health Check Failed]:', err.message);

        return res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime_seconds: Math.floor(process.uptime()),
            database: {
                status: 'disconnected',
                latency_ms: elapsed,
                error: 'Database unavailable or timed out'
            }
        });
    }
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

// ── Persistent Database-Backed Idempotency Engine ───────────────────────────
async function handleIdempotencyBegin(client, endpoint, key) {
    if (!key || typeof key !== 'string' || !key.trim()) return null;
    const cleanKey = key.trim();

    // 1. Attempt to insert 'PROCESSING' state
    const insRes = await client.query(
        `INSERT INTO idempotency_keys (endpoint, key, status, created_at, updated_at)
         VALUES ($1, $2, 'PROCESSING', NOW(), NOW())
         ON CONFLICT (endpoint, key) DO NOTHING
         RETURNING status`,
        [endpoint, cleanKey]
    );

    if (insRes.rows.length > 0) {
        // Thread 1: Successfully registered PROCESSING state
        return { cleanKey, isNew: true };
    }

    // 2. Row exists. Lock the row with FOR UPDATE.
    // Concurrent Thread 2 will BLOCK here until Thread 1 commits or rolls back!
    const existingRes = await client.query(
        `SELECT status, document_id, response_code, response_body
         FROM idempotency_keys
         WHERE endpoint = $1 AND key = $2
         FOR UPDATE`,
        [endpoint, cleanKey]
    );

    if (existingRes.rows.length === 0) {
        // Thread 1 rolled back completely, retry insert
        const retryIns = await client.query(
            `INSERT INTO idempotency_keys (endpoint, key, status, created_at, updated_at)
             VALUES ($1, $2, 'PROCESSING', NOW(), NOW())
             ON CONFLICT (endpoint, key) DO NOTHING
             RETURNING status`,
            [endpoint, cleanKey]
        );
        if (retryIns.rows.length > 0) {
            return { cleanKey, isNew: true };
        }
    }

    const existing = existingRes.rows[0];
    if (existing && existing.status === 'COMPLETED') {
        return {
            cleanKey,
            isNew: false,
            responseCode: existing.response_code || 200,
            responseBody: existing.response_body
        };
    }

    if (existing && existing.status === 'FAILED') {
        // Previous attempt failed, allow retry by updating status to PROCESSING
        await client.query(
            `UPDATE idempotency_keys
             SET status = 'PROCESSING', updated_at = NOW()
             WHERE endpoint = $1 AND key = $2`,
            [endpoint, cleanKey]
        );
        return { cleanKey, isNew: true };
    }

    throw new Error('A transaction with this idempotency key is already in progress');
}

async function handleIdempotencyCommit(client, endpoint, cleanKey, documentId, responseCode, responseBody) {
    if (!cleanKey) return;
    await client.query(
        `UPDATE idempotency_keys
         SET status = 'COMPLETED',
             document_id = $1,
             response_code = $2,
             response_body = $3,
             updated_at = NOW()
         WHERE endpoint = $4 AND key = $5`,
        [documentId, responseCode, JSON.stringify(responseBody), endpoint, cleanKey]
    );
}

async function handleIdempotencyFail(client, endpoint, cleanKey) {
    if (!cleanKey) return;
    try {
        await client.query(
            `UPDATE idempotency_keys
             SET status = 'FAILED', updated_at = NOW()
             WHERE endpoint = $1 AND key = $2 AND status = 'PROCESSING'`,
            [endpoint, cleanKey]
        );
    } catch (err) {
        // Silently ignore errors during fail cleanup
    }
}

async function safeRollback(client) {
    if (!client) return;
    try {
        await client.query('ROLLBACK');
    } catch (_) {
        // Suppress rollback errors if connection was lost or already rolled back
    }
}

function safeRelease(client) {
    if (!client) return;
    try {
        client.release();
    } catch (_) {
        // Suppress release errors if client was already destroyed
    }
}

function parseDateForDB(dateVal) {
    if (!dateVal) return null;
    if (typeof dateVal !== 'string') {
        if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
            return dateVal.toISOString().split('T')[0];
        }
        return null;
    }
    const str = dateVal.trim();
    if (!str) return null;
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return `${year}-${month}-${day}`;
    }
    // YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
        const year = ymdMatch[1];
        const month = ymdMatch[2].padStart(2, '0');
        const day = ymdMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return null;
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
                reference_type TEXT DEFAULT 'DIRECT',
                amount NUMERIC NOT NULL CHECK (amount > 0),
                allocated_amount NUMERIC NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
                advance_amount NUMERIC NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
                discount_amount NUMERIC NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
                payment_mode TEXT,
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
                allocated_amount NUMERIC NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
                discount_amount NUMERIC NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
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
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_credit_balance NUMERIC NOT NULL DEFAULT 0;
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_advance_balance NUMERIC NOT NULL DEFAULT 0;

            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS store_credit_applied NUMERIC NULL;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS invoice_id TEXT;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS receivable_reduction NUMERIC NULL;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
            ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

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
            ALTER TABLE customer_receipts ALTER COLUMN customer_id DROP NOT NULL;
            ALTER TABLE customer_receipts DROP CONSTRAINT IF EXISTS customer_receipts_customer_id_fkey;
            ALTER TABLE customer_receipts ALTER COLUMN reference_type DROP NOT NULL;
            ALTER TABLE customer_receipts ALTER COLUMN reference_type SET DEFAULT 'DIRECT';
            ALTER TABLE customer_receipts ALTER COLUMN payment_mode DROP NOT NULL;
            ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;
            ALTER TABLE customer_receipt_allocations ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;

            ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
            ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
            ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE vendor_payments ALTER COLUMN reference_type DROP NOT NULL;
            ALTER TABLE vendor_payments ALTER COLUMN reference_type SET DEFAULT 'DIRECT';
            ALTER TABLE vendor_payments ALTER COLUMN payment_mode DROP NOT NULL;
            ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;
            ALTER TABLE vendor_payment_allocations ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;

            -- Vouchers and Expense Categories
            CREATE TABLE IF NOT EXISTS vouchers (
                id TEXT PRIMARY KEY,
                voucher_no TEXT UNIQUE NOT NULL,
                voucher_type TEXT NOT NULL,
                date DATE NOT NULL,
                category TEXT NOT NULL,
                party_name TEXT NOT NULL,
                payment_mode TEXT NOT NULL,
                reference_no TEXT,
                amount NUMERIC NOT NULL,
                tax_rate NUMERIC DEFAULT 0,
                amount_in_words TEXT,
                narration TEXT,
                attachment TEXT,
                status TEXT DEFAULT 'ACTIVE',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS expense_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'Expense',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            -- Audit Logging Table & Indexes
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                action TEXT NOT NULL,
                old_data JSONB,
                new_data JSONB,
                performed_by_id TEXT,
                performed_by_name TEXT,
                ip_address TEXT,
                user_agent TEXT,
                transaction_id UUID NOT NULL,
                request_method TEXT,
                endpoint TEXT,
                performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_at ON audit_logs(performed_at);

            -- 🚀 Performance Indexes for Sub-millisecond Queries
            CREATE INDEX IF NOT EXISTS idx_vouchers_date_status ON vouchers(date, status);
            CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type);
            CREATE INDEX IF NOT EXISTS idx_sales_invoices_date_status ON sales_invoices(date, status);
            CREATE INDEX IF NOT EXISTS idx_sales_invoices_cust ON sales_invoices(customer_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date_status ON purchase_invoices(date, status);
            CREATE INDEX IF NOT EXISTS idx_purchase_invoices_vend ON purchase_invoices(vendor_id);
            CREATE INDEX IF NOT EXISTS idx_customer_receipts_date_status ON customer_receipts(date, status);
            CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(date);
            CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(date);
            CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns(date);
            CREATE INDEX IF NOT EXISTS idx_items_lookup ON items(code, name, category_name);
            CREATE INDEX IF NOT EXISTS idx_customers_lookup ON customers(phone_number, customer_name);
            CREATE INDEX IF NOT EXISTS idx_vendors_lookup ON vendors(phone_number, vendor_name);

            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(64) PRIMARY KEY,
                username VARCHAR(64) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(32) NOT NULL DEFAULT 'CASHIER',
                full_name VARCHAR(128),
                status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

            CREATE TABLE IF NOT EXISTS login_attempts (
                ip_address VARCHAR(64) PRIMARY KEY,
                failed_count INTEGER NOT NULL DEFAULT 1,
                first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                locked_until TIMESTAMPTZ
            );

            CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);

            ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
            ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS role VARCHAR(32);
        `);
        
        // Seed default admin account if configured (parameterized to prevent SQL injection or leakage)
        if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) {
            await pool.query(`
                INSERT INTO users (id, username, password_hash, role, full_name, status)
                VALUES ($1, $2, $3, 'ADMIN', 'System Administrator', 'ACTIVE')
                ON CONFLICT (username) DO NOTHING
            `, ['usr_admin_default', process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD_HASH]);
        }

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

// Error Sanitization Helper: Never expose PostgreSQL error strings, SQL, table names, constraint names, stack traces, credentials or connection strings
function sanitizeClientError(err, defaultMsg = 'Internal server error') {
    if (!err) return defaultMsg;
    const msg = typeof err === 'string' ? err : (err.message || defaultMsg);
    const isDbInternal = /relation ".*"|table ".*"|constraint ".*"|column ".*"|syntax error at|SELECT|INSERT INTO|UPDATE |DELETE FROM|violates.*constraint|deadlock detected/i.test(msg);
    if (isDbInternal || msg.includes('connection') || msg.includes('password') || msg.includes('secret') || msg.includes('DATABASE_URL')) {
        return 'A database error occurred. Please contact your system administrator.';
    }
    return msg;
}

// Secure Error Helper (prevents detail leakage to client)
function sendError(res, err, friendlyMessage = 'Internal server error') {
    console.error('SERVER ERROR:', err);
    res.status(500).json({ error: sanitizeClientError(err, friendlyMessage) });
}

// Serverless explicitly awaitable init route (Disabled in production)
app.get('/api/init-db', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Endpoint disabled in production' });
    }
    try {
        if (req.user && req.user.role !== 'ADMIN' && req.username !== (process.env.ADMIN_USERNAME || 'admin') && req.username !== 'System') {
            return res.status(403).json({ error: 'Forbidden: Admin authorization required' });
        }
        await initDB();
        res.send('Database tables initialized successfully! You can now close this tab and log in.');
    } catch (e) {
        res.status(500).send('Database initialization failed: ' + sanitizeClientError(e));
    }
});

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

// Persistent Database-Backed Login Rate Limiter Middleware
const loginRateLimiter = async (req, res, next) => {
    // Behind Vercel edge proxy, x-real-ip cannot be spoofed by clients; otherwise use trusted Express req.ip
    const clientIp = (process.env.VERCEL && req.headers['x-real-ip'])
        ? req.headers['x-real-ip']
        : (req.ip || req.socket?.remoteAddress || 'unknown');
    try {
        const checkRes = await pool.query(
            "SELECT failed_count, first_failed_at, locked_until FROM login_attempts WHERE ip_address = $1",
            [clientIp]
        );
        if (checkRes.rows.length > 0) {
            const row = checkRes.rows[0];
            if (row.locked_until && new Date(row.locked_until) > new Date()) {
                const remainingMinutes = Math.max(1, Math.ceil((new Date(row.locked_until) - new Date()) / 60000));
                return res.status(429).json({
                    error: `Too many login attempts. Please try again in ${remainingMinutes} minute(s).`
                });
            }
        }
        req.clientIp = clientIp;
        next();
    } catch (err) {
        console.error('Rate limiter database check error:', err);
        req.clientIp = clientIp;
        next();
    }
};

// Authentication Login API
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        let user = null;
        let isValidPass = false;

        // 1. Query users table
        const userRes = await pool.query(
            "SELECT id, username, password_hash, role, full_name, status FROM users WHERE username = $1",
            [username]
        );

        if (userRes.rows.length > 0) {
            const dbUser = userRes.rows[0];
            if (dbUser.status !== 'ACTIVE') {
                return res.status(401).json({ error: 'Account is deactivated' });
            }
            isValidPass = bcrypt.compareSync(password, dbUser.password_hash);
            if (isValidPass) {
                user = dbUser;
            }
        } else if (username === process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) {
            // Fallback for primary environment admin account
            isValidPass = bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH);
            if (isValidPass) {
                user = {
                    id: 'usr_admin_default',
                    username: process.env.ADMIN_USERNAME,
                    role: 'ADMIN',
                    full_name: 'System Administrator'
                };
            }
        }

        if (user && isValidPass) {
            // Reset rate limit attempts on successful login
            pool.query("DELETE FROM login_attempts WHERE ip_address = $1", [req.clientIp]).catch(() => {});

            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const sessionId = generateId();
            
            // Fixed 8 hours expiry
            const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

            await pool.query(
                "INSERT INTO active_sessions (id, token_hash, username, user_id, role, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
                [sessionId, tokenHash, user.username, user.id, user.role, expiresAt]
            );

            return res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    fullName: user.full_name
                }
            });
        } else {
            // Increment rate limit attempts atomically
            await pool.query(`
                INSERT INTO login_attempts (ip_address, failed_count, first_failed_at, last_failed_at, locked_until)
                VALUES ($1, 1, NOW(), NOW(), NULL)
                ON CONFLICT (ip_address) DO UPDATE SET
                    failed_count = CASE 
                        WHEN login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= NOW() THEN 1
                        WHEN NOW() - login_attempts.first_failed_at > INTERVAL '15 minutes' THEN 1
                        ELSE login_attempts.failed_count + 1
                    END,
                    first_failed_at = CASE 
                        WHEN login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= NOW() THEN NOW()
                        WHEN NOW() - login_attempts.first_failed_at > INTERVAL '15 minutes' THEN NOW()
                        ELSE login_attempts.first_failed_at
                    END,
                    last_failed_at = NOW(),
                    locked_until = CASE 
                        WHEN (login_attempts.failed_count + 1) >= 5 THEN NOW() + INTERVAL '15 minutes'
                        ELSE NULL
                    END
            `, [req.clientIp]);

            return res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (err) {
        console.error('Login processing error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
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

// User Management Endpoints (Admin Only)
app.get('/api/users', requireRole(['ADMIN']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, role, full_name as "fullName", status, created_at as "createdAt"
            FROM users
            ORDER BY username ASC
        `);
        res.json(result.rows);
    } catch (err) {
        sendError(res, err, 'Failed to fetch users');
    }
});

app.post('/api/users', requireRole(['ADMIN']), async (req, res) => {
    const { username, password, role, fullName } = req.body || {};
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required' });
    }
    const validRoles = ['ADMIN', 'ACCOUNTANT', 'CASHIER'];
    if (!validRoles.includes(role.toUpperCase())) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }
    try {
        const passwordHash = bcrypt.hashSync(password, 10);
        const newId = generateId();
        const result = await pool.query(`
            INSERT INTO users (id, username, password_hash, role, full_name, status)
            VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
            RETURNING id, username, role, full_name as "fullName", status, created_at as "createdAt"
        `, [newId, username.trim(), passwordHash, role.toUpperCase(), fullName || '']);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Username already exists' });
        }
        sendError(res, err, 'Failed to create user');
    }
});

app.patch('/api/users/:id', requireRole(['ADMIN']), async (req, res) => {
    const userId = req.params.id;
    const { role, status, fullName, password } = req.body || {};
    try {
        const updates = [];
        const values = [];
        let idx = 1;

        if (role) {
            const validRoles = ['ADMIN', 'ACCOUNTANT', 'CASHIER'];
            if (!validRoles.includes(role.toUpperCase())) {
                return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
            }
            updates.push(`role = $${idx++}`);
            values.push(role.toUpperCase());
        }
        if (status) {
            const validStatuses = ['ACTIVE', 'INACTIVE'];
            if (!validStatuses.includes(status.toUpperCase())) {
                return res.status(400).json({ error: 'Status must be ACTIVE or INACTIVE' });
            }
            updates.push(`status = $${idx++}`);
            values.push(status.toUpperCase());
        }
        if (fullName !== undefined) {
            updates.push(`full_name = $${idx++}`);
            values.push(fullName);
        }
        if (password) {
            const passwordHash = bcrypt.hashSync(password, 10);
            updates.push(`password_hash = $${idx++}`);
            values.push(passwordHash);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided for update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(userId);
        const queryStr = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, role, full_name as "fullName", status, updated_at as "updatedAt"`;
        const result = await pool.query(queryStr, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        sendError(res, err, 'Failed to update user');
    }
});


// Core Settings / Counters (PostgreSQL backed with sequence fallback)
app.get('/api/invoice-counter', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    try {
        const seqRes = await pool.query("SELECT current_number FROM document_sequences WHERE document_type = 'sales_invoice' AND financial_year = 'ALL'");
        const seqVal = seqRes.rows.length > 0 ? parseInt(seqRes.rows[0].current_number) || 0 : 0;
        
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^INV', '', 'g') AS INTEGER)) as max_val FROM sales_invoices WHERE invoice_no ~ '^INV[0-9]+$'");
        const maxVal = parseInt(result.rows[0]?.max_val) || 0;
        
        const nextCounter = Math.max(seqVal, maxVal) + 1;
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching invoice counter:', e);
        res.json({ counter: 1 });
    }
});
app.post('/api/invoice-counter', requireRole(['ADMIN']), async (req, res) => {
    try {
        const val = parseInt(req.body.counter) || 1;
        await pool.query(
            "UPDATE document_sequences SET current_number = $1, updated_at = NOW() WHERE document_type = 'sales_invoice' AND financial_year = 'ALL'",
            [Math.max(0, val - 1)]
        );
        const db = await readDB(); db.invoice_counter = val; await writeDB(db);
        res.json({ success: true, counter: val });
    } catch (e) {
        res.status(500).json({ error: sanitizeClientError(e) });
    }
});

app.get('/api/return-counter', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const seqRes = await pool.query("SELECT current_number FROM document_sequences WHERE document_type = 'sales_return' AND financial_year = 'ALL'");
        const seqVal = seqRes.rows.length > 0 ? parseInt(seqRes.rows[0].current_number) || 0 : 0;
        
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^RET', '', 'g') AS INTEGER)) as max_val FROM sales_returns WHERE return_no ~ '^RET[0-9]+$'");
        const maxVal = parseInt(result.rows[0]?.max_val) || 0;
        
        const nextCounter = Math.max(seqVal, maxVal) + 1;
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching return counter:', e);
        res.json({ counter: 1 });
    }
});
app.post('/api/return-counter', requireRole(['ADMIN']), async (req, res) => {
    try {
        const val = parseInt(req.body.counter) || 1;
        await pool.query(
            "UPDATE document_sequences SET current_number = $1, updated_at = NOW() WHERE document_type = 'sales_return' AND financial_year = 'ALL'",
            [Math.max(0, val - 1)]
        );
        const db = await readDB(); db.return_counter = val; await writeDB(db);
        res.json({ success: true, counter: val });
    } catch (e) {
        res.status(500).json({ error: sanitizeClientError(e) });
    }
});

app.get('/api/pret-counter', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const seqRes = await pool.query("SELECT current_number FROM document_sequences WHERE document_type = 'purchase_return' AND financial_year = 'ALL'");
        const seqVal = seqRes.rows.length > 0 ? parseInt(seqRes.rows[0].current_number) || 0 : 0;
        
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^PRET', '', 'g') AS INTEGER)) as max_val FROM purchase_returns WHERE return_no ~ '^PRET[0-9]+$'");
        const maxVal = parseInt(result.rows[0]?.max_val) || 0;
        
        const nextCounter = Math.max(seqVal, maxVal) + 1;
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching pret counter:', e);
        res.json({ counter: 1 });
    }
});
app.post('/api/pret-counter', requireRole(['ADMIN']), async (req, res) => {
    try {
        const val = parseInt(req.body.counter) || 1;
        await pool.query(
            "UPDATE document_sequences SET current_number = $1, updated_at = NOW() WHERE document_type = 'purchase_return' AND financial_year = 'ALL'",
            [Math.max(0, val - 1)]
        );
        const db = await readDB(); db.pret_counter = val; await writeDB(db);
        res.json({ success: true, counter: val });
    } catch (e) {
        res.status(500).json({ error: sanitizeClientError(e) });
    }
});

app.get('/api/payment-counter', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    try {
        const seqRes = await pool.query("SELECT current_number FROM document_sequences WHERE (document_type = 'customer_receipt' OR prefix = 'AR') AND financial_year = 'ALL'");
        const seqVal = seqRes.rows.length > 0 ? parseInt(seqRes.rows[0].current_number) || 0 : 0;
        
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(receipt_no, '^AR', '', 'g') AS INTEGER)) as max_val FROM customer_receipts WHERE receipt_no ~ '^AR[0-9]+$'");
        const maxVal = parseInt(result.rows[0]?.max_val) || 0;
        
        const nextCounter = Math.max(seqVal, maxVal) + 1;
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching AR counter:', e);
        res.json({ counter: 1 });
    }
});
app.post('/api/payment-counter', requireRole(['ADMIN']), async (req, res) => {
    const val = parseInt(req.body.counter) || 1;
    const db = await readDB(); db.payment_counter = val; await writeDB(db);
    res.json({ success: true, counter: val });
});

app.get('/api/pi-counter', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const seqRes = await pool.query("SELECT current_number FROM document_sequences WHERE document_type = 'purchase_invoice' AND financial_year = 'ALL'");
        const seqVal = seqRes.rows.length > 0 ? parseInt(seqRes.rows[0].current_number) || 0 : 0;
        
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(pi_no, '^PI', '', 'g') AS INTEGER)) as max_val FROM purchase_invoices WHERE pi_no ~ '^PI[0-9]+$'");
        const maxVal = parseInt(result.rows[0]?.max_val) || 0;
        
        const nextCounter = Math.max(seqVal, maxVal) + 1;
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching PI counter:', e);
        res.json({ counter: 1 });
    }
});
app.post('/api/pi-counter', requireRole(['ADMIN']), async (req, res) => {
    const val = parseInt(req.body.counter) || 1;
    const db = await readDB(); db.pi_counter = val; await writeDB(db);
    res.json({ success: true, counter: val });
});

app.get('/api/vendor-payment-counter', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const seqRes = await pool.query("SELECT current_number FROM document_sequences WHERE (document_type = 'vendor_payment' OR prefix = 'PMT') AND financial_year = 'ALL'");
        const seqVal = seqRes.rows.length > 0 ? parseInt(seqRes.rows[0].current_number) || 0 : 0;
        
        const result = await pool.query("SELECT MAX(CAST(REGEXP_REPLACE(payment_no, '^PMT', '', 'g') AS INTEGER)) as max_val FROM vendor_payments WHERE payment_no ~ '^PMT[0-9]+$'");
        const maxVal = parseInt(result.rows[0]?.max_val) || 0;
        
        const nextCounter = Math.max(seqVal, maxVal) + 1;
        res.json({ counter: nextCounter });
    } catch (e) {
        console.error('Error fetching PMT counter:', e);
        res.json({ counter: 1 });
    }
});
app.post('/api/vendor-payment-counter', requireRole(['ADMIN']), async (req, res) => {
    const val = parseInt(req.body.counter) || 1;
    const db = await readDB(); db.vendor_payment_counter = val; await writeDB(db);
    res.json({ success: true, counter: val });
});

app.get('/api/settings/tag', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => res.json((await readDB()).tagSettings || {}));
app.post('/api/settings/tag', requireRole(['ADMIN']), async (req, res) => {
    const db = await readDB(); db.tagSettings = req.body; await writeDB(db);
    res.json({ success: true });
});


// ───────── VOUCHERS API ─────────
app.get('/api/voucher-counter', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const pmtCount = await pool.query("SELECT COUNT(*) FROM vouchers WHERE voucher_type = 'Payment' AND status != 'DELETED'");
        const recCount = await pool.query("SELECT COUNT(*) FROM vouchers WHERE voucher_type = 'Receipt' AND status != 'DELETED'");
        const nextPaymentNum = (parseInt(pmtCount.rows[0]?.count || 0) + 1);
        const nextReceiptNum = (parseInt(recCount.rows[0]?.count || 0) + 1);
        res.json({
            nextPaymentNo: `PAY-${String(nextPaymentNum).padStart(3, '0')}`,
            nextReceiptNo: `REC-${String(nextReceiptNum).padStart(3, '0')}`
        });
    } catch (e) {
        res.json({ nextPaymentNo: 'PAY-001', nextReceiptNo: 'REC-001' });
    }
});

app.get('/api/vouchers', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, voucher_no as "voucherNo", voucher_type as "voucherType",
            date, category, party_name as "partyName", payment_mode as "paymentMode",
            reference_no as "referenceNo", amount, tax_rate as "taxRate",
            amount_in_words as "amountInWords", narration, attachment, status,
            created_at as "createdAt", updated_at as "updatedAt"
            FROM vouchers
            WHERE status != 'DELETED'
            ORDER BY created_at DESC, date DESC
        `);
        const rows = result.rows.map(r => {
            if (r.date) {
                const d = new Date(r.date);
                r.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            r.amount = parseFloat(r.amount) || 0;
            return r;
        });
        res.json(rows);
    } catch (e) {
        console.error('Error fetching vouchers:', e);
        try {
            const db = await readDB();
            res.json(db.vouchers || []);
        } catch (err) {
            sendError(res, err, 'Failed to fetch vouchers');
        }
    }
});

app.get('/api/vouchers/:id', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, voucher_no as "voucherNo", voucher_type as "voucherType",
            date, category, party_name as "partyName", payment_mode as "paymentMode",
            reference_no as "referenceNo", amount, tax_rate as "taxRate",
            amount_in_words as "amountInWords", narration, attachment, status,
            created_at as "createdAt", updated_at as "updatedAt"
            FROM vouchers
            WHERE (id = $1 OR voucher_no = $1) AND status != 'DELETED'
        `, [req.params.id]);
        if (result.rows.length > 0) {
            const r = result.rows[0];
            if (r.date) {
                const d = new Date(r.date);
                r.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            r.amount = parseFloat(r.amount) || 0;
            return res.json(r);
        }
        res.status(404).json({ error: 'Voucher not found' });
    } catch (e) {
        sendError(res, e, 'Failed to fetch voucher');
    }
});

app.post('/api/vouchers', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const id = `vch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const v = req.body;
        
        let dateVal = v.date;
        if (typeof dateVal === 'string' && dateVal.includes('/')) {
            const parts = dateVal.split('/');
            if (parts.length === 3) {
                dateVal = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }
        if (!dateVal) dateVal = new Date().toISOString().split('T')[0];

        let voucherNo = v.voucherNo;
        if (!voucherNo) {
            const isPayment = (v.voucherType || 'Payment').toLowerCase() === 'payment';
            const prefix = isPayment ? 'PAY' : 'REC';
            const countRes = await pool.query("SELECT COUNT(*) FROM vouchers WHERE voucher_type = $1 AND status != 'DELETED'", [isPayment ? 'Payment' : 'Receipt']);
            const nextSeq = parseInt(countRes.rows[0]?.count || 0) + 1;
            voucherNo = `${prefix}-${String(nextSeq).padStart(3, '0')}`;
        }

        const insertQuery = `
            INSERT INTO vouchers (
                id, voucher_no, voucher_type, date, category, party_name,
                payment_mode, reference_no, amount, tax_rate, amount_in_words,
                narration, attachment, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ACTIVE', NOW(), NOW()
            ) RETURNING id, voucher_no as "voucherNo"
        `;
        await pool.query(insertQuery, [
            id,
            voucherNo,
            v.voucherType || 'Payment',
            dateVal,
            v.category || 'General',
            v.partyName || '',
            v.paymentMode || 'Cash',
            v.referenceNo || null,
            parseFloat(v.amount) || 0,
            parseFloat(v.taxRate) || 0,
            v.amountInWords || '',
            v.narration || '',
            v.attachment || null
        ]);

        try {
            const db = await readDB();
            db.vouchers = db.vouchers || [];
            db.vouchers.unshift({ ...v, id, voucherNo, date: v.date });
            await writeDB(db);
        } catch (err) {}

        res.json({ success: true, id, voucherNo, message: 'Voucher created successfully' });
    } catch (e) {
        sendError(res, e, 'Failed to create voucher');
    }
});

app.put('/api/vouchers/:id', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const id = req.params.id;
        const v = req.body;

        let dateVal = v.date;
        if (typeof dateVal === 'string' && dateVal.includes('/')) {
            const parts = dateVal.split('/');
            if (parts.length === 3) {
                dateVal = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        const updateQuery = `
            UPDATE vouchers SET
                voucher_type = COALESCE($1, voucher_type),
                date = COALESCE($2, date),
                category = COALESCE($3, category),
                party_name = COALESCE($4, party_name),
                payment_mode = COALESCE($5, payment_mode),
                reference_no = $6,
                amount = COALESCE($7, amount),
                tax_rate = COALESCE($8, tax_rate),
                amount_in_words = COALESCE($9, amount_in_words),
                narration = $10,
                attachment = COALESCE($11, attachment),
                updated_at = NOW()
            WHERE id = $12
        `;
        await pool.query(updateQuery, [
            v.voucherType,
            dateVal,
            v.category,
            v.partyName,
            v.paymentMode,
            v.referenceNo || null,
            parseFloat(v.amount) || 0,
            parseFloat(v.taxRate) || 0,
            v.amountInWords,
            v.narration || '',
            v.attachment || null,
            id
        ]);

        try {
            const db = await readDB();
            db.vouchers = db.vouchers || [];
            const idx = db.vouchers.findIndex(item => item.id === id);
            if (idx !== -1) {
                db.vouchers[idx] = { ...db.vouchers[idx], ...v, updatedAt: new Date().toISOString() };
                await writeDB(db);
            }
        } catch (err) {}

        res.json({ success: true, message: 'Voucher updated successfully' });
    } catch (e) {
        sendError(res, e, 'Failed to update voucher');
    }
});

app.delete('/api/vouchers/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("UPDATE vouchers SET status = 'DELETED', updated_at = NOW() WHERE id = $1", [id]);
        
        try {
            const db = await readDB();
            db.vouchers = (db.vouchers || []).filter(v => v.id !== id);
            await writeDB(db);
        } catch (err) {}

        res.json({ success: true, message: 'Voucher deleted successfully' });
    } catch (e) {
        sendError(res, e, 'Failed to delete voucher');
    }
});

// Expense / Income Categories API
app.get('/api/expense-categories', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, type FROM expense_categories ORDER BY name ASC');
        if (result.rows.length === 0) {
            const defaultExpenseCategories = [
                { name: 'Shop Rent', type: 'Expense' },
                { name: 'Staff Salary / Wages', type: 'Expense' },
                { name: 'Electricity Bill', type: 'Expense' },
                { name: 'Freight & Transportation', type: 'Expense' },
                { name: 'Tea & Refreshments', type: 'Expense' },
                { name: 'Repairs & Maintenance', type: 'Expense' },
                { name: 'Printing & Stationery', type: 'Expense' },
                { name: 'Loading / Unloading', type: 'Expense' },
                { name: 'Telephone & Internet', type: 'Expense' },
                { name: 'Miscellaneous Expense', type: 'Expense' },
                { name: 'Scrap Sales', type: 'Income' },
                { name: 'Interest Received', type: 'Income' },
                { name: 'Rent Received', type: 'Income' },
                { name: 'Commission Received', type: 'Income' },
                { name: 'Miscellaneous Income', type: 'Income' }
            ];
            for (let c of defaultExpenseCategories) {
                const catId = `cat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
                await pool.query('INSERT INTO expense_categories (id, name, type) VALUES ($1, $2, $3)', [catId, c.name, c.type]);
            }
            const seeded = await pool.query('SELECT id, name, type FROM expense_categories ORDER BY name ASC');
            return res.json(seeded.rows);
        }
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.json([
            { id: '1', name: 'Shop Rent', type: 'Expense' },
            { id: '2', name: 'Staff Salary / Wages', type: 'Expense' },
            { id: '3', name: 'Electricity Bill', type: 'Expense' },
            { id: '4', name: 'Freight & Transportation', type: 'Expense' },
            { id: '5', name: 'Tea & Refreshments', type: 'Expense' },
            { id: '6', name: 'Repairs & Maintenance', type: 'Expense' },
            { id: '7', name: 'Printing & Stationery', type: 'Expense' },
            { id: '8', name: 'Miscellaneous Expense', type: 'Expense' },
            { id: '9', name: 'Scrap Sales', type: 'Income' },
            { id: '10', name: 'Miscellaneous Income', type: 'Income' }
        ]);
    }
});

app.post('/api/expense-categories', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const { name, type } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });
        const catId = `cat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        await pool.query('INSERT INTO expense_categories (id, name, type) VALUES ($1, $2, $3)', [catId, name.trim(), type || 'Expense']);
        res.json({ success: true, id: catId, name: name.trim(), type: type || 'Expense' });
    } catch (e) {
        sendError(res, e, 'Failed to add category');
    }
});

app.get('/api/payments', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT cr.id, cr.receipt_no as "arNo", cr.date, COALESCE(c.customer_name, 'Walk In Customer') as "customerName", 
            COALESCE(c.phone_number, '') as "mobile", 
            COALESCE(c.bill_address, '') || ', ' || COALESCE(c.bill_city, '') as "address",
            cr.amount, cr.allocated_amount as "allocatedAmount", cr.advance_amount as "advanceAmount", 
            COALESCE(cr.discount_amount, 0) as "discountAmount",
            cr.payment_mode as "paymentMode", cr.reference_no as "referenceNo", cr.reference_date as "referenceDate",
            cr.note, cr.status, cr.created_at as "createdAt",
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'invoiceNo', si.invoice_no,
                        'date', si.date,
                        'amount', si.amount,
                        'allocated', cra.allocated_amount,
                        'discount', COALESCE(cra.discount_amount, 0)
                    )
                 ) FROM customer_receipt_allocations cra
                 JOIN sales_invoices si ON si.id = cra.invoice_id
                 WHERE cra.receipt_id = cr.id),
                '[]'::json
            ) as invoices
            FROM customer_receipts cr
            LEFT JOIN customers c ON c.id = cr.customer_id
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
                discount: parseFloat(r.discountAmount) || 0,
                invoices: r.invoices
            };
        });

        // Merge with legacy payments
        const db = await readDB();
        const legacyPayments = db.payments || [];
        res.json([...dbReceipts, ...legacyPayments]);
    } catch (e) {
        sendError(res, e, 'Failed to fetch payments');
    }
});
app.post('/api/payments', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

app.get('/api/vendor-payments', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT vp.id, vp.payment_no as "pmtNo", vp.date, v.vendor_name as "vendorName",
            vp.vendor_id as "vendorId",
            vp.amount as "paidAmount", vp.allocated_amount as "allocatedAmount", vp.advance_amount as "advanceAmount",
            COALESCE(vp.discount_amount, 0) as "discountAmount",
            vp.payment_mode as "paymentMode", vp.reference_no as "referenceNo", vp.reference_date as "referenceDate",
            vp.note, vp.status, vp.created_at as "createdAt",
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'piNo', pi.pi_no,
                        'date', pi.date,
                        'amount', pi.amount,
                        'allocated', vpa.allocated_amount,
                        'discount', COALESCE(vpa.discount_amount, 0)
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
                discount: parseFloat(p.discountAmount) || 0,
                invoices: p.invoices
            };
        });

        // Merge with legacy payments
        const db = await readDB();
        const legacyPayments = db.vendor_payments || [];
        res.json([...dbPayments, ...legacyPayments]);
    } catch (e) {
        sendError(res, e, 'Failed to fetch vendor payments');
    }
});
app.post('/api/vendor-payments', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
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
app.get('/api/categories', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name FROM categories ORDER BY name ASC');
        res.json(result.rows);
    } catch (e) {
        sendError(res, e, 'Failed to fetch categories');
    }
});
app.post('/api/categories', requireRole(['ADMIN']), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const categories = req.body;
        if (!Array.isArray(categories)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Payload must be an array of categories' });
        }

        const existingRes = await client.query('SELECT id, name FROM categories');
        const existingByName = new Map(existingRes.rows.map(r => [r.name.trim().toLowerCase(), r]));
        const existingById = new Map(existingRes.rows.map(r => [r.id, r]));

        const handledIds = new Set();
        for (let rawCat of categories) {
            const c = typeof rawCat === 'string' ? { name: rawCat } : (rawCat || {});
            const name = (c.name || '').trim();
            if (!name) continue;

            if (c.id && existingById.has(c.id)) {
                await client.query('UPDATE categories SET name = $1 WHERE id = $2', [name, c.id]);
                handledIds.add(c.id);
            } else if (existingByName.has(name.toLowerCase())) {
                const existing = existingByName.get(name.toLowerCase());
                handledIds.add(existing.id);
            } else {
                const newId = c.id || generateId();
                await client.query('INSERT INTO categories (id, name) VALUES ($1, $2)', [newId, name]);
                handledIds.add(newId);
            }
        }

        // Safe deletion: only delete categories that are NOT referenced by any inventory items
        for (const existing of existingRes.rows) {
            if (!handledIds.has(existing.id)) {
                const checkUsage = await client.query(
                    'SELECT 1 FROM items WHERE category_name = $1 OR category = $1 LIMIT 1',
                    [existing.name]
                );
                if (checkUsage.rows.length === 0) {
                    await client.query('DELETE FROM categories WHERE id = $1', [existing.id]);
                }
            }
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
app.get('/api/units', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, unit_prefix as "unitPrefix", accept_decimal as "acceptDecimal" FROM units ORDER BY name ASC');
        res.json(result.rows);
    } catch (e) {
        sendError(res, e, 'Failed to fetch units');
    }
});
app.post('/api/units', requireRole(['ADMIN']), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const units = req.body;
        if (!Array.isArray(units)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Payload must be an array of units' });
        }

        const existingRes = await client.query('SELECT id, name, unit_prefix, accept_decimal FROM units');
        const existingByName = new Map(existingRes.rows.map(r => [r.name.trim().toLowerCase(), r]));
        const existingById = new Map(existingRes.rows.map(r => [r.id, r]));

        const handledIds = new Set();
        for (let rawUnit of units) {
            const u = typeof rawUnit === 'string' ? { name: rawUnit } : (rawUnit || {});
            const name = (u.name || '').trim();
            if (!name) continue;

            const unitPrefix = u.unitPrefix || '';
            const acceptDecimal = u.acceptDecimal === true;

            if (u.id && existingById.has(u.id)) {
                await client.query(
                    'UPDATE units SET name = $1, unit_prefix = $2, accept_decimal = $3 WHERE id = $4',
                    [name, unitPrefix, acceptDecimal, u.id]
                );
                handledIds.add(u.id);
            } else if (existingByName.has(name.toLowerCase())) {
                const existing = existingByName.get(name.toLowerCase());
                await client.query(
                    'UPDATE units SET unit_prefix = $1, accept_decimal = $2 WHERE id = $3',
                    [unitPrefix, acceptDecimal, existing.id]
                );
                handledIds.add(existing.id);
            } else {
                const newId = u.id || generateId();
                await client.query(
                    'INSERT INTO units (id, name, unit_prefix, accept_decimal) VALUES ($1, $2, $3, $4)',
                    [newId, name, unitPrefix, acceptDecimal]
                );
                handledIds.add(newId);
            }
        }

        // Safe deletion: only delete units that are NOT referenced by any inventory items
        for (const existing of existingRes.rows) {
            if (!handledIds.has(existing.id)) {
                const checkUsage = await client.query(
                    'SELECT 1 FROM items WHERE unit_name = $1 OR unit = $1 LIMIT 1',
                    [existing.name]
                );
                if (checkUsage.rows.length === 0) {
                    await client.query('DELETE FROM units WHERE id = $1', [existing.id]);
                }
            }
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
app.get('/api/items', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
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
        sendError(res, e, 'Failed to fetch items');
    }
});
app.post('/api/items', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const rawItems = req.body;
        const items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
        // Standardize multi-item processing order to prevent concurrent transaction deadlocks
        items.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
        
        for (let i of items) {
            const isStockAdjustment = i.isStockAdjustment === true;
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
                    minimum_stock = EXCLUDED.minimum_stock, location = EXCLUDED.location, 
                    purchase_tax_type = EXCLUDED.purchase_tax_type, selling_tax_type = EXCLUDED.selling_tax_type, 
                    conversions = EXCLUDED.conversions, images = EXCLUDED.images,
                    stock = CASE WHEN $21::boolean IS TRUE THEN EXCLUDED.stock ELSE items.stock END
            `, [
                i.id || generateId(), i.code, i.name, i.category || null, i.unit || null, i.hsn || '', i.gstRate || '', parseFloat(i.cess) || 0,
                i.taxType || '', parseFloat(i.taxAmount) || 0, parseFloat(i.purchasePrice || i.purchaseAmount) || 0, parseFloat(i.sellingPrice || i.sellingAmount) || 0,
                parseFloat(i.mrp) || 0, parseFloat(i.stock) || 0, parseFloat(i.minimumStock) || 0, i.itemLocation || '',
                i.purchaseTaxType || '', i.sellingTaxType || '', JSON.stringify(i.conversions || []), JSON.stringify(i.images || []),
                isStockAdjustment
            ]);
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
app.get('/api/vendors', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
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
        sendError(res, e, 'Failed to fetch vendors');
    }
});
app.post('/api/vendors', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const rawVendors = req.body;
        const vendors = Array.isArray(rawVendors) ? rawVendors : (rawVendors ? [rawVendors] : []);
        
        for (let v of vendors) {
            const vid = v.id || generateId();
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
                    ship_state = EXCLUDED.ship_state, ship_pincode = EXCLUDED.ship_pincode, ship_country = EXCLUDED.ship_country
            `, [
                vid, v.vendorName || 'Unknown Vendor', v.contactPerson || '', v.phoneNumber || '', v.email || '', v.gstTreatment || '',
                v.gstin || '', v.panNumber || '', parseFloat(v.openingBalance) || 0, parsedDate, v.billAddress || '', v.billCity || '',
                v.billState || '', v.billPinCode || '', v.billCountry || '', v.shipAddress || '', v.shipCity || '',
                v.shipState || '', v.shipPinCode || '', v.shipCountry || '', parseFloat(v.pendingToPay) || parseFloat(v.openingBalance) || 0, parseFloat(v.vendorCreditBalance) || 0, parseFloat(v.vendorAdvanceBalance) || 0
            ]);
        }
        
        await client.query('COMMIT');
        
        // Also update JSON store for backwards compatibility without dropping omitted records
        try {
            const db = await readDB();
            if (!Array.isArray(db.vendors)) db.vendors = [];
            for (let v of vendors) {
                const idx = db.vendors.findIndex(x => String(x.id) === String(v.id));
                if (idx >= 0) db.vendors[idx] = { ...db.vendors[idx], ...v };
                else db.vendors.push(v);
            }
            await writeDB(db);
        } catch (dbErr) {
            console.warn('JSON store vendor sync skipped:', dbErr.message);
        }
        
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        sendError(res, e, 'Failed to save vendors');
    } finally {
        client.release();
    }
});

// 5. Customers
app.get('/api/customers', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
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
        sendError(res, e, 'Failed to fetch customers');
    }
});
app.post('/api/customers', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const rawCustomers = req.body;
        const customers = Array.isArray(rawCustomers) ? rawCustomers : (rawCustomers ? [rawCustomers] : []);
        
        for (let c of customers) {
            const cid = c.id || generateId();
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
            const actualShipAddress = c.shipAddress || '';
            const actualShipCity = c.shipCity || '';
            const actualShipState = c.shipState || '';
            const actualShipPin = c.shipPinCode || '';
            const actualShipCountry = c.shipCountry || '';
            const actualPan = c.pan || c.panNumber || '';

            await client.query(`
                INSERT INTO customers (
                    id, customer_name, contact_person, phone_number, email, gst_treatment, 
                    gstin, pan_number, opening_balance, as_of_date, bill_address, bill_city, 
                    bill_state, bill_pincode, bill_country, ship_address, ship_city, 
                    ship_state, ship_pincode, ship_country, pending_to_receive, store_credit_balance, customer_advance_balance
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
                ON CONFLICT (id) DO UPDATE SET
                    customer_name = EXCLUDED.customer_name, contact_person = EXCLUDED.contact_person, phone_number = EXCLUDED.phone_number, email = EXCLUDED.email, 
                    gst_treatment = EXCLUDED.gst_treatment, gstin = EXCLUDED.gstin, pan_number = EXCLUDED.pan_number, opening_balance = EXCLUDED.opening_balance, 
                    as_of_date = EXCLUDED.as_of_date, bill_address = EXCLUDED.bill_address, bill_city = EXCLUDED.bill_city, bill_state = EXCLUDED.bill_state, 
                    bill_pincode = EXCLUDED.bill_pincode, bill_country = EXCLUDED.bill_country, ship_address = EXCLUDED.ship_address, ship_city = EXCLUDED.ship_city, 
                    ship_state = EXCLUDED.ship_state, ship_pincode = EXCLUDED.ship_pincode, ship_country = EXCLUDED.ship_country
            `, [
                cid, actualName, c.contactPerson || '', actualMobile, c.email || '', c.gstTreatment || '',
                c.gstin || '', actualPan, parseFloat(c.openingBalance) || 0, parsedDate, actualAddress, actualCity,
                actualState, actualPin, actualCountry, actualShipAddress, actualShipCity,
                actualShipState, actualShipPin, actualShipCountry, parseFloat(c.pendingToReceive) || parseFloat(c.openingBalance) || 0, parseFloat(c.storeCreditBalance) || 0, parseFloat(c.customerAdvanceBalance) || 0
            ]);
        }
        
        await client.query('COMMIT');
        
        // Also update JSON store for backwards compatibility without dropping omitted records
        try {
            const db = await readDB();
            if (!Array.isArray(db.customers)) db.customers = [];
            for (let c of customers) {
                const idx = db.customers.findIndex(x => String(x.id) === String(c.id));
                if (idx >= 0) db.customers[idx] = { ...db.customers[idx], ...c };
                else db.customers.push(c);
            }
            await writeDB(db);
        } catch (dbErr) {
            console.warn('JSON store customer sync skipped:', dbErr.message);
        }
        
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        sendError(res, e, 'Failed to save customers');
    } finally {
        client.release();
    }
});

// 6. Purchase Invoices
app.get('/api/purchase-invoices', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, pi_no as "piNo", date, ref_no as "refNo", due_date as "dueDate", payment_terms as "paymentTerms", vendor_id as "vendorId", vendor_name as "vendorName", 
            sub_total as "subTotal", discount_percent as "discountPercent", discount_amount as "discountAmount", total_tax as "totalTax", amount, 
            paid_amount as "paidAmount", pending_to_pay as "pendingToPay", note, items, status
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
        sendError(res, e, 'Failed to fetch purchase invoices');
    }
});
app.post('/api/purchase-invoices', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

// 7. Sales Invoices
app.get('/api/sales', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, invoice_no as "invoiceNumber", date, ref_no as "refNo", due_date as "dueDate", payment_terms as "paymentTerms", customer_id as "customerId", customer_name as "customerName", 
            sub_total as "subTotal", discount_percent as "discountPercent", discount_amount as "discountAmount", total_tax as "totalTax", amount as "grandTotal", 
            paid_amount as "receivedAmount", pending_to_receive as "pendingToReceive", note, items, status
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
        sendError(res, e, 'Failed to fetch sales invoices');
    }
});

// Atomic Sales Invoice Creation Endpoint
app.post('/api/sales/create', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connErr) {
        return res.status(503).json({ error: 'System is busy (connection pool). Please try again.' });
    }
    let cleanIdemKey = null;
    try {
        await client.query('BEGIN');

        // ── 0. Persistent Database-Backed Idempotency Gate ────────────────────
        const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
        const idemResult = await handleIdempotencyBegin(client, '/api/sales/create', idempotencyKey);
        if (idemResult && !idemResult.isNew) {
            await client.query('ROLLBACK');
            return res.status(idemResult.responseCode).json(idemResult.responseBody);
        }
        cleanIdemKey = idemResult ? idemResult.cleanKey : null;

        const {
            date,
            refNo,
            dueDate,
            paymentTerms,
            customerId,
            customerName,
            subTotal: clientSubTotal,
            subtotal: clientSubTotalLower,
            discount,
            taxAmount: clientTaxAmount,
            taxTotal: clientTaxTotal,
            grandTotal: clientGrandTotal,
            receivedAmount: clientReceivedAmount,
            paidAmount: clientPaidAmount,
            items,
            manualInvoiceNumber,
            applyStoreCredit,     // boolean — user chose to apply credit
            requestedCredit       // amount the frontend believes is available (advisory only)
        } = req.body;

        // ── 1. Validation of Input Financials & Items ─────────────────────────
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Invoice must contain at least one line item');
        }

        for (const it of items) {
            const qty = parseFloat(it.qty);
            if (isNaN(qty) || qty <= 0) {
                throw new Error(`Invalid quantity (${it.qty}) for item: ${it.name || it.code}`);
            }
        }

        const parsedSubTotal = parseFloat(clientSubTotal !== undefined ? clientSubTotal : (clientSubTotalLower !== undefined ? clientSubTotalLower : 0)) || 0;
        const parsedDiscount = parseFloat(discount) || 0;
        const parsedTaxAmount = parseFloat(clientTaxAmount !== undefined ? clientTaxAmount : (clientTaxTotal !== undefined ? clientTaxTotal : 0)) || 0;
        const subTotal = parsedSubTotal;
        const taxAmount = parsedTaxAmount;
        const grandTotal = parseFloat(clientGrandTotal) || 0;
        const receivedAmount = parseFloat(clientReceivedAmount !== undefined ? clientReceivedAmount : (clientPaidAmount !== undefined ? clientPaidAmount : 0)) || 0;

        if (grandTotal < 0) {
            throw new Error('Grand total cannot be negative');
        }
        if (receivedAmount < 0) {
            throw new Error('Received amount cannot be negative');
        }
        if (receivedAmount > grandTotal) {
            throw new Error('Received amount cannot exceed grand total');
        }

        // ── 2. Level 2: Sequence Acquisition (Strict deterministic prefix order: 'AR' then 'INV') ──
        let receiptId = null;
        let receiptNo = null;
        if (receivedAmount > 0) {
            let seqResAR = await client.query(
                `UPDATE document_sequences 
                 SET current_number = current_number + 1, updated_at = NOW() 
                 WHERE prefix = 'AR' AND document_type = 'customer_receipt' 
                 RETURNING current_number`
            );
            let nextReceiptNum = 1;
            if (seqResAR.rows.length === 0) {
                const maxRes = await client.query(
                    "SELECT MAX(CAST(REGEXP_REPLACE(receipt_no, '^AR', '', 'g') AS INTEGER)) as max_val FROM customer_receipts WHERE receipt_no ~ '^AR[0-9]+$'"
                );
                nextReceiptNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
                await client.query(
                    `INSERT INTO document_sequences (prefix, document_type, financial_year, current_number, updated_at)
                     VALUES ('AR', 'customer_receipt', 'ALL', $1, NOW())
                     ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                    [nextReceiptNum]
                );
            } else {
                nextReceiptNum = parseInt(seqResAR.rows[0].current_number);
            }
            receiptNo = `AR${String(nextReceiptNum).padStart(3, '0')}`;
            receiptId = generateId();
        }

        let finalInvoiceNo = manualInvoiceNumber;
        if (!finalInvoiceNo) {
            let seqRes = await client.query(
                `UPDATE document_sequences 
                 SET current_number = current_number + 1, updated_at = NOW() 
                 WHERE document_type = 'sales_invoice' AND financial_year = 'ALL' 
                 RETURNING current_number`
            );

            let nextNum = 1;
            if (seqRes.rows.length === 0) {
                const maxRes = await client.query(
                    `SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^INV', '', 'g') AS INTEGER)) as max_val FROM sales_invoices WHERE invoice_no ~ '^INV[0-9]+$'`
                );
                const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
                nextNum = maxExisting + 1;

                await client.query(
                    `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number, updated_at) 
                     VALUES ('sales_invoice', 'INV', 'ALL', $1, NOW()) 
                     ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                    [nextNum]
                );
            } else {
                nextNum = parseInt(seqRes.rows[0].current_number);
            }

            finalInvoiceNo = 'INV' + String(nextNum).padStart(3, '0');
        }

        // ── 3. Level 3: Deterministic Stock Row Locking & Stock Validation ───
        const itemCodes = [...new Set(items.map(i => String(i.code)))].sort();
        const dbItemsRes = await client.query(
            `SELECT code, name, stock FROM items WHERE code = ANY($1) ORDER BY code ASC FOR UPDATE`,
            [itemCodes]
        );

        const dbItemsMap = new Map();
        dbItemsRes.rows.forEach(r => dbItemsMap.set(String(r.code), r));

        const requestedQtyMap = new Map();
        items.forEach(it => {
            const code = String(it.code);
            const currentReq = requestedQtyMap.get(code) || 0;
            requestedQtyMap.set(code, currentReq + parseFloat(it.qty));
        });

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

        // Deduct Stock
        for (const [code, reqQty] of requestedQtyMap.entries()) {
            await client.query(
                `UPDATE items SET stock = stock - $1 WHERE code = $2`,
                [reqQty, code]
            );
        }

        // Parse Dates
        const parsedDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];
        const parsedDueDate = parseDateForDB(dueDate);
        const sid = generateId();

        // ── 4. Level 4: Customer Locking & Store Credit Validation ───────────
        let creditUsed = 0;
        let customerRow = null;

        const calculatedSubTotal = (items && items.length > 0)
            ? items.reduce((sum, it) => sum + ((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0)) - (parseFloat(it.disc || it.discount) || 0), 0)
            : parsedSubTotal;
        const preCreditBase = grandTotal > 0 ? grandTotal : Math.round(calculatedSubTotal - parsedDiscount + parsedTaxAmount);

        if (customerId && String(customerId) !== 'walk-in') {
            const custRes = await client.query(
                `SELECT id, pending_to_receive, store_credit_balance FROM customers WHERE id = $1 FOR UPDATE`,
                [customerId]
            );

            if (custRes.rows.length === 0) {
                throw new Error(`Customer ID "${customerId}" not found`);
            }
            customerRow = custRes.rows[0];

            if (applyStoreCredit) {
                const availableCredit = parseFloat(customerRow.store_credit_balance) || 0;
                creditUsed = Math.min(
                    parseFloat(requestedCredit) || 0,
                    availableCredit,
                    Math.max(0, preCreditBase)
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

        const backendGrandTotal = Math.max(0, preCreditBase - creditUsed);
        const backendNetUnpaid = Math.max(0, backendGrandTotal - receivedAmount);

        // ── 5. Insert Sales Invoice ───────────────────────────────────────────
        await client.query(
            `INSERT INTO sales_invoices (
                id, invoice_no, date, ref_no, due_date, payment_terms, customer_id, customer_name,
                sub_total, discount_percent, discount_amount, total_tax, amount,
                paid_amount, pending_to_receive, returned_amount, note, items, store_credit_applied, idempotency_key
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, $16, $17, $18, $19)`,
            [
                sid, finalInvoiceNo, parsedDate, refNo || '', parsedDueDate, paymentTerms || '',
                customerId || null, customerName || 'Walk In Customer', parsedSubTotal, 0,
                parsedDiscount, parsedTaxAmount, backendGrandTotal, receivedAmount, backendNetUnpaid,
                '', JSON.stringify(items), creditUsed, cleanIdemKey
            ]
        );

        // Update Customer Outstanding Balance (customer already locked at Level 4)
        if (customerId && String(customerId) !== 'walk-in') {
            if (backendNetUnpaid > 0) {
                await client.query(
                    `UPDATE customers SET pending_to_receive = COALESCE(pending_to_receive, 0) + $1 WHERE id = $2`,
                    [backendNetUnpaid, customerId]
                );
            }
        }

        // ── 6. Create Customer Receipt & Allocation for POS Direct Payment ────
        if (receivedAmount > 0 && receiptId && receiptNo) {
            const actualCustomerId = (customerId && String(customerId) !== 'walk-in') ? customerId : null;

            await client.query(`
                INSERT INTO customer_receipts (
                    id, receipt_no, date, customer_id, reference_type, amount,
                    allocated_amount, advance_amount, discount_amount, payment_mode,
                    reference_no, reference_date, note, status
                ) VALUES ($1, $2, $3, $4, 'DIRECT', $5, $5, 0, 0, $6, $7, $8, $9, 'ACTIVE')
            `, [
                receiptId,
                receiptNo,
                parsedDate,
                actualCustomerId,
                receivedAmount,
                req.body.paymentMode || 'Cash',
                finalInvoiceNo,
                parsedDate,
                `POS direct payment for ${finalInvoiceNo}`
            ]);

            await client.query(`
                INSERT INTO customer_receipt_allocations (
                    id, receipt_id, invoice_id, allocated_amount, discount_amount
                ) VALUES ($1, $2, $3, $4, 0)
            `, [generateId(), receiptId, sid, receivedAmount]);
        }

        const responsePayload = { success: true, invoiceNumber: finalInvoiceNo, id: sid, creditUsed, receiptId, receiptNo };

        // ── 7. Commit Idempotency & DB Transaction ────────────────────────────
        await handleIdempotencyCommit(client, '/api/sales/create', cleanIdemKey, sid, 200, responsePayload);
        await client.query('COMMIT');
        res.json(responsePayload);

    } catch (e) {
        await safeRollback(client);
        await handleIdempotencyFail(client, '/api/sales/create', cleanIdemKey);
        if (e.code === '40P01') {
            return res.status(500).json({ error: 'Transaction deadlock detected. Please try saving again.' });
        } else if (e.code === '55P03') {
            return res.status(503).json({ error: 'System is busy updating inventory for these items. Please try again.' });
        } else if (e.code === '23505') {
            return res.status(409).json({ error: 'Invoice number or idempotency key collision detected. Please try saving again.' });
        }
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to create sales invoice') });
    } finally {
        safeRelease(client);
    }
});

// Atomic Purchase Invoice Creation Endpoint
app.post('/api/purchases/create', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connErr) {
        return res.status(503).json({ error: 'System is busy (connection pool). Please try again.' });
    }
    let cleanIdemKey = null;
    try {
        await client.query('BEGIN');

        // ── 0. Persistent Database-Backed Idempotency Gate ────────────────────
        const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
        const idemResult = await handleIdempotencyBegin(client, '/api/purchases/create', idempotencyKey);
        if (idemResult && !idemResult.isNew) {
            await client.query('ROLLBACK');
            return res.status(idemResult.responseCode).json(idemResult.responseBody);
        }
        cleanIdemKey = idemResult ? idemResult.cleanKey : null;

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

        // ── 1. Validation of Input Financials & Items ─────────────────────────
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

        // ── 2. Level 2: Sequence Acquisition (Deterministic prefix order: 'PI' then 'PMT') ──
        let finalPiNo = manualPiNumber;
        if (!finalPiNo) {
            let seqRes = await client.query(
                `UPDATE document_sequences 
                 SET current_number = current_number + 1, updated_at = NOW() 
                 WHERE document_type = 'purchase_invoice' AND financial_year = 'ALL' 
                 RETURNING current_number`
            );

            let nextNum = 1;
            if (seqRes.rows.length === 0) {
                const maxRes = await client.query(
                    `SELECT MAX(CAST(REGEXP_REPLACE(pi_no, '^\\D+', '', 'g') AS INTEGER)) as max_val FROM purchase_invoices WHERE pi_no ~ '\\d+'`
                );
                const maxExisting = parseInt(maxRes.rows[0]?.max_val) || 0;
                nextNum = maxExisting + 1;

                await client.query(
                    `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number, updated_at) 
                     VALUES ('purchase_invoice', 'PI', 'ALL', $1, NOW()) 
                     ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                    [nextNum]
                );
            } else {
                nextNum = parseInt(seqRes.rows[0].current_number);
            }

            finalPiNo = 'PI-' + String(nextNum).padStart(3, '0');
        }

        let paymentNo = null;
        let paymentId = null;
        if (paidAmount > 0) {
            let seqResPMT = await client.query(
                `UPDATE document_sequences 
                 SET current_number = current_number + 1, updated_at = NOW() 
                 WHERE prefix = 'PMT' AND document_type = 'vendor_payment' 
                 RETURNING current_number`
            );
            let nextPmtNum = 1;
            if (seqResPMT.rows.length === 0) {
                const maxRes = await client.query(
                    "SELECT MAX(CAST(REGEXP_REPLACE(payment_no, '^PMT', '', 'g') AS INTEGER)) as max_val FROM vendor_payments WHERE payment_no ~ '^PMT[0-9]+$'"
                );
                nextPmtNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
                await client.query(
                    `INSERT INTO document_sequences (prefix, document_type, financial_year, current_number, updated_at)
                     VALUES ('PMT', 'vendor_payment', 'ALL', $1, NOW())
                     ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                    [nextPmtNum]
                );
            } else {
                nextPmtNum = parseInt(seqResPMT.rows[0].current_number);
            }
            paymentNo = `PMT${String(nextPmtNum).padStart(3, '0')}`;
            paymentId = generateId();
        }

        // ── 3. Level 3: Handle Items & Deterministic Stock Row Locking ────────
        const finalItemsList = [];
        const existingItemsToUpdate = [];

        for (const it of items) {
            if (it.isNew) {
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

            const requestedQtyMap = new Map();
            existingItemsToUpdate.forEach(it => {
                const code = String(it.code);
                const currentReq = requestedQtyMap.get(code) || 0;
                requestedQtyMap.set(code, currentReq + parseFloat(it.qty));
            });

            for (const code of requestedQtyMap.keys()) {
                if (!dbItemsMap.has(code)) {
                    throw new Error(`Existing item code "${code}" not found in inventory`);
                }
            }

            for (const [code, reqQty] of requestedQtyMap.entries()) {
                await client.query(
                    `UPDATE items SET stock = stock + $1 WHERE code = $2`,
                    [reqQty, code]
                );
            }
        }

        // ── 4. Level 4: Resolve & Lock Vendor Row ─────────────────────────────
        let vendorIdToUse = null;

        if (requestedVendorId) {
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

        // Parse Dates
        const parsedDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];
        const parsedDueDate = parseDateForDB(dueDate);
        const piId = generateId();

        // ── 5. Insert Purchase Invoice Record ─────────────────────────────────
        await client.query(
            `INSERT INTO purchase_invoices (
                id, pi_no, date, ref_no, due_date, payment_terms, vendor_id, vendor_name,
                sub_total, discount_percent, discount_amount, total_tax, amount,
                paid_amount, pending_to_pay, returned_amount, note, items, idempotency_key
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, $16, $17, $18)`,
            [
                piId, finalPiNo, parsedDate, refNo || '', parsedDueDate, paymentTerms || 'None',
                vendorIdToUse, vendorName, parsedSubTotal, 0,
                parsedDiscount, parsedTaxAmount, grandTotal, paidAmount, netUnpaid,
                req.body.note || req.body.piNote || '', JSON.stringify(finalItemsList), cleanIdemKey
            ]
        );

        // ── 6. Atomically Create Linked Vendor Payment for Direct Cash Purchase ─
        if (paidAmount > 0 && paymentId && paymentNo) {
            await client.query(`
                INSERT INTO vendor_payments (
                    id, payment_no, date, vendor_id, reference_type, amount,
                    allocated_amount, advance_amount, discount_amount, payment_mode,
                    reference_no, reference_date, note, status
                ) VALUES ($1, $2, $3, $4, 'DIRECT', $5, $5, 0, 0, $6, $7, $8, $9, 'ACTIVE')
            `, [
                paymentId,
                paymentNo,
                parsedDate,
                vendorIdToUse,
                paidAmount,
                req.body.paymentMode || 'Cash',
                finalPiNo,
                parsedDate,
                `Cash purchase payment for ${finalPiNo}`
            ]);

            await client.query(`
                INSERT INTO vendor_payment_allocations (
                    id, payment_id, purchase_invoice_id, allocated_amount, discount_amount
                ) VALUES ($1, $2, $3, $4, 0)
            `, [generateId(), paymentId, piId, paidAmount]);
        }

        const responsePayload = { success: true, piNo: finalPiNo, id: piId, paymentId, paymentNo };

        // ── 7. Commit Idempotency & DB Transaction ────────────────────────────
        await handleIdempotencyCommit(client, '/api/purchases/create', cleanIdemKey, piId, 200, responsePayload);
        await client.query('COMMIT');
        res.json(responsePayload);

    } catch (e) {
        await safeRollback(client);
        await handleIdempotencyFail(client, '/api/purchases/create', cleanIdemKey);
        if (e.code === '40P01') {
            return res.status(500).json({ error: 'Transaction deadlock detected. Please try saving again.' });
        } else if (e.code === '55P03') {
            return res.status(503).json({ error: 'System is busy updating inventory for these items. Please try again.' });
        } else if (e.code === '23505') {
            return res.status(409).json({ error: 'Purchase invoice number or idempotency key collision detected. Please try saving again.' });
        }
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to create purchase invoice') });
    } finally {
        safeRelease(client);
    }
});
app.post('/api/sales', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

// 8a. Atomic Sales Return Creation
app.post('/api/sales-returns/create', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connErr) {
        return res.status(503).json({ error: 'System is busy (connection pool). Please try again.' });
    }
    let cleanIdemKey = null;
    try {
        await client.query('BEGIN');

        // ── 0. Persistent Database-Backed Idempotency Gate ────────────────────
        const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
        const idemResult = await handleIdempotencyBegin(client, '/api/sales-returns/create', idempotencyKey);
        if (idemResult && !idemResult.isNew) {
            await client.query('ROLLBACK');
            return res.status(idemResult.responseCode).json(idemResult.responseBody);
        }
        cleanIdemKey = idemResult ? idemResult.cleanKey : null;

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
            `SELECT id, invoice_no, customer_id, discount_amount, total_tax, amount, pending_to_receive, returned_amount, items, status
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
            `UPDATE document_sequences 
             SET current_number = current_number + 1, updated_at = NOW() 
             WHERE document_type = 'sales_return' AND financial_year = 'ALL' 
             RETURNING current_number`
        );
        let nextReturnNum = 1;
        if (seqRes.rows.length === 0) {
            const maxRes = await client.query(
                `SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^RET', '', 'g') AS INTEGER)) as max_val FROM sales_returns WHERE return_no ~ '^RET[0-9]+$'`
            );
            nextReturnNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
            await client.query(
                `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number, updated_at) 
                 VALUES ('sales_return', 'RET', 'ALL', $1, NOW()) 
                 ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                [nextReturnNum]
            );
        } else {
            nextReturnNum = parseInt(seqRes.rows[0].current_number);
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
        const parsedReturnDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];

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

            const invoicePending = parseFloat(originalInvoice.pending_to_receive) || 0;
            const requestedCashRefund = Math.max(0, parseFloat(clientRefundAmount) || 0);

            // Allocation Step 1: Outstanding absorption against THIS SPECIFIC INVOICE
            receivableReduction = Math.min(returnGrandTotal, invoicePending);
            // Allocation Step 2: Remaining return value after invoice outstanding is cleared
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

        // ── 12b. Update Original Sales Invoice ────────────────────────────────
        await client.query(
            `UPDATE sales_invoices SET
                pending_to_receive = COALESCE(pending_to_receive, 0) - $1,
                returned_amount    = COALESCE(returned_amount, 0) + $2
             WHERE id = $3`,
            [receivableReduction, returnGrandTotal, invoiceId]
        );

        // ── 13. Insert Sales Return ───────────────────────────────────────────
        const returnId = generateId();
        await client.query(
            `INSERT INTO sales_returns (
                id, return_no, invoice_id, invoice_no, date,
                customer_id, customer_name,
                sub_total, discount_amount, total_tax, grand_total,
                refund_amount, store_credit, receivable_reduction, status, created_at, updated_at, items
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'ACTIVE',NOW(),NOW(),$15)`,
            [
                returnId, finalReturnNo, invoiceId, originalInvoice.invoice_no, parsedReturnDate,
                isWalkIn ? null : customerId,
                req.body.customerName || '',
                returnSubTotal, proportionalGlobalDisc, returnTaxTotal, returnGrandTotal,
                cashRefundAmount, storeCreditCreated, receivableReduction,
                JSON.stringify(returnLineItems)
            ]
        );


        const responsePayload = {
            success: true,
            returnNo: finalReturnNo,
            id: returnId,
            returnGrandTotal,
            storeCreditCreated,
            cashRefundAmount
        };

        // ── Commit Idempotency & DB Transaction ──────────────────────────────
        await handleIdempotencyCommit(client, '/api/sales-returns/create', cleanIdemKey, returnId, 200, responsePayload);
        await client.query('COMMIT');
        res.json(responsePayload);

    } catch (e) {
        await safeRollback(client);
        await handleIdempotencyFail(client, '/api/sales-returns/create', cleanIdemKey);
        if (e.code === '40P01') return res.status(500).json({ error: 'Transaction deadlock detected. Please try again.' });
        if (e.code === '55P03') return res.status(503).json({ error: 'System is busy. Please try again.' });
        if (e.code === '23505') return res.status(409).json({ error: 'Duplicate return number or idempotency key collision detected. Please try saving again.' });
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to create sales return') });
    } finally {
        safeRelease(client);
    }
});

// POST /api/purchase-returns/create
app.post('/api/purchase-returns/create', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connErr) {
        return res.status(503).json({ error: 'System is busy (connection pool). Please try again.' });
    }
    let cleanIdemKey = null;
    try {
        await client.query('BEGIN');

        // ── 0. Persistent Database-Backed Idempotency Gate ────────────────────
        const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
        const idemResult = await handleIdempotencyBegin(client, '/api/purchase-returns/create', idempotencyKey);
        if (idemResult && !idemResult.isNew) {
            await client.query('ROLLBACK');
            return res.status(idemResult.responseCode).json(idemResult.responseBody);
        }
        cleanIdemKey = idemResult ? idemResult.cleanKey : null;

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
            `SELECT id, pi_no, vendor_id, vendor_name, sub_total, discount_percent, discount_amount, total_tax, amount, pending_to_pay, returned_amount, items, status
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

        // 5. Increment document_sequences atomically for purchase_return
        let seqRes = await client.query(
            `UPDATE document_sequences 
             SET current_number = current_number + 1, updated_at = NOW() 
             WHERE document_type = 'purchase_return' AND financial_year = 'ALL' 
             RETURNING current_number`
        );
        let nextReturnNum = 1;
        if (seqRes.rows.length === 0) {
            const maxRes = await client.query(
                `SELECT MAX(CAST(REGEXP_REPLACE(return_no, '^PRET', '', 'g') AS INTEGER)) as max_val FROM purchase_returns WHERE return_no ~ '^PRET[0-9]+$'`
            );
            nextReturnNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
            await client.query(
                `INSERT INTO document_sequences (document_type, prefix, financial_year, current_number, updated_at) 
                 VALUES ('purchase_return', 'PRET', 'ALL', $1, NOW()) 
                 ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                [nextReturnNum]
            );
        } else {
            nextReturnNum = parseInt(seqRes.rows[0].current_number);
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
        const invoicePending = parseFloat(originalInvoice.pending_to_pay) || 0;
        const payableReduction = Math.min(returnGrandTotal, invoicePending);
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

        // 12b. Update Original Purchase Invoice
        await client.query(
            `UPDATE purchase_invoices SET
                pending_to_pay  = COALESCE(pending_to_pay, 0) - $1,
                returned_amount = COALESCE(returned_amount, 0) + $2
             WHERE id = $3`,
            [payableReduction, returnGrandTotal, invoiceId]
        );

        // Parse date
        const parsedReturnDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];

        // 13. Insert Purchase Return
        const returnId = generateId();
        await client.query(
            `INSERT INTO purchase_returns (
                id, return_no, invoice_id, invoice_no, date, vendor_id, vendor_name,
                sub_total, discount_amount, total_tax, grand_total, refund_amount, store_credit,
                vendor_credit, cash_received, payable_reduction, status, created_at, updated_at, items
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'ACTIVE', NOW(), NOW(), $17)`,
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
                payableReduction,
                JSON.stringify(returnLineItems)
            ]
        );

        const responsePayload = {
            success: true,
            returnNo: finalReturnNo,
            id: returnId,
            returnGrandTotal,
            vendorCreditCreated,
            cashReceivedFromVendor
        };

        // ── Commit Idempotency & DB Transaction ──────────────────────────────
        await handleIdempotencyCommit(client, '/api/purchase-returns/create', cleanIdemKey, returnId, 200, responsePayload);
        await client.query('COMMIT');
        res.json(responsePayload);

    } catch (e) {
        await safeRollback(client);
        await handleIdempotencyFail(client, '/api/purchase-returns/create', cleanIdemKey);
        if (e.code === '40P01') return res.status(500).json({ error: 'Transaction deadlock detected. Please try saving again.' });
        if (e.code === '55P03') return res.status(503).json({ error: 'System is busy updating inventory. Please try again.' });
        if (e.code === '23505') return res.status(409).json({ error: 'Duplicate return number or idempotency key collision detected. Please try saving again.' });
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to create purchase return') });
    } finally {
        safeRelease(client);
    }
});

app.post('/api/receipts/create', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connErr) {
        return res.status(503).json({ error: 'Database connection pool busy. Please try again.' });
    }
    let cleanIdemKey = null;
    try {
        await client.query('BEGIN');

        // ── 0. Persistent Database-Backed Idempotency Gate ────────────────────
        const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
        const idemResult = await handleIdempotencyBegin(client, '/api/receipts/create', idempotencyKey);
        if (idemResult && !idemResult.isNew) {
            await client.query('ROLLBACK');
            return res.status(idemResult.responseCode).json(idemResult.responseBody);
        }
        cleanIdemKey = idemResult ? idemResult.cleanKey : null;

        const {
            customerId,
            amount: amountInput,
            discount: discountInput,
            date,
            referenceType: reqRefType,
            paymentMode: reqPayMode,
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
        const discount = parseFloat(discountInput) || 0;
        if (isNaN(discount) || discount < 0) {
            throw new Error('Discount cannot be negative');
        }
        if (!date) throw new Error('Date is required');

        const referenceType = reqRefType || 'DIRECT';
        const paymentMode = reqPayMode || null;

        let allocatedAmount = 0;
        let totalDiscount = 0;
        let allocationsToSave = [];
        let uniqueInvoiceIds = [];

        // 2. Process Allocations
        if (!rawAllocations || !Array.isArray(rawAllocations) || rawAllocations.length === 0) {
            throw new Error('Allocations are required');
        }

        // Aggregate duplicate invoice allocations
        const aggMap = new Map();
        for (const alloc of rawAllocations) {
            const invId = String(alloc.invoiceId);
            const allocAmt = parseFloat(alloc.allocatedAmount) || 0;
            const discAmt = parseFloat(alloc.discountAmount) || 0;

            if (!invId) throw new Error('Invoice ID is required for allocation');
            if (allocAmt < 0 || discAmt < 0 || (allocAmt + discAmt) <= 0) {
                throw new Error(`Invalid allocation or discount for invoice: ${invId}`);
            }

            const existing = aggMap.get(invId) || { allocAmt: 0, discAmt: 0 };
            existing.allocAmt += allocAmt;
            existing.discAmt += discAmt;
            aggMap.set(invId, existing);
        }

        const isWalkIn = (!customerId || String(customerId) === 'walk-in' || String(customerId).toLowerCase() === 'walk in customer');
        let selectedCustomerName = 'walk in customer';
        let customer = null;

        if (!isWalkIn) {
            // Pre-fetch selected customer name for validation
            const custCheck = await client.query("SELECT id, customer_name, pending_to_receive FROM customers WHERE id = $1", [customerId]);
            if (custCheck.rows.length === 0) {
                throw new Error('Customer not found');
            }
            customer = custCheck.rows[0];
            selectedCustomerName = (customer.customer_name || '').toLowerCase().trim();
        }

        // Lock affected Sales Invoices in deterministic sorted order
        uniqueInvoiceIds = Array.from(aggMap.keys()).sort();
        const invRes = await client.query(
            "SELECT id, invoice_no, customer_id, customer_name, amount, paid_amount, pending_to_receive, status FROM sales_invoices WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE",
            [uniqueInvoiceIds]
        );

        const invMap = new Map(invRes.rows.map(row => [row.id, row]));

        // Validate invoice details and allocations
        for (const [invId, { allocAmt, discAmt }] of aggMap.entries()) {
            const invoice = invMap.get(invId);
            if (!invoice) {
                throw new Error(`Sales Invoice with ID "${invId}" not found`);
            }
            if (invoice.status === 'CANCELLED') {
                throw new Error('Cannot create transaction against a cancelled Sales Invoice.');
            }
            const invCustId = String(invoice.customer_id || '');
            const invCustName = (invoice.customer_name || '').toLowerCase().trim();
            if (isWalkIn) {
                if (invCustId && invCustId !== 'walk-in' && invCustName !== 'walk in customer') {
                    throw new Error(`Invoice ${invoice.invoice_no} does not belong to Walk In Customer`);
                }
            } else {
                if (invCustId !== String(customerId) && invCustName !== selectedCustomerName) {
                    throw new Error(`Invoice ${invoice.invoice_no} does not belong to the selected customer`);
                }
            }

            const currentPaid = parseFloat(invoice.paid_amount) || 0;
            const remaining = parseFloat(invoice.pending_to_receive) || 0;

            if ((allocAmt + discAmt) > remaining + 0.0001) {
                throw new Error(`Allocation + discount (${(allocAmt + discAmt).toFixed(2)}) exceeds remaining outstanding balance of ${remaining.toFixed(2)} on invoice ${invoice.invoice_no}`);
            }

            allocatedAmount += allocAmt;
            totalDiscount += discAmt;

            allocationsToSave.push({
                invoiceId: invId,
                allocatedAmount: allocAmt,
                discountAmount: discAmt,
                newPaid: currentPaid + allocAmt + discAmt,
                newPending: Math.max(0, remaining - (allocAmt + discAmt))
            });
        }

        // Invariant checks:
        if (Math.abs(allocatedAmount - amount) > 0.01) {
            throw new Error(`Sum of allocations (${allocatedAmount.toFixed(2)}) must equal received amount (${amount.toFixed(2)})`);
        }
        if (discount > 0 && Math.abs(totalDiscount - discount) > 0.01) {
            throw new Error(`Sum of allocated discounts (${totalDiscount.toFixed(2)}) must equal discount amount (${discount.toFixed(2)})`);
        }
        const finalDiscount = discount > 0 ? discount : totalDiscount;

        // 3. Generate Receipt number atomically
        let seqRes = await client.query(
            `UPDATE document_sequences 
             SET current_number = current_number + 1, updated_at = NOW() 
             WHERE prefix = 'AR' AND document_type = 'customer_receipt' 
             RETURNING current_number`
        );
        let nextReceiptNum = 1;
        if (seqRes.rows.length === 0) {
            const maxRes = await client.query(
                "SELECT MAX(CAST(REGEXP_REPLACE(receipt_no, '^AR', '', 'g') AS INTEGER)) as max_val FROM customer_receipts WHERE receipt_no ~ '^AR[0-9]+$'"
            );
            nextReceiptNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
            await client.query(
                `INSERT INTO document_sequences (prefix, document_type, financial_year, current_number, updated_at)
                 VALUES ('AR', 'customer_receipt', 'ALL', $1, NOW())
                 ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                [nextReceiptNum]
            );
        } else {
            nextReceiptNum = parseInt(seqRes.rows[0].current_number);
        }
        const receiptNo = `AR${String(nextReceiptNum).padStart(3, '0')}`;

        // 4. Lock customer row LAST if registered customer
        if (!isWalkIn) {
            const custRes = await client.query(
                "SELECT id, customer_name, pending_to_receive FROM customers WHERE id = $1 FOR UPDATE",
                [customerId]
            );
            if (custRes.rows.length === 0) {
                throw new Error('Customer not found');
            }
            customer = custRes.rows[0];
        }

        const receiptId = generateId();

        // 5. Insert receipt (advance_amount = 0)
        const parsedReceiptDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];
        const parsedRefDate = parseDateForDB(referenceDate);
        const actualCustomerId = isWalkIn ? null : customerId;

        await client.query(`
            INSERT INTO customer_receipts (
                id, receipt_no, date, customer_id, reference_type, amount, 
                allocated_amount, advance_amount, discount_amount, payment_mode, reference_no, reference_date, note, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12, 'ACTIVE')
        `, [
            receiptId, receiptNo, parsedReceiptDate, actualCustomerId, referenceType, amount,
            allocatedAmount, finalDiscount, paymentMode, referenceNo || null,
            parsedRefDate, note || ''
        ]);

        // 6. Insert allocation rows and update Sales Invoices
        for (const alloc of allocationsToSave) {
            await client.query(`
                INSERT INTO customer_receipt_allocations (id, receipt_id, invoice_id, allocated_amount, discount_amount)
                VALUES ($1, $2, $3, $4, $5)
            `, [generateId(), receiptId, alloc.invoiceId, alloc.allocatedAmount, alloc.discountAmount]);

            await client.query(`
                UPDATE sales_invoices 
                SET paid_amount = $1, pending_to_receive = $2
                WHERE id = $3
            `, [alloc.newPaid, alloc.newPending, alloc.invoiceId]);
        }

        // 7. Update Customer Balances if registered customer
        if (!isWalkIn && customer) {
            const currentPending = parseFloat(customer.pending_to_receive) || 0;
            const totalSettled = allocatedAmount + finalDiscount;
            const newPending = Math.max(0, currentPending - totalSettled);

            await client.query(`
                UPDATE customers
                SET pending_to_receive = $1
                WHERE id = $2
            `, [newPending, customerId]);
        }

        const responsePayload = { success: true, receiptNo, receiptId, allocatedAmount, discountAmount: finalDiscount };

        // ── Commit Idempotency & DB Transaction ──────────────────────────────
        await handleIdempotencyCommit(client, '/api/receipts/create', cleanIdemKey, receiptId, 200, responsePayload);
        await client.query('COMMIT');
        res.json(responsePayload);
    } catch (err) {
        await safeRollback(client);
        await handleIdempotencyFail(client, '/api/receipts/create', cleanIdemKey);
        console.error('Customer Receipt creation failed:', err);
        if (err.code === '40P01') {
            return res.status(500).json({ error: 'Transaction deadlock detected. Please try saving again.' });
        } else if (err.code === '23505') {
            return res.status(409).json({ error: 'Receipt number or idempotency key collision detected. Please try saving again.' });
        } else if (err.code || (err.stack && err.stack.includes('pg')) || (err.message && err.message.includes('connect'))) {
            res.status(500).json({ error: 'An unexpected database error occurred' });
        } else {
            res.status(400).json({ error: sanitizeClientError(err, 'Failed to create customer receipt') });
        }
    } finally {
        safeRelease(client);
    }
});

app.post('/api/vendor-payments/create', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connErr) {
        return res.status(503).json({ error: 'Database connection pool busy. Please try again.' });
    }
    let cleanIdemKey = null;
    try {
        await client.query('BEGIN');

        // ── 0. Persistent Database-Backed Idempotency Gate ────────────────────
        const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
        const idemResult = await handleIdempotencyBegin(client, '/api/vendor-payments/create', idempotencyKey);
        if (idemResult && !idemResult.isNew) {
            await client.query('ROLLBACK');
            return res.status(idemResult.responseCode).json(idemResult.responseBody);
        }
        cleanIdemKey = idemResult ? idemResult.cleanKey : null;

        const {
            vendorId,
            amount: amountInput,
            discount: discountInput,
            date,
            referenceType: reqRefType,
            paymentMode: reqPayMode,
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
        const discount = parseFloat(discountInput) || 0;
        if (isNaN(discount) || discount < 0) {
            throw new Error('Discount cannot be negative');
        }
        if (!date) throw new Error('Date is required');

        const referenceType = reqRefType || 'DIRECT';
        const paymentMode = reqPayMode || null;

        let allocatedAmount = 0;
        let totalDiscount = 0;
        let allocationsToSave = [];
        let uniqueInvoiceIds = [];

        // 2. Process Allocations
        if (!rawAllocations || !Array.isArray(rawAllocations) || rawAllocations.length === 0) {
            throw new Error('Allocations are required');
        }

        // Aggregate duplicate invoice allocations
        const aggMap = new Map();
        for (const alloc of rawAllocations) {
            const invId = String(alloc.invoiceId);
            const allocAmt = parseFloat(alloc.allocatedAmount) || 0;
            const discAmt = parseFloat(alloc.discountAmount) || 0;

            if (!invId) throw new Error('Invoice ID is required for allocation');
            if (allocAmt < 0 || discAmt < 0 || (allocAmt + discAmt) <= 0) {
                throw new Error(`Invalid allocation or discount for invoice: ${invId}`);
            }

            const existing = aggMap.get(invId) || { allocAmt: 0, discAmt: 0 };
            existing.allocAmt += allocAmt;
            existing.discAmt += discAmt;
            aggMap.set(invId, existing);
        }

        // Lock affected Purchase Invoices in deterministic sorted order
        uniqueInvoiceIds = Array.from(aggMap.keys()).sort();
        const invRes = await client.query(
            "SELECT id, pi_no, vendor_id, amount, paid_amount, pending_to_pay, status FROM purchase_invoices WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE",
            [uniqueInvoiceIds]
        );

        const invMap = new Map(invRes.rows.map(row => [row.id, row]));

        // Validate invoice details and allocations
        for (const [invId, { allocAmt, discAmt }] of aggMap.entries()) {
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
            const remaining = parseFloat(invoice.pending_to_pay) || 0;

            if ((allocAmt + discAmt) > remaining + 0.0001) {
                throw new Error(`Allocation + discount (${(allocAmt + discAmt).toFixed(2)}) exceeds remaining outstanding balance of ${remaining.toFixed(2)} on invoice ${invoice.pi_no}`);
            }

            allocatedAmount += allocAmt;
            totalDiscount += discAmt;

            allocationsToSave.push({
                invoiceId: invId,
                allocatedAmount: allocAmt,
                discountAmount: discAmt,
                newPaid: currentPaid + allocAmt + discAmt,
                newPending: Math.max(0, remaining - (allocAmt + discAmt))
            });
        }

        // Invariant checks:
        if (Math.abs(allocatedAmount - amount) > 0.01) {
            throw new Error(`Sum of allocations (${allocatedAmount.toFixed(2)}) must equal paid amount (${amount.toFixed(2)})`);
        }
        if (discount > 0 && Math.abs(totalDiscount - discount) > 0.01) {
            throw new Error(`Sum of allocated discounts (${totalDiscount.toFixed(2)}) must equal discount amount (${discount.toFixed(2)})`);
        }
        const finalDiscount = discount > 0 ? discount : totalDiscount;

        // 3. Lock/generate sequence atomically
        let seqRes = await client.query(
            `UPDATE document_sequences 
             SET current_number = current_number + 1, updated_at = NOW() 
             WHERE prefix = 'PMT' AND document_type = 'vendor_payment' 
             RETURNING current_number`
        );
        let nextPmtNum = 1;
        if (seqRes.rows.length === 0) {
            const maxRes = await client.query(
                "SELECT MAX(CAST(REGEXP_REPLACE(payment_no, '^PMT', '', 'g') AS INTEGER)) as max_val FROM vendor_payments WHERE payment_no ~ '^PMT[0-9]+$'"
            );
            nextPmtNum = (parseInt(maxRes.rows[0]?.max_val) || 0) + 1;
            await client.query(
                `INSERT INTO document_sequences (prefix, document_type, financial_year, current_number, updated_at)
                 VALUES ('PMT', 'vendor_payment', 'ALL', $1, NOW())
                 ON CONFLICT (document_type, financial_year) DO UPDATE SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
                [nextPmtNum]
            );
        } else {
            nextPmtNum = parseInt(seqRes.rows[0].current_number);
        }
        const paymentNo = `PMT${String(nextPmtNum).padStart(3, '0')}`;

        // 4. Lock Vendor row
        const vendorRes = await client.query(
            "SELECT id, vendor_name, pending_to_pay, vendor_advance_balance FROM vendors WHERE id = $1 FOR UPDATE",
            [vendorId]
        );
        if (vendorRes.rows.length === 0) {
            throw new Error('Vendor not found');
        }
        const vendor = vendorRes.rows[0];

        const paymentId = generateId();

        // 5. Insert vendor payment
        const parsedPaymentDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];
        const parsedRefDate = parseDateForDB(referenceDate);
        await client.query(`
            INSERT INTO vendor_payments (
                id, payment_no, date, vendor_id, reference_type, amount, 
                allocated_amount, advance_amount, discount_amount, payment_mode, reference_no, reference_date, note, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12, 'ACTIVE')
        `, [
            paymentId, paymentNo, parsedPaymentDate, vendorId, referenceType, amount,
            allocatedAmount, finalDiscount, paymentMode, referenceNo || null,
            parsedRefDate, note || ''
        ]);

        // 6. Insert allocation rows and update Purchase Invoices
        for (const alloc of allocationsToSave) {
            await client.query(`
                INSERT INTO vendor_payment_allocations (id, payment_id, purchase_invoice_id, allocated_amount, discount_amount)
                VALUES ($1, $2, $3, $4, $5)
            `, [generateId(), paymentId, alloc.invoiceId, alloc.allocatedAmount, alloc.discountAmount]);

            await client.query(`
                UPDATE purchase_invoices 
                SET paid_amount = $1, pending_to_pay = $2
                WHERE id = $3
            `, [alloc.newPaid, alloc.newPending, alloc.invoiceId]);
        }

        // 7. Update Vendor Balances
        const currentPending = parseFloat(vendor.pending_to_pay) || 0;
        const totalSettled = allocatedAmount + finalDiscount;
        const newPending = Math.max(0, currentPending - totalSettled);

        await client.query(`
            UPDATE vendors
            SET pending_to_pay = $1
            WHERE id = $2
        `, [newPending, vendorId]);

        const responsePayload = { success: true, paymentNo, paymentId, allocatedAmount, discountAmount: finalDiscount };

        // ── Commit Idempotency & DB Transaction ──────────────────────────────
        await handleIdempotencyCommit(client, '/api/vendor-payments/create', cleanIdemKey, paymentId, 200, responsePayload);
        await client.query('COMMIT');
        res.json(responsePayload);
    } catch (err) {
        await safeRollback(client);
        await handleIdempotencyFail(client, '/api/vendor-payments/create', cleanIdemKey);
        console.error('Vendor Payment creation failed:', err);
        if (err.code === '40P01') {
            return res.status(500).json({ error: 'Transaction deadlock detected. Please try saving again.' });
        } else if (err.code === '23505') {
            return res.status(409).json({ error: 'Vendor payment number or idempotency key collision detected. Please try saving again.' });
        } else if (err.code || (err.stack && err.stack.includes('pg')) || (err.message && err.message.includes('connect'))) {
            res.status(500).json({ error: 'An unexpected database error occurred' });
        } else {
            res.status(400).json({ error: sanitizeClientError(err, 'Failed to create vendor payment') });
        }
    } finally {
        safeRelease(client);
    }
});

// 8. Sales Returns
app.get('/api/sales-returns', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), async (req, res) => {
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
        sendError(res, e, 'Failed to fetch sales returns');
    }
});

app.post('/api/sales-returns', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});


// Purchase Returns API
app.get('/api/purchase-returns', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
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
        sendError(res, e, 'Failed to fetch purchase returns');
    }
});

app.post('/api/purchase-returns', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    res.status(410).json({
        error: "This endpoint has been deprecated.",
        message: "Use the transaction-safe API introduced in Phase 2."
    });
});

// 12b. Dashboard Summary Analytics (High-Performance Server-Side Aggregation)
app.get('/api/reports/dashboard-summary', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
    try {
        const startDate = parseDateForDB(req.query.startDate) || null;
        const endDate = parseDateForDB(req.query.endDate) || null;

        // Run parallel queries across PostgreSQL
        const [
            salesAggRes,
            returnsAggRes,
            purchasesAggRes,
            purchaseReturnsAggRes,
            customerPendingRes,
            vendorPendingRes,
            valuationRes,
            topSellingRes,
            categoryRes,
            monthlyRes,
            debtorsRes,
            recentInvoicesRes,
            recentPaymentsRes
        ] = await Promise.all([
            // 1. Sales Aggregation
            pool.query(`
                SELECT COALESCE(SUM(amount), 0)::numeric as "totalSalesAmount", COUNT(*)::int as "salesCount"
                FROM sales_invoices
                WHERE status != 'CANCELLED' 
                  AND ($1::date IS NULL OR date >= $1::date) 
                  AND ($2::date IS NULL OR date <= $2::date)
            `, [startDate, endDate]),

            // 2. Returns Aggregation
            pool.query(`
                SELECT COALESCE(SUM(grand_total), 0)::numeric as "totalSalesReturnAmount", COUNT(*)::int as "salesReturnCount"
                FROM sales_returns
                WHERE status != 'CANCELLED' 
                  AND ($1::date IS NULL OR date >= $1::date) 
                  AND ($2::date IS NULL OR date <= $2::date)
            `, [startDate, endDate]),

            // 3. Purchases Aggregation
            pool.query(`
                SELECT COALESCE(SUM(amount), 0)::numeric as "totalPurchaseAmount", COUNT(*)::int as "purchaseCount"
                FROM purchase_invoices
                WHERE status != 'CANCELLED' 
                  AND ($1::date IS NULL OR date >= $1::date) 
                  AND ($2::date IS NULL OR date <= $2::date)
            `, [startDate, endDate]),

            // 3b. Purchase Returns Aggregation
            pool.query(`
                SELECT COALESCE(SUM(grand_total), 0)::numeric as "totalPurchaseReturnAmount", COUNT(*)::int as "purchaseReturnCount"
                FROM purchase_returns
                WHERE status != 'CANCELLED' 
                  AND ($1::date IS NULL OR date >= $1::date) 
                  AND ($2::date IS NULL OR date <= $2::date)
            `, [startDate, endDate]),

            // 4. Global Customer Pending
            pool.query(`
                SELECT 
                    (SELECT COALESCE(SUM(pending_to_receive), 0) FROM sales_invoices WHERE status != 'CANCELLED') +
                    (SELECT COALESCE(SUM(opening_balance), 0) FROM customers) as "globalCustomerPending"
            `),

            // 5. Global Vendor Pending
            pool.query(`
                SELECT 
                    (SELECT COALESCE(SUM(pending_to_pay), 0) FROM purchase_invoices WHERE status != 'CANCELLED') +
                    (SELECT COALESCE(SUM(opening_balance), 0) FROM vendors) as "globalVendorPending"
            `),

            // 6. Inventory Valuation
            pool.query(`
                SELECT COALESCE(SUM(stock * purchase_price), 0)::numeric as "inventoryValuation" 
                FROM items
            `),

            // 7. Top Selling Products
            pool.query(`
                SELECT 
                    COALESCE(elem->>'code', elem->'item'->>'code') as code,
                    COALESCE(elem->>'name', elem->'item'->>'name', 'Product') as name,
                    SUM(COALESCE((elem->>'qty')::numeric, (elem->>'quantity')::numeric, 0))::numeric as qty,
                    SUM(COALESCE((elem->>'qty')::numeric, (elem->>'quantity')::numeric, 0) * COALESCE((elem->>'rate')::numeric, (elem->>'price')::numeric, 0))::numeric as total
                FROM sales_invoices,
                LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(items) = 'array' THEN items ELSE '[]'::jsonb END) as elem
                WHERE status != 'CANCELLED'
                  AND ($1::date IS NULL OR date >= $1::date)
                  AND ($2::date IS NULL OR date <= $2::date)
                GROUP BY 1, 2
                ORDER BY total DESC
                LIMIT 5
            `, [startDate, endDate]),

            // 8. Category Breakdown
            pool.query(`
                SELECT 
                    COALESCE(i.category_name, 'General') as category,
                    SUM(COALESCE((elem->>'qty')::numeric, (elem->>'quantity')::numeric, 0) * COALESCE((elem->>'rate')::numeric, (elem->>'price')::numeric, 0))::numeric as amount
                FROM sales_invoices s,
                LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.items) = 'array' THEN s.items ELSE '[]'::jsonb END) as elem
                LEFT JOIN items i ON i.code = COALESCE(elem->>'code', elem->'item'->>'code')
                WHERE s.status != 'CANCELLED'
                  AND ($1::date IS NULL OR s.date >= $1::date)
                  AND ($2::date IS NULL OR s.date <= $2::date)
                GROUP BY 1
                ORDER BY amount DESC
                LIMIT 5
            `, [startDate, endDate]),

            // 9. Monthly Cash Flow (Last 6 Months)
            pool.query(`
                WITH months AS (
                    SELECT generate_series(
                        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                        date_trunc('month', CURRENT_DATE),
                        INTERVAL '1 month'
                    )::date as m_start
                )
                SELECT 
                    to_char(m.m_start, 'Mon') as label,
                    COALESCE((SELECT SUM(amount) FROM sales_invoices WHERE date_trunc('month', date) = m.m_start AND status != 'CANCELLED'), 0)::numeric as sales,
                    COALESCE((SELECT SUM(amount) FROM purchase_invoices WHERE date_trunc('month', date) = m.m_start AND status != 'CANCELLED'), 0)::numeric as purchases
                FROM months m
                ORDER BY m.m_start ASC
            `),

            // 10. Top Debtors
            pool.query(`
                WITH inv_dues AS (
                    SELECT customer_id, customer_name, SUM(pending_to_receive) as inv_pending, SUM(amount) as total_purchases
                    FROM sales_invoices 
                    WHERE status != 'CANCELLED'
                    GROUP BY customer_id, customer_name
                )
                SELECT 
                    c.id,
                    c.customer_name as name,
                    c.phone_number as mobile,
                    COALESCE(inv.total_purchases, 0)::numeric as "totalPurchases",
                    (COALESCE(inv.inv_pending, 0) + COALESCE(c.opening_balance, 0))::numeric as pending
                FROM customers c
                LEFT JOIN inv_dues inv ON inv.customer_id = c.id
                WHERE (COALESCE(inv.inv_pending, 0) + COALESCE(c.opening_balance, 0)) > 0
                ORDER BY pending DESC
                LIMIT 5
            `),

            // 11. Recent Invoices (Latest 5, active)
            pool.query(`
                SELECT 
                    id, invoice_no as "invoiceNumber", date, customer_name as "customerName", 
                    amount as "grandTotal", paid_amount as "receivedAmount", pending_to_receive as "pendingToReceive", status
                FROM sales_invoices
                WHERE status != 'CANCELLED'
                ORDER BY date DESC, id DESC
                LIMIT 5
            `),

            // 12. Recent Payments (Latest 5, active)
            pool.query(`
                SELECT 
                    cr.id, cr.receipt_no as "receiptNo", cr.date, c.customer_name as "customerName",
                    cr.amount, cr.payment_mode as "paymentMode", cr.status
                FROM customer_receipts cr
                LEFT JOIN customers c ON c.id = cr.customer_id
                WHERE cr.status != 'CANCELLED'
                ORDER BY cr.date DESC, cr.id DESC
                LIMIT 5
            `)
        ]);

        const totalSalesAmount = parseFloat(salesAggRes.rows[0]?.totalSalesAmount) || 0;
        const totalSalesReturnAmount = parseFloat(returnsAggRes.rows[0]?.totalSalesReturnAmount) || 0;
        const netSales = Math.max(0, totalSalesAmount - totalSalesReturnAmount);
        const totalPurchaseAmount = parseFloat(purchasesAggRes.rows[0]?.totalPurchaseAmount) || 0;
        const totalPurchaseReturnAmount = parseFloat(purchaseReturnsAggRes.rows[0]?.totalPurchaseReturnAmount) || 0;
        const globalCustomerPending = parseFloat(customerPendingRes.rows[0]?.globalCustomerPending) || 0;
        const globalVendorPending = parseFloat(vendorPendingRes.rows[0]?.globalVendorPending) || 0;
        const inventoryValuation = parseFloat(valuationRes.rows[0]?.inventoryValuation) || 0;

        // Process Category Breakdown with percentages & colors
        const catColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];
        const totalCatRev = categoryRes.rows.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0) || 1;
        const categoryBreakdown = categoryRes.rows.map((row, idx) => {
            const amt = parseFloat(row.amount) || 0;
            return {
                category: row.category,
                amount: amt,
                percentage: Math.round((amt / totalCatRev) * 100),
                color: catColors[idx % catColors.length]
            };
        });

        // Process Monthly Comparison
        const monthlyMonths = monthlyRes.rows.map(r => ({
            label: r.label,
            sales: parseFloat(r.sales) || 0,
            purchases: parseFloat(r.purchases) || 0
        }));
        const maxVal = Math.max(...monthlyMonths.map(m => Math.max(m.sales, m.purchases)), 1000);

        // Format Recent Invoices Dates
        const recentInvoices = recentInvoicesRes.rows.map(s => {
            if (s.date) {
                const d = new Date(s.date);
                s.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            s.grandTotal = parseFloat(s.grandTotal) || 0;
            s.receivedAmount = parseFloat(s.receivedAmount) || 0;
            s.pendingToReceive = parseFloat(s.pendingToReceive) || 0;
            return s;
        });

        // Format Recent Payments Dates
        const recentPayments = recentPaymentsRes.rows.map(p => {
            if (p.date) {
                const d = new Date(p.date);
                p.date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            p.amount = parseFloat(p.amount) || 0;
            return p;
        });

        const topDebtors = debtorsRes.rows.map(d => ({
            id: d.id,
            name: d.name,
            mobile: d.mobile || '-',
            totalPurchases: parseFloat(d.totalPurchases) || 0,
            pending: parseFloat(d.pending) || 0
        }));

        const topSellingProducts = topSellingRes.rows.map(p => ({
            code: p.code,
            name: p.name,
            qty: parseFloat(p.qty) || 0,
            total: parseFloat(p.total) || 0
        }));

        res.json({
            success: true,
            summary: {
                totalSalesAmount,
                salesCount: parseInt(salesAggRes.rows[0]?.salesCount) || 0,
                totalSalesReturnAmount,
                salesReturnCount: parseInt(returnsAggRes.rows[0]?.salesReturnCount) || 0,
                netSales,
                totalPurchaseAmount,
                purchaseCount: parseInt(purchasesAggRes.rows[0]?.purchaseCount) || 0,
                totalPurchaseReturnAmount,
                purchaseReturnCount: parseInt(purchaseReturnsAggRes.rows[0]?.purchaseReturnCount) || 0,
                globalCustomerPending,
                globalVendorPending,
                inventoryValuation,
                topSellingProducts,
                categoryBreakdown,
                monthlyComparison: {
                    months: monthlyMonths,
                    maxVal
                },
                topDebtors,
                recentInvoices,
                recentPayments
            }
        });
    } catch (err) {
        sendError(res, err, 'Failed to generate dashboard summary');
    }
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

// Circuit breaker for failed Gemini models (e.g. 404 Not Found, 400 Invalid)
const disabledGeminiModels = new Set();

app.post('/api/ai/extract-invoice', requireRole(['ADMIN', 'ACCOUNTANT']), (req, res, next) => {
    upload.fields([{ name: 'invoiceFile', maxCount: 1 }, { name: 'invoice', maxCount: 1 }])(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        if (req.files) {
            req.file = (req.files['invoiceFile'] && req.files['invoiceFile'][0]) || 
                       (req.files['invoice'] && req.files['invoice'][0]) || 
                       null;
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
        
        // Robust Fallback Array with verified official models
        const verifiedModels = [
            process.env.GEMINI_MODEL,
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro"
        ].filter(Boolean);

        let modelsToTry = verifiedModels.filter(m => !disabledGeminiModels.has(m));
        if (modelsToTry.length === 0) {
            // Reset circuit breaker if all models were temporarily marked disabled
            disabledGeminiModels.clear();
            modelsToTry = verifiedModels;
        }

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
                if (err.message && (err.message.includes('404') || err.message.includes('not found') || err.message.includes('400') || err.message.includes('is not supported'))) {
                    disabledGeminiModels.add(modelName);
                }
                lastError = err;
            }
        }

        if (!responseResult) {
            throw new Error(`All fallback AI models failed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
        }

        const rawText = responseResult.response.text();
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            return res.status(422).json({ error: "AI model response did not contain a valid JSON object" });
        }

        const jsonSubstring = rawText.substring(firstBrace, lastBrace + 1);
        let extractedData;
        try {
            extractedData = JSON.parse(jsonSubstring);
        } catch (parseErr) {
            return res.status(422).json({
                error: "Failed to parse extracted invoice JSON from AI model",
                details: parseErr.message
            });
        }

        // Schema validation: ensure required financial nodes exist
        if (!extractedData || typeof extractedData !== 'object' || (!extractedData.vendor && !extractedData.invoice && !extractedData.items)) {
            return res.status(422).json({ error: "Extracted invoice is missing required financial fields (vendor, invoice, items)" });
        }

        res.json({ success: true, data: extractedData });
    } catch (error) {
        sendError(res, error, 'AI Extraction service failed');
    }
});

// 1. POST /api/receipts/:id/cancel
app.post('/api/receipts/:id/cancel', requireRole(['ADMIN']), async (req, res) => {
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
            "SELECT invoice_id, allocated_amount, COALESCE(discount_amount, 0) as discount_amount FROM customer_receipt_allocations WHERE receipt_id = $1",
            [receiptId]
        );

        let uniqueInvoiceIds = [];
        if (allocRes.rows.length > 0) {
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

        // 3. Lock Customer row (Lock 3) if registered customer
        let customer = null;
        if (receipt.customer_id && String(receipt.customer_id) !== 'walk-in') {
            const custRes = await client.query(
                "SELECT id, pending_to_receive, customer_advance_balance FROM customers WHERE id = $1 FOR UPDATE",
                [receipt.customer_id]
            );
            if (custRes.rows.length === 0) {
                throw new Error('Customer not found');
            }
            customer = custRes.rows[0];
        }

        const receiptAdvanceAmt = parseFloat(receipt.advance_amount) || 0;

        // Invariant check: customer advance balance must be sufficient to revert if advance was granted
        if (customer && receiptAdvanceAmt > 0) {
            const currentCustAdvance = parseFloat(customer.customer_advance_balance) || 0;
            if (currentCustAdvance < receiptAdvanceAmt) {
                throw new Error(`Insufficient customer advance balance. Available: ${currentCustAdvance}, Required: ${receiptAdvanceAmt}`);
            }
        }

        // 4. Perform reversals
        // Revert allocations and discounts
        for (const alloc of allocRes.rows) {
            const inv = invMap.get(alloc.invoice_id);
            if (!inv) {
                throw new Error(`Sales Invoice with ID "${alloc.invoice_id}" not found`);
            }
            const allocatedVal = parseFloat(alloc.allocated_amount) || 0;
            const discountVal = parseFloat(alloc.discount_amount) || 0;
            const totalReversal = allocatedVal + discountVal;
            
            // Revert Invoice balances
            await client.query(
                "UPDATE sales_invoices SET paid_amount = COALESCE(paid_amount, 0) - $1, pending_to_receive = COALESCE(pending_to_receive, 0) + $1 WHERE id = $2",
                [totalReversal, inv.id]
            );
            
            // Revert Customer outstanding receivable if registered customer
            if (customer) {
                await client.query(
                    "UPDATE customers SET pending_to_receive = COALESCE(pending_to_receive, 0) + $1 WHERE id = $2",
                    [totalReversal, customer.id]
                );
            }
        }

        // Revert Customer Advance Balance if applicable
        if (customer && receiptAdvanceAmt > 0) {
            await client.query(
                "UPDATE customers SET customer_advance_balance = COALESCE(customer_advance_balance, 0) - $1 WHERE id = $2",
                [receiptAdvanceAmt, customer.id]
            );
        }

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
        await safeRollback(client);
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to cancel customer receipt') });
    } finally {
        safeRelease(client);
    }
});

// 2. POST /api/vendor-payments/:id/cancel
app.post('/api/vendor-payments/:id/cancel', requireRole(['ADMIN']), async (req, res) => {
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
            "SELECT purchase_invoice_id, allocated_amount, COALESCE(discount_amount, 0) as discount_amount FROM vendor_payment_allocations WHERE payment_id = $1",
            [paymentId]
        );

        let uniqueInvoiceIds = [];
        if (allocRes.rows.length > 0) {
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

        // 4. Perform reversals
        // Revert allocations and discounts
        for (const alloc of allocRes.rows) {
            const inv = invMap.get(alloc.purchase_invoice_id);
            if (!inv) {
                throw new Error(`Purchase Invoice with ID "${alloc.purchase_invoice_id}" not found`);
            }
            const allocatedVal = parseFloat(alloc.allocated_amount) || 0;
            const discountVal = parseFloat(alloc.discount_amount) || 0;
            const totalReversal = allocatedVal + discountVal;
            
            // Revert Invoice balances
            await client.query(
                "UPDATE purchase_invoices SET paid_amount = COALESCE(paid_amount, 0) - $1, pending_to_pay = COALESCE(pending_to_pay, 0) + $1 WHERE id = $2",
                [totalReversal, inv.id]
            );
            
            // Revert Vendor outstanding payable
            await client.query(
                "UPDATE vendors SET pending_to_pay = COALESCE(pending_to_pay, 0) + $1 WHERE id = $2",
                [totalReversal, vendor.id]
            );
        }

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
        await safeRollback(client);
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to cancel vendor payment') });
    } finally {
        safeRelease(client);
    }
});

// 3. POST /api/sales-returns/:id/cancel
// PUT /api/sales-returns/:id (Full Edit)
app.put('/api/sales-returns/:id', requireRole(['ADMIN']), async (req, res) => {
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
        const parsedDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];

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
                `SELECT id, code, name, stock FROM items WHERE id = ANY($1::text[]) ORDER BY code ASC FOR UPDATE`,
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
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to update Sales Return') });
    } finally {
        client.release();
    }
});

// PUT /api/purchase-returns/:id (Full Edit)
app.put('/api/purchase-returns/:id', requireRole(['ADMIN']), async (req, res) => {
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

        const parsedDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];

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
            const dbItemsRes = await client.query(`SELECT id, code, name, stock FROM items WHERE id = ANY($1::text[]) ORDER BY code ASC FOR UPDATE`, [itemIds]);
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
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to update Purchase Return') });
    } finally {
        client.release();
    }
});


app.post('/api/sales-returns/:id/cancel', requireRole(['ADMIN']), async (req, res) => {
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
            "SELECT id, return_no, invoice_id, customer_id, grand_total, store_credit, receivable_reduction, status, items FROM sales_returns WHERE id = $1 FOR UPDATE",
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
            [parseFloat(salesReturn.receivable_reduction) || 0, storeCreditToRevert, customer.id]
        );

        // Revert Original Sales Invoice balances
        await client.query(
            `UPDATE sales_invoices SET 
                pending_to_receive = COALESCE(pending_to_receive, 0) + $1,
                returned_amount    = COALESCE(returned_amount, 0) - $2
             WHERE id = $3`,
            [parseFloat(salesReturn.receivable_reduction) || 0, parseFloat(salesReturn.grand_total) || 0, salesReturn.invoice_id]
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
            oldData: salesReturn,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Sales Return cancelled successfully' });

    } catch (error) {
        await safeRollback(client);
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to cancel sales return') });
    } finally {
        safeRelease(client);
    }
});

// 4. POST /api/purchase-returns/:id/cancel
app.post('/api/purchase-returns/:id/cancel', requireRole(['ADMIN']), async (req, res) => {
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
            "SELECT id, return_no, invoice_id, vendor_id, grand_total, vendor_credit, payable_reduction, status, items FROM purchase_returns WHERE id = $1 FOR UPDATE",
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
            [parseFloat(purchaseReturn.payable_reduction) || 0, vendorCreditToRevert, vendor.id]
        );

        // Revert Original Purchase Invoice balances
        await client.query(
            `UPDATE purchase_invoices SET 
                pending_to_pay  = COALESCE(pending_to_pay, 0) + $1,
                returned_amount = COALESCE(returned_amount, 0) - $2
             WHERE id = $3`,
            [parseFloat(purchaseReturn.payable_reduction) || 0, parseFloat(purchaseReturn.grand_total) || 0, purchaseReturn.invoice_id]
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
            oldData: purchaseReturn,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Purchase Return cancelled successfully' });

    } catch (error) {
        await safeRollback(client);
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to cancel purchase return') });
    } finally {
        safeRelease(client);
    }
});

// 5. POST /api/sales/:id/cancel
app.post('/api/sales/:id/cancel', requireRole(['ADMIN']), async (req, res) => {
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
        await safeRollback(client);
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to cancel sales invoice') });
    } finally {
        safeRelease(client);
    }
});

// 6. POST /api/purchases/:id/cancel
app.post('/api/purchases/:id/cancel', requireRole(['ADMIN']), async (req, res) => {
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
            recordId: invoiceId,
            action: 'CANCEL',
            oldData: invoice,
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');
        res.json({ success: true, message: 'Purchase Invoice cancelled successfully' });

    } catch (error) {
        await safeRollback(client);
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to cancel purchase invoice') });
    } finally {
        safeRelease(client);
    }
});

// PUT /api/sales/:id (Full Edit)
app.put('/api/sales/:id', requireRole(['ADMIN']), async (req, res) => {
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
        const parsedDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];
        const parsedDueDate = parseDateForDB(dueDate);

        // 3. Delta Calculation (Items using primary key ID or Code)
        const oldItems = typeof oldInv.items === 'string' ? JSON.parse(oldInv.items) : (oldInv.items || []);
        
        const itemDeltas = new Map(); // key: item code or id, value: qty delta (new - old)
        const getItemKey = (it) => String(it.code || it.id || it.item_id || it.item?.code || it.item?.id || '');

        for (const oldIt of oldItems) {
            const itemKey = getItemKey(oldIt);
            const qty = parseFloat(oldIt.qty) || 0;
            if (itemKey && itemKey !== 'undefined') {
                itemDeltas.set(itemKey, (itemDeltas.get(itemKey) || 0) - qty);
            }
        }

        for (const newIt of items) {
            const itemKey = getItemKey(newIt);
            const qty = parseFloat(newIt.qty) || 0;
            if (itemKey && itemKey !== 'undefined') {
                itemDeltas.set(itemKey, (itemDeltas.get(itemKey) || 0) + qty);
            }
        }

        // Clean up 0 deltas
        for (const [itemKey, delta] of itemDeltas.entries()) {
            if (Math.abs(delta) < 0.0001) itemDeltas.delete(itemKey);
        }

        // 4. Stock Validation
        const itemKeys = Array.from(itemDeltas.keys()).sort();
        if (itemKeys.length > 0) {
            const dbItemsRes = await client.query(
                `SELECT id, code, name, stock FROM items WHERE code = ANY($1::text[]) OR id = ANY($1::text[]) ORDER BY code ASC FOR UPDATE`,
                [itemKeys]
            );

            const dbItemsMap = new Map();
            dbItemsRes.rows.forEach(r => {
                dbItemsMap.set(String(r.code), r);
                dbItemsMap.set(String(r.id), r);
            });

            for (const [itemKey, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemKey);
                if (!dbItem) {
                    throw new Error(`Item "${itemKey}" not found in inventory`);
                }
                const currentStock = parseFloat(dbItem.stock) || 0;
                // For sales, deltaQty > 0 means we need to take MORE from stock.
                if (currentStock - deltaQty < 0) {
                    throw new Error(`Insufficient stock for item "${dbItem.name}". Available: ${currentStock}, Edit requires deducting additional: ${deltaQty}`);
                }
            }

            // Apply Stock Deltas
            for (const [itemKey, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemKey);
                await client.query(
                    `UPDATE items SET stock = stock - $1 WHERE id = $2`,
                    [deltaQty, dbItem.id]
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
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to update transaction') });
    } finally {
        client.release();
    }
});


// PATCH /api/sales/:id
app.patch('/api/sales/:id', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
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
            updates.push(`due_date = $${idx++}`);
            values.push(parseDateForDB(dueDate));
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
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to update sales invoice metadata') });
    } finally {
        client.release();
    }
});

// PUT /api/purchases/:id (Full Edit)
app.put('/api/purchases/:id', requireRole(['ADMIN']), async (req, res) => {
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
        const parsedDate = parseDateForDB(date) || new Date().toISOString().split('T')[0];
        const parsedDueDate = parseDateForDB(dueDate);

        // 3. Delta Calculation (Items using primary key ID or Code)
        const oldItems = typeof oldInv.items === 'string' ? JSON.parse(oldInv.items) : (oldInv.items || []);
        
        const itemDeltas = new Map(); 
        const getItemKey = (it) => String(it.code || it.id || it.item_id || it.item?.code || it.item?.id || '');

        for (const oldIt of oldItems) {
            const itemKey = getItemKey(oldIt);
            const qty = parseFloat(oldIt.qty) || 0;
            if (itemKey && itemKey !== 'undefined') {
                itemDeltas.set(itemKey, (itemDeltas.get(itemKey) || 0) - qty);
            }
        }

        for (const newIt of items) {
            const itemKey = getItemKey(newIt);
            const qty = parseFloat(newIt.qty) || 0;
            if (itemKey && itemKey !== 'undefined') {
                itemDeltas.set(itemKey, (itemDeltas.get(itemKey) || 0) + qty);
            }
        }

        // Clean up 0 deltas
        for (const [itemKey, delta] of itemDeltas.entries()) {
            if (Math.abs(delta) < 0.0001) itemDeltas.delete(itemKey);
        }

        // 4. Stock Validation
        const itemKeys = Array.from(itemDeltas.keys()).sort();
        if (itemKeys.length > 0) {
            const dbItemsRes = await client.query(
                `SELECT id, code, name, stock FROM items WHERE code = ANY($1::text[]) OR id = ANY($1::text[]) ORDER BY code ASC FOR UPDATE`,
                [itemKeys]
            );

            const dbItemsMap = new Map();
            dbItemsRes.rows.forEach(r => {
                dbItemsMap.set(String(r.code), r);
                dbItemsMap.set(String(r.id), r);
            });

            for (const [itemKey, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemKey);
                if (!dbItem) {
                    throw new Error(`Item "${itemKey}" not found in inventory`);
                }
                const currentStock = parseFloat(dbItem.stock) || 0;
                // For purchases, deltaQty < 0 means we took TOO MUCH away.
                if (currentStock + deltaQty < 0) {
                    throw new Error(`Insufficient stock for item "${dbItem.name}". Available: ${currentStock}, Edit requires deducting additional: ${Math.abs(deltaQty)}`);
                }
            }

            // Apply Stock Deltas
            for (const [itemKey, deltaQty] of itemDeltas.entries()) {
                const dbItem = dbItemsMap.get(itemKey);
                await client.query(
                    `UPDATE items SET stock = stock + $1 WHERE id = $2`,
                    [deltaQty, dbItem.id]
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
        res.status(400).json({ error: sanitizeClientError(e, 'Failed to update transaction') });
    } finally {
        client.release();
    }
});


// PATCH /api/purchases/:id
app.patch('/api/purchases/:id', requireRole(['ADMIN', 'ACCOUNTANT']), async (req, res) => {
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
            updates.push(`due_date = $${idx++}`);
            values.push(parseDateForDB(dueDate));
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
        res.status(400).json({ error: sanitizeClientError(error, 'Failed to update purchase invoice metadata') });
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
