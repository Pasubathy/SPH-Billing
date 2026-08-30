require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function clearDB() {
    const client = await pool.connect();
    try {
        console.log('Connecting to database and starting clear operation...');
        await client.query('BEGIN');

        // Truncate tables
        const tables = [
            'customer_receipt_allocations',
            'customer_receipts',
            'vendor_payment_allocations',
            'vendor_payments',
            'sales_returns',
            'purchase_returns',
            'sales_invoices',
            'purchase_invoices',
            'items',
            'vendors',
            'customers',
            'categories',
            'units',
            'tag_settings'
        ];

        for (const tbl of tables) {
            try {
                await client.query(`TRUNCATE TABLE ${tbl} CASCADE`);
                console.log(`Truncated table: ${tbl}`);
            } catch (e) {
                console.log(`Note: TRUNCATE ${tbl} skipped: ${e.message}`);
            }
        }

        try {
            await client.query(`TRUNCATE TABLE audit_logs CASCADE`);
            console.log('Truncated table: audit_logs');
        } catch (e) {
            // ignore if not exists
        }

        // Reset document sequences
        try {
            await client.query('DELETE FROM document_sequences');
            const defaultSeqs = [
                ['INV', 'sales_invoice', 0],
                ['RET', 'sales_return', 0],
                ['AR', 'customer_receipt', 0],
                ['PI', 'purchase_invoice', 0],
                ['PRET', 'purchase_return', 0],
                ['PMT', 'vendor_payment', 0]
            ];
            for (const [prefix, docType, num] of defaultSeqs) {
                await client.query(
                    'INSERT INTO document_sequences (prefix, document_type, current_number) VALUES ($1, $2, $3)',
                    [prefix, docType, num]
                );
            }
            console.log('Reset all document sequences to 0');
        } catch (e) {
            console.log(`Note: document_sequences reset error: ${e.message}`);
        }

        // Reset JSON store table
        const defaultData = {
            categories: [],
            units: [],
            items: [],
            customers: [],
            sales: [],
            invoice_counter: 1,
            return_counter: 1,
            payments: [],
            payment_counter: 1,
            pret_counter: 1,
            pi_counter: 1,
            vendor_payment_counter: 1,
            tagSettings: {},
            vendors: [],
            purchase_invoices: []
        };

        await client.query('DELETE FROM store');
        await client.query('INSERT INTO store (id, data) VALUES (1, $1)', [defaultData]);
        console.log('Reset store table to initial state');

        await client.query('COMMIT');
        console.log('Database successfully cleared and reset!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to clear database:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

clearDB();
