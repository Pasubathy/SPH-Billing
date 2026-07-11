const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("DELETE FROM customers WHERE customer_name = 'Unknown Customer' OR customer_name = ''").then(r => {
    console.log('Deleted bad customers:', r.rowCount);
}).catch(console.error).finally(()=>pool.end());
