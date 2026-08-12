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
    item: null,
    salesInvoiceId: null,
    purchaseInvoiceId: null,
    receiptId: null,
    paymentId: null,
    metrics: { startTime: performance.now(), queries: 0, endpoints: [] }
};

// Custom query wrapper to count queries
async function dbQuery(sql, params) {
    testState.metrics.queries++;
    return client.query(sql, params);
}

async function apiReq(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const start = performance.now();
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
    
    const duration = performance.now() - start;
    testState.metrics.endpoints.push({ endpoint, method, duration, status });
    return { status, data, duration };
}

describe('Accounting Engine E2E Integration Tests', async () => {
    
    before(async () => {
        client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();

        // Ensure auth token
        const res = await apiReq('/auth/login', 'POST', { username: process.env.ADMIN_USERNAME || 'admin', password: 'password' });
        if (res.data && res.data.token) {
            token = res.data.token;
        } else {
            token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await dbQuery(`INSERT INTO active_sessions (id, token_hash, username, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour') ON CONFLICT DO NOTHING`, [crypto.randomUUID(), tokenHash, process.env.ADMIN_USERNAME || 'admin']);
        }

        // Isolated Test Data Setup
        testState.customer = { id: `test-cust-${testState.suffix}`, customer_name: `Test Customer ${testState.suffix}` };
        await dbQuery(`INSERT INTO customers (id, customer_name, pending_to_receive, customer_advance_balance) VALUES ($1, $2, 0, 0)`, [testState.customer.id, testState.customer.customer_name]);

        testState.item = { id: `test-item-${testState.suffix}`, code: `ITM${testState.suffix}`, name: `Test Item ${testState.suffix}`, stock: 100 };
        await dbQuery(`INSERT INTO items (id, code, name, stock, selling_price, purchase_price) VALUES ($1, $2, $3, $4, 100, 50)`, [testState.item.id, testState.item.code, testState.item.name, testState.item.stock]);
    });

    after(async () => {
        // Data Cleanup
        const s = testState.suffix;
        await dbQuery(`DELETE FROM customer_receipt_allocations WHERE invoice_id LIKE '%${s}%' OR receipt_id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM customer_receipts WHERE customer_id LIKE '%${s}%' OR id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM sales_returns WHERE customer_id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM sales_invoices WHERE customer_id LIKE '%${s}%' OR id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM items WHERE id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM customers WHERE id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM audit_logs WHERE record_id LIKE '%${s}%'`);
        await dbQuery(`DELETE FROM active_sessions WHERE token_hash = $1`, [token]);
        await client.end();
        
        console.log("=== Performance Metrics ===");
        console.log(`Total execution time: ${(performance.now() - testState.metrics.startTime).toFixed(2)} ms`);
        console.log(`Total DB Queries executed by tests: ${testState.metrics.queries}`);
        console.table(testState.metrics.endpoints.map(e => ({ Method: e.method, Endpoint: e.endpoint, Status: e.status, Time_ms: e.duration.toFixed(2) })));
    });

    test('1. Sales Workflow: Create Sales Invoice', async () => {
        const payload = {
            date: new Date().toISOString().split('T')[0],
            customerId: testState.customer.id,
            items: [{ id: testState.item.id, code: testState.item.code, qty: 10, rate: 100, discount: 0, taxAmount: 0, amount: 1000 }],
            subTotal: 1000, discount: 0, taxAmount: 0, grandTotal: 1000, note: `Test ${testState.suffix}`
        };
        const res = await apiReq('/sales/create', 'POST', payload);
        assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
        assert.ok(res.data.id, 'Expected invoice ID returned');
        testState.salesInvoiceId = res.data.id;

        // DB Verification
        const inv = await dbQuery('SELECT pending_to_receive FROM sales_invoices WHERE id = $1', [testState.salesInvoiceId]);
        assert.equal(inv.rows[0].pending_to_receive, '1000.00');

        const cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '1000.00');

        const itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item.id]);
        assert.equal(itm.rows[0].stock, '90.00'); // 100 - 10
    });

    test('2. Sales Workflow: Partial Receipt', async () => {
        const payload = {
            customerId: testState.customer.id,
            date: new Date().toISOString().split('T')[0],
            paymentMode: 'CASH',
            amount: 400,
            referenceType: 'AGAINST_REFERENCE',
            allocations: [{ invoiceId: testState.salesInvoiceId, allocatedAmount: 400 }]
        };
        const res = await apiReq('/receipts/create', 'POST', payload);
        assert.equal(res.status, 200);
        testState.receiptId = res.data.receiptId || res.data.id; // Assuming standard format

        const inv = await dbQuery('SELECT paid_amount, pending_to_receive FROM sales_invoices WHERE id = $1', [testState.salesInvoiceId]);
        assert.equal(inv.rows[0].paid_amount, '400.00');
        assert.equal(inv.rows[0].pending_to_receive, '600.00');

        const cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '600.00');
    });

    test('3. Sales Workflow: Cancel Receipt (Rollback & Audit Check)', async () => {
        const res = await apiReq(`/receipts/${testState.receiptId}/cancel`, 'POST', { reason: 'Test cancel' });
        assert.equal(res.status, 200);

        // Audit Verification
        const audit = await dbQuery(`SELECT * FROM audit_logs WHERE record_id = $1 AND action = 'CANCEL'`, [testState.receiptId]);
        assert.equal(audit.rows.length, 1, 'Exactly one audit log should exist for cancellation');
        assert.equal(audit.rows[0].table_name, 'customer_receipts');
        assert.ok(audit.rows[0].transaction_id);

        // State Verification
        const inv = await dbQuery('SELECT paid_amount, pending_to_receive FROM sales_invoices WHERE id = $1', [testState.salesInvoiceId]);
        assert.equal(inv.rows[0].paid_amount, '0.00');
        assert.equal(inv.rows[0].pending_to_receive, '1000.00');

        const cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '1000.00');
    });

    test('4. Sales Workflow: Cancel Invoice', async () => {
        const res = await apiReq(`/sales/${testState.salesInvoiceId}/cancel`, 'POST', { reason: 'Void test' });
        assert.equal(res.status, 200);

        // DB Verification
        const inv = await dbQuery('SELECT status FROM sales_invoices WHERE id = $1', [testState.salesInvoiceId]);
        assert.equal(inv.rows[0].status, 'CANCELLED');

        const cust = await dbQuery('SELECT pending_to_receive FROM customers WHERE id = $1', [testState.customer.id]);
        assert.equal(cust.rows[0].pending_to_receive, '0.00'); // Restored to 0

        const itm = await dbQuery('SELECT stock FROM items WHERE id = $1', [testState.item.id]);
        assert.equal(itm.rows[0].stock, '100.00'); // Restored to 100

        // Audit Log Check
        const audit = await dbQuery(`SELECT * FROM audit_logs WHERE record_id = $1 AND action = 'CANCEL'`, [testState.salesInvoiceId]);
        assert.equal(audit.rows.length, 1);
    });

    test('5. Negative Testing: Double Cancellation', async () => {
        const res = await apiReq(`/sales/${testState.salesInvoiceId}/cancel`, 'POST', { reason: 'Try double cancel' });
        assert.equal(res.status, 400); // Already cancelled
    });

    test('6. PATCH Endpoint Audit Check', async () => {
        // Create another invoice to patch
        const resInv = await apiReq('/sales/create', 'POST', {
            date: new Date().toISOString().split('T')[0], customerId: testState.customer.id, items: [{ id: testState.item.id, code: testState.item.code, qty: 1, rate: 100, discount: 0, taxAmount: 0, amount: 100 }], subTotal: 100, grandTotal: 100
        });
        const newInvId = resInv.data.id;

        const resPatch = await apiReq(`/sales/${newInvId}`, 'PATCH', { note: 'Patched Note' });
        assert.equal(resPatch.status, 200);

        const audit = await dbQuery(`SELECT * FROM audit_logs WHERE record_id = $1 AND action = 'PATCH'`, [newInvId]);
        assert.equal(audit.rows.length, 1);
        assert.ok(audit.rows[0].new_data.note === 'Patched Note');
    });

    test('7. Database Constraint Testing (Rollback verify)', async () => {
        // Try forcing negative stock
        try {
            await dbQuery(`UPDATE items SET stock = -10 WHERE id = $1`, [testState.item.id]);
            assert.fail('Should have thrown constraint violation');
        } catch(e) {
            assert.match(e.message, /chk_item_stock|violates check constraint/i);
        }

        // Try invalid status
        try {
            await dbQuery(`UPDATE sales_invoices SET status = 'INVALID' WHERE id = $1`, [testState.salesInvoiceId]);
            assert.fail('Should have thrown constraint violation');
        } catch(e) {
            assert.match(e.message, /chk_si_status|violates check constraint/i);
        }
    });

    test('8. Concurrency Testing (Race Condition on Cancel)', async () => {
        // Create an invoice
        const resInv = await apiReq('/sales/create', 'POST', {
            date: new Date().toISOString().split('T')[0], customerId: testState.customer.id, items: [{ id: testState.item.id, code: testState.item.code, qty: 1, rate: 100, discount: 0, taxAmount: 0, amount: 100 }], subTotal: 100, grandTotal: 100
        });
        const newInvId = resInv.data.id;

        // Hit cancel simultaneously
        const p1 = apiReq(`/sales/${newInvId}/cancel`, 'POST', { reason: 'Race 1' });
        const p2 = apiReq(`/sales/${newInvId}/cancel`, 'POST', { reason: 'Race 2' });

        const [r1, r2] = await Promise.all([p1, p2]);
        
        // One should succeed (200), one should fail (400)
        assert.ok((r1.status === 200 && r2.status === 400) || (r1.status === 400 && r2.status === 200));

        // Exactly one cancel audit log
        const audit = await dbQuery(`SELECT * FROM audit_logs WHERE record_id = $1 AND action = 'CANCEL'`, [newInvId]);
        assert.equal(audit.rows.length, 1);
    });

});
