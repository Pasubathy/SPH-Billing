const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const startMarker = '-- Phase 3 Database Migrations';
const endMarker = 'CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);';

const startIdx = code.indexOf(startMarker);
const endIdx = code.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    code = code.substring(0, startIdx) + code.substring(endIdx + endMarker.length);
    fs.writeFileSync('server.js', code);
    console.log('Removed broken Phase 3 block');
} else {
    console.log('Markers not found');
}
