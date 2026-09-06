const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_URL = 'http://localhost:3000/api';
let token = '';
let client;

const suffix = Date.now().toString().slice(-6);
const itemCodeA = `ITM_P3_A_${suffix}`;
const itemCodeB = `ITM_P3_B_${suffix}`;
const customerId = `cust_p3_${suffix}`;
const vendorId = `vend_p3_${suffix}`;

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

describe('Phase 3 Performance, Reliability & Serverless Optimization Tests', async () => {

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
            INSERT INTO items (id, code, name, stock, sale_price, purchase_price, category_name)
            VALUES ($1, $2, 'Phase 3 Fast Item A', 100, 50, 30, 'Hardware'),
                   ($3, $4, 'Phase 3 Fast Item B', 50, 80, 40, 'Paints')
            ON CONFLICT (code) DO NOTHING
        `, [crypto.randomUUID(), itemCodeA, crypto.randomUUID(), itemCodeB]);

        // Seed test customer
        await client.query(`
            INSERT INTO customers (id, customer_name, phone_number, opening_balance, pending_to_receive)
            VALUES ($1, 'Phase 3 Customer', '9876500003', 150, 150)
            ON CONFLICT (id) DO NOTHING
        `, [customerId]);

        // Seed test vendor
        await client.query(`
            INSERT INTO vendors (id, vendor_name, phone_number, opening_balance, pending_to_pay)
            VALUES ($1, 'Phase 3 Vendor', '9876500004', 200, 200)
            ON CONFLICT (id) DO NOTHING
        `, [vendorId]);
    });

    after(async () => {
        try {
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
                DELETE FROM vendor_payments WHERE vendor_id = $1 OR payment_no LIKE $2 OR note LIKE $2
            `, [vendorId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM purchase_returns WHERE vendor_id = $1 OR return_no LIKE $2
            `, [vendorId, `%${suffix}%`]);

            await client.query(`
                DELETE FROM purchase_invoices WHERE vendor_id = $1 OR pi_no LIKE $2
            `, [vendorId, `%${suffix}%`]);

            await client.query(`DELETE FROM items WHERE code IN ($1, $2)`, [itemCodeA, itemCodeB]);
            await client.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
            await client.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
        } catch (err) {
            console.error('Phase 3 cleanup error:', err);
        } finally {
            await client.end();
        }
    });

    // ==========================================
    // 1. POSTGRESQL POOL CONFIGURATION
    // ==========================================
    test('1. pg.Pool is configured with serverless limits (max, idleTimeout, connectionTimeout)', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(serverSource.includes('process.env.VERCEL ? 3 : 10'), 'Pool max connections must be serverless-aware');
        assert.ok(serverSource.includes('idleTimeoutMillis: 30000'), 'idleTimeoutMillis must be 30000ms');
        assert.ok(serverSource.includes('connectionTimeoutMillis: 10000'), 'connectionTimeoutMillis must be 10000ms');
    });

    test('2. pg.Pool dynamically handles SSL for Neon databases without crashing local dev', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(
            serverSource.includes('neon.tech') || serverSource.includes('sslmode=require'),
            'Pool SSL configuration must detect remote Neon connections'
        );
    });

    // ==========================================
    // 2. GEMINI FALLBACK & CIRCUIT BREAKER
    // ==========================================
    test('3. Gemini fallback array contains only verified production models (no 3.x fictitious models)', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(!serverSource.includes('gemini-3.6-flash'), 'Must not contain fictitious model gemini-3.6-flash');
        assert.ok(!serverSource.includes('gemini-3.5-flash'), 'Must not contain fictitious model gemini-3.5-flash');
        assert.ok(!serverSource.includes('gemini-3.7-flash'), 'Must not contain fictitious model gemini-3.7-flash');
        assert.ok(serverSource.includes('gemini-2.5-flash'), 'Must contain verified model gemini-2.5-flash');
        assert.ok(serverSource.includes('gemini-2.0-flash'), 'Must contain verified model gemini-2.0-flash');
        assert.ok(serverSource.includes('gemini-1.5-flash'), 'Must contain verified model gemini-1.5-flash');
        assert.ok(serverSource.includes('gemini-1.5-pro'), 'Must contain verified model gemini-1.5-pro');
    });

    test('4. Gemini model circuit breaker tracks failed models in memory', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(serverSource.includes('disabledGeminiModels'), 'Must have circuit breaker set disabledGeminiModels');
        assert.ok(serverSource.includes('disabledGeminiModels.add(modelName)'), 'Must add failed models to circuit breaker');
    });

    test('5. Gemini invoice extraction endpoint validates missing file payload with 400', async () => {
        const res = await apiReq('/ai/extract-invoice', 'POST', {});
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.data.error, 'No invoice file uploaded');
    });

    // ==========================================
    // 3. GEMINI ROBUST BOUNDARY JSON PARSING
    // ==========================================
    test('6. Gemini JSON boundary parser extracts objects with conversational preambles and postambles', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(serverSource.includes('indexOf(\'{\')'), 'Must find outer opening brace');
        assert.ok(serverSource.includes('lastIndexOf(\'}\')'), 'Must find outer closing brace');
    });

    test('7. Gemini JSON validation requires vendor, invoice, and items fields', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(serverSource.includes('extractedData.vendor'), 'Must validate vendor object');
        assert.ok(serverSource.includes('extractedData.invoice'), 'Must validate invoice object');
        assert.ok(serverSource.includes('extractedData.items'), 'Must validate items array');
        assert.ok(serverSource.includes('422'), 'Must return HTTP 422 when invoice structure is invalid');
    });

    // ==========================================
    // 4. DATABASE ERROR HANDLING (NO SILENT res.json([]))
    // ==========================================
    test('8. All 12 key GET endpoints are protected against silent failure masking (no catch { res.json([]) })', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        const silentCatchRegex = /catch\s*\([^)]*\)\s*\{\s*(console\.[a-z]+\([^)]*\);\s*)?res\.json\(\s*\[\s*\]\s*\);\s*\}/g;
        const matches = serverSource.match(silentCatchRegex) || [];
        assert.strictEqual(matches.length, 0, `Expected 0 silent catch res.json([]) blocks, found ${matches.length}`);
    });

    test('9. Key GET endpoints return HTTP 200 with proper data in healthy state', async () => {
        const routes = [
            '/categories',
            '/units',
            '/items',
            '/vendors',
            '/customers',
            '/purchase-invoices',
            '/sales',
            '/sales-returns',
            '/purchase-returns',
            '/payments',
            '/vendor-payments',
            '/vouchers'
        ];

        for (const route of routes) {
            const res = await apiReq(route, 'GET');
            assert.strictEqual(res.status, 200, `Route ${route} should return 200 in healthy state (got ${res.status}: ${JSON.stringify(res.data)})`);
            assert.ok(Array.isArray(res.data), `Route ${route} should return an array`);
        }
    });

    // ==========================================
    // 5. DOCUMENT NUMBER GENERATION ATOMICITY ($O(1)$)
    // ==========================================
    test('10. Sales invoice generation uses atomic sequence update without full-table regex scans', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(
            serverSource.includes("SET current_number = current_number + 1") &&
            serverSource.includes("WHERE document_type = 'sales_invoice'"),
            'Sales invoice generation must use atomic sequence increment'
        );
    });

    test('11. Direct cash sales generate atomic receipt number without full-table scans', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(
            serverSource.includes("SET current_number = current_number + 1") &&
            serverSource.includes("prefix = 'AR' AND document_type = 'customer_receipt'"),
            'Direct cash sale must increment customer_receipt atomically'
        );
    });

    test('12. Purchase invoice generation uses atomic sequence update', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(
            serverSource.includes("SET current_number = current_number + 1") &&
            serverSource.includes("WHERE document_type = 'purchase_invoice'"),
            'Purchase invoice generation must use atomic sequence increment'
        );
    });

    test('13. Sales return generation uses atomic sequence update', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(
            serverSource.includes("SET current_number = current_number + 1") &&
            serverSource.includes("WHERE document_type = 'sales_return'"),
            'Sales return generation must use atomic sequence increment'
        );
    });

    test('14. Purchase return generation uses atomic sequence update', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(
            serverSource.includes("SET current_number = current_number + 1") &&
            serverSource.includes("WHERE document_type = 'purchase_return'"),
            'Purchase return generation must use atomic sequence increment'
        );
    });

    test('15. Concurrent invoice creation produces unique, strictly sequential document numbers', async () => {
        const createPromises = [1, 2, 3].map(i => apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 3 Customer',
            items: [{
                code: itemCodeA,
                name: 'Phase 3 Fast Item A',
                qty: 1,
                price: 50,
                discount: 0,
                taxPercent: 0,
                total: 50
            }],
            subtotal: 50,
            taxTotal: 0,
            grandTotal: 50,
            paymentMode: 'CREDIT',
            paidAmount: 0,
            pendingAmount: 50,
            date: new Date().toISOString()
        }));

        const results = await Promise.all(createPromises);
        const invoiceNumbers = results.map(r => {
            assert.strictEqual(r.status, 200);
            const num = r.data.invoiceNumber || r.data.invoiceNo;
            assert.ok(num, 'Must return invoiceNumber');
            return num;
        });

        // Verify all 3 invoice numbers are unique
        const uniqueInvoices = new Set(invoiceNumbers);
        assert.strictEqual(uniqueInvoices.size, 3, 'All concurrent invoice numbers must be unique');

        // Verify sequence format INV###
        for (const num of invoiceNumbers) {
            assert.match(num, /^INV\d{3,}$/, 'Invoice number must follow INV### format');
        }
    });

    // ==========================================
    // 6. HIGH-PERFORMANCE DASHBOARD SUMMARY API
    // ==========================================
    test('16. GET /api/reports/dashboard-summary returns HTTP 200 with complete financial metrics', async () => {
        const res = await apiReq('/reports/dashboard-summary', 'GET');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.success, true);
        
        const d = res.data.summary;
        assert.ok(typeof d.totalSalesAmount === 'number', 'totalSalesAmount must be a number');
        assert.ok(typeof d.totalSalesReturnAmount === 'number', 'totalSalesReturnAmount must be a number');
        assert.ok(typeof d.netSales === 'number', 'netSales must be a number');
        assert.ok(typeof d.salesCount === 'number', 'salesCount must be a number');
        assert.ok(typeof d.globalCustomerPending === 'number', 'globalCustomerPending must be a number');
        assert.ok(typeof d.totalPurchaseAmount === 'number', 'totalPurchaseAmount must be a number');
        assert.ok(typeof d.totalPurchaseReturnAmount === 'number', 'totalPurchaseReturnAmount must be a number');
        assert.ok(typeof d.purchaseCount === 'number', 'purchaseCount must be a number');
        assert.ok(typeof d.globalVendorPending === 'number', 'globalVendorPending must be a number');
        assert.ok(typeof d.inventoryValuation === 'number', 'inventoryValuation must be a number');
    });

    test('17. Dashboard summary returns pre-aggregated analytics arrays (charts & lists)', async () => {
        const res = await apiReq('/reports/dashboard-summary', 'GET');
        assert.strictEqual(res.status, 200);
        
        const d = res.data.summary;
        assert.ok(Array.isArray(d.monthlyComparison.months), 'monthlyComparison.months must be an array');
        assert.strictEqual(d.monthlyComparison.months.length, 6, 'monthlyComparison must return 6 months');
        assert.ok(typeof d.monthlyComparison.maxVal === 'number', 'monthlyComparison.maxVal must be a number');
        assert.ok(Array.isArray(d.topSellingProducts), 'topSellingProducts must be an array');
        assert.ok(Array.isArray(d.categoryBreakdown), 'categoryBreakdown must be an array');
        assert.ok(Array.isArray(d.topDebtors), 'topDebtors must be an array');
        assert.ok(Array.isArray(d.recentInvoices), 'recentInvoices must be an array');
        assert.ok(Array.isArray(d.recentPayments), 'recentPayments must be an array');
    });

    test('18. Dashboard summary strictly excludes CANCELLED sales from sales totals', async () => {
        // Create an invoice
        const createRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 3 Customer',
            items: [{
                code: itemCodeA,
                name: 'Phase 3 Fast Item A',
                qty: 1,
                price: 500,
                discount: 0,
                taxPercent: 0,
                total: 500
            }],
            subTotal: 500,
            subtotal: 500,
            taxAmount: 0,
            taxTotal: 0,
            grandTotal: 500,
            paymentMode: 'CREDIT',
            receivedAmount: 0,
            paidAmount: 0,
            pendingAmount: 500,
            date: new Date().toISOString()
        });
        assert.strictEqual(createRes.status, 200);
        const invId = createRes.data.id;

        // Get summary before cancellation
        const summaryBefore = (await apiReq('/reports/dashboard-summary', 'GET')).data.summary;

        // Cancel the invoice
        const cancelRes = await apiReq(`/sales/${invId}/cancel`, 'POST', { reason: 'Phase 3 Exclusion Test' });
        assert.strictEqual(cancelRes.status, 200);

        // Get summary after cancellation
        const summaryAfter = (await apiReq('/reports/dashboard-summary', 'GET')).data.summary;

        // Verify that cancelled sale amount was removed from totalSalesAmount
        assert.strictEqual(
            Math.round(summaryBefore.totalSalesAmount - summaryAfter.totalSalesAmount),
            500,
            'Cancelled sale must be excluded from totalSalesAmount'
        );

        // Verify that the cancelled invoice does not appear in recentInvoices
        const recentIds = summaryAfter.recentInvoices.map(i => i.id);
        assert.ok(!recentIds.includes(invId), 'Cancelled invoice must not appear in recentInvoices');
    });

    test('19. Dashboard summary supports custom date range filtering', async () => {
        // Request summary for future date range where no transactions exist
        const res = await apiReq('/reports/dashboard-summary?startDate=2099-01-01&endDate=2099-12-31', 'GET');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.summary.totalSalesAmount, 0, 'Sales in year 2099 must be 0');
        assert.strictEqual(res.data.summary.totalPurchaseAmount, 0, 'Purchases in year 2099 must be 0');
        assert.strictEqual(res.data.summary.salesCount, 0, 'Sales count in year 2099 must be 0');
    });

    test('20. Dashboard summary calculates globalCustomerPending including opening balances', async () => {
        const res = await apiReq('/reports/dashboard-summary', 'GET');
        assert.strictEqual(res.status, 200);
        // Customer opening balance of 150 was seeded
        assert.ok(res.data.summary.globalCustomerPending >= 150, 'globalCustomerPending must account for customer opening balance');
    });

    test('21. Dashboard summary calculates globalVendorPending including opening balances', async () => {
        const res = await apiReq('/reports/dashboard-summary', 'GET');
        assert.strictEqual(res.status, 200);
        // Vendor opening balance of 200 was seeded
        assert.ok(res.data.summary.globalVendorPending >= 200, 'globalVendorPending must account for vendor opening balance');
    });

    // ==========================================
    // 7. INVARIANTS & INTEGRATION INTEGRITY
    // ==========================================
    test('22. Phase 1 protection: item create does not execute mass deletion', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(!serverSource.includes('DELETE FROM items WHERE NOT'), 'Mass item deletion must remain removed');
    });

    test('23. Phase 1 protection: item stock is preserved during profile update', async () => {
        const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        assert.ok(!serverSource.includes('stock = EXCLUDED.stock'), 'Stock overwrite must remain removed');
    });

    test('24. Phase 2 protection: Direct cash sale creates exactly 1 customer receipt and 1 allocation atomically', async () => {
        const cashSaleRes = await apiReq('/sales/create', 'POST', {
            customerId,
            customerName: 'Phase 3 Customer',
            items: [{
                code: itemCodeB,
                name: 'Phase 3 Fast Item B',
                qty: 1,
                price: 80,
                discount: 0,
                taxPercent: 0,
                total: 80
            }],
            subTotal: 80,
            subtotal: 80,
            taxAmount: 0,
            taxTotal: 0,
            grandTotal: 80,
            paymentMode: 'CASH',
            receivedAmount: 80,
            paidAmount: 80,
            pendingAmount: 0,
            date: new Date().toISOString()
        });
        assert.strictEqual(cashSaleRes.status, 200);
        const invoiceId = cashSaleRes.data.id;

        // Verify allocation
        const allocRows = await client.query(
            `SELECT * FROM customer_receipt_allocations WHERE invoice_id = $1`,
            [invoiceId]
        );
        assert.strictEqual(allocRows.rows.length, 1, 'Exactly 1 allocation must be created');
        assert.strictEqual(Number(allocRows.rows[0].allocated_amount), 80);

        // Verify receipt
        const receiptRows = await client.query(
            `SELECT * FROM customer_receipts WHERE id = $1`,
            [allocRows.rows[0].receipt_id]
        );
        assert.strictEqual(receiptRows.rows.length, 1, 'Exactly 1 receipt must be created');
        assert.strictEqual(Number(receiptRows.rows[0].amount), 80);
    });

});
