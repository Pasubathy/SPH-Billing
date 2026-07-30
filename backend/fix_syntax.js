const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace('`);\\n        \\n            -- Phase 3', '\\n            -- Phase 3');

// Wait, the end of Phase 3 schema had:
// `CREATE INDEX ...;\\n        const res = await pool.query('SELECT COUNT(*) FROM store');`
// I need to add `\\n        `);` right before `const res = await pool.query`
code = code.replace("const res = await pool.query('SELECT COUNT(*) FROM store');", "\\n        `);\\n        const res = await pool.query('SELECT COUNT(*) FROM store');");

fs.writeFileSync('server.js', code);
console.log('Fixed syntax error in server.js');
