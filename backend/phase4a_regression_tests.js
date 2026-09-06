const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_URL = 'http://localhost:3000/api';
let token = '';
let client;

const suffix = Date.now().toString().slice(-6);
const itemCodeA = `ITM_P4A_A_${suffix}`;
const itemCodeB = `ITM_P4A_B_${suffix}`;
const customerId = `cust_p4a_${suffix}`;
const vendorId = `vend_p4a_${suffix}`;

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

describe('Phase 4A Financial & Transaction Safety Regression Tests', async () => {

    before(async () => {
        client = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000,
            ssl: { rejectUnauthorized: false }
        });
        client.on('error', (err) => {
            console.warn('[TEST POOL CLIENT RESET]', err.message);
        });

        // Create an active session token for testing
        token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await client.query(
            `INSERT INTO active_sessions (id, token_hash, username, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '2 hours')`,
            [crypto.randomUUID(), tokenHash, process.env.ADMIN_USERNAME || 'SPH.admin']
        );

        // Seed test items
        await client.query(`
            INSERT INTO items (id, code, name, stock, sale_price, purchase_price, category_name)
            VALUES ($1, $2, 'Phase 4A Item A', 500, 100, 60, 'Hardware'),
                   ($3, $4, 'Phase 4A Item B', 500, 200, 120, 'Hardware')
            ON CONFLICT (code) DO NOTHING
        `, [crypto.randomUUID(), itemCodeA, crypto.randomUUID(), itemCodeB]);

        // Seed test customer
        await client.query(`
            INSERT INTO customers (id, customer_name, phone_number, opening_balance, pending_to_receive, store_credit_balance)
            VALUES ($1, 'Phase 4A Customer', '9876543210', 0, 0, 0)
            ON CONFLICT (id) DO NOTHING
        `, [customerId]);

        // Seed test vendor
        await client.query(`
            INSERT INTO vendors (id, vendor_name, phone_number, opening_balance, pending_to_pay, vendor_credit_balance)
            VALUES ($1, 'Phase 4A Vendor', '9876543211', 0, 0, 0)
            ON CONFLICT (id) DO NOTHING
        `, [vendorId]);
    });

    after(async () => {
        try {
            await client.query(`DELETE FROM customer_receipt_allocations WHERE invoice_id IN (SELECT id FROM sales_invoices WHERE customer_id = $1)`, [customerId]);
            await client.query(`DELETE FROM customer_receipts WHERE customer_id = $1`, [customerId]);
            await client.query(`DELETE FROM sales_returns WHERE customer_id = $1`, [customerId]);
            await client.query(`DELETE FROM sales_invoices WHERE customer_id = $1`, [customerId]);

            await client.query(`DELETE FROM vendor_payment_allocations WHERE purchase_invoice_id IN (SELECT id FROM purchase_invoices WHERE vendor_id = $1)`, [vendorId]);
            await client.query(`DELETE FROM vendor_payments WHERE vendor_id = $1`, [vendorId]);
            await client.query(`DELETE FROM purchase_returns WHERE vendor_id = $1`, [vendorId]);
            await client.query(`DELETE FROM purchase_invoices WHERE vendor_id = $1`, [vendorId]);

            await client.query(`DELETE FROM items WHERE code IN ($1, $2)`, [itemCodeA, itemCodeB]);
            await client.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
            await client.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
            await client.query(`DELETE FROM idempotency_keys WHERE key LIKE $1`, [`%${suffix}%`]);
        } catch (e) {
            console.error('Cleanup error:', e);
        } finally {
            await client.end();
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 1. SALES RETURN ACCOUNTING EQUATIONS
    // ──────────────────────────────────────────────────────────────────────────

    test('1.1 Unpaid invoice full return: pending drops to 0, customer pending drops to 0', async () => {
        // Create Sales Invoice for 10 units @ 100 = 1000, 0 received
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 100 }]
        });
        assert.strictEqual(invRes.status, 200);
        const invoiceId = invRes.data.id;

        // Verify pre-return state
        const siPre = await client.query(`SELECT amount, paid_amount, pending_to_receive, returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(siPre.rows[0].pending_to_receive), 1000);
        assert.strictEqual(parseFloat(siPre.rows[0].returned_amount), 0);

        // Perform full return of 10 units
        const retRes = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 10 }]
        });
        assert.strictEqual(retRes.status, 200);
        assert.strictEqual(retRes.data.returnGrandTotal, 1000);

        // Verify post-return invoice state
        const siPost = await client.query(`SELECT pending_to_receive, returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(siPost.rows[0].pending_to_receive), 0);
        assert.strictEqual(parseFloat(siPost.rows[0].returned_amount), 1000);

        // Verify return record saved receivable_reduction
        const sr = await client.query(`SELECT receivable_reduction, grand_total, store_credit, refund_amount FROM sales_returns WHERE id = $1`, [retRes.data.id]);
        assert.strictEqual(parseFloat(sr.rows[0].receivable_reduction), 1000);
        assert.strictEqual(parseFloat(sr.rows[0].store_credit), 0);
    });

    test('1.2 Partially paid invoice return: reduction absorbed by pending, excess creates store credit', async () => {
        // Create invoice of 1000, customer paid 400, pending = 600
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 400,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 100 }]
        });
        assert.strictEqual(invRes.status, 200);
        const invoiceId = invRes.data.id;

        // Customer returns 7 units = 700 worth
        // Pending is 600 -> receivableReduction = 600, excess = 100 -> storeCreditCreated = 100
        const retRes = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 7 }],
            refundAmount: 0 // no cash refund requested, entire excess goes to store credit
        });
        assert.strictEqual(retRes.status, 200);
        assert.strictEqual(retRes.data.returnGrandTotal, 700);
        assert.strictEqual(retRes.data.storeCreditCreated, 100);

        // Verify invoice balance: pending drops to 0, returned_amount = 700
        const siPost = await client.query(`SELECT pending_to_receive, returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(siPost.rows[0].pending_to_receive), 0);
        assert.strictEqual(parseFloat(siPost.rows[0].returned_amount), 700);

        // Verify customer store credit increased by 100
        const custRes = await client.query(`SELECT store_credit_balance FROM customers WHERE id = $1`, [customerId]);
        assert.strictEqual(parseFloat(custRes.rows[0].store_credit_balance), 100);
    });

    test('1.3 Fully paid invoice return: invoice pending unchanged (0), full return becomes refund/credit', async () => {
        // Create invoice of 500, fully paid 500
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 500,
            receivedAmount: 500,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 5, rate: 100 }]
        });
        assert.strictEqual(invRes.status, 200);
        const invoiceId = invRes.data.id;

        const custBefore = await client.query(`SELECT store_credit_balance FROM customers WHERE id = $1`, [customerId]);
        const creditBefore = parseFloat(custBefore.rows[0].store_credit_balance);

        // Return 3 units (300 worth) with cash refund 100, remaining 200 store credit
        const retRes = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 3 }],
            refundAmount: 100
        });
        assert.strictEqual(retRes.status, 200);
        assert.strictEqual(retRes.data.returnGrandTotal, 300);
        assert.strictEqual(retRes.data.cashRefundAmount, 100);
        assert.strictEqual(retRes.data.storeCreditCreated, 200);

        // Verify invoice: pending remains 0, returned_amount = 300
        const si = await client.query(`SELECT pending_to_receive, returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(si.rows[0].pending_to_receive), 0);
        assert.strictEqual(parseFloat(si.rows[0].returned_amount), 300);

        // Customer store credit grew by exactly 200
        const custAfter = await client.query(`SELECT store_credit_balance FROM customers WHERE id = $1`, [customerId]);
        assert.strictEqual(parseFloat(custAfter.rows[0].store_credit_balance), creditBefore + 200);
    });

    test('1.4 Multiple returns on same invoice: cumulative tracking and math consistency', async () => {
        // Create invoice of 10 units @ 100 = 1000, paid 200, pending 800
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 200,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        // Return 1: 3 units (300)
        const ret1 = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 3 }]
        });
        assert.strictEqual(ret1.status, 200);
        let si = await client.query(`SELECT pending_to_receive, returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(si.rows[0].pending_to_receive), 500);
        assert.strictEqual(parseFloat(si.rows[0].returned_amount), 300);

        // Return 2: 4 units (400)
        const ret2 = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 4 }]
        });
        assert.strictEqual(ret2.status, 200);
        si = await client.query(`SELECT pending_to_receive, returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(si.rows[0].pending_to_receive), 100);
        assert.strictEqual(parseFloat(si.rows[0].returned_amount), 700);
    });

    test('1.5 Return followed by receipt: cannot over-collect on returned balance', async () => {
        // Create invoice of 1000, unpaid (pending 1000)
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        // Return 4 units (400) -> pending is now 600
        await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 4 }]
        });

        // Attempt to create receipt allocating 700 -> MUST FAIL (only 600 pending remaining)
        const failReceipt = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 700,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 700, discountAmount: 0 }]
        });
        assert.strictEqual(failReceipt.status, 400);
        assert.match(failReceipt.data.error, /exceeds remaining outstanding balance/i);

        // Allocate exactly remaining 600 -> MUST SUCCEED
        const passReceipt = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 600,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 600, discountAmount: 0 }]
        });
        assert.strictEqual(passReceipt.status, 200);

        const si = await client.query(`SELECT pending_to_receive, paid_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(si.rows[0].pending_to_receive), 0);
        assert.strictEqual(parseFloat(si.rows[0].paid_amount), 600);
    });

    test('1.6 Invalid physical excess return is rejected', async () => {
        // Invoice for 2 units
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 200,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 2, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        // Try to return 3 units -> MUST FAIL
        const overRet = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 3 }]
        });
        assert.strictEqual(overRet.status, 400);
        assert.match(overRet.data.error, /over-return/i);
    });

    test('1.7 Sales return cancellation: restores original invoice and customer balances', async () => {
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        // Return 5 units (500)
        const retRes = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 5 }]
        });
        const returnId = retRes.data.id;

        // Cancel the return
        const cancelRes = await apiReq(`/sales-returns/${returnId}/cancel`, 'POST', {
            reason: 'Customer cancelled return request'
        });
        assert.strictEqual(cancelRes.status, 200);

        // Verify invoice pending restored to 1000, returned_amount restored to 0
        const si = await client.query(`SELECT pending_to_receive, returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(si.rows[0].pending_to_receive), 1000);
        assert.strictEqual(parseFloat(si.rows[0].returned_amount), 0);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. PURCHASE RETURN ACCOUNTING
    // ──────────────────────────────────────────────────────────────────────────

    test('2.1 Purchase return reduces invoice pending_to_pay and vendor balance atomically', async () => {
        // Create Purchase of 10 units @ 60 = 600, unpaid
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Phase 4A Vendor',
            date: '2026-03-01',
            grandTotal: 600,
            paidAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 60 }]
        });
        assert.strictEqual(piRes.status, 200);
        const piId = piRes.data.id;

        // Return 4 units @ 60 = 240
        const retRes = await apiReq('/purchase-returns/create', 'POST', {
            invoiceId: piId,
            vendorId,
            items: [{ code: itemCodeA, qty: 4 }]
        });
        assert.strictEqual(retRes.status, 200);
        assert.strictEqual(retRes.data.returnGrandTotal, 240);

        // Check Purchase Invoice pending_to_pay drops from 600 to 360, returned_amount = 240
        const pi = await client.query(`SELECT pending_to_pay, returned_amount FROM purchase_invoices WHERE id = $1`, [piId]);
        assert.strictEqual(parseFloat(pi.rows[0].pending_to_pay), 360);
        assert.strictEqual(parseFloat(pi.rows[0].returned_amount), 240);

        // Check return row captured payable_reduction = 240
        const pr = await client.query(`SELECT payable_reduction FROM purchase_returns WHERE id = $1`, [retRes.data.id]);
        assert.strictEqual(parseFloat(pr.rows[0].payable_reduction), 240);
    });

    test('2.2 Purchase return cancellation restores purchase invoice and vendor balances', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Phase 4A Vendor',
            date: '2026-03-01',
            grandTotal: 600,
            paidAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 60 }]
        });
        const piId = piRes.data.id;

        const retRes = await apiReq('/purchase-returns/create', 'POST', {
            invoiceId: piId,
            vendorId,
            items: [{ code: itemCodeA, qty: 5 }]
        });
        const returnId = retRes.data.id;

        const cancelRes = await apiReq(`/purchase-returns/${returnId}/cancel`, 'POST', {
            reason: 'Vendor rejected return'
        });
        assert.strictEqual(cancelRes.status, 200);

        // Verify purchase invoice restored
        const pi = await client.query(`SELECT pending_to_pay, returned_amount FROM purchase_invoices WHERE id = $1`, [piId]);
        assert.strictEqual(parseFloat(pi.rows[0].pending_to_pay), 600);
        assert.strictEqual(parseFloat(pi.rows[0].returned_amount), 0);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. CASH PURCHASES (IMMEDIATE PAYMENT & CANCELLATION SAFETY)
    // ──────────────────────────────────────────────────────────────────────────

    test('3.1 Cash purchase creates vendor_payments & allocations record atomically', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Phase 4A Vendor',
            date: '2026-03-01',
            grandTotal: 1200,
            paidAmount: 1200, // full immediate payment
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 20, rate: 60 }]
        });
        assert.strictEqual(piRes.status, 200);
        const piId = piRes.data.id;
        assert.ok(piRes.data.paymentId, 'Expected paymentId to be returned');
        assert.ok(piRes.data.paymentNo, 'Expected paymentNo to be returned');

        // Verify vendor payment record was created
        const vp = await client.query(`SELECT id, payment_no, amount, allocated_amount, status FROM vendor_payments WHERE id = $1`, [piRes.data.paymentId]);
        assert.strictEqual(vp.rows.length, 1);
        assert.strictEqual(parseFloat(vp.rows[0].amount), 1200);
        assert.strictEqual(vp.rows[0].status, 'ACTIVE');

        // Verify vendor payment allocation record
        const vpa = await client.query(`SELECT purchase_invoice_id, allocated_amount FROM vendor_payment_allocations WHERE payment_id = $1`, [piRes.data.paymentId]);
        assert.strictEqual(vpa.rows.length, 1);
        assert.strictEqual(vpa.rows[0].purchase_invoice_id, piId);
        assert.strictEqual(parseFloat(vpa.rows[0].allocated_amount), 1200);
    });

    test('3.2 Cash purchase cancellation is blocked while payment is active', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Phase 4A Vendor',
            date: '2026-03-01',
            grandTotal: 600,
            paidAmount: 600,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 60 }]
        });
        const piId = piRes.data.id;

        // Attempt to cancel purchase invoice directly -> MUST BE BLOCKED
        const cancelRes = await apiReq(`/purchases/${piId}/cancel`, 'POST', {
            reason: 'Mistake in purchase'
        });
        assert.strictEqual(cancelRes.status, 400);
        assert.match(cancelRes.data.error, /active vendor payments are allocated/i);
    });

    test('3.3 Cancelling payment first restores purchase invoice pending balance, allowing safe invoice cancellation', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Phase 4A Vendor',
            date: '2026-03-01',
            grandTotal: 600,
            paidAmount: 600,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 10, rate: 60 }]
        });
        const piId = piRes.data.id;
        const paymentId = piRes.data.paymentId;

        // Cancel the payment first
        const cancelPmt = await apiReq(`/vendor-payments/${paymentId}/cancel`, 'POST', {
            reason: 'Payment refund from vendor'
        });
        assert.strictEqual(cancelPmt.status, 200);

        // Verify purchase invoice has pending_to_pay restored to 600 and paid_amount drops to 0
        const pi = await client.query(`SELECT pending_to_pay, paid_amount FROM purchase_invoices WHERE id = $1`, [piId]);
        assert.strictEqual(parseFloat(pi.rows[0].pending_to_pay), 600);
        assert.strictEqual(parseFloat(pi.rows[0].paid_amount), 0);

        // Now invoice cancellation must succeed cleanly
        const cancelInv = await apiReq(`/purchases/${piId}/cancel`, 'POST', {
            reason: 'Order cancelled with vendor'
        });
        assert.strictEqual(cancelInv.status, 200);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. GLOBAL LOCK ORDER & CONCURRENCY (ZERO 40P01 DEADLOCKS)
    // ──────────────────────────────────────────────────────────────────────────

    test('4.1 Concurrent POS cash sale and customer receipt on same customer produces ZERO 40P01 deadlocks', async () => {
        // Pre-create an invoice for this customer so the receipt has an invoice to allocate against
        const seedInv = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 2000,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 20, rate: 100 }]
        });
        const existingInvId = seedInv.data.id;

        // Run 5 pairs of concurrent cash-sales and receipts simultaneously (10 concurrent requests)
        const concurrentTasks = [];

        for (let i = 0; i < 5; i++) {
            // Task A: POS cash sale (requests Sequence AR then Sequence INV then Items then Customer)
            const saleTask = apiReq('/sales/create', 'POST', {
                customerId,
                customerName: 'Phase 4A Customer',
                date: '2026-03-01',
                grandTotal: 100,
                receivedAmount: 100, // triggers receipt creation inside sales/create
                items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 1, rate: 100 }]
            });

            // Task B: Customer receipt creation (requests Invoice then Sequence AR then Customer)
            const receiptTask = apiReq('/receipts/create', 'POST', {
                customerId,
                amount: 50,
                date: '2026-03-01',
                allocations: [{ invoiceId: existingInvId, allocatedAmount: 50, discountAmount: 0 }]
            });

            concurrentTasks.push(saleTask, receiptTask);
        }

        const results = await Promise.all(concurrentTasks);

        // Check for any 40P01 deadlocks
        const deadlocks = results.filter(r => r.status === 500 && JSON.stringify(r.data).includes('40P01'));
        assert.strictEqual(deadlocks.length, 0, `Detected ${deadlocks.length} 40P01 deadlocks! Lock order is violated.`);

        // Ensure all succeeded with 200
        const failures = results.filter(r => r.status !== 200);
        assert.strictEqual(failures.length, 0, `Unexpected errors during concurrency test: ${JSON.stringify(failures)}`);
    });

    test('4.2 Multiple concurrent sales creations on same customer serialize safely', async () => {
        const tasks = Array.from({ length: 6 }, (_, i) => apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 1, rate: 100 }]
        }));

        const results = await Promise.all(tasks);
        const deadlocks = results.filter(r => r.status === 500 && JSON.stringify(r.data).includes('40P01'));
        assert.strictEqual(deadlocks.length, 0);

        for (const res of results) {
            assert.strictEqual(res.status, 200);
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. DATABASE-BACKED IDEMPOTENCY ENGINE
    // ──────────────────────────────────────────────────────────────────────────

    test('5.1 Same idempotency key sequential retry returns cached response without duplicate execution', async () => {
        const testKey = `idem_seq_${suffix}_${Date.now()}`;

        // First attempt
        const res1 = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 1, rate: 100 }],
            idempotencyKey: testKey
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(res1.status, 200);
        const invoiceNumber1 = res1.data.invoiceNumber;
        const invoiceId1 = res1.data.id;

        // Second attempt with exact same key
        const res2 = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 1, rate: 100 }],
            idempotencyKey: testKey
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(res2.status, 200);
        assert.strictEqual(res2.data.invoiceNumber, invoiceNumber1);
        assert.strictEqual(res2.data.id, invoiceId1);

        // Verify only ONE invoice exists in the database with this idempotency key
        const countRes = await client.query(`SELECT COUNT(*) FROM sales_invoices WHERE idempotency_key = $1`, [testKey]);
        assert.strictEqual(parseInt(countRes.rows[0].count), 1);
    });

    test('5.2 Same idempotency key concurrent retry executes exactly once and dedupes atomically', async () => {
        const testKey = `idem_conc_${suffix}_${Date.now()}`;

        // Fire two identical requests simultaneously
        const [res1, res2] = await Promise.all([
            apiReq('/sales/create', 'POST', {
                customerId,
                customerName: 'Phase 4A Customer',
                date: '2026-03-01',
                grandTotal: 200,
                receivedAmount: 0,
                items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 2, rate: 100 }],
                idempotencyKey: testKey
            }, { 'Idempotency-Key': testKey }),
            apiReq('/sales/create', 'POST', {
                customerId,
                customerName: 'Phase 4A Customer',
                date: '2026-03-01',
                grandTotal: 200,
                receivedAmount: 0,
                items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 2, rate: 100 }],
                idempotencyKey: testKey
            }, { 'Idempotency-Key': testKey })
        ]);

        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res2.status, 200);
        assert.strictEqual(res1.data.invoiceNumber, res2.data.invoiceNumber);
        assert.strictEqual(res1.data.id, res2.data.id);

        // Verify only 1 invoice exists in DB
        const countRes = await client.query(`SELECT COUNT(*) FROM sales_invoices WHERE idempotency_key = $1`, [testKey]);
        assert.strictEqual(parseInt(countRes.rows[0].count), 1);
    });

    test('5.3 Different idempotency keys create distinct invoices', async () => {
        const key1 = `idem_diff1_${suffix}_${Date.now()}`;
        const key2 = `idem_diff2_${suffix}_${Date.now()}`;

        const res1 = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 1, rate: 100 }],
            idempotencyKey: key1
        });
        const res2 = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 1, rate: 100 }],
            idempotencyKey: key2
        });

        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res2.status, 200);
        assert.notStrictEqual(res1.data.invoiceNumber, res2.data.invoiceNumber);
        assert.notStrictEqual(res1.data.id, res2.data.id);
    });

    test('5.4 Failed transaction retry with same idempotency key is permitted after fix', async () => {
        const failKey = `idem_fail_${suffix}_${Date.now()}`;

        // Attempt with negative quantity -> triggers Error & ROLLBACK
        const failRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: -5, rate: 100 }],
            idempotencyKey: failKey
        });
        assert.strictEqual(failRes.status, 400);

        // Retry with same key and valid quantity -> MUST SUCCEED
        const passRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 1, rate: 100 }],
            idempotencyKey: failKey
        });
        assert.strictEqual(passRes.status, 200);
        assert.ok(passRes.data.id);
    });

    test('5.5 Stock deducted exactly once across sequential duplicate requests', async () => {
        const testKey = `idem_stock_${suffix}_${Date.now()}`;

        const itemPre = await client.query(`SELECT stock FROM items WHERE code = $1`, [itemCodeB]);
        const stockPre = parseFloat(itemPre.rows[0].stock);

        // Send request deducting 5 units
        const res1 = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 0,
            items: [{ code: itemCodeB, name: 'Phase 4A Item B', qty: 5, rate: 200 }],
            idempotencyKey: testKey
        });
        assert.strictEqual(res1.status, 200);

        // Send duplicate request with same key
        const res2 = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 4A Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 0,
            items: [{ code: itemCodeB, name: 'Phase 4A Item B', qty: 5, rate: 200 }],
            idempotencyKey: testKey
        });
        assert.strictEqual(res2.status, 200);

        // Stock must have dropped by exactly 5 (not 10)
        const itemPost = await client.query(`SELECT stock FROM items WHERE code = $1`, [itemCodeB]);
        const stockPost = parseFloat(itemPost.rows[0].stock);
        assert.strictEqual(stockPost, stockPre - 5);
    });

    test('5.6 Purchase invoice idempotency works sequentially and concurrently', async () => {
        const pTestKey = `idem_pi_${suffix}_${Date.now()}`;

        // Concurrent duplicate purchase requests
        const [res1, res2] = await Promise.all([
            apiReq('/purchases/create', 'POST', {
                vendorId,
                vendorName: 'Phase 4A Vendor',
                date: '2026-03-01',
                grandTotal: 120,
                paidAmount: 0,
                items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 2, rate: 60 }],
                idempotencyKey: pTestKey
            }),
            apiReq('/purchases/create', 'POST', {
                vendorId,
                vendorName: 'Phase 4A Vendor',
                date: '2026-03-01',
                grandTotal: 120,
                paidAmount: 0,
                items: [{ code: itemCodeA, name: 'Phase 4A Item A', qty: 2, rate: 60 }],
                idempotencyKey: pTestKey
            })
        ]);

        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res2.status, 200);
        assert.strictEqual(res1.data.piNo, res2.data.piNo);
        assert.strictEqual(res1.data.id, res2.data.id);

        const countRes = await client.query(`SELECT COUNT(*) FROM purchase_invoices WHERE idempotency_key = $1`, [pTestKey]);
        assert.strictEqual(parseInt(countRes.rows[0].count), 1);
    });
});
