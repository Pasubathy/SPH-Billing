const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

async function validate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    
    await client.connect();
    
    const queries = [
        { name: "Duplicate Sales Invoices", sql: "SELECT invoice_no, COUNT(*) FROM sales_invoices GROUP BY invoice_no HAVING COUNT(*) > 1;" },
        { name: "Duplicate Purchase Invoices", sql: "SELECT pi_no, COUNT(*) FROM purchase_invoices GROUP BY pi_no HAVING COUNT(*) > 1;" },
        { name: "Orphan Customer Receipt Allocations", sql: "SELECT * FROM customer_receipt_allocations WHERE invoice_id NOT IN (SELECT id FROM sales_invoices);" },
        { name: "Orphan Vendor Payment Allocations", sql: "SELECT * FROM vendor_payment_allocations WHERE purchase_invoice_id NOT IN (SELECT id FROM purchase_invoices);" },
        { name: "Orphan Sales Returns", sql: "SELECT * FROM sales_returns WHERE invoice_no IS NOT NULL AND invoice_no NOT IN (SELECT invoice_no FROM sales_invoices);" },
        { name: "Orphan Purchase Returns", sql: "SELECT * FROM purchase_returns WHERE pi_no IS NOT NULL AND pi_no NOT IN (SELECT pi_no FROM purchase_invoices);" },
        { name: "Invalid Sales Invoice Customer FK", sql: "SELECT * FROM sales_invoices WHERE customer_id NOT IN (SELECT id FROM customers) AND customer_id IS NOT NULL;" },
        { name: "Invalid Purchase Invoice Vendor FK", sql: "SELECT * FROM purchase_invoices WHERE vendor_id NOT IN (SELECT id FROM vendors) AND vendor_id IS NOT NULL;" },
        { name: "Invalid Sales Return Customer FK", sql: "SELECT * FROM sales_returns WHERE customer_id NOT IN (SELECT id FROM customers) AND customer_id IS NOT NULL;" },
        { name: "Invalid Purchase Return Vendor FK", sql: "SELECT * FROM purchase_returns WHERE vendor_id NOT IN (SELECT id FROM vendors) AND vendor_id IS NOT NULL;" },
        { name: "Negative Stock Items", sql: "SELECT id, name, stock FROM items WHERE stock < 0;" },
        { name: "Negative Sales Invoices Amounts", sql: "SELECT id, amount, pending_to_receive FROM sales_invoices WHERE pending_to_receive < 0 OR amount < 0;" },
        { name: "Negative Purchase Invoices Amounts", sql: "SELECT id, amount, pending_to_pay FROM purchase_invoices WHERE pending_to_pay < 0 OR amount < 0;" },
    ];
    
    let issuesFound = false;
    
    for (const q of queries) {
        try {
            const res = await client.query(q.sql);
            if (res.rows.length > 0) {
                issuesFound = true;
                console.log(`\n❌ [FAIL] ${q.name}: Found ${res.rows.length} violating rows.`);
                console.table(res.rows);
            } else {
                console.log(`✅ [PASS] ${q.name}`);
            }
        } catch (err) {
            console.log(`\n⚠️ [ERROR] ${q.name} execution failed:`, err.message);
        }
    }
    
    if (issuesFound) {
        console.log("\nValidation completed with issues.");
    } else {
        console.log("\nValidation completed successfully. No issues found.");
    }
    
    await client.end();
}

validate().catch(console.error);
