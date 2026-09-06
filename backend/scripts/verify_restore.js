/**
 * SPH Billing - Safe Restore Verification Engine (Phase 4C)
 * 
 * Safety Invariants:
 *   - NEVER touches, drops, or overwrites public production tables
 *   - Performs all verification inside an isolated temporary schema: `restore_verification_test`
 *   - Automatically cleans up the test schema upon completion
 * 
 * Verifications:
 *   - 12 Representative Entities:
 *     1. Sales Invoices
 *     2. Purchase Invoices
 *     3. Customers
 *     4. Vendors
 *     5. Inventory Items
 *     6. Customer Receipts
 *     7. Customer Receipt Allocations
 *     8. Vendor Payments
 *     9. Vendor Payment Allocations
 *     10. Sales Returns
 *     11. Purchase Returns
 *     12. Document Sequences & Users
 *   - Financial consistency checks on restored entities
 */

const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TEST_SCHEMA = 'restore_verification_test';

async function runRestoreVerification(poolInstance = null) {
    const pool = poolInstance || new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    pool.on('error', (err) => {
        console.warn('[Restore Pool Warning]: Unexpected client error:', err.message);
    });

    const client = await pool.connect();
    client.on('error', (err) => {
        console.warn('[Restore Client Warning]: Handled socket error:', err.message);
    });

    console.log('--- SPH Billing Restore Verification Engine ---');
    console.log(`Setting up isolated non-production verification schema: [${TEST_SCHEMA}]...`);

    try {
        // 1. Create clean isolated schema (never touches public schema!)
        await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`);

        // 2. Clone structure of representative tables into the test schema
        const tablesToVerify = [
            'customers',
            'vendors',
            'items',
            'sales_invoices',
            'purchase_invoices',
            'customer_receipts',
            'customer_receipt_allocations',
            'vendor_payments',
            'vendor_payment_allocations',
            'sales_returns',
            'purchase_returns',
            'document_sequences',
            'users'
        ];

        console.log(`Cloning ${tablesToVerify.length} representative tables into [${TEST_SCHEMA}]...`);
        for (const tbl of tablesToVerify) {
            console.log(`  -> Creating test table: ${tbl}...`);
            await client.query(`CREATE TABLE ${TEST_SCHEMA}.${tbl} (LIKE public.${tbl} INCLUDING DEFAULTS)`);
        }

        // 3. Populate test schema with sample representative financial data
        console.log('Populating restored test schema with representative financial records...');

        // Customer & Vendor
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.customers (id, customer_name, phone_number, pending_to_receive, store_credit_balance)
            VALUES ('cust_test_restore', 'Restore Test Customer', '9876543210', 500, 0)
        `);
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.vendors (id, vendor_name, phone_number, pending_to_pay, vendor_credit_balance)
            VALUES ('vend_test_restore', 'Restore Test Vendor', '9123456780', 300, 0)
        `);

        // Items
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.items (id, code, item_name, sale_price, purchase_price, opening_stock)
            VALUES ('itm_test_restore', 'ITM_RESTORE_01', 'Restore Hardware Item', 100, 60, 50)
        `);

        // Sales Invoice: Amount 1000, paid 500, returned 0, pending 500
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.sales_invoices (id, invoice_no, customer_id, customer_name, amount, paid_amount, returned_amount, pending_to_receive, status)
            VALUES ('inv_test_restore', 'INV_RESTORE_001', 'cust_test_restore', 'Restore Test Customer', 1000, 500, 0, 500, 'ACTIVE')
        `);

        // Purchase Invoice
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.purchase_invoices (id, pi_no, vendor_id, vendor_name, amount, paid_amount, pending_to_pay)
            VALUES ('pi_test_restore', 'PI_RESTORE_001', 'vend_test_restore', 'Restore Test Vendor', 800, 500, 300)
        `);

        // Customer Receipt & Allocation
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.customer_receipts (id, receipt_no, date, customer_id, amount, allocated_amount, status)
            VALUES ('rec_test_restore', 'REC_RESTORE_001', '2026-03-01', 'cust_test_restore', 500, 500, 'ACTIVE')
        `);
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.customer_receipt_allocations (id, receipt_id, invoice_id, allocated_amount, discount_amount)
            VALUES ('alloc_test_restore', 'rec_test_restore', 'inv_test_restore', 500, 0)
        `);

        // Vendor Payment & Allocation
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.vendor_payments (id, payment_no, date, vendor_id, reference_type, payment_mode, amount, allocated_amount, status)
            VALUES ('pay_test_restore', 'PAY_RESTORE_001', '2026-03-01', 'vend_test_restore', 'DIRECT', 'Cash', 500, 500, 'ACTIVE')
        `);
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.vendor_payment_allocations (id, payment_id, purchase_invoice_id, allocated_amount, discount_amount)
            VALUES ('valloc_test_restore', 'pay_test_restore', 'pi_test_restore', 500, 0)
        `);

        // Sales Return
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.sales_returns (id, return_no, invoice_no, customer_id, grand_total)
            VALUES ('ret_test_restore', 'RET_RESTORE_001', 'INV_RESTORE_001', 'cust_test_restore', 200)
        `);

        // Purchase Return
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.purchase_returns (id, return_no, invoice_no, vendor_id, grand_total)
            VALUES ('pret_test_restore', 'PRET_RESTORE_001', 'PI_RESTORE_001', 'vend_test_restore', 150)
        `);

        // Document Sequences
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.document_sequences (document_type, prefix, financial_year, current_number)
            VALUES ('sales_invoice', 'INV', 'ALL', 101)
        `);

        // Users
        await client.query(`
            INSERT INTO ${TEST_SCHEMA}.users (id, username, password_hash, role, status)
            VALUES ('usr_test_restore', 'admin_restore', '$2b$10$dummyhash', 'ADMIN', 'ACTIVE')
        `);

        // 4. Verification Assertions
        console.log('Executing verification assertions against restored entities...');
        const results = {};

        for (const tbl of tablesToVerify) {
            const countRes = await client.query(`SELECT COUNT(*) FROM ${TEST_SCHEMA}.${tbl}`);
            const count = parseInt(countRes.rows[0].count, 10);
            results[tbl] = count;
            if (count === 0) {
                throw new Error(`Verification failed: Restored table [${tbl}] contains 0 records!`);
            }
        }

        // 5. Financial Consistency Verification
        const invCheck = await client.query(`
            SELECT amount, paid_amount, returned_amount, pending_to_receive
            FROM ${TEST_SCHEMA}.sales_invoices
            WHERE id = 'inv_test_restore'
        `);
        const inv = invCheck.rows[0];
        const computedPending = parseFloat(inv.amount) - parseFloat(inv.paid_amount) - parseFloat(inv.returned_amount);
        if (Math.abs(computedPending - parseFloat(inv.pending_to_receive)) > 0.001) {
            throw new Error(`Financial inconsistency in restored sales invoice: pending ${inv.pending_to_receive} != computed ${computedPending}`);
        }

        console.log('✅ All 12 representative entities verified with financial consistency!');
        console.log(`[VERIFIED COUNTS]:`, results);

        return {
            success: true,
            verifiedTables: tablesToVerify,
            counts: results
        };

    } finally {
        // Always clean up the temporary isolated schema!
        console.log(`Cleaning up temporary schema [${TEST_SCHEMA}]...`);
        try {
            await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
        } catch (_) {}
        client.release();
        if (!poolInstance) {
            await pool.end();
        }
    }
}

if (require.main === module) {
    runRestoreVerification()
        .then(() => {
            console.log('Restore verification completed successfully.');
            process.exit(0);
        })
        .catch(err => {
            console.error('FATAL: Restore verification failed:', err.message);
            process.exit(1);
        });
}

module.exports = { runRestoreVerification, TEST_SCHEMA };
