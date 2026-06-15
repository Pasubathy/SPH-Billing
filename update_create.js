const fs = require('fs');
let code = fs.readFileSync('frontend/js/create-item.js', 'utf8');

// Replace the event listener
code = code.replace(
    /document\.getElementById\('printTagBtn'\)\.addEventListener\('click',\s*openPrintTagModal\);/,
    `document.getElementById('printTagBtn').addEventListener('click', () => {
        const code = document.getElementById('itemCode').value.trim();
        const name = document.getElementById('itemName').value.trim();
        const unitSelect = document.getElementById('purchaseUnit');
        const unit = unitSelect.options[unitSelect.selectedIndex]?.text.match(/\\(([^)]+)\\)/)?.[1] || unitSelect.value || 'Unit';
        const price = document.getElementById('sellingAmount').value.trim();
        const displayPrice = \`₹\${parseFloat(price).toFixed(2)}/\${unit}\`;
        
        const qrCanvas = document.querySelector('#tagQRCode canvas');
        const qrImg = document.querySelector('#tagQRCode img');
        const qrDataUrl = qrCanvas ? qrCanvas.toDataURL() : (qrImg ? qrImg.src : '');

        openPrintTagModal({ code, name, displayPrice, qrDataUrl });
    });`
);

// Remove the function definitions
const startStr = '// Open modal for printing tags';
const endStr = '// Show/hide conversions grid based on whether rows exist';
const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + code.substring(endIndex);
}

fs.writeFileSync('frontend/js/create-item.js', code);
