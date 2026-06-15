const fs = require('fs');
let code = fs.readFileSync('frontend/js/script.js', 'utf8');

const additionalCode = `

// --- Global Tag Printing Logic ---
function openPrintTagModal(itemData) {
    let modal = document.getElementById('printTagQtyModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'printTagQtyModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center;';
        
        modal.innerHTML = \`
            <div style="background: white; border-radius: 12px; width: 350px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Print Tags</h3>
                    <button id="closePrintModalBtn" style="background: none; border: none; cursor: pointer; color: var(--text-muted);"><i data-lucide="x" style="width: 20px; height: 20px;"></i></button>
                </div>
                <div style="padding: 20px;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 13px; font-weight: 500; display: block; margin-bottom: 8px;">Number of Copies</label>
                        <input type="number" id="printTagQtyInput" value="1" min="1" max="1000" class="custom-form-input" style="text-align: center; font-size: 16px; font-weight: 600;">
                    </div>
                </div>
                <div style="padding: 16px 20px; background: #F8FAFC; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between;">
                    <button id="cancelPrintModalBtn" class="btn btn-outline" style="height: 36px; padding: 0 20px;">Cancel</button>
                    <button id="confirmPrintModalBtn" class="btn btn-primary" style="height: 36px; padding: 0 32px; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="printer" style="width: 16px; height: 16px;"></i> Print
                    </button>
                </div>
            </div>
        \`;
        document.body.appendChild(modal);
        if (window.lucide) { lucide.createIcons(); }

        document.getElementById('closePrintModalBtn').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('cancelPrintModalBtn').addEventListener('click', () => modal.style.display = 'none');
    }
    
    // Clear old listener
    const confirmBtn = document.getElementById('confirmPrintModalBtn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', () => {
        const qty = parseInt(document.getElementById('printTagQtyInput').value) || 1;
        modal.style.display = 'none';
        executePrintTags(qty, itemData);
    });

    document.getElementById('printTagQtyInput').value = '1';
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('printTagQtyInput').focus(), 100);
}

async function executePrintTags(count, itemData) {
    const { code, name, displayPrice, qrDataUrl } = itemData;

    let s = {};
    try {
        const res = await fetch('/api/settings/tag');
        s = await res.json();
    } catch(e) {
        console.error("Failed to load tag settings", e);
        showToast('Failed to load tag configuration', 'error');
        return;
    }

    if (!s || Object.keys(s).length === 0) {
        showToast('Tag settings not configured properly', 'error');
        return;
    }

    // QR Code specific settings handling
    const showCode = s.showCode !== false;
    const showName = s.showName !== false;
    const showPrice = s.showPrice !== false;
    const showQR = s.showQR !== false;
    const qrSize = s.qrSize || 64;

    let printIframe = document.getElementById('printTagIframe');
    if (!printIframe) {
        printIframe = document.createElement('iframe');
        printIframe.id = 'printTagIframe';
        printIframe.style.cssText = 'position: absolute; width: 0; height: 0; border: none;';
        document.body.appendChild(printIframe);
    }

    const doc = printIframe.contentWindow.document;
    doc.open();
    
    const css = \`
        @page { size: \${s.width}mm \${s.height}mm; margin: 0; }
        body { margin: 0; padding: 0; background: white; font-family: sans-serif; }
        .tag-page { 
            width: \${s.width}mm; 
            height: \${s.height}mm; 
            padding: \${s.marginTop}mm \${s.marginRight}mm \${s.marginBottom}mm \${s.marginLeft}mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            gap: 12px;
            page-break-after: always;
            overflow: hidden;
            background: white;
        }
        .tag-qrcode { display: \${showQR ? 'flex' : 'none'}; width: \${qrSize}px; height: \${qrSize}px; flex-shrink: 0; align-items: center; justify-content: center; }
        .tag-qrcode img { width: 100%; height: 100%; object-fit: contain; }
        .tag-details { display: flex; flex-direction: column; gap: 4px; justify-content: center; flex: 1; overflow: hidden; }
        .tag-code { display: \${showCode ? 'block' : 'none'}; font-size: \${s.codeFontSize}px; font-weight: 400; color: black; white-space: nowrap; }
        .tag-name { display: \${showName ? 'block' : 'none'}; font-size: \${s.nameFontSize}px; font-weight: 400; color: black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tag-price { display: \${showPrice ? 'block' : 'none'}; font-size: \${s.priceFontSize}px; font-weight: 400; color: black; white-space: nowrap; }
    \`;

    let html = '<html><head><style>' + css + '</style></head><body>';
    for (let i = 0; i < count; i++) {
        html += \`
            <div class="tag-page">
                <div class="tag-qrcode">\${qrDataUrl ? '<img src="' + qrDataUrl + '" />' : ''}</div>
                <div class="tag-details">
                    <div class="tag-code">\${code || ''}</div>
                    <div class="tag-name">\${name || ''}</div>
                    <div class="tag-price">\${displayPrice || ''}</div>
                </div>
            </div>
        \`;
    }
    html += '</body></html>';

    doc.write(html);
    doc.close();

    setTimeout(() => {
        printIframe.contentWindow.focus();
        printIframe.contentWindow.print();
    }, 250);
}
`;

if(!code.includes('openPrintTagModal(itemData)')) {
    code += additionalCode;
    fs.writeFileSync('frontend/js/script.js', code);
}
