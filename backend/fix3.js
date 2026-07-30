const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/\\\\n        `\\);\\\\n        const res = await pool\\.query/g, "\\n        `);\\n        const res = await pool.query");

fs.writeFileSync('server.js', code);
console.log('Fixed token error');
