const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const multer = require('multer');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Prevent browser caching during development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const dbPath = path.join(__dirname, '../db/data.json');
const { Pool } = require('pg');

// Initialize PostgreSQL Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Helper to initialize the DB table
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
                ship_state TEXT, ship_pincode TEXT, ship_country TEXT, pending_to_pay NUMERIC
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
                EXCEPTION WHEN duplicate_column THEN END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD COLUMN pending_to_pay NUMERIC;
                EXCEPTION WHEN duplicate_column THEN END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD COLUMN paid_amount NUMERIC;
                EXCEPTION WHEN duplicate_column THEN END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD COLUMN note TEXT;
                EXCEPTION WHEN duplicate_column THEN END;
                
                BEGIN
                    ALTER TABLE purchase_invoices ADD CONSTRAINT purchase_invoices_pi_no_key UNIQUE (pi_no);
                EXCEPTION WHEN duplicate_table THEN END;
                EXCEPTION WHEN others THEN END;
            END $$;
            
            CREATE TABLE IF NOT EXISTS sales_invoices (
                id TEXT PRIMARY KEY,
                invoice_no TEXT UNIQUE, date DATE, ref_no TEXT, due_date DATE, payment_terms TEXT,
                customer_id TEXT, customer_name TEXT, sub_total NUMERIC, discount_percent NUMERIC,
                discount_amount NUMERIC, total_tax NUMERIC, amount NUMERIC, paid_amount NUMERIC,
                pending_to_receive NUMERIC, note TEXT, items JSONB
            );
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

// API Endpoints

// Core Settings / Counters (still in JSON store)
app.get('/api/invoice-counter', async (req, res) => res.json({ counter: (await readDB()).invoice_counter || 1 }));
app.post('/api/invoice-counter', async (req, res) => {
    const db = await readDB(); db.invoice_counter = parseInt(req.body.counter) || 1; await writeDB(db);
    res.json({ success: true, counter: db.invoice_counter });
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

app.get('/api/payments', async (req, res) => res.json((await readDB()).payments || []));
app.post('/api/payments', async (req, res) => {
    const db = await readDB(); db.payments = req.body; await writeDB(db);
    res.json({ success: true });
});

app.get('/api/vendor-payments', async (req, res) => res.json((await readDB()).vendor_payments || []));
app.post('/api/vendor-payments', async (req, res) => {
    const db = await readDB(); db.vendor_payments = req.body; await writeDB(db);
    res.json({ success: true });
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
        console.error(e); res.status(500).json({ error: e.message });
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
        console.error(e); res.status(500).json({ error: e.message });
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
            const codeList = incomingCodes.map(c => "'" + String(c).replace(/'/g, "''") + "'").join(',');
            await client.query(`DELETE FROM items WHERE code NOT IN (${codeList})`);
        } else {
            await client.query('DELETE FROM items');
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e); res.status(500).json({ error: e.message });
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
            ship_state as "shipState", ship_pincode as "shipPinCode", ship_country as "shipCountry", pending_to_pay as "pendingToPay"
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
                    ship_state, ship_pincode, ship_country, pending_to_pay
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                ON CONFLICT (id) DO UPDATE SET
                    vendor_name = EXCLUDED.vendor_name, contact_person = EXCLUDED.contact_person, phone_number = EXCLUDED.phone_number, email = EXCLUDED.email, 
                    gst_treatment = EXCLUDED.gst_treatment, gstin = EXCLUDED.gstin, pan_number = EXCLUDED.pan_number, opening_balance = EXCLUDED.opening_balance, 
                    as_of_date = EXCLUDED.as_of_date, bill_address = EXCLUDED.bill_address, bill_city = EXCLUDED.bill_city, bill_state = EXCLUDED.bill_state, 
                    bill_pincode = EXCLUDED.bill_pincode, bill_country = EXCLUDED.bill_country, ship_address = EXCLUDED.ship_address, ship_city = EXCLUDED.ship_city, 
                    ship_state = EXCLUDED.ship_state, ship_pincode = EXCLUDED.ship_pincode, ship_country = EXCLUDED.ship_country, pending_to_pay = EXCLUDED.pending_to_pay
            `, [
                vid, v.vendorName || 'Unknown Vendor', v.contactPerson || '', v.phoneNumber || '', v.email || '', v.gstTreatment || '',
                v.gstin || '', v.panNumber || '', parseFloat(v.openingBalance) || 0, parsedDate, v.billAddress || '', v.billCity || '',
                v.billState || '', v.billPinCode || '', v.billCountry || '', v.shipAddress || '', v.shipCity || '',
                v.shipState || '', v.shipPinCode || '', v.shipCountry || '', parseFloat(v.pendingToPay) || 0
            ]);
        }
        
        if (incomingIds.length > 0) {
            const idList = incomingIds.map(i => "'" + String(i).replace(/'/g, "''") + "'").join(',');
            await client.query(`DELETE FROM vendors WHERE id NOT IN (${idList})`);
        } else {
            await client.query('DELETE FROM vendors');
        }
        
        await client.query('COMMIT');
        
        // Also save to JSON for transactions backwards compatibility
        const db = await readDB(); db.vendors = vendors; await writeDB(db);
        
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e); res.status(500).json({ error: e.message });
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
            ship_state as "shipState", ship_pincode as "shipPinCode", ship_country as "shipCountry", pending_to_receive as "pendingToReceive"
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
                    ship_state, ship_pincode, ship_country, pending_to_receive
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                ON CONFLICT (id) DO UPDATE SET
                    customer_name = EXCLUDED.customer_name, contact_person = EXCLUDED.contact_person, phone_number = EXCLUDED.phone_number, email = EXCLUDED.email, 
                    gst_treatment = EXCLUDED.gst_treatment, gstin = EXCLUDED.gstin, pan_number = EXCLUDED.pan_number, opening_balance = EXCLUDED.opening_balance, 
                    as_of_date = EXCLUDED.as_of_date, bill_address = EXCLUDED.bill_address, bill_city = EXCLUDED.bill_city, bill_state = EXCLUDED.bill_state, 
                    bill_pincode = EXCLUDED.bill_pincode, bill_country = EXCLUDED.bill_country, ship_address = EXCLUDED.ship_address, ship_city = EXCLUDED.ship_city, 
                    ship_state = EXCLUDED.ship_state, ship_pincode = EXCLUDED.ship_pincode, ship_country = EXCLUDED.ship_country, pending_to_receive = EXCLUDED.pending_to_receive
            `, [
                cid, actualName, c.contactPerson || '', actualMobile, c.email || '', c.gstTreatment || '',
                c.gstin || '', actualPan, parseFloat(c.openingBalance) || 0, parsedDate, actualAddress, actualCity,
                actualState, actualPin, actualCountry, c.shipAddress || '', c.shipCity || '',
                c.shipState || '', c.shipPinCode || '', c.shipCountry || '', parseFloat(c.pendingToReceive) || 0
            ]);
        }
        
        if (incomingIds.length > 0) {
            const idList = incomingIds.map(i => "'" + String(i).replace(/'/g, "''") + "'").join(',');
            await client.query(`DELETE FROM customers WHERE id NOT IN (${idList})`);
        } else {
            await client.query('DELETE FROM customers');
        }
        
        await client.query('COMMIT');
        
        const db = await readDB(); db.customers = customers; await writeDB(db);
        
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e); res.status(500).json({ error: e.message });
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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const invoices = req.body;
        const incomingIds = [];
        
        for (let pi of invoices) {
            const piid = pi.id || generateId();
            incomingIds.push(piid);
            let parsedDate = pi.date;
            if (parsedDate && parsedDate.includes('/')) {
               const parts = parsedDate.split('/');
               if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDate) parsedDate = null;
            let parsedDueDate = pi.dueDate;
            if (parsedDueDate && parsedDueDate.includes('/')) {
               const parts = parsedDueDate.split('/');
               if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDueDate) parsedDueDate = null;

            await client.query(`
                INSERT INTO purchase_invoices (
                    id, pi_no, date, ref_no, due_date, payment_terms, vendor_id, vendor_name, 
                    sub_total, discount_percent, discount_amount, total_tax, amount, 
                    paid_amount, pending_to_pay, note, items
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                ON CONFLICT (pi_no) DO UPDATE SET
                    date = EXCLUDED.date, ref_no = EXCLUDED.ref_no, due_date = EXCLUDED.due_date, payment_terms = EXCLUDED.payment_terms, 
                    vendor_id = EXCLUDED.vendor_id, vendor_name = EXCLUDED.vendor_name, sub_total = EXCLUDED.sub_total, discount_percent = EXCLUDED.discount_percent, 
                    discount_amount = EXCLUDED.discount_amount, total_tax = EXCLUDED.total_tax, amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, 
                    pending_to_pay = EXCLUDED.pending_to_pay, note = EXCLUDED.note, items = EXCLUDED.items
            `, [
                piid, pi.piNo, parsedDate, pi.refNo || '', parsedDueDate, pi.paymentTerms || '',
                pi.vendorId || null, pi.vendorName || '', parseFloat(pi.subTotal) || 0, parseFloat(pi.discountPercent) || 0,
                parseFloat(pi.discountAmount) || 0, parseFloat(pi.totalTax) || 0, parseFloat(pi.amount) || 0,
                parseFloat(pi.paidAmount) || 0, parseFloat(pi.pendingToPay) || 0, pi.note || '', JSON.stringify(pi.items || [])
            ]);
        }
        
        if (incomingIds.length > 0) {
            const idList = incomingIds.map(i => "'" + String(i).replace(/'/g, "''") + "'").join(',');
            await client.query(`DELETE FROM purchase_invoices WHERE id NOT IN (${idList})`);
        } else {
            await client.query('DELETE FROM purchase_invoices');
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e); res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
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
app.post('/api/sales', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const sales = req.body;
        const incomingIds = [];
        
        for (let s of sales) {
            const sid = s.id || generateId();
            incomingIds.push(sid);
            let parsedDate = s.date;
            if (parsedDate && parsedDate.includes('/')) {
               const parts = parsedDate.split('/');
               if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDate) parsedDate = null;
            let parsedDueDate = s.dueDate;
            if (parsedDueDate && parsedDueDate.includes('/')) {
               const parts = parsedDueDate.split('/');
               if (parts.length === 3) parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (!parsedDueDate) parsedDueDate = null;

            const actualInvoiceNo = s.invoiceNo || s.invoiceNumber;
            const actualAmount = s.amount !== undefined ? s.amount : s.grandTotal;
            const actualPaid = s.paidAmount !== undefined ? s.paidAmount : s.receivedAmount;

            await client.query(`
                INSERT INTO sales_invoices (
                    id, invoice_no, date, ref_no, due_date, payment_terms, customer_id, customer_name, 
                    sub_total, discount_percent, discount_amount, total_tax, amount, 
                    paid_amount, pending_to_receive, note, items
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                ON CONFLICT (invoice_no) DO UPDATE SET
                    date = EXCLUDED.date, ref_no = EXCLUDED.ref_no, due_date = EXCLUDED.due_date, payment_terms = EXCLUDED.payment_terms, 
                    customer_id = EXCLUDED.customer_id, customer_name = EXCLUDED.customer_name, sub_total = EXCLUDED.sub_total, discount_percent = EXCLUDED.discount_percent, 
                    discount_amount = EXCLUDED.discount_amount, total_tax = EXCLUDED.total_tax, amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, 
                    pending_to_receive = EXCLUDED.pending_to_receive, note = EXCLUDED.note, items = EXCLUDED.items
            `, [
                sid, actualInvoiceNo, parsedDate, s.refNo || '', parsedDueDate, s.paymentTerms || '',
                s.customerId || null, s.customerName || '', parseFloat(s.subTotal) || 0, parseFloat(s.discountPercent) || 0,
                parseFloat(s.discountAmount) || 0, parseFloat(s.totalTax) || 0, parseFloat(actualAmount) || 0,
                parseFloat(actualPaid) || 0, parseFloat(s.pendingToReceive) || 0, s.note || '', JSON.stringify(s.items || [])
            ]);
        }
        
        if (incomingIds.length > 0) {
            const idList = incomingIds.map(i => "'" + String(i).replace(/'/g, "''") + "'").join(',');
            await client.query(`DELETE FROM sales_invoices WHERE id NOT IN (${idList})`);
        } else {
            await client.query('DELETE FROM sales_invoices');
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e); res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// 13. AI Invoice Extraction
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/ai/extract-invoice', upload.single('invoiceFile'), async (req, res) => {
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
        console.error('AI Extraction Error:', error);
        res.status(500).json({ error: 'AI Error: ' + error.message });
    }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start HTTP server on port 3000
app.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(`  SPH Billing Server running at:`);
    console.log(`  Local:   http://localhost:${HTTP_PORT}`);
    console.log(`==================================================`);
});
