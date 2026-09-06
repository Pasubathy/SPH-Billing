const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function applyPhase4a() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    await client.connect();
    console.log('Connected to PostgreSQL database.');

    try {
        const sql = fs.readFileSync(path.join(__dirname, 'phase4a_migration.sql'), 'utf8');
        console.log('Executing Phase 4A migration...');
        await client.query(sql);
        console.log('Phase 4A migration applied successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

applyPhase4a();
