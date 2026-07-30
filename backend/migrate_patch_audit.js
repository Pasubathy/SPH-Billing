const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

const patchEndpoints = [
    { startMarker: "app.patch('/api/sales/:id'", tableName: 'sales_invoices', idVar: 'invoiceId', oldDataVar: 'invRes.rows[0]' },
    { startMarker: "app.patch('/api/purchases/:id'", tableName: 'purchase_invoices', idVar: 'invoiceId', oldDataVar: 'invRes.rows[0]' }
];

for (const ep of patchEndpoints) {
    const startIndex = code.indexOf(ep.startMarker);
    if (startIndex === -1) {
        console.error('Could not find endpoint', ep.startMarker);
        continue;
    }
    
    // Insert transaction ID at the beginning of the endpoint body
    const firstLineEnd = code.indexOf('{', startIndex);
    
    // Ensure we don't insert it twice
    let endpointBlockStr = code.substring(startIndex, startIndex + 300);
    if (!endpointBlockStr.includes('transactionId = crypto.randomUUID()')) {
        code = code.slice(0, firstLineEnd + 1) + '\\n    const transactionId = crypto.randomUUID();' + code.slice(firstLineEnd + 1);
    }
    
    let currentStartIndex = code.indexOf(ep.startMarker);
    let nextEndpointIndex = code.indexOf("app.", currentStartIndex + 50);
    if (nextEndpointIndex === -1) nextEndpointIndex = code.length;

    let endpointCode = code.substring(currentStartIndex, nextEndpointIndex);
    
    if (endpointCode.includes('insertAuditLog')) continue; // skip if already injected

    const auditCall = `
            await insertAuditLog(client, {
                tableName: '${ep.tableName}',
                recordId: ${ep.idVar},
                action: 'PATCH',
                oldData: ${ep.oldDataVar},
                newData: result.rows[0],
                req,
                transactionId
            });
            await client.query('COMMIT');`;

    endpointCode = endpointCode.replace("await client.query('COMMIT');", auditCall);
    code = code.substring(0, currentStartIndex) + endpointCode + code.substring(nextEndpointIndex);
}

// Ensure crypto is required if not already (it is already required from previous steps)

fs.writeFileSync('server.js', code.replace(/\\\\n/g, '\\n'));
console.log('Successfully migrated server.js for PATCH endpoints');
