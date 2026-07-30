const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

async function fix() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    
    await client.connect();
    
    try {
        console.log("Fixing negative stock...");
        await client.query("UPDATE items SET stock = 0 WHERE id = '1784484278590nemc2'");
        
        console.log("Applying chk_item_stock constraint...");
        await client.query("ALTER TABLE items ADD CONSTRAINT chk_item_stock CHECK (stock >= 0)");
        
        console.log("Constraint applied successfully.");
    } catch (e) {
        console.error("Failed:", e);
    } finally {
        await client.end();
    }
}
fix().catch(console.error);
