const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '../backend/.env' });

const API_URL = 'http://localhost:3000/api';
let token = '';
let client;

const testState = {
    suffix: Date.now().toString().slice(-6),
    customer: null,
    vendor: null,
    item1: null,
    item2: null,
    siId: null,
    piId: null,
    srId: null,
    prId: null
};

async function dbQuery(sql, params) {
    return client.query(sql, params);
}

async function apiReq(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    let data = {};
    let status = 500;
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        status = res.status;
        data = await res.json().catch(() => ({}));
    } catch (e) {
        console.error("API error", endpoint, e);
    }
    if (status !== 200) {
        console.error(`[API FAIL] ${method} ${endpoint} returned ${status}:`, data.error || data);
    }
    return { status, data };
}

describe('PUT Endpoints Functional Tests', async () => {
    
    before(async () => {
        client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();

        const res = await apiReq('/auth/login', 'POST', { username: process.env.ADMIN_USERNAME || 'admin', password: 'password' });
        if (res.data && res.data.token) {
            token = res.data.token;
        } else {
            token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await dbQuery(`INSERT INTO active_sessions (id, token_hash, username, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour') ON CONFLICT DO NOTHING`, [crypto.randomUUID(), tokenHash, process.env.ADMIN_USERNAME || 'admin']);
        }

        testState.customer = { id: `test-cust-${testState.suffix}`, customer_name: `Test Customer` };
        await dbQuery(`INSERT INTO customers (id, customer_name, pending_to_receive, customer_advance_balance) VALUES ($1, $2, 0, 0)`, [testState.customer.id, testState.customer.customer_name]);

        testState.vendor = { id: `test-vend-${testState.suffix}`, vendor_name: `Test Vendor` };
        await dbQuery(`INSERT INTO vendors (id, vendor_name, pending_to_pay, vendor_advance_balance) VALUES ($1, $2, 0, 0)`, [testState.vendor.id, testState.vendor.vendor_name]);

        testState.item1 = { id: `item1-${testState.suffix}`, code: `IT1${testState.suffix}`, name: `Item 1`, stock: 100 };
        await dbQuery(`INSERT INTO items (id, code, name, stock, selling_price, purchase_price) VALUES ($1, $2, $3, $4, 100, 50)`, [testState.item1.id, testState.item1.code, testState.item1.name, testState.item1.stock]);

        testState.item2 = { id: `item2-${testState.suffix}`, code: `IT2${testState.suffix}`, name: `Item 2`, stock: 50 };
        await dbQuery(`INSERT INTO items (id, code, name, stock, selling_price, purchase_price) VALUES ($1, $2, $3, $4, 200, 100)`, [testState.item2.id, testState.item2.code, testState.item2.name, testState.item2.stock]);
    });

    after(async () => {
        const s = testState.suffix;
        await dbQuery(`DELETE FROM sales_invoices WHERE id LIKE '%${s}%' OR customer_id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM purchase_invoices WHERE id LIKE '%${s}%' OR vendor_id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM sales_returns WHERE id LIKE '%${s}%' OR customer_id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM purchase_returns WHERE id LIKE '%${s}%' OR vendor_id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM items WHERE id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM customers WHERE id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM vendors WHERE id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM audit_logs WHERE record_id LIKE '%${s}%'`);
        await client.end();
    });

    test('1. Sales Invoice PUT tests', async () => {
        // Create Sales Invoice
        let payload = {
            date: new Date().toISOString().split('T')[0],
            customerId: testState.customer.id,
            items: [{ id: testState.item1.id, code: testState.item1.code, qty: 10, rate: 100, discount: 0, taxAmount: 0, amount: 1000 }],
            subTotal: 1000, discount: 0, taxAmount: 0, grandTotal: 1000, note: `Test SI`
        };
        let res = await apiReq('/sales/create', 'POST', payload);
        assert.equal(res.status, 200);
        testState.siId = res.data.id;

        // Verify Initial Stock & Balance
        let itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '90.00');
        let cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '1000.00');

        // Edit quantity (increase) -> 20
        payload.items[0].qty = 20;
        payload.items[0].finalAmount = 2000;
        payload.sub_total = 2000; payload.amount = 2000;
        res = await apiReq(`/sales/${testState.siId}`, 'PUT', payload);
        assert.equal(res.status, 200);
        
        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '80.00');
        cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '2000.00');

        // Edit quantity (decrease) -> 5
        payload.items[0].qty = 5;
        payload.items[0].finalAmount = 500;
        payload.sub_total = 500; payload.amount = 500;
        res = await apiReq(`/sales/${testState.siId}`, 'PUT', payload);
        assert.equal(res.status, 200);

        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '95.00');
        cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '500.00');

        // Change item
        payload.items = [{ id: testState.item2.id, code: testState.item2.code, qty: 10, rate: 200, discount: 0, taxAmount: 0, amount: 2000 }];
        payload.sub_total = 2000; payload.amount = 2000;
        res = await apiReq(`/sales/${testState.siId}`, 'PUT', payload);
        assert.equal(res.status, 200);

        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '100.00'); // old item restored
        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item2.id]);
        assert.equal(itm.rows[0].stock, '40.00'); // new item deducted
        cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '2000.00');
        
        // Add line item
        payload.items.push({ id: testState.item1.id, code: testState.item1.code, qty: 2, rate: 100, discount: 0, taxAmount: 0, amount: 200 });
        payload.sub_total = 2200; payload.amount = 2200;
        res = await apiReq(`/sales/${testState.siId}`, 'PUT', payload);
        assert.equal(res.status, 200);

        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '98.00');

        // Remove line item
        payload.items.splice(0, 1); // remove item2
        payload.sub_total = 200; payload.amount = 200;
        res = await apiReq(`/sales/${testState.siId}`, 'PUT', payload);
        assert.equal(res.status, 200);

        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item2.id]);
        assert.equal(itm.rows[0].stock, '50.00'); // restored
        
        // Change rate/discount/tax
        payload.items[0].selling_price = 150;
        payload.items[0].discount = 10;
        payload.items[0].taxAmount = 14;
        payload.items[0].finalAmount = 154; // (150-10) + 14
        payload.sub_total = 140; payload.discount_amount = 10; payload.total_tax = 14; payload.amount = 154;
        res = await apiReq(`/sales/${testState.siId}`, 'PUT', payload);
        assert.equal(res.status, 200);
        
        cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '154.00');
        
        // Audit log check
        const audit = await dbQuery(`SELECT * FROM audit_logs WHERE record_id = $1 AND action = 'PUT'`, [testState.siId]);
        assert.ok(audit.rows.length > 0);
    });

    test('2. Purchase Invoice PUT tests', async () => {
        let payload = {
            date: new Date().toISOString().split('T')[0],
            vendorId: testState.vendor.id,
            vendorName: testState.vendor.vendor_name,
            items: [{ id: testState.item1.id, code: testState.item1.code, qty: 10, rate: 50, discount: 0, taxAmount: 0, amount: 500 }],
            subTotal: 500, discount: 0, taxAmount: 0, grandTotal: 500, note: `Test PI`
        };
        let res = await apiReq('/purchases/create', 'POST', payload);
        assert.equal(res.status, 200);
        testState.piId = res.data.id;

        // initial stock (currently 98 from SI) -> should become 108
        let itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '108.00');
        let vend = await dbQuery('SELECT pending_to_pay FROM vendors WHERE id = $1', [testState.vendor.id]);
        assert.equal(vend.rows[0].pending_to_pay, '500.00');

        // Edit quantity -> 20
        payload.items[0].qty = 20; payload.items[0].finalAmount = 1000;
        payload.sub_total = 1000; payload.amount = 1000;
        res = await apiReq(`/purchases/${testState.piId}`, 'PUT', payload);
        assert.equal(res.status, 200);
        
        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '118.00');
        vend = await dbQuery('SELECT pending_to_pay FROM vendors WHERE id = $1', [testState.vendor.id]);
        assert.equal(vend.rows[0].pending_to_pay, '1000.00');
    });

    test('3. Sales Return PUT tests', async () => {
        let payload = {
            date: new Date().toISOString().split('T')[0],
            customerId: testState.customer.id,
            invoiceId: testState.siId,
            refundAmount: 0,
            items: [{ id: testState.item1.id, code: testState.item1.code, qty: 2, rate: 100, discount: 0, taxAmount: 0, amount: 200 }],
            subTotal: 200, discount: 0, taxAmount: 0, grandTotal: 200, note: `Test SR`
        };
        let res = await apiReq('/sales-returns/create', 'POST', payload);
        assert.equal(res.status, 200);
        testState.srId = res.data.id;

        // Initial stock (118) -> 120 (returns increase stock)
        let itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '120.00');
        // Initial customer balance (154) -> 154 - 200 = -46.00
        let cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '-46.00');

        // Edit quantity -> 5
        payload.items[0].qty = 5; payload.items[0].finalAmount = 500;
        payload.sub_total = 500; payload.amount = 500;
        res = await apiReq(`/sales-returns/${testState.srId}`, 'PUT', payload);
        assert.equal(res.status, 200);
        
        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '123.00'); // 118 base + 5
        cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '-346.00'); // 154 - 500
    });

    test('4. Purchase Return PUT tests', async () => {
        let payload = {
            date: new Date().toISOString().split('T')[0],
            vendorId: testState.vendor.id,
            invoiceId: testState.piId,
            refundAmount: 0,
            items: [{ id: testState.item1.id, code: testState.item1.code, qty: 5, rate: 50, discount: 0, taxAmount: 0, amount: 250 }],
            subTotal: 250, discount: 0, taxAmount: 0, grandTotal: 250, note: `Test PR`
        };
        let res = await apiReq('/purchase-returns/create', 'POST', payload);
        assert.equal(res.status, 200);
        testState.prId = res.data.id;

        // initial stock (123) -> 118 (returns decrease stock)
        let itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '118.00');
        // Vendor balance (1000) -> 750
        let vend = await dbQuery('SELECT pending_to_pay FROM vendors WHERE id = $1', [testState.vendor.id]);
        assert.equal(vend.rows[0].pending_to_pay, '750.00');

        // Edit quantity -> 10
        payload.items[0].qty = 10; payload.items[0].finalAmount = 500;
        payload.sub_total = 500; payload.amount = 500;
        res = await apiReq(`/purchase-returns/${testState.prId}`, 'PUT', payload);
        assert.equal(res.status, 200);
        
        itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '113.00');
        vend = await dbQuery('SELECT pending_to_pay FROM vendors WHERE id = $1', [testState.vendor.id]);
        assert.equal(vend.rows[0].pending_to_pay, '500.00');
    });

    test('5. Restriction Tests', async () => {
        // Change customer/vendor -> reject
        let payload = { customerId: 'some-other-id', items: [], grandTotal: 0 };
        let res = await apiReq(`/sales/${testState.siId}`, 'PUT', payload);
        assert.equal(res.status, 400);

        // Negative stock -> reject
        let vendPayload = {
            date: new Date().toISOString().split('T')[0],
            vendorId: testState.vendor.id,
            items: [{ id: testState.item1.id, code: testState.item1.code, qty: 1000, rate: 50, discount: 0, taxAmount: 0, amount: 50000 }],
            subTotal: 50000, discount: 0, taxAmount: 0, amount: 50000, note: `Test PR neg stock`
        };
        // This is a purchase return, returning 1000 items would make stock negative (currently 113)
        res = await apiReq(`/purchase-returns/${testState.prId}`, 'PUT', vendPayload);
        assert.equal(res.status, 400); // Or 500 if unhandled DB constraint

        // Confirm DB unchanged
        let itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item1.id]);
        assert.equal(itm.rows[0].stock, '113.00');
    });

});
