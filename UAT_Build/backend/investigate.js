const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

async function investigate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    
    await client.connect();
    
    try {
        const itemId = '1784484278590nemc2';
        
        console.log("=== Item Details ===");
        const itemRes = await client.query('SELECT * FROM items WHERE id = $1', [itemId]);
        console.table(itemRes.rows);
        
        console.log("\n=== Sales Invoices involving item ===");
        const salesRes = await client.query(`
            SELECT id, invoice_no, date, status, items 
            FROM sales_invoices 
            WHERE items::text LIKE $1
        `, [`%${itemId}%`]);
        console.table(salesRes.rows.map(r => ({
            id: r.id, invoice_no: r.invoice_no, date: r.date, status: r.status, 
            qty_sold: r.items.find(i => i.id === itemId)?.quantity
        })));
        
        console.log("\n=== Purchase Invoices involving item ===");
        const purRes = await client.query(`
            SELECT id, pi_no, date, status, items 
            FROM purchase_invoices 
            WHERE items::text LIKE $1
        `, [`%${itemId}%`]);
        console.table(purRes.rows.map(r => ({
            id: r.id, pi_no: r.pi_no, date: r.date, status: r.status, 
            qty_bought: r.items.find(i => i.id === itemId)?.quantity
        })));
        
    } catch (e) {
        console.error("Failed:", e);
    } finally {
        await client.end();
    }
}
investigate().catch(console.error);
