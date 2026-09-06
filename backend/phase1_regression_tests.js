const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { Client } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_URL = 'http://localhost:3000/api';
let token = '';
let client;

const suffix = Date.now().toString().slice(-6);
const itemCodeA = `ITM_P1_A_${suffix}`;
const itemCodeB = `ITM_P1_B_${suffix}`;
const customerId = `cust_p1_${suffix}`;
const vendorId = `vend_p1_${suffix}`;

async function apiReq(endpoint, method = 'GET', body = null, extraHeaders = {}) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token && !headers['Authorization'] && !headers['No-Auth']) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    delete headers['No-Auth'];

    const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const status = res.status;
    let data;
    const text = await res.text();
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status, data };
}

describe('Phase 1 Critical Fixes Regression Tests', async () => {

    before(async () => {
        client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();

        // Create an active session token directly
        token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await client.query(
            `INSERT INTO active_sessions (id, token_hash, username, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '2 hours')`,
            [crypto.randomUUID(), tokenHash, process.env.ADMIN_USERNAME || 'SPH.admin']
        );
    });

    after(async () => {
        // Clean up test data
        await client.query(`DELETE FROM items WHERE code IN ($1, $2)`, [itemCodeA, itemCodeB]);
        await client.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
        await client.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
        await client.query(`DELETE FROM audit_logs WHERE record_id IN ($1, $2, $3, $4)`, [itemCodeA, itemCodeB, customerId, vendorId]);
        await client.end();
    });

    test('1. Unauthenticated /api/init-db is rejected with 401', async () => {
        const unauthRes = await apiReq('/init-db', 'GET', null, { 'No-Auth': true });
        assert.equal(unauthRes.status, 401, 'Unauthenticated /api/init-db should be rejected with 401');

        // Authenticated with admin session token should succeed
        const authRes = await apiReq('/init-db', 'GET');
        assert.equal(authRes.status, 200, 'Authenticated admin /api/init-db should succeed with 200');

        // Authenticated with admin key header should succeed
        const keyRes = await apiReq('/init-db', 'GET', null, { 'No-Auth': true, 'x-admin-key': process.env.ADMIN_PASSWORD_HASH });
        assert.equal(keyRes.status, 200, '/api/init-db with admin key header should succeed with 200');
    });

    test('2. Audit logging table exists and records actions without relation errors', async () => {
        // Verify audit_logs table exists
        const tblCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'audit_logs'
        `);
        assert.equal(tblCheck.rows.length, 1, 'Table audit_logs must exist in public schema');

        // Verify write to audit_logs
        const testTxId = crypto.randomUUID();
        const testAction = 'UPDATE';
        await client.query(`
            INSERT INTO audit_logs (
                table_name, record_id, action, old_data, new_data,
                performed_by_id, performed_by_name, ip_address, user_agent,
                transaction_id, request_method, endpoint
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
            'test_table', 'rec-test-1', testAction, JSON.stringify({ old: 'val' }), JSON.stringify({ new: 'val' }),
            'admin', 'Admin User', '127.0.0.1', 'NodeTest', testTxId, 'POST', '/api/test'
        ]);

        const readBack = await client.query(`SELECT * FROM audit_logs WHERE transaction_id = $1`, [testTxId]);
        assert.equal(readBack.rows.length, 1);
        assert.equal(readBack.rows[0].record_id, 'rec-test-1');
        assert.equal(readBack.rows[0].action, 'UPDATE');
    });

    test('3. Creating an item does not delete existing unrelated items', async () => {
        // Create Item A
        const resA = await apiReq('/items', 'POST', {
            code: itemCodeA,
            name: `Test Item A ${suffix}`,
            stock: 100,
            sellingPrice: 150,
            purchasePrice: 90
        });
        assert.equal(resA.status, 200, 'Saving Item A should succeed');

        const dbA = await client.query(`SELECT code, name FROM items WHERE code = $1`, [itemCodeA]);
        assert.equal(dbA.rows.length, 1, 'Item A must exist in DB');

        // Create Item B (submitting only Item B)
        const resB = await apiReq('/items', 'POST', {
            code: itemCodeB,
            name: `Test Item B ${suffix}`,
            stock: 200,
            sellingPrice: 250,
            purchasePrice: 180
        });
        assert.equal(resB.status, 200, 'Saving Item B should succeed');

        // Verify Item A was NOT deleted by saving Item B
        const dbAAfterB = await client.query(`SELECT code, name FROM items WHERE code = $1`, [itemCodeA]);
        assert.equal(dbAAfterB.rows.length, 1, 'Item A must NOT be deleted when Item B is created');

        const dbB = await client.query(`SELECT code, name FROM items WHERE code = $1`, [itemCodeB]);
        assert.equal(dbB.rows.length, 1, 'Item B must exist in DB');
    });

    test('4. Editing an item does not overwrite current live stock with stale frontend values', async () => {
        // Item A currently has 100 stock. Simulate a sale reducing stock to 73 in DB.
        await client.query(`UPDATE items SET stock = 73 WHERE code = $1`, [itemCodeA]);

        // Client edits item metadata (e.g. changes sellingPrice and name) with stale stock = 100
        const editRes = await apiReq('/items', 'POST', {
            code: itemCodeA,
            name: `Updated Item A Name ${suffix}`,
            sellingPrice: 165,
            purchasePrice: 90,
            stock: 100 // Stale stock from client
        });
        assert.equal(editRes.status, 200, 'Editing Item A should succeed');

        // Verify database stock is PRESERVED at 73 and NOT overwritten with 100
        const itemCheck = await client.query(`SELECT stock, name, selling_price FROM items WHERE code = $1`, [itemCodeA]);
        assert.equal(itemCheck.rows[0].name, `Updated Item A Name ${suffix}`, 'Name should be updated');
        assert.equal(Number(itemCheck.rows[0].selling_price), 165, 'Selling price should be updated');
        assert.equal(Number(itemCheck.rows[0].stock), 73, 'Live stock must remain 73, NOT overwritten by stale 100');
    });

    test('5. Editing a customer profile does not overwrite live financial balance', async () => {
        // Create initial customer with opening balance 500, pending_to_receive 1250
        await client.query(`
            INSERT INTO customers (id, customer_name, phone_number, pending_to_receive, customer_advance_balance, opening_balance)
            VALUES ($1, $2, $3, 1250.00, 50.00, 500.00)
        `, [customerId, `Customer ${suffix}`, '9876543210']);

        // Profile edit from UI (updating phone and address, with stale pendingToReceive = 0)
        const custEditRes = await apiReq('/customers', 'POST', {
            id: customerId,
            name: `Customer ${suffix} Updated`,
            mobile: '9998887776',
            address: '42 Main St',
            pendingToReceive: 0, // Stale value from client form
            customerAdvanceBalance: 0
        });
        assert.equal(custEditRes.status, 200, 'Saving customer edit should succeed');

        // Verify live financial balances were preserved
        const custCheck = await client.query(`
            SELECT customer_name, phone_number, bill_address, pending_to_receive, customer_advance_balance 
            FROM customers WHERE id = $1
        `, [customerId]);
        assert.equal(custCheck.rows[0].customer_name, `Customer ${suffix} Updated`, 'Name should update');
        assert.equal(custCheck.rows[0].phone_number, '9998887776', 'Phone should update');
        assert.equal(custCheck.rows[0].bill_address, '42 Main St', 'Address should update');
        assert.equal(Number(custCheck.rows[0].pending_to_receive), 1250, 'Live pending_to_receive must be preserved at 1250');
        assert.equal(Number(custCheck.rows[0].customer_advance_balance), 50, 'Live advance balance must be preserved at 50');
    });

    test('6. Editing a vendor profile does not overwrite live financial balance', async () => {
        // Create initial vendor with pending_to_pay 3400, credit_balance 250
        await client.query(`
            INSERT INTO vendors (id, vendor_name, phone_number, pending_to_pay, vendor_credit_balance, vendor_advance_balance, opening_balance)
            VALUES ($1, $2, $3, 3400.00, 250.00, 100.00, 1000.00)
        `, [vendorId, `Vendor ${suffix}`, '9123456780']);

        // Profile edit from UI (updating contact person and email, with stale pendingToPay = 0)
        const vendEditRes = await apiReq('/vendors', 'POST', {
            id: vendorId,
            vendorName: `Vendor ${suffix} Renamed`,
            contactPerson: 'Jane Doe',
            phoneNumber: '9123456789',
            pendingToPay: 0, // Stale value from client form
            vendorCreditBalance: 0
        });
        assert.equal(vendEditRes.status, 200, 'Saving vendor edit should succeed');

        // Verify live financial balances were preserved
        const vendCheck = await client.query(`
            SELECT vendor_name, contact_person, phone_number, pending_to_pay, vendor_credit_balance, vendor_advance_balance 
            FROM vendors WHERE id = $1
        `, [vendorId]);
        assert.equal(vendCheck.rows[0].vendor_name, `Vendor ${suffix} Renamed`, 'Name should update');
        assert.equal(vendCheck.rows[0].contact_person, 'Jane Doe', 'Contact person should update');
        assert.equal(Number(vendCheck.rows[0].pending_to_pay), 3400, 'Live pending_to_pay must be preserved at 3400');
        assert.equal(Number(vendCheck.rows[0].vendor_credit_balance), 250, 'Live vendor_credit_balance must be preserved at 250');
        assert.equal(Number(vendCheck.rows[0].vendor_advance_balance), 100, 'Live advance balance must be preserved at 100');
    });
});
