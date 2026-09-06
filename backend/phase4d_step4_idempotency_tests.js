/**
 * SPH Billing — Phase 4D Step 4 Test Suite
 * Idempotency Expansion across Mutation Endpoints:
 * 1. POST /api/receipts/create
 * 2. POST /api/sales-returns/create
 * 3. POST /api/purchase-returns/create
 * 4. POST /api/vendor-payments/create
 *
 * Validates:
 * - Sequential duplicate retries return cached responses
 * - Concurrent duplicate requests result in exactly ONE financial transaction
 * - Failed/rolled-back transactions allow legitimate retries with the same key
 * - Cross-endpoint independence (same key on different endpoints does not collide)
 * - Strict financial invariant & accounting equation integrity
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const suffix = crypto.randomBytes(4).toString('hex');
const customerId = `cust_idem_${suffix}`;
const vendorId = `vend_idem_${suffix}`;
const itemCodeA = `ITM_IDEM_A_${suffix}`;
const itemCodeB = `ITM_IDEM_B_${suffix}`;

let client;
let token;

function apiReq(path, method = 'GET', body = null, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path.startsWith('http') ? path : `${BASE_URL}/api${path}`);
        const payload = body ? JSON.stringify(body) : null;

        const headers = {
            'Authorization': `Bearer ${token}`,
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
            ...extraHeaders
        };

        const req = http.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch { parsed = data; }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

describe('Phase 4D Step 4: Idempotency Expansion Tests', () => {
    before(async () => {
        client = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000,
            ssl: { rejectUnauthorized: false }
        });

        token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await client.query(
            `INSERT INTO active_sessions (id, token_hash, username, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '2 hours')`,
            [crypto.randomUUID(), tokenHash, process.env.ADMIN_USERNAME || 'SPH.admin']
        );

        // Seed test items
        await client.query(`
            INSERT INTO items (id, code, name, stock, sale_price, purchase_price, category_name)
            VALUES ($1, $2, 'Idem Item A', 500, 100, 60, 'Hardware'),
                   ($3, $4, 'Idem Item B', 500, 200, 120, 'Hardware')
            ON CONFLICT (code) DO NOTHING
        `, [crypto.randomUUID(), itemCodeA, crypto.randomUUID(), itemCodeB]);

        // Seed test customer
        await client.query(`
            INSERT INTO customers (id, customer_name, phone_number, opening_balance, pending_to_receive, store_credit_balance)
            VALUES ($1, 'Idem Customer', '9876543299', 0, 0, 0)
            ON CONFLICT (id) DO NOTHING
        `, [customerId]);

        // Seed test vendor
        await client.query(`
            INSERT INTO vendors (id, vendor_name, phone_number, opening_balance, pending_to_pay, vendor_credit_balance)
            VALUES ($1, 'Idem Vendor', '9876543298', 0, 0, 0)
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
    // 1. CUSTOMER RECEIPTS IDEMPOTENCY
    // ──────────────────────────────────────────────────────────────────────────

    test('1.1 POST /api/receipts/create: Sequential retry returns cached response and mutates exactly once', async () => {
        // Create an unpaid invoice for 500
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Idem Customer',
            date: '2026-03-01',
            grandTotal: 500,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Idem Item A', qty: 5, rate: 100 }]
        });
        assert.strictEqual(invRes.status, 200);
        const invoiceId = invRes.data.id;

        const testKey = `idem_rcpt_seq_${suffix}_${Date.now()}`;

        // First receipt creation: allocate 200
        const r1 = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 200,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 200, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(r1.status, 200);
        const receiptNo = r1.data.receiptNo;
        const receiptId = r1.data.receiptId;
        assert(receiptNo && receiptId);

        // Second attempt with same key (simulated timeout retry)
        const r2 = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 200,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 200, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(r2.status, 200);
        assert.strictEqual(r2.data.receiptNo, receiptNo, 'Cached receiptNo must match exactly');
        assert.strictEqual(r2.data.receiptId, receiptId, 'Cached receiptId must match exactly');

        // Check DB: exactly ONE receipt row, exactly ONE allocation row, invoice pending = 300
        const rcptCount = await client.query(`SELECT COUNT(*) FROM customer_receipts WHERE id = $1`, [receiptId]);
        assert.strictEqual(parseInt(rcptCount.rows[0].count), 1, 'Exactly one receipt must exist in database');

        const allocCount = await client.query(`SELECT COUNT(*) FROM customer_receipt_allocations WHERE receipt_id = $1`, [receiptId]);
        assert.strictEqual(parseInt(allocCount.rows[0].count), 1, 'Exactly one allocation must exist');

        const invCheck = await client.query(`SELECT pending_to_receive, paid_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(invCheck.rows[0].pending_to_receive), 300, 'Pending must be 300 (not reduced twice to 100)');
        assert.strictEqual(parseFloat(invCheck.rows[0].paid_amount), 200, 'Paid must be 200 (not 400)');
    });

    test('1.2 POST /api/receipts/create: Concurrent duplicate requests execute exactly once', async () => {
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Idem Customer',
            date: '2026-03-01',
            grandTotal: 300,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Idem Item A', qty: 3, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        const testKey = `idem_rcpt_conc_${suffix}_${Date.now()}`;

        // Fire 4 concurrent requests with the identical key
        const tasks = Array.from({ length: 4 }, () => apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 100,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 100, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey }));

        const results = await Promise.all(tasks);
        const successful = results.filter(r => r.status === 200);
        assert(successful.length >= 1, 'At least one request must succeed with 200');

        const firstReceiptId = successful[0].data.receiptId;
        for (const res of successful) {
            assert.strictEqual(res.data.receiptId, firstReceiptId, 'All 200 responses must return identical receiptId');
        }

        // Verify DB: invoice pending reduced by exactly 100, not 400
        const invCheck = await client.query(`SELECT pending_to_receive, paid_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(invCheck.rows[0].pending_to_receive), 200);
        assert.strictEqual(parseFloat(invCheck.rows[0].paid_amount), 100);
    });

    test('1.3 POST /api/receipts/create: Failed transaction allows retry with same key', async () => {
        const testKey = `idem_rcpt_fail_${suffix}_${Date.now()}`;

        // Attempt 1: Invalid request (allocating 99999 on non-existent invoice) -> fails
        const badRes = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 100,
            date: '2026-03-01',
            allocations: [{ invoiceId: '00000000-0000-0000-0000-000000000000', allocatedAmount: 100, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey });
        assert.strictEqual(badRes.status, 400);

        // Attempt 2: Create a real invoice and retry with the SAME testKey
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Idem Customer',
            date: '2026-03-01',
            grandTotal: 100,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Idem Item A', qty: 1, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        const goodRes = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 100,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 100, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(goodRes.status, 200, 'Retry after failure must succeed with same key');
        assert(goodRes.data.receiptId);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. SALES RETURNS IDEMPOTENCY
    // ──────────────────────────────────────────────────────────────────────────

    test('2.1 POST /api/sales-returns/create: Sequential retry returns cached response and mutates stock/invoice once', async () => {
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Idem Customer',
            date: '2026-03-01',
            grandTotal: 1000,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Idem Item A', qty: 10, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        // Record stock before return
        const stockPre = await client.query(`SELECT stock FROM items WHERE code = $1`, [itemCodeA]);
        const initialStock = parseFloat(stockPre.rows[0].stock);

        const testKey = `idem_sret_seq_${suffix}_${Date.now()}`;

        // Return 2 units
        const r1 = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 2 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(r1.status, 200);
        const returnNo = r1.data.returnNo;
        const returnId = r1.data.id;

        // Retry same key
        const r2 = await apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 2 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(r2.status, 200);
        assert.strictEqual(r2.data.returnNo, returnNo);
        assert.strictEqual(r2.data.id, returnId);

        // Verify stock incremented by 2, NOT 4
        const stockPost = await client.query(`SELECT stock FROM items WHERE code = $1`, [itemCodeA]);
        assert.strictEqual(parseFloat(stockPost.rows[0].stock), initialStock + 2, 'Stock must only be incremented once');

        // Verify invoice returned_amount = 200, NOT 400
        const invCheck = await client.query(`SELECT returned_amount, pending_to_receive FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(invCheck.rows[0].returned_amount), 200);
        assert.strictEqual(parseFloat(invCheck.rows[0].pending_to_receive), 800);
    });

    test('2.2 POST /api/sales-returns/create: Concurrent duplicate requests execute exactly once', async () => {
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Idem Customer',
            date: '2026-03-01',
            grandTotal: 500,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Idem Item A', qty: 5, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        const testKey = `idem_sret_conc_${suffix}_${Date.now()}`;

        const tasks = Array.from({ length: 4 }, () => apiReq('/sales-returns/create', 'POST', {
            invoiceId,
            customerId,
            items: [{ code: itemCodeA, qty: 1 }]
        }, { 'Idempotency-Key': testKey }));

        const results = await Promise.all(tasks);
        const successful = results.filter(r => r.status === 200);
        assert(successful.length >= 1);

        const firstReturnId = successful[0].data.id;
        for (const res of successful) {
            assert.strictEqual(res.data.id, firstReturnId);
        }

        // Check invoice returned_amount is 100, not 400
        const invCheck = await client.query(`SELECT returned_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(invCheck.rows[0].returned_amount), 100);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. PURCHASE RETURNS IDEMPOTENCY
    // ──────────────────────────────────────────────────────────────────────────

    test('3.1 POST /api/purchase-returns/create: Sequential retry returns cached response and mutates stock/payable once', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Idem Vendor',
            date: '2026-03-01',
            grandTotal: 1000,
            paidAmount: 0,
            items: [{ code: itemCodeB, name: 'Idem Item B', qty: 10, rate: 100 }]
        });
        assert.strictEqual(piRes.status, 200);
        const invoiceId = piRes.data.id;

        const stockPre = await client.query(`SELECT stock FROM items WHERE code = $1`, [itemCodeB]);
        const initialStock = parseFloat(stockPre.rows[0].stock);

        const testKey = `idem_pret_seq_${suffix}_${Date.now()}`;

        // Return 2 units
        const r1 = await apiReq('/purchase-returns/create', 'POST', {
            invoiceId,
            vendorId,
            items: [{ code: itemCodeB, qty: 2 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(r1.status, 200);
        const returnNo = r1.data.returnNo;
        const returnId = r1.data.id;

        // Retry same key
        const r2 = await apiReq('/purchase-returns/create', 'POST', {
            invoiceId,
            vendorId,
            items: [{ code: itemCodeB, qty: 2 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(r2.status, 200);
        assert.strictEqual(r2.data.returnNo, returnNo);
        assert.strictEqual(r2.data.id, returnId);

        // Stock must be deducted by 2, NOT 4
        const stockPost = await client.query(`SELECT stock FROM items WHERE code = $1`, [itemCodeB]);
        assert.strictEqual(parseFloat(stockPost.rows[0].stock), initialStock - 2, 'Purchase return stock must only deduct once');

        // Invoice returned_amount = 200, pending_to_pay = 800
        const piCheck = await client.query(`SELECT returned_amount, pending_to_pay FROM purchase_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(piCheck.rows[0].returned_amount), 200);
        assert.strictEqual(parseFloat(piCheck.rows[0].pending_to_pay), 800);
    });

    test('3.2 POST /api/purchase-returns/create: Concurrent duplicate requests execute exactly once', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Idem Vendor',
            date: '2026-03-01',
            grandTotal: 500,
            paidAmount: 0,
            items: [{ code: itemCodeB, name: 'Idem Item B', qty: 5, rate: 100 }]
        });
        assert.strictEqual(piRes.status, 200);
        const invoiceId = piRes.data.id;

        const testKey = `idem_pret_conc_${suffix}_${Date.now()}`;

        const tasks = Array.from({ length: 4 }, () => apiReq('/purchase-returns/create', 'POST', {
            invoiceId,
            vendorId,
            items: [{ code: itemCodeB, qty: 1 }]
        }, { 'Idempotency-Key': testKey }));

        const results = await Promise.all(tasks);
        const successful = results.filter(r => r.status === 200);
        assert(successful.length >= 1);

        const firstId = successful[0].data.id;
        for (const res of successful) {
            assert.strictEqual(res.data.id, firstId);
        }

        const piCheck = await client.query(`SELECT returned_amount FROM purchase_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(piCheck.rows[0].returned_amount), 100);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. VENDOR PAYMENTS IDEMPOTENCY
    // ──────────────────────────────────────────────────────────────────────────

    test('4.1 POST /api/vendor-payments/create: Sequential retry returns cached response and mutates payable once', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Idem Vendor',
            date: '2026-03-01',
            grandTotal: 500,
            paidAmount: 0,
            items: [{ code: itemCodeB, name: 'Idem Item B', qty: 5, rate: 100 }]
        });
        assert.strictEqual(piRes.status, 200);
        const invoiceId = piRes.data.id;

        const testKey = `idem_vpmt_seq_${suffix}_${Date.now()}`;

        // Pay 150
        const p1 = await apiReq('/vendor-payments/create', 'POST', {
            vendorId,
            amount: 150,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 150, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(p1.status, 200);
        const paymentNo = p1.data.paymentNo;
        const paymentId = p1.data.paymentId;

        // Retry same key
        const p2 = await apiReq('/vendor-payments/create', 'POST', {
            vendorId,
            amount: 150,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 150, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey });

        assert.strictEqual(p2.status, 200);
        assert.strictEqual(p2.data.paymentNo, paymentNo);
        assert.strictEqual(p2.data.paymentId, paymentId);

        // Exactly ONE vendor_payment, ONE allocation
        const pmtCount = await client.query(`SELECT COUNT(*) FROM vendor_payments WHERE id = $1`, [paymentId]);
        assert.strictEqual(parseInt(pmtCount.rows[0].count), 1);

        const allocCount = await client.query(`SELECT COUNT(*) FROM vendor_payment_allocations WHERE payment_id = $1`, [paymentId]);
        assert.strictEqual(parseInt(allocCount.rows[0].count), 1);

        // Invoice pending = 350, paid = 150
        const piCheck = await client.query(`SELECT pending_to_pay, paid_amount FROM purchase_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(piCheck.rows[0].pending_to_pay), 350);
        assert.strictEqual(parseFloat(piCheck.rows[0].paid_amount), 150);
    });

    test('4.2 POST /api/vendor-payments/create: Concurrent duplicate requests execute exactly once', async () => {
        const piRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Idem Vendor',
            date: '2026-03-01',
            grandTotal: 400,
            paidAmount: 0,
            items: [{ code: itemCodeB, name: 'Idem Item B', qty: 4, rate: 100 }]
        });
        assert.strictEqual(piRes.status, 200);
        const invoiceId = piRes.data.id;

        const testKey = `idem_vpmt_conc_${suffix}_${Date.now()}`;

        const tasks = Array.from({ length: 4 }, () => apiReq('/vendor-payments/create', 'POST', {
            vendorId,
            amount: 100,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 100, discountAmount: 0 }]
        }, { 'Idempotency-Key': testKey }));

        const results = await Promise.all(tasks);
        const successful = results.filter(r => r.status === 200);
        assert(successful.length >= 1);

        const firstPaymentId = successful[0].data.paymentId;
        for (const res of successful) {
            assert.strictEqual(res.data.paymentId, firstPaymentId);
        }

        const piCheck = await client.query(`SELECT pending_to_pay FROM purchase_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(piCheck.rows[0].pending_to_pay), 300);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. CROSS-ENDPOINT INDEPENDENCE & DISTINCT KEYS
    // ──────────────────────────────────────────────────────────────────────────

    test('5.1 Same idempotency key used across different endpoints is treated independently', async () => {
        const sharedKey = `shared_idem_${suffix}_${Date.now()}`;

        // Create sale invoice for receipt test
        const sRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Idem Customer',
            date: '2026-03-01',
            grandTotal: 200,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Idem Item A', qty: 2, rate: 100 }]
        });
        const sInvId = sRes.data.id;

        // Create purchase invoice for payment test
        const pRes = await apiReq('/purchases/create', 'POST', {
            vendorId,
            vendorName: 'Idem Vendor',
            date: '2026-03-01',
            grandTotal: 200,
            paidAmount: 0,
            items: [{ code: itemCodeB, name: 'Idem Item B', qty: 2, rate: 100 }]
        });
        assert.strictEqual(pRes.status, 200);
        const pInvId = pRes.data.id;

        // Use sharedKey on /api/receipts/create
        const rRes = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 50,
            date: '2026-03-01',
            allocations: [{ invoiceId: sInvId, allocatedAmount: 50, discountAmount: 0 }]
        }, { 'Idempotency-Key': sharedKey });
        assert.strictEqual(rRes.status, 200);

        // Use EXACT SAME sharedKey on /api/vendor-payments/create
        const pmtRes = await apiReq('/vendor-payments/create', 'POST', {
            vendorId,
            amount: 50,
            date: '2026-03-01',
            allocations: [{ invoiceId: pInvId, allocatedAmount: 50, discountAmount: 0 }]
        }, { 'Idempotency-Key': sharedKey });
        assert.strictEqual(pmtRes.status, 200);

        // Both endpoints must succeed because PRIMARY KEY is (endpoint, key)
        assert(rRes.data.receiptId);
        assert(pmtRes.data.paymentId);
        assert.notStrictEqual(rRes.data.receiptId, pmtRes.data.paymentId);
    });

    test('5.2 Genuinely different transactions with distinct keys both succeed', async () => {
        const invRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Idem Customer',
            date: '2026-03-01',
            grandTotal: 300,
            receivedAmount: 0,
            items: [{ code: itemCodeA, name: 'Idem Item A', qty: 3, rate: 100 }]
        });
        const invoiceId = invRes.data.id;

        const key1 = `key_1_${suffix}_${Date.now()}`;
        const key2 = `key_2_${suffix}_${Date.now()}`;

        const res1 = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 100,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 100, discountAmount: 0 }]
        }, { 'Idempotency-Key': key1 });

        const res2 = await apiReq('/receipts/create', 'POST', {
            customerId,
            amount: 100,
            date: '2026-03-01',
            allocations: [{ invoiceId, allocatedAmount: 100, discountAmount: 0 }]
        }, { 'Idempotency-Key': key2 });

        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res2.status, 200);
        assert.notStrictEqual(res1.data.receiptId, res2.data.receiptId);

        // Invoice pending = 100, paid = 200
        const invCheck = await client.query(`SELECT pending_to_receive, paid_amount FROM sales_invoices WHERE id = $1`, [invoiceId]);
        assert.strictEqual(parseFloat(invCheck.rows[0].pending_to_receive), 100);
        assert.strictEqual(parseFloat(invCheck.rows[0].paid_amount), 200);
    });
});
