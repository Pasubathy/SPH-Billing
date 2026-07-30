const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '../backend/.env' });

const API_URL = 'http://localhost:3000/api';
let token = '';
let client;

// Test Data Trackers
const testState = {
    customer: null,
    vendor: null,
    item: null,
    salesInvoice: null,
    receipt: null,
    purchaseInvoice: null,
    payment: null
};

// Helper: HTTP Request
async function apiReq(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const start = performance.now();
    const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const duration = performance.now() - start;
    
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, duration };
}

describe('Accounting Engine E2E Integration Tests', async () => {
    
    before(async () => {
        // Connect DB
        client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();

        // Admin Login
        const res = await apiReq('/auth/login', 'POST', {
            username: process.env.ADMIN_USERNAME,
            password: process.env.ADMIN_PASSWORD_HASH // Note: this might need actual password, but in dev it might just accept the hash or password. We will insert a session manually if login fails.
        });
        
        // Manual session injection if standard login is tricky
        if (res.status !== 200) {
            token = crypto.randomBytes(32).toString('hex');
            await client.query(`
                INSERT INTO active_sessions (id, token_hash, username, expires_at)
                VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')
            `, [crypto.randomUUID(), token, process.env.ADMIN_USERNAME]);
        } else {
            token = res.data.token;
        }

        // Setup Isolated Test Data
        const suffix = Date.now().toString().slice(-6);
        
        testState.customer = {
            id: `test-cust-${suffix}`,
            customer_name: `Test Customer ${suffix}`,
            pending_to_receive: 0,
            customer_advance_balance: 0
        };
        await client.query(`INSERT INTO customers (id, customer_name, pending_to_receive, customer_advance_balance) VALUES ($1, $2, 0, 0)`, [testState.customer.id, testState.customer.customer_name]);

        testState.vendor = {
            id: `test-vend-${suffix}`,
            vendor_name: `Test Vendor ${suffix}`,
            pending_to_pay: 0,
            vendor_credit_balance: 0,
            vendor_advance_balance: 0
        };
        await client.query(`INSERT INTO vendors (id, vendor_name, pending_to_pay, vendor_credit_balance, vendor_advance_balance) VALUES ($1, $2, 0, 0, 0)`, [testState.vendor.id, testState.vendor.vendor_name]);

        testState.item = {
            id: `test-item-${suffix}`,
            code: `ITM${suffix}`,
            name: `Test Item ${suffix}`,
            stock: 100,
            selling_price: 100,
            purchase_price: 50
        };
        await client.query(`INSERT INTO items (id, code, name, stock, selling_price, purchase_price) VALUES ($1, $2, $3, $4, $5, $6)`, [testState.item.id, testState.item.code, testState.item.name, testState.item.stock, testState.item.selling_price, testState.item.purchase_price]);
    });

    after(async () => {
        // Teardown Test Data
        await client.query(`DELETE FROM customer_receipt_allocations WHERE invoice_id LIKE 'test-%'`);
        await client.query(`DELETE FROM vendor_payment_allocations WHERE purchase_invoice_id LIKE 'test-%'`);
        await client.query(`DELETE FROM customer_receipts WHERE customer_id LIKE 'test-%'`);
        await client.query(`DELETE FROM vendor_payments WHERE vendor_id LIKE 'test-%'`);
        await client.query(`DELETE FROM sales_returns WHERE customer_id LIKE 'test-%'`);
        await client.query(`DELETE FROM purchase_returns WHERE vendor_id LIKE 'test-%'`);
        await client.query(`DELETE FROM sales_invoices WHERE customer_id LIKE 'test-%'`);
        await client.query(`DELETE FROM purchase_invoices WHERE vendor_id LIKE 'test-%'`);
        await client.query(`DELETE FROM items WHERE id LIKE 'test-%'`);
        await client.query(`DELETE FROM customers WHERE id LIKE 'test-%'`);
        await client.query(`DELETE FROM vendors WHERE id LIKE 'test-%'`);
        await client.query(`DELETE FROM audit_logs WHERE record_id LIKE 'test-%'`);
        await client.query(`DELETE FROM active_sessions WHERE token_hash = $1`, [token]);
        await client.end();
    });

    // ==========================================
    // 1. Sales Workflow
    // ==========================================
    test('Create Sales Invoice', async () => {
        const payload = {
            date: new Date().toISOString().split('T')[0],
            customer_id: testState.customer.id,
            items: [{ id: testState.item.id, quantity: 10, selling_price: 100, discount: 0, taxAmount: 0, finalAmount: 1000 }],
            sub_total: 1000, discount_amount: 0, total_tax: 0, amount: 1000
        };
        // wait, looking at server.js for create sales invoice... legacy endpoint returns 410! 
        // We need to know the Phase 2 endpoint name for creating sales invoice.
        // Wait, did we create a new endpoint? Phase 2 was "cancel" APIs. The create APIs might still be active or replaced?
        // In the instructions: "Phase 2 ... Replace its implementation with a controlled deprecation response ... POST /api/sales"
        // Wait, where is the *new* create endpoint? 
    });

});
