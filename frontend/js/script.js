// Initialize Lucide icons
lucide.createIcons();

document.addEventListener('DOMContentLoaded', () => {
    setupProfileMenu();

    const togglePasswordBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const loginForm = document.getElementById('loginForm');

    // Toggle Password Visibility
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Toggle the icon
        const icon = togglePasswordBtn.querySelector('i');
        if (type === 'text') {
            icon.setAttribute('data-lucide', 'eye');
        } else {
            icon.setAttribute('data-lucide', 'eye-off');
        }
        
        // Re-initialize this specific icon
        lucide.createIcons({
            icons: {
                Eye: lucide.icons.Eye,
                EyeOff: lucide.icons.EyeOff
            },
            nameAttr: 'data-lucide',
            attrs: {
                class: 'eye-icon'
            }
        });
        
        togglePasswordBtn.innerHTML = type === 'text' ? '<i data-lucide="eye" class="eye-icon"></i>' : '<i data-lucide="eye-off" class="eye-icon"></i>';
        lucide.createIcons();
        });
    }

    // Handle form submission
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        console.log('Login attempt:', { username, password });
        
        // Add loading state to button
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalContent = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i data-lucide="loader-2" class="btn-icon" style="animation: spin 1s linear infinite;"></i> Logging in...';
        lucide.createIcons();
        submitBtn.disabled = true;
        
        // Simulate network request
        setTimeout(() => {
            // Restore button
            submitBtn.innerHTML = originalContent;
            lucide.createIcons();
            submitBtn.disabled = false;
            
            if (username === 'SPH.admin' && password === 'SPH@26') {
                window.location.href = 'items.html';
            } else {
                showToast('Invalid username or password', 'error');
            }
        }, 1500);
        });
    }
});

// Profile Menu Setup
function setupProfileMenu() {
    const profileContainer = document.querySelector('.user-profile');
    if (!profileContainer) return;

    // Update the profile to look like "SPH Admin"
    const nameSpan = profileContainer.querySelector('.user-name');
    if (nameSpan && nameSpan.textContent.trim() === 'SPH') {
        nameSpan.textContent = 'SPH Admin';
    }
    
    // Add custom avatar styling
    const avatar = profileContainer.querySelector('.user-avatar');
    if (avatar) {
        avatar.style.backgroundColor = '#FFD54F';
        avatar.style.color = '#000B58';
        avatar.style.fontWeight = '700';
        avatar.style.fontSize = '11px';
        avatar.innerHTML = 'SPH';
    }

    // Create the dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'profile-dropdown-menu';
    dropdown.innerHTML = `
        <div class="profile-menu-section">
            <button class="profile-menu-item" id="openTagSettingBtn">Tag Setting</button>
            <button class="profile-menu-item">Invoice Setting</button>
        </div>
        <button class="profile-logout-btn" id="logoutBtn">
            <i data-lucide="log-out" style="width: 16px; height: 16px;"></i>
            Logout
        </button>
    `;

    profileContainer.appendChild(dropdown);
    lucide.createIcons();

    // Toggle menu
    profileContainer.addEventListener('click', (e) => {
        if (e.target.closest('.profile-dropdown-menu') && e.target.tagName !== 'BUTTON') {
            return;
        }
        dropdown.classList.toggle('show');
    });

    // Handle Tag Setting Modal
    const openTagSettingBtn = dropdown.querySelector('#openTagSettingBtn');
    if (openTagSettingBtn) {
        openTagSettingBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.remove('show');
            openTagSettingModal();
        });
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!profileContainer.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    // Handle logout
    const logoutBtn = dropdown.querySelector('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'index.html';
        });
    }
}

// Global variable to hold the script content
function openTagSettingModal() {
    let modal = document.getElementById('tagSettingModal');
    if (!modal) {
        // Create modal overlay
        modal = document.createElement('div');
        modal.id = 'tagSettingModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center;';

        if (!document.getElementById('tagSettingModalStyles')) {
            const style = document.createElement('style');
            style.id = 'tagSettingModalStyles';
            style.innerHTML = `
                .tsm-content { width: 900px; max-width: 95%; background: white; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
                .tsm-header { height: 50px; padding: 0 24px; box-sizing: border-box; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
                .tsm-body { display: flex; height: 500px; }
                .tsm-left { width: 350px; border-right: 1px solid var(--border-color); padding: 20px; overflow-y: auto; background: #fff; }
                .tsm-right { flex: 1; background: #E2E8F0; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
                .tsm-group { margin-bottom: 20px; }
                .tsm-group h3 { font-size: 14px; font-weight: 600; margin: 0 0 12px 0; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
                .tsm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                .tsm-input-wrap label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
                .tsm-input-wrap input, .tsm-input-wrap select { width: 100%; height: 32px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 8px; box-sizing: border-box; }
                .tsm-item { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding: 12px 0; }
                .tsm-item:last-child { border-bottom: none; }
                .tsm-item-left { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text-color); }
                .tsm-item-left i { width: 16px; height: 16px; color: #64748B; }
                .tsm-item-left.active i { color: #000B58; }
                .tsm-item-right { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
                .tsm-item-right input { width: 48px; height: 28px; border: 1px solid var(--border-color); border-radius: 4px; padding: 0 4px; text-align: center; box-sizing: border-box; }
                #tsmCanvas { background: white; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.1); box-sizing: border-box; display: flex; flex-direction: row; align-items: center; overflow: hidden; color: black; font-family: sans-serif; justify-content: flex-start; }
                #tsmContentLeft { display: flex; flex-direction: column; overflow: hidden; gap: 4px; justify-content: center; min-width: 0; }
                #tsmCode { font-weight: 400; white-space: nowrap; }
                #tsmName { font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                #tsmPrice { font-weight: 400; white-space: nowrap; }
                #tsmQR { flex-shrink: 0; margin-right: 12px; }
                .tsm-zoom { position: absolute; bottom: 16px; right: 16px; background: white; padding: 6px; border-radius: 8px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .tsm-footer { height: 50px; padding: 0 24px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: #F8FAFC; border-radius: 0 0 12px 12px; box-sizing: border-box; }
                .tsm-btn-cancel { height: 35px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; border: 1px solid #000B58; border-radius: 8px; background: #F8FAFC; color: #000B58; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit; font-size: 14px; box-sizing: border-box; }
                .tsm-btn-cancel:hover { background: #E2E8F0; }
                .tsm-btn-cancel i { width: 20px; height: 20px; }
                .tsm-btn-save { height: 35px; display: flex; align-items: center; justify-content: center; padding: 0 32px; border: none; border-radius: 8px; background: #000B58; color: white; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit; font-size: 14px; box-sizing: border-box; }
                .tsm-btn-save:hover { opacity: 0.9; }
            `;
            document.head.appendChild(style);
        }

        modal.innerHTML = `
            <div class="tsm-content">
                <div class="tsm-header">
                    <h2 style="margin:0; font-size: 18px; font-weight: 600;">Tag Setting</h2>
                    <button id="closeTsmBtn" style="background:none; border:none; cursor:pointer;"><i data-lucide="x"></i></button>
                </div>
                <div class="tsm-body">
                    <div class="tsm-left">
                        <div class="tsm-group">
                            <h3>Label Size (mm)</h3>
                            <div class="tsm-grid-2">
                                <div class="tsm-input-wrap"><label>Width</label><input type="number" id="tsmWidth" value="50"></div>
                                <div class="tsm-input-wrap"><label>Height</label><input type="number" id="tsmHeight" value="30"></div>
                            </div>
                        </div>
                        <div class="tsm-group">
                            <h3>Margins (mm)</h3>
                            <div class="tsm-grid-2">
                                <div class="tsm-input-wrap"><label>Top</label><input type="number" id="tsmMT" value="2" step="0.5"></div>
                                <div class="tsm-input-wrap"><label>Bottom</label><input type="number" id="tsmMB" value="2" step="0.5"></div>
                                <div class="tsm-input-wrap"><label>Left</label><input type="number" id="tsmML" value="2" step="0.5"></div>
                                <div class="tsm-input-wrap"><label>Right</label><input type="number" id="tsmMR" value="2" step="0.5"></div>
                            </div>
                        </div>
                        <div class="tsm-group" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 0 16px;">
                            <h3 style="margin-top: 16px;">Layout</h3>
                            <div class="tsm-input-wrap" style="margin-bottom: 16px;">
                                <label>Alignment</label>
                                <select id="tsmAlign">
                                    <option value="flex-start">Left</option>
                                    <option value="center">Center</option>
                                    <option value="flex-end">Right</option>
                                </select>
                            </div>
                            <h3 style="margin-top: 16px;">Particulars</h3>
                            <div class="tsm-item">
                                <div class="tsm-item-left" id="tsmToggleCode">Item Code</div>
                                <div class="tsm-item-right"><input type="number" id="tsmCodeFS" value="12"> px</div>
                                <input type="checkbox" id="tsmShowCode" checked style="display:none;">
                            </div>
                            <div class="tsm-item">
                                <div class="tsm-item-left" id="tsmToggleName">Item Name</div>
                                <div class="tsm-item-right"><input type="number" id="tsmNameFS" value="14"> px</div>
                                <input type="checkbox" id="tsmShowName" checked style="display:none;">
                            </div>
                            <div class="tsm-item">
                                <div class="tsm-item-left" id="tsmTogglePrice">Selling Price</div>
                                <div class="tsm-item-right"><input type="number" id="tsmPriceFS" value="16"> px</div>
                                <input type="checkbox" id="tsmShowPrice" checked style="display:none;">
                            </div>
                            <div class="tsm-item">
                                <div class="tsm-item-left" id="tsmToggleQR">QR Code</div>
                                <div class="tsm-item-right"><input type="number" id="tsmQRSize" value="64"> px</div>
                                <input type="checkbox" id="tsmShowQR" checked style="display:none;">
                            </div>
                        </div>
                    </div>
                    <div class="tsm-right">
                        <div style="position: absolute; top: 16px; left: 16px; background: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">Live Preview</div>
                        <div id="tsmContainer" style="transform-origin: center; transition: transform 0.2s;">
                            <div id="tsmCanvas">
                                <img id="tsmQR" src="Images/dummy_qr.png" alt="QR Code" style="object-fit: contain;">
                                <div id="tsmContentLeft">
                                    <div id="tsmCode">0001</div>
                                    <div id="tsmName">Item</div>
                                    <div id="tsmPrice">₹180.00/Unit</div>
                                </div>
                            </div>
                        </div>
                        <div class="tsm-zoom">
                            <button id="tsmZoomOut" style="border:none;background:none;cursor:pointer;">-</button>
                            <span id="tsmZoomVal" style="font-size:12px;width:30px;text-align:center;">100%</span>
                            <button id="tsmZoomIn" style="border:none;background:none;cursor:pointer;">+</button>
                        </div>
                    </div>
                </div>
                <div class="tsm-footer">
                    <button id="cancelTsmBtn" class="tsm-btn-cancel"><i data-lucide="x-circle"></i> Cancel</button>
                    <button id="saveTsmBtn" class="tsm-btn-save">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        lucide.createIcons();

        // Modal close
        document.getElementById('closeTsmBtn').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        document.getElementById('cancelTsmBtn').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Setup logic
        const MM_TO_PX = 3.78;
        let zoom = 2; // Default 200% for visibility

        const inputs = ['tsmWidth', 'tsmHeight', 'tsmMT', 'tsmMB', 'tsmML', 'tsmMR', 'tsmCodeFS', 'tsmNameFS', 'tsmPriceFS', 'tsmQRSize', 'tsmAlign'];
        
        // Custom toggle logic for eye icons
        const toggles = [
            { id: 'tsmToggleCode', check: 'tsmShowCode' },
            { id: 'tsmToggleName', check: 'tsmShowName' },
            { id: 'tsmTogglePrice', check: 'tsmShowPrice' },
            { id: 'tsmToggleQR', check: 'tsmShowQR' }
        ];

        toggles.forEach(t => {
            document.getElementById(t.id).addEventListener('click', () => {
                const cb = document.getElementById(t.check);
                cb.checked = !cb.checked;
                const toggleDiv = document.getElementById(t.id);
                if (cb.checked) {
                    toggleDiv.classList.add('active');
                } else {
                    toggleDiv.classList.remove('active');
                }
                updateTsmPreview();
            });
        });

        function updateTsmPreview() {
            const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
            const getCheck = (id) => document.getElementById(id).checked;

            const w = getVal('tsmWidth') * MM_TO_PX;
            const h = getVal('tsmHeight') * MM_TO_PX;
            const mt = getVal('tsmMT') * MM_TO_PX;
            const mb = getVal('tsmMB') * MM_TO_PX;
            const ml = getVal('tsmML') * MM_TO_PX;
            const mr = getVal('tsmMR') * MM_TO_PX;

            const canvas = document.getElementById('tsmCanvas');
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            canvas.style.padding = `${mt}px ${mr}px ${mb}px ${ml}px`;
            canvas.style.justifyContent = document.getElementById('tsmAlign').value || 'flex-start';

            const code = document.getElementById('tsmCode');
            code.style.display = getCheck('tsmShowCode') ? 'block' : 'none';
            code.style.fontSize = getVal('tsmCodeFS') + 'px';

            const name = document.getElementById('tsmName');
            name.style.display = getCheck('tsmShowName') ? 'block' : 'none';
            name.style.fontSize = getVal('tsmNameFS') + 'px';

            const price = document.getElementById('tsmPrice');
            price.style.display = getCheck('tsmShowPrice') ? 'block' : 'none';
            price.style.fontSize = getVal('tsmPriceFS') + 'px';

            const qr = document.getElementById('tsmQR');
            qr.style.display = getCheck('tsmShowQR') ? 'block' : 'none';
            qr.style.width = getVal('tsmQRSize') + 'px';
            qr.style.height = getVal('tsmQRSize') + 'px';

            document.getElementById('tsmContainer').style.transform = `scale(${zoom})`;
            document.getElementById('tsmZoomVal').textContent = Math.round(zoom * 100) + '%';
        }

        inputs.forEach(id => {
            document.getElementById(id).addEventListener('input', updateTsmPreview);
            document.getElementById(id).addEventListener('change', updateTsmPreview);
        });

        document.getElementById('tsmZoomIn').addEventListener('click', () => { if(zoom < 4) { zoom+=0.25; updateTsmPreview(); } });
        document.getElementById('tsmZoomOut').addEventListener('click', () => { if(zoom > 0.5) { zoom-=0.25; updateTsmPreview(); } });

        // Load and Save
        document.getElementById('saveTsmBtn').addEventListener('click', async () => {
            const btn = document.getElementById('saveTsmBtn');
            const original = btn.innerText;
            btn.innerText = 'Saving...';
            btn.disabled = true;

            const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
            const getCheck = (id) => document.getElementById(id).checked;

            const settings = {
                width: getVal('tsmWidth'), height: getVal('tsmHeight'),
                marginTop: getVal('tsmMT'), marginBottom: getVal('tsmMB'), marginLeft: getVal('tsmML'), marginRight: getVal('tsmMR'),
                showCode: getCheck('tsmShowCode'), codeFontSize: getVal('tsmCodeFS'),
                showName: getCheck('tsmShowName'), nameFontSize: getVal('tsmNameFS'),
                showPrice: getCheck('tsmShowPrice'), priceFontSize: getVal('tsmPriceFS'),
                showQR: getCheck('tsmShowQR'), qrSize: getVal('tsmQRSize'),
                align: document.getElementById('tsmAlign').value || 'flex-start'
            };

            try {
                const res = await fetch('/api/settings/tag', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                });
                if (res.ok) {
                    showToast('Tag saved successfully!', 'success');
                    modal.style.display = 'none';
                    if (typeof applyGlobalTagSettings === 'function') {
                        applyGlobalTagSettings();
                    }
                }
            } catch (err) {}
            btn.innerText = original;
            btn.disabled = false;
        });

        // Load initially
        fetch('/api/settings/tag').then(r=>r.json()).then(s => {
            if(s && Object.keys(s).length > 0) {
                const setVal = (id, val) => { if (val !== undefined) document.getElementById(id).value = val; };
                const setCheck = (id, val) => { if (val !== undefined) document.getElementById(id).checked = val; };
                
                setVal('tsmWidth', s.width); setVal('tsmHeight', s.height);
                setVal('tsmMT', s.marginTop); setVal('tsmMB', s.marginBottom); setVal('tsmML', s.marginLeft); setVal('tsmMR', s.marginRight);
                setCheck('tsmShowCode', s.showCode); setVal('tsmCodeFS', s.codeFontSize);
                setCheck('tsmShowName', s.showName); setVal('tsmNameFS', s.nameFontSize);
                setCheck('tsmShowPrice', s.showPrice); setVal('tsmPriceFS', s.priceFontSize);
                if(s.showQR !== undefined) setCheck('tsmShowQR', s.showQR); else setCheck('tsmShowQR', true);
                if(s.qrSize !== undefined) setVal('tsmQRSize', s.qrSize); else setVal('tsmQRSize', 64);
                if(s.align !== undefined) setVal('tsmAlign', s.align); else setVal('tsmAlign', 'flex-start');

                // Update UI toggles visually
                toggles.forEach(t => {
                    const cb = document.getElementById(t.check);
                    const toggleDiv = document.getElementById(t.id);
                    if (cb.checked) {
                        toggleDiv.classList.add('active');
                    } else {
                        toggleDiv.classList.remove('active');
                    }
                });

                updateTsmPreview();
            }
        }).catch(e=>{});
        
        updateTsmPreview();
    }
    
    modal.style.display = 'flex';
}

// Toast notification function
function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = type === 'error' ? 'alert-circle' : 'check-circle';
    
    toast.innerHTML = `
        <i data-lucide="${icon}" class="toast-icon"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Global Tag Settings Applier
function applyGlobalTagSettings() {
    fetch('/api/settings/tag').then(r => r.json()).then(s => {
        if(s && Object.keys(s).length > 0) {
            let styleEl = document.getElementById('dynamicTagStyles');
            if(!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'dynamicTagStyles';
                document.head.appendChild(styleEl);
            }
            
            const align = s.align || 'flex-start';
            const showCode = s.showCode !== false;
            const showName = s.showName !== false;
            const showPrice = s.showPrice !== false;
            const showQR = s.showQR !== false;
            const qrSize = s.qrSize || 64;

            const css = `
                .tag-sticker-box-new {
                    width: ${s.width}mm !important;
                    height: ${s.height}mm !important;
                    padding: ${s.marginTop}mm ${s.marginRight}mm ${s.marginBottom}mm ${s.marginLeft}mm !important;
                    box-sizing: border-box !important;
                    display: flex !important;
                    flex-direction: row !important;
                    align-items: center !important;
                    justify-content: ${align} !important;
                    background: white !important;
                    font-family: sans-serif !important;
                    gap: 12px !important;
                }
                .tag-sticker-left {
                    flex-shrink: 0 !important;
                }
                .tag-sticker-right {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 4px !important;
                    justify-content: center !important;
                    min-width: 0 !important;
                    overflow: hidden !important;
                }
                .tag-code-new {
                    display: ${showCode ? 'block' : 'none'} !important;
                    font-size: ${s.codeFontSize}px !important;
                    font-weight: 400 !important;
                    color: black !important;
                    white-space: nowrap !important;
                }
                .tag-name-new {
                    display: ${showName ? 'block' : 'none'} !important;
                    font-size: ${s.nameFontSize}px !important;
                    font-weight: 400 !important;
                    color: black !important;
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                }
                .tag-price-new {
                    display: ${showPrice ? 'block' : 'none'} !important;
                    font-size: ${s.priceFontSize}px !important;
                    font-weight: 400 !important;
                    color: black !important;
                    white-space: nowrap !important;
                }
                .tag-qrcode-new, .tag-qrcode-new img, .tag-qrcode-new canvas {
                    width: ${qrSize}px !important;
                    height: ${qrSize}px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    display: ${showQR ? 'block' : 'none'} !important;
                }
                @media print {
                    @page {
                        size: ${s.width}mm ${s.height}mm;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        background: white;
                    }
                    .tag-sticker-box-new {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        margin: 0 !important;
                        border: none !important;
                    }
                }
            `;
            styleEl.innerHTML = css;
        }
    }).catch(e => console.error("Error loading tag settings:", e));
}

document.addEventListener('DOMContentLoaded', () => {
    applyGlobalTagSettings();
});

// --- Global Tag Printing Logic ---
function openPrintTagModal(itemData) {
    let modal = document.getElementById('printTagQtyModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'printTagQtyModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center;';
        
        modal.innerHTML = `
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
        `;
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
    const align = s.align || 'flex-start';

    let printIframe = document.getElementById('printTagIframe');
    if (!printIframe) {
        printIframe = document.createElement('iframe');
        printIframe.id = 'printTagIframe';
        printIframe.style.cssText = 'position: absolute; width: 0; height: 0; border: none;';
        document.body.appendChild(printIframe);
    }

    const doc = printIframe.contentWindow.document;
    doc.open();
    
    const css = `
        @page { size: ${s.width}mm ${s.height}mm; margin: 0; }
        body { margin: 0; padding: 0; background: white; font-family: sans-serif; }
        .tag-page { 
            width: ${s.width}mm; 
            height: ${s.height}mm; 
            padding: ${s.marginTop}mm ${s.marginRight}mm ${s.marginBottom}mm ${s.marginLeft}mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: ${align};
            gap: 12px;
            page-break-after: always;
            overflow: hidden;
            background: white;
        }
        .tag-qrcode { display: ${showQR ? 'flex' : 'none'}; width: ${qrSize}px; height: ${qrSize}px; flex-shrink: 0; align-items: center; justify-content: center; margin: 0; padding: 0; }
        .tag-qrcode img { width: 100%; height: 100%; object-fit: contain; }
        .tag-details { display: flex; flex-direction: column; gap: 4px; justify-content: center; min-width: 0; overflow: hidden; }
        .tag-code { display: ${showCode ? 'block' : 'none'}; font-size: ${s.codeFontSize}px; font-weight: 400; color: black; white-space: nowrap; }
        .tag-name { display: ${showName ? 'block' : 'none'}; font-size: ${s.nameFontSize}px; font-weight: 400; color: black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tag-price { display: ${showPrice ? 'block' : 'none'}; font-size: ${s.priceFontSize}px; font-weight: 400; color: black; white-space: nowrap; }
    `;

    let html = '<html><head><style>' + css + '</style></head><body>';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="tag-page">
                <div class="tag-qrcode">${qrDataUrl ? '<img src="' + qrDataUrl + '" />' : ''}</div>
                <div class="tag-details">
                    <div class="tag-code">${code || ''}</div>
                    <div class="tag-name">${name || ''}</div>
                    <div class="tag-price">${displayPrice || ''}</div>
                </div>
            </div>
        `;
    }
    html += '</body></html>';

    doc.write(html);
    doc.close();

    setTimeout(() => {
        printIframe.contentWindow.focus();
        printIframe.contentWindow.print();
    }, 250);
}