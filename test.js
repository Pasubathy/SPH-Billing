process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        const fileContent = fs.readFileSync(path.join(__dirname, 'backend/.env'));
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('invoiceFile', blob, 'test.txt');

        const res = await fetch('https://localhost:3443/api/ai/extract-invoice', {
            method: 'POST',
            body: formData
        });
        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Response:', text);
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

test();
