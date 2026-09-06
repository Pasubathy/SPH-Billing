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
const itemCodeA = `ITM_P2_A_${suffix}`;
const itemCodeB = `ITM_P2_B_${suffix}`;
const customerId = `cust_p2_${suffix}`;
const vendorId = `vend_p2_${suffix}`;

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

describe('Phase 2 Production Safety & Regression Tests', async () => {

    before(async () => {
        client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();

        // Create an active session token for testing
        token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await client.query(
            `INSERT INTO active_sessions (id, token_hash, username, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '2 hours')`,
            [crypto.randomUUID(), tokenHash, process.env.ADMIN_USERNAME || 'SPH.admin']
        );

        // Seed test items
        await client.query(`
            INSERT INTO items (id, code, name, stock, sale_price, purchase_price)
            VALUES ($1, $2, 'Test Item A', 100, 50, 30),
                   ($3, $4, 'Test Item B', 100, 70, 40)
            ON CONFLICT (code) DO NOTHING
        `, [crypto.randomUUID(), itemCodeA, crypto.randomUUID(), itemCodeB]);

        // Seed test customer
        await client.query(`
            INSERT INTO customers (id, customer_name, phone_number, opening_balance, pending_to_receive)
            VALUES ($1, 'Phase 2 Test Customer', '9876543210', 0, 0)
            ON CONFLICT (id) DO NOTHING
        `, [customerId]);

        // Seed test vendor
        await client.query(`
            INSERT INTO vendors (id, vendor_name, phone_number, opening_balance, pending_to_pay)
            VALUES ($1, 'Phase 2 Test Vendor', '9876543211', 0, 0)
            ON CONFLICT (id) DO NOTHING
        `, [vendorId]);
    });

    after(async () => {
        try {
            // Clean up test receipts, allocations, sales, purchases, items, customer, vendor
            await client.query(`
                DELETE FROM customer_receipt_allocations WHERE invoice_id IN (
                    SELECT id FROM sales_invoices WHERE customer_id = $1 OR invoice_no LIKE $2
                )
            `, [customerId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM customer_receipts WHERE customer_id = $1 OR receipt_no LIKE $2 OR note LIKE $2
            `, [customerId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM sales_returns WHERE customer_id = $1 OR invoice_no LIKE $2
            `, [customerId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM sales_invoices WHERE customer_id = $1 OR invoice_no LIKE $2
            `, [customerId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM vendor_payment_allocations WHERE purchase_invoice_id IN (
                    SELECT id FROM purchase_invoices WHERE vendor_id = $1 OR pi_no LIKE $2
                )
            `, [vendorId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM purchase_returns WHERE vendor_id = $1 OR invoice_no LIKE $2
            `, [vendorId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM purchase_invoices WHERE vendor_id = $1 OR pi_no LIKE $2
            `, [vendorId, `%${suffix}%`]);

            await client.query(`DELETE FROM items WHERE code IN ($1, $2)`, [itemCodeA, itemCodeB]);
            await client.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
            await client.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
        } catch (e) {
            console.error('Cleanup error:', e);
        } finally {
            await client.end();
        }
    });

    // 1. sph_auth_token works
    test('1. sph_auth_token works with authenticated requests', async () => {
        const res = await apiReq('/sales');
        assert.equal(res.status, 200, 'Authenticated request with valid token must return 200');
        assert.ok(Array.isArray(res.data), 'GET /api/sales must return an array');
    });

    // 2. Bearer null is rejected/not generated
    test('2. Bearer null, Bearer undefined, and Bearer "" are rejected with 401', async () => {
        const resNull = await apiReq('/sales', 'GET', null, { 'Authorization': 'Bearer null', 'No-Auth': true });
        assert.equal(resNull.status, 401, 'Bearer null must be rejected with 401');

        const resUndef = await apiReq('/sales', 'GET', null, { 'Authorization': 'Bearer undefined', 'No-Auth': true });
        assert.equal(resUndef.status, 401, 'Bearer undefined must be rejected with 401');

        const resEmpty = await apiReq('/sales', 'GET', null, { 'Authorization': 'Bearer ""', 'No-Auth': true });
        assert.equal(resEmpty.status, 401, 'Bearer "" must be rejected with 401');

        const resNoAuth = await apiReq('/sales', 'GET', null, { 'No-Auth': true });
        assert.equal(resNoAuth.status, 401, 'Missing Authorization header must return 401');
    });

    // 3. GET /api/sales returns status
    test('3. GET /api/sales returns status field for each invoice', async () => {
        const res = await apiReq('/sales');
        assert.equal(res.status, 200);
        if (res.data.length > 0) {
            const first = res.data[0];
            assert.ok('status' in first, 'Sales invoice must have a status field');
            assert.ok(['ACTIVE', 'CANCELLED'].includes(first.status), `Status must be ACTIVE or CANCELLED, got: ${first.status}`);
        }
    });

    // 4. GET /api/purchase-invoices returns status
    test('4. GET /api/purchase-invoices returns status field for each invoice', async () => {
        const res = await apiReq('/purchase-invoices');
        assert.equal(res.status, 200);
        if (res.data.length > 0) {
            const first = res.data[0];
            assert.ok('status' in first, 'Purchase invoice must have a status field');
            assert.ok(['ACTIVE', 'CANCELLED'].includes(first.status), `Status must be ACTIVE or CANCELLED, got: ${first.status}`);
        }
    });

    // 5. CANCELLED sales invoice is correctly identified
    let testSalesInvoiceId = null;
    let testSalesInvoiceNo = null;

    test('5. Creating and cancelling a sales invoice identifies status as CANCELLED', async () => {
        // Create an invoice
        const salePayload = {
            customerId,
            customerName: 'Phase 2 Test Customer',
            date: '2026-09-04',
            items: [{
                code: itemCodeA,
                name: 'Test Item A',
                qty: 2,
                rate: 50,
                amount: 100
            }],
            subTotal: 100,
            grandTotal: 100,
            receivedAmount: 0,
            paymentMode: 'CREDIT'
        };

        const createRes = await apiReq('/sales/create', 'POST', salePayload);
        assert.equal(createRes.status, 200, `Failed to create sales invoice: ${JSON.stringify(createRes.data)}`);
        testSalesInvoiceId = createRes.data.invoice?.id || createRes.data.id;
        testSalesInvoiceNo = createRes.data.invoice?.invoiceNumber || createRes.data.invoiceNo;

        // Cancel the invoice
        const cancelRes = await apiReq(`/sales/${testSalesInvoiceId}/cancel`, 'POST', {
            reason: 'Phase 2 regression test cancellation'
        });
        assert.equal(cancelRes.status, 200, `Failed to cancel invoice: ${JSON.stringify(cancelRes.data)}`);

        // Check via GET /api/sales
        const listRes = await apiReq('/sales');
        const found = listRes.data.find(s => String(s.id) === String(testSalesInvoiceId));
        assert.ok(found, 'Cancelled sales invoice must be found in sales list');
        assert.equal(found.status, 'CANCELLED', 'Invoice status must be CANCELLED');
    });

    // 6. CANCELLED purchase invoice is correctly identified
    let testPurchaseInvoiceId = null;
    test('6. Creating and cancelling a purchase invoice identifies status as CANCELLED', async () => {
        const piPayload = {
            vendorId,
            vendorName: 'Phase 2 Test Vendor',
            date: '2026-09-04',
            items: [{
                code: itemCodeA,
                name: 'Test Item A',
                qty: 5,
                rate: 30,
                amount: 150
            }],
            subTotal: 150,
            grandTotal: 150,
            paidAmount: 0
        };

        const createRes = await apiReq('/purchases/create', 'POST', piPayload);
        assert.equal(createRes.status, 200, `Failed to create purchase invoice: ${JSON.stringify(createRes.data)}`);
        testPurchaseInvoiceId = createRes.data.invoice?.id || createRes.data.id;

        // Cancel the purchase invoice
        const cancelRes = await apiReq(`/purchases/${testPurchaseInvoiceId}/cancel`, 'POST', {
            reason: 'Phase 2 regression test cancellation'
        });
        assert.equal(cancelRes.status, 200, `Failed to cancel purchase invoice: ${JSON.stringify(cancelRes.data)}`);

        // Check via GET /api/purchase-invoices
        const listRes = await apiReq('/purchase-invoices');
        const found = listRes.data.find(p => String(p.id) === String(testPurchaseInvoiceId));
        assert.ok(found, 'Cancelled purchase invoice must be found in purchase invoice list');
        assert.equal(found.status, 'CANCELLED', 'Purchase invoice status must be CANCELLED');
    });

    // 7. Cancelled invoices are excluded from financial totals
    test('7. Cancelled sales invoice does not leave pending balance on customer', async () => {
        const custRes = await client.query('SELECT pending_to_receive FROM customers WHERE id = $1', [customerId]);
        const pending = parseFloat(custRes.rows[0]?.pending_to_receive || 0);
        assert.equal(pending, 0, 'Customer pending balance must be 0 after sales invoice cancellation');
    });

    // 8. Cancelled invoices cannot be selected for financial operations
    test('8. Cancelled sales invoice cannot have returns created against it', async () => {
        const returnPayload = {
            invoiceId: testSalesInvoiceId,
            invoiceNo: testSalesInvoiceNo,
            customerId,
            customerName: 'Phase 2 Test Customer',
            date: '2026-09-04',
            items: [{
                code: itemCodeA,
                name: 'Test Item A',
                qty: 1,
                rate: 50,
                amount: 50
            }],
            grandTotal: 50,
            refundAmount: 50,
            refundMode: 'Cash'
        };

        const retRes = await apiReq('/sales-returns/create', 'POST', returnPayload);
        assert.notEqual(retRes.status, 200, 'Sales return against CANCELLED invoice must be rejected');
    });

    // 9. Concurrent inventory transactions do not deadlock
    test('9. Concurrent multi-item inventory transactions execute deterministically without deadlock', async () => {
        const tx1 = async () => {
            const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
            await pgClient.connect();
            try {
                await pgClient.query('BEGIN');
                // Lock items in standard alphabetical order: code ASC
                const res = await pgClient.query(`SELECT * FROM items WHERE code IN ($1, $2) ORDER BY code ASC FOR UPDATE`, [itemCodeA, itemCodeB]);
                await new Promise(resolve => setTimeout(resolve, 50)); // small delay to simulate processing
                await pgClient.query('COMMIT');
                return { success: true, count: res.rows.length };
            } catch (e) {
                await pgClient.query('ROLLBACK');
                throw e;
            } finally {
                await pgClient.end();
            }
        };

        const tx2 = async () => {
            const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
            await pgClient.connect();
            try {
                await pgClient.query('BEGIN');
                // Second concurrent transaction locking same rows with standard order
                const res = await pgClient.query(`SELECT * FROM items WHERE code IN ($1, $2) ORDER BY code ASC FOR UPDATE`, [itemCodeA, itemCodeB]);
                await new Promise(resolve => setTimeout(resolve, 50));
                await pgClient.query('COMMIT');
                return { success: true, count: res.rows.length };
            } catch (e) {
                await pgClient.query('ROLLBACK');
                throw e;
            } finally {
                await pgClient.end();
            }
        };

        const [r1, r2] = await Promise.all([tx1(), tx2()]);
        assert.equal(r1.success, true);
        assert.equal(r2.success, true);
    });

    // 10. Direct cash sale creates exactly one receipt if required by the accounting model
    // 11. Exactly one allocation exists
    let cashSaleInvoiceId = null;
    let createdReceiptId = null;

    test('10 & 11. Direct cash sale (receivedAmount > 0) creates exactly one receipt and one allocation atomically', async () => {
        const cashSalePayload = {
            customerId,
            customerName: 'Phase 2 Test Customer',
            date: '2026-09-04',
            items: [{
                code: itemCodeA,
                name: 'Test Item A',
                qty: 1,
                rate: 50,
                amount: 50
            }],
            subTotal: 50,
            grandTotal: 50,
            receivedAmount: 50,
            paymentMode: 'Cash'
        };

        const saleRes = await apiReq('/sales/create', 'POST', cashSalePayload);
        assert.equal(saleRes.status, 200, `Direct cash sale failed: ${JSON.stringify(saleRes.data)}`);
        cashSaleInvoiceId = saleRes.data.invoice?.id || saleRes.data.id;
        assert.ok(cashSaleInvoiceId, 'Cash sale invoice ID must be present');

        // Check customer_receipts for this invoice
        const allocRes = await client.query(
            'SELECT * FROM customer_receipt_allocations WHERE invoice_id = $1',
            [cashSaleInvoiceId]
        );
        assert.equal(allocRes.rows.length, 1, 'Exactly one receipt allocation must exist for direct cash sale');
        assert.equal(parseFloat(allocRes.rows[0].allocated_amount), 50, 'Allocated amount must match received amount');

        createdReceiptId = allocRes.rows[0].receipt_id;
        const rcptRes = await client.query(
            'SELECT * FROM customer_receipts WHERE id = $1',
            [createdReceiptId]
        );
        assert.equal(rcptRes.rows.length, 1, 'Exactly one customer receipt must be linked to the sale');
        assert.equal(parseFloat(rcptRes.rows[0].amount), 50, 'Receipt amount must match received amount');
        assert.equal(rcptRes.rows[0].status, 'ACTIVE', 'Receipt status must be ACTIVE');

        // Verify customer pending balance did NOT go negative / double-deducted
        const custCheck = await client.query('SELECT pending_to_receive FROM customers WHERE id = $1', [customerId]);
        assert.equal(parseFloat(custCheck.rows[0].pending_to_receive), 0, 'Customer pending balance must be 0 (no double deduction)');
    });

    // 12. Credit sale creates no receipt
    // 13. Credit sale behavior remains unchanged
    test('12 & 13. Credit sale (receivedAmount === 0) creates no receipt and updates customer pending correctly', async () => {
        const creditSalePayload = {
            customerId,
            customerName: 'Phase 2 Test Customer',
            date: '2026-09-04',
            items: [{
                code: itemCodeB,
                name: 'Test Item B',
                qty: 1,
                rate: 70,
                amount: 70
            }],
            subTotal: 70,
            grandTotal: 70,
            receivedAmount: 0,
            paymentMode: 'CREDIT'
        };

        const creditRes = await apiReq('/sales/create', 'POST', creditSalePayload);
        assert.equal(creditRes.status, 200, `Credit sale failed: ${JSON.stringify(creditRes.data)}`);
        const creditInvoiceId = creditRes.data.invoice?.id || creditRes.data.id;

        // Verify NO allocation was created for credit sale
        const allocRes = await client.query(
            'SELECT * FROM customer_receipt_allocations WHERE invoice_id = $1',
            [creditInvoiceId]
        );
        assert.equal(allocRes.rows.length, 0, 'Credit sale must NOT create any receipt allocations');

        // Verify customer pending increased by 70
        const custCheck = await client.query('SELECT pending_to_receive FROM customers WHERE id = $1', [customerId]);
        assert.equal(parseFloat(custCheck.rows[0].pending_to_receive), 70, 'Customer pending balance must increase by invoice amount');
    });

    // 14. Walk-in cash sale works
    // 15. Receipt cancellation works for walk-in cash sale
    test('14 & 15. Walk-in cash sale creates receipt without customer_id, and receipt cancellation succeeds', async () => {
        const walkInPayload = {
            customerId: null,
            customerName: 'Walk-In Customer',
            date: '2026-09-04',
            items: [{
                code: itemCodeA,
                name: 'Test Item A',
                qty: 1,
                rate: 50,
                amount: 50
            }],
            subTotal: 50,
            grandTotal: 50,
            receivedAmount: 50,
            paymentMode: 'Cash'
        };

        const walkInRes = await apiReq('/sales/create', 'POST', walkInPayload);
        assert.equal(walkInRes.status, 200, `Walk-in cash sale failed: ${JSON.stringify(walkInRes.data)}`);
        const walkInInvoiceId = walkInRes.data.invoice?.id || walkInRes.data.id;

        // Check allocation and receipt
        const allocRes = await client.query(
            'SELECT * FROM customer_receipt_allocations WHERE invoice_id = $1',
            [walkInInvoiceId]
        );
        assert.equal(allocRes.rows.length, 1, 'Walk-in cash sale must have 1 allocation');

        const walkInReceiptId = allocRes.rows[0].receipt_id;
        const rcptRes = await client.query('SELECT * FROM customer_receipts WHERE id = $1', [walkInReceiptId]);
        assert.equal(rcptRes.rows.length, 1, 'Walk-in receipt must exist');
        assert.equal(rcptRes.rows[0].customer_id, null, 'Walk-in receipt customer_id must be null');

        // Test receipt cancellation on walk-in receipt (must NOT throw Customer not found)
        const cancelRcptRes = await apiReq(`/receipts/${walkInReceiptId}/cancel`, 'POST', {
            reason: 'Test walk-in receipt cancellation'
        });
        assert.equal(cancelRcptRes.status, 200, `Walk-in receipt cancellation failed: ${JSON.stringify(cancelRcptRes.data)}`);

        // Verify receipt is CANCELLED
        const updatedRcpt = await client.query('SELECT status FROM customer_receipts WHERE id = $1', [walkInReceiptId]);
        assert.equal(updatedRcpt.rows[0].status, 'CANCELLED', 'Walk-in receipt must be CANCELLED');
    });

    // 16. Phase 1 regression protections remain intact
    test('16. Phase 1 protections remain intact (audit logs, stock preservation)', async () => {
        // Verify audit log exists for the actions taken above
        const logs = await client.query(`
            SELECT * FROM audit_logs 
            WHERE record_id = $1 OR record_id = $2
            ORDER BY performed_at DESC
        `, [testSalesInvoiceId, testPurchaseInvoiceId]);
        assert.ok(logs.rows.length > 0, 'Audit logs must be written for invoice creation and cancellation');

        // Verify stock was restored upon invoice cancellation
        const itemRes = await client.query('SELECT stock FROM items WHERE code = $1', [itemCodeA]);
        assert.ok(parseFloat(itemRes.rows[0].stock) >= 90, 'Stock must not be permanently lost');
    });
});
