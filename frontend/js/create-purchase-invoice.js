document.addEventListener('DOMContentLoaded', async () => {
    let allItems = [];
    let vendors = [];
    let currentPiCounter = 1;
    let piItems = [];
    
    const dom = {
        piNo: document.getElementById('piNo'),
        purchaseDate: document.getElementById('purchaseDate'),
        refNo: document.getElementById('refNo'),
        paymentTerms: document.getElementById('paymentTerms'),
        dueDate: document.getElementById('dueDate'),
        vendorSelect: document.getElementById('vendorSelect'),
        billAddress: document.getElementById('billAddress'),
        shipAddress: document.getElementById('shipAddress'),
        changeShippingAddressBtn: document.getElementById('changeShippingAddressBtn'),
        itemSearch: document.getElementById('itemSearch'),
        itemSearchDropdown: document.getElementById('itemSearchDropdown'),
        scanTagBtn: document.getElementById('scanTagBtn'),
        piItemsBody: document.getElementById('piItemsBody'),
        paidAmount: document.getElementById('paidAmount'),
        
        gstinNo: document.getElementById('gstinNo'),
        panNo: document.getElementById('panNo'),
        piNote: document.getElementById('piNote'),
        documentUploadInput: document.getElementById('documentUploadInput'),
        documentUploadContainer: document.getElementById('documentUploadContainer'),
        
        // Summary elements
        sumSubTotal: document.getElementById('sumSubTotal'),
        sumDiscountPercent: document.getElementById('sumDiscountPercent'),
        sumDiscountAmount: document.getElementById('sumDiscountAmount'),
        sumAfterDiscount: document.getElementById('sumAfterDiscount'),
        sgstLabel: document.getElementById('sgstLabel'),
        sumSGST: document.getElementById('sumSGST'),
        cgstLabel: document.getElementById('cgstLabel'),
        sumCGST: document.getElementById('sumCGST'),
        sumTotal: document.getElementById('sumTotal'),
        sumRoundOff: document.getElementById('sumRoundOff'),
        sumGrandTotal: document.getElementById('sumGrandTotal'),

        // Table footers
        tableTotalAmount: document.getElementById('tableTotalAmount'),
        tableTotalDiscount: document.getElementById('tableTotalDiscount'),
        tableTotalFinalAmt: document.getElementById('tableTotalFinalAmt'),
        tableTotalTax: document.getElementById('tableTotalTax'),
        tableTotalGrand: document.getElementById('tableTotalGrand'),

        savePiBtn: document.getElementById('savePiBtn'),
        saveAddPiBtn: document.getElementById('saveAddPiBtn')
    };

    // Make shipping address readonly initially
    if(dom.shipAddress) dom.shipAddress.readOnly = true;

    try {
        const [itemsRes, vendorsRes, counterRes] = await Promise.all([
            fetch('/api/items'),
            fetch('/api/vendors'),
            fetch('/api/pi-counter')
        ]);
        allItems = await itemsRes.json();
        vendors = await vendorsRes.json();
        const counterData = await counterRes.json();
        currentPiCounter = counterData.counter || 1;
        
        // Format PI No
        dom.piNo.value = 'PI' + String(currentPiCounter).padStart(3, '0');
    } catch (e) {
        console.error("Failed to load initial data", e);
    }

    populateVendorDropdown();
    renderTable();

    // Vendor Selection Logic
    dom.vendorSelect.addEventListener('change', (e) => {
        const vId = e.target.value;
        const v = vendors.find(x => String(x.id) === String(vId));
        if (v) {
            let bAddr = '';
            let sAddr = '';
            
            // Format billing address
            bAddr = [v.billAddress, v.billCity, v.billState, v.billCountry, v.billPinCode].filter(Boolean).join(', ');
            sAddr = [v.shipAddress, v.shipCity, v.shipState, v.shipCountry, v.shipPinCode].filter(Boolean).join(', ');
            
            dom.billAddress.value = bAddr || 'No billing address provided';
            dom.shipAddress.value = sAddr || 'No shipping address provided';
            dom.shipAddress.readOnly = true; // lock it again

            dom.gstinNo.value = v.gstin || '';
            dom.panNo.value = v.panNumber || '';
        } else {
            dom.billAddress.value = '';
            dom.shipAddress.value = '';
            dom.gstinNo.value = '';
            dom.panNo.value = '';
        }
    });

    // Change shipping address button
    if (dom.changeShippingAddressBtn) {
        dom.changeShippingAddressBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if(dom.shipAddress) {
                dom.shipAddress.readOnly = false;
                dom.shipAddress.focus();
                dom.shipAddress.value = ''; // clear it for new entry
            }
        });
    }

    // Document Upload Logic
    let uploadedDocuments = [];
    let docCounter = 1;

    if (dom.documentUploadInput) {
        dom.documentUploadInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            files.forEach(file => {
                const docId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                uploadedDocuments.push({
                    id: docId,
                    file: file,
                    srNo: docCounter++
                });
            });
            
            renderUploadedDocuments();
            // Reset input so the same file can be selected again if removed
            dom.documentUploadInput.value = '';
        });
    }

    function renderUploadedDocuments() {
        // Keep only the label, remove existing badges
        const badges = dom.documentUploadContainer.querySelectorAll('.uploaded-doc-badge');
        badges.forEach(b => b.remove());

        uploadedDocuments.forEach(doc => {
            const badge = document.createElement('div');
            badge.className = 'uploaded-doc-badge';
            badge.style.cssText = 'display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 4px; font-size: 13px;';
            
            // create object URL for preview/link
            const url = URL.createObjectURL(doc.file);

            badge.innerHTML = `
                <a href="${url}" target="_blank" style="color: var(--text-main); text-decoration: none; font-weight: 500;">${doc.srNo}</a>
                <button type="button" class="remove-doc-btn" data-id="${doc.id}" style="border: none; background: none; padding: 0; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; margin-left: 4px;">
                    <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                </button>
            `;
            
            dom.documentUploadContainer.appendChild(badge);
        });

        if (window.lucide) {
            lucide.createIcons();
        }

        // Bind remove events
        dom.documentUploadContainer.querySelectorAll('.remove-doc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                uploadedDocuments = uploadedDocuments.filter(d => d.id !== id);
                renderUploadedDocuments();
            });
        });
    }

    // Payment terms -> Due date logic
    function calculateDueDate() {
        const pDateVal = dom.purchaseDate.value;
        const terms = dom.paymentTerms.value;
        if (!pDateVal || terms === 'None') {
            dom.dueDate.value = '';
            return;
        }
        const d = new Date(pDateVal);
        const daysMatch = terms.match(/(\d+)/);
        if (daysMatch) {
            d.setDate(d.getDate() + parseInt(daysMatch[1], 10));
            dom.dueDate.value = d.toISOString().split('T')[0];
        }
    }
    
    dom.purchaseDate.addEventListener('change', calculateDueDate);
    dom.paymentTerms.addEventListener('change', calculateDueDate);

    // Search items logic
    dom.itemSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            dom.itemSearchDropdown.classList.remove('show');
            return;
        }

        const matches = allItems.filter(i => 
            (i.name && i.name.toLowerCase().includes(query)) || 
            (i.code && String(i.code).toLowerCase().includes(query))
        ).slice(0, 10);

        if (matches.length > 0) {
            dom.itemSearchDropdown.innerHTML = matches.map(item => `
                <div class="search-dropdown-item" data-code="${item.code}">
                    <div><span style="font-weight: 500;">${item.name}</span> <span style="color:var(--text-muted); font-size:12px;">(${item.code})</span></div>
                    <div style="font-weight: 500;">${item.stock || 0} / ${item.unit || 'Unit'}</div>
                </div>
            `).join('');
            dom.itemSearchDropdown.classList.add('show');

            dom.itemSearchDropdown.querySelectorAll('.search-dropdown-item').forEach(el => {
                el.addEventListener('click', () => {
                    addItemToInvoice(el.getAttribute('data-code'));
                    dom.itemSearch.value = '';
                    dom.itemSearchDropdown.classList.remove('show');
                });
            });
        } else {
            dom.itemSearchDropdown.classList.remove('show');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-container') && !e.target.closest('.search-dropdown')) {
            dom.itemSearchDropdown.classList.remove('show');
        }
    });

    // Scanner logic
    const scannerModal = document.getElementById('scannerModal');
    let html5QrCode = null;

    if (dom.scanTagBtn && scannerModal) {
        dom.scanTagBtn.addEventListener('click', () => {
            scannerModal.style.display = 'flex';
            startQRScanner();
        });

        document.getElementById('closeScannerBtn').addEventListener('click', () => {
            stopQRScanner();
        });
    }

    function startQRScanner() {
        if (!window.Html5Qrcode) {
            showToast('QR Code library failed to load.', 'error');
            return;
        }

        try {
            if (!html5QrCode) {
                html5QrCode = new Html5Qrcode("qr-reader");
            }

            const config = { 
                fps: 25, 
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                },
                useBarCodeDetectorIfSupported: true
            };
            const onScanSuccess = (decodedText) => {
                // Parse standard string: CODE-PRICE
                const parts = decodedText.split('-');
                let code = parts[0] || decodedText;
                
                addItemToInvoice(code);
                stopQRScanner();
            };

            // Try environment/back camera first
            html5QrCode.start(
                { facingMode: "environment" },
                config,
                onScanSuccess
            ).catch(err => {
                console.warn("Environment camera failed, trying user camera", err);
                html5QrCode.start(
                    { facingMode: "user" },
                    config,
                    onScanSuccess
                ).catch(innerErr => {
                    console.error("Camera access failed", innerErr);
                    showToast("Failed to access camera", "error");
                    scannerModal.style.display = 'none';
                });
            });
        } catch (e) {
            console.error(e);
            showToast("Error initializing camera scanner", "error");
        }
    }

    function stopQRScanner() {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                scannerModal.style.display = 'none';
            }).catch(err => {
                console.error("Error stopping scanner", err);
                scannerModal.style.display = 'none';
            });
        } else {
            scannerModal.style.display = 'none';
        }
    }

    function addItemToInvoice(code) {
        const item = allItems.find(i => String(i.code) === String(code));
        if (!item) return;

        // check if exists
        const existing = piItems.find(i => String(i.code) === String(code));
        if (existing) {
            existing.qty += 1;
            renderTable();
            return;
        }

        // Add new
        const taxRate = parseFloat(item.gstRate ? item.gstRate.replace(/[^0-9.]/g, '') : 0) || 0;

        piItems.push({
            id: Date.now().toString(),
            code: item.code,
            name: item.name,
            hsn: item.hsn || '',
            qty: 1,
            unit: item.unit || 'Nos',
            rate: parseFloat(item.purchasePrice || 0),
            discount: 0,
            taxRate: taxRate,
            unitsOptions: [item.unit || 'Nos'] // Simplified for PI
        });
        
        renderTable();
    }

    function renderTable() {
        dom.piItemsBody.innerHTML = '';
        
        let tAmt = 0;
        let tDisc = 0;
        let tFinal = 0;
        let tTax = 0;
        let tGrand = 0;

        if (piItems.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="12" style="text-align: center; color: var(--text-muted); height: 40px; font-style: italic;">
                    No items added yet. Search or scan a tag to add items.
                </td>
            `;
            dom.piItemsBody.appendChild(tr);
        } else {
            piItems.forEach((row, idx) => {
                const amount = row.rate * row.qty;
                const finalAmt = amount - row.discount;
                const taxAmt = finalAmt * (row.taxRate / 100);
                const totalAmt = finalAmt + taxAmt;

                tAmt += amount;
                tDisc += row.discount;
                tFinal += finalAmt;
                tTax += taxAmt;
                tGrand += totalAmt;

                const isNewBadge = row.isNew ? `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#22C55E; margin-left:6px;" title="New Item detected by AI"></span>` : '';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td>
                        <div class="map-item-btn" data-id="${row.id}" style="font-weight:500; cursor: pointer; display: flex; align-items: center;" title="Click to map to existing item">${row.name}${isNewBadge}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${row.code}</div>
                    </td>
                    <td><input type="text" value="${row.hsn}" class="custom-form-input hsn-input" data-id="${row.id}"></td>
                    <td><input type="number" value="${row.qty}" class="custom-form-input qty-input" data-id="${row.id}" min="1"></td>
                    <td>
                        <select class="custom-form-input unit-input" data-id="${row.id}">
                            ${row.unitsOptions.map(u => `<option value="${u}" ${u===row.unit?'selected':''}>${u}</option>`).join('')}
                        </select>
                    </td>
                    <td><input type="number" value="${row.rate}" class="custom-form-input rate-input amount-input" data-id="${row.id}"></td>
                    <td class="cell-readonly" style="text-align: left;">₹${amount.toFixed(2)}</td>
                    <td><input type="number" value="${row.discount}" class="custom-form-input disc-input amount-input" data-id="${row.id}"></td>
                    <td class="cell-readonly" style="text-align: left;">₹${finalAmt.toFixed(2)}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <input type="number" value="${row.taxRate}" class="custom-form-input tax-input amount-input" data-id="${row.id}" style="width: 50px; padding: 0 8px;">%
                        </div>
                        <div class="cell-readonly" style="text-align:left; font-size:11px; margin-top:2px;">₹${taxAmt.toFixed(2)}</div>
                    </td>
                    <td class="cell-readonly" style="text-align: left; font-weight: 500;">₹${totalAmt.toFixed(2)}</td>
                    <td>
                        <button class="btn-delete-row delete-btn-table" data-id="${row.id}">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </td>
                `;
                dom.piItemsBody.appendChild(tr);
            });
        }

        if (window.lucide) lucide.createIcons();

        // Bind table events
        document.querySelectorAll('.qty-input, .rate-input, .disc-input, .tax-input, .hsn-input').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                const val = parseFloat(e.target.value) || 0;
                const row = piItems.find(r => r.id === id);
                if (!row) return;

                if (e.target.classList.contains('qty-input')) row.qty = val;
                if (e.target.classList.contains('rate-input')) row.rate = val;
                if (e.target.classList.contains('disc-input')) row.discount = val;
                if (e.target.classList.contains('tax-input')) row.taxRate = val;
                if (e.target.classList.contains('hsn-input')) row.hsn = e.target.value;

                renderTable(); // Re-render handles calculations
            });
        });

        document.querySelectorAll('.delete-btn-table').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                piItems = piItems.filter(r => r.id !== id);
                renderTable();
            });
        });

        // Map Item Inline Search
        document.querySelectorAll('.map-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const row = piItems.find(r => r.id === id);
                if (!row) return;

                const cell = e.currentTarget.parentElement;
                cell.innerHTML = `
                    <div style="position: relative;">
                        <input type="text" class="custom-form-input item-map-search" placeholder="Search item..." style="width: 100%; font-size: 12px; height: 30px;" value="${row.name}">
                        <div class="item-map-dropdown" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid var(--border-color); border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 100; max-height: 200px; overflow-y: auto; display: none;"></div>
                    </div>
                `;
                
                const input = cell.querySelector('.item-map-search');
                const dropdown = cell.querySelector('.item-map-dropdown');
                
                input.focus();
                
                input.addEventListener('input', (ev) => {
                    const q = ev.target.value.toLowerCase().trim();
                    if (!q) { dropdown.style.display = 'none'; return; }
                    
                    const matches = allItems.filter(i => 
                        (i.name && i.name.toLowerCase().includes(q)) || 
                        (i.code && String(i.code).toLowerCase().includes(q))
                    ).slice(0, 10);
                    
                    if (matches.length > 0) {
                        dropdown.innerHTML = matches.map(item => `
                            <div class="map-dropdown-item" data-code="${item.code}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                                <div><div style="font-weight: 500; font-size: 13px;">${item.name}</div><div style="font-size: 11px; color: var(--text-muted);">${item.code}</div></div>
                                <div style="font-weight: 500; font-size: 12px;">${item.stock || 0} / ${item.unit || 'Unit'}</div>
                            </div>
                        `).join('');
                        dropdown.style.display = 'block';
                        
                        dropdown.querySelectorAll('.map-dropdown-item').forEach(opt => {
                            opt.addEventListener('mousedown', (eClick) => {
                                eClick.preventDefault(); // prevent blur
                                const code = opt.getAttribute('data-code');
                                const matched = allItems.find(i => String(i.code) === String(code));
                                if (matched) {
                                    row.code = matched.code;
                                    row.name = matched.name;
                                    row.hsn = matched.hsn || row.hsn;
                                    row.unit = matched.unit || row.unit;
                                    row.isNew = false;
                                    renderTable();
                                }
                            });
                        });
                    } else {
                        dropdown.style.display = 'none';
                    }
                });
                
                input.addEventListener('blur', () => {
                    setTimeout(() => {
                        if (piItems.find(r => r.id === id)) renderTable();
                    }, 150);
                });
            });
        });

        // Update footer totals
        dom.tableTotalAmount.textContent = `₹${tAmt.toFixed(2)}`;
        dom.tableTotalDiscount.textContent = `₹${tDisc.toFixed(2)}`;
        dom.tableTotalFinalAmt.textContent = `₹${tFinal.toFixed(2)}`;
        dom.tableTotalTax.textContent = `₹${tTax.toFixed(2)}`;
        dom.tableTotalGrand.textContent = `₹${tGrand.toFixed(2)}`;

        updateSummary(); // Summary handles its own logic based on raw totals
    }

    // Summary calculation logic
    let preventLoop = false;

    dom.sumDiscountPercent.addEventListener('input', () => {
        if (preventLoop) return;
        preventLoop = true;
        const subT = getRawSubTotal();
        const pct = parseFloat(dom.sumDiscountPercent.value) || 0;
        const amt = subT * (pct / 100);
        dom.sumDiscountAmount.value = amt ? amt.toFixed(2) : '';
        calculateFinalSummary();
        preventLoop = false;
    });

    dom.sumDiscountAmount.addEventListener('input', () => {
        if (preventLoop) return;
        preventLoop = true;
        const subT = getRawSubTotal();
        const amt = parseFloat(dom.sumDiscountAmount.value) || 0;
        if (subT > 0) {
            const pct = (amt / subT) * 100;
            dom.sumDiscountPercent.value = pct ? pct.toFixed(2) : '';
        } else {
            dom.sumDiscountPercent.value = '';
        }
        calculateFinalSummary();
        preventLoop = false;
    });

    function getRawSubTotal() {
        // sum of (qty * rate - item_discount) across all items
        return piItems.reduce((acc, r) => acc + ((r.rate * r.qty) - r.discount), 0);
    }

    function updateSummary() {
        const subT = getRawSubTotal();
        dom.sumSubTotal.textContent = `₹${subT.toFixed(2)}`;
        calculateFinalSummary();
    }

    function calculateFinalSummary() {
        const subT = getRawSubTotal();
        const discAmt = parseFloat(dom.sumDiscountAmount.value) || 0;
        const afterDisc = subT - discAmt;
        dom.sumAfterDiscount.textContent = `₹${afterDisc.toFixed(2)}`;

        // Calculate SGST / CGST overall based on the item taxes proportionally or recalculated
        // For accurate tax, tax is usually per-item. If an overall discount is applied, tax must be recalculated.
        // Let's distribute discount proportionally to items to calculate exact tax.
        
        let totalTax = 0;
        let avgTaxRate = 0;

        if (subT > 0) {
            piItems.forEach(r => {
                const itemBaseAmt = (r.rate * r.qty) - r.discount;
                const rowRatio = itemBaseAmt / subT;
                const allocatedDisc = discAmt * rowRatio;
                // Tax is calculated on the amount after both item and global discounts
                const finalRowAmt = itemBaseAmt - allocatedDisc;
                totalTax += finalRowAmt * (r.taxRate / 100);
            });
            // Approximate average rate for display
            avgTaxRate = (totalTax / afterDisc) * 100 || 0;
        }

        // Split into CGST and SGST
        const halfTax = totalTax / 2;
        const halfRate = avgTaxRate / 2;

        dom.sgstLabel.textContent = `SGST ${halfRate.toFixed(2)}%`;
        dom.cgstLabel.textContent = `CGST ${halfRate.toFixed(2)}%`;

        dom.sumSGST.textContent = `₹${halfTax.toFixed(2)}`;
        dom.sumCGST.textContent = `₹${halfTax.toFixed(2)}`;

        const totalAmt = afterDisc + totalTax;
        dom.sumTotal.textContent = `₹${totalAmt.toFixed(2)}`;

        const grandTotal = Math.round(totalAmt);
        const roundOff = grandTotal - totalAmt;
        
        dom.sumRoundOff.textContent = roundOff.toFixed(2);
        dom.sumGrandTotal.textContent = `₹${grandTotal.toFixed(2)}`;
    }

    function initCustomDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        let trigger = dropdown.querySelector('.custom-dropdown-trigger');
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        trigger = newTrigger;

        const select = dropdown.querySelector('select');
        const triggerText = trigger.querySelector('.trigger-text');
        const panel = dropdown.querySelector('.custom-dropdown-panel');

        panel.innerHTML = '';

        Array.from(select.options).forEach((opt, index) => {
            if (opt.value === "" && index === 0) return; 

            const optionDiv = document.createElement('div');
            optionDiv.className = 'custom-dropdown-option';
            optionDiv.textContent = opt.textContent;
            optionDiv.dataset.value = opt.value;

            if (select.value === opt.value) {
                optionDiv.classList.add('selected');
                if (opt.value !== "") {
                    triggerText.textContent = opt.textContent;
                    triggerText.classList.remove('placeholder');
                }
            }

            optionDiv.addEventListener('click', () => {
                select.value = opt.value;
                triggerText.textContent = opt.textContent;
                triggerText.classList.remove('placeholder');
                panel.querySelectorAll('.custom-dropdown-option').forEach(el => el.classList.remove('selected'));
                optionDiv.classList.add('selected');
                dropdown.classList.remove('open');
                select.dispatchEvent(new Event('change'));
            });

            panel.appendChild(optionDiv);
        });

        trigger.addEventListener('click', () => {
            const isOpen = dropdown.classList.contains('open');
            document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
            if (!isOpen) {
                dropdown.classList.add('open');
            }
        });
    }

    function populateVendorDropdown() {
        dom.vendorSelect.innerHTML = '<option value="">Select Vendor</option>';
        vendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.vendorName;
            dom.vendorSelect.appendChild(opt);
        });
        initCustomDropdown('vendorDropdown');
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        }
    });

    async function savePurchaseInvoice(stayOnPage = false) {
        if (!dom.purchaseDate.value) { alert("Please select Purchase Date"); return; }
        if (!dom.vendorSelect.value) { alert("Please select Vendor"); return; }
        if (piItems.length === 0) { alert("Please add at least one item to invoice"); return; }

        const originalBtnText = dom.savePiBtn.innerHTML;
        const originalAddBtnText = dom.saveAddPiBtn.innerHTML;
        dom.savePiBtn.innerHTML = 'Saving...';
        dom.savePiBtn.disabled = true;
        dom.saveAddPiBtn.innerHTML = 'Saving...';
        dom.saveAddPiBtn.disabled = true;

        const gTotalStr = dom.sumGrandTotal.textContent.replace('₹', '').replace(/,/g, '');
        const grandTotal = parseFloat(gTotalStr) || 0;
        
        let vendorId = dom.vendorSelect.value;
        let vendor = vendors.find(v => String(v.id) === String(vendorId));
        let createdNewVendor = false;
        
        if (vendorId === 'NEW_VENDOR_TEMP') {
            const newVendorName = dom.vendorSelect.options[dom.vendorSelect.selectedIndex].text;
            vendor = {
                id: Date.now().toString(),
                vendorName: newVendorName,
                gstin: dom.gstinNo.value,
                panNumber: dom.panNo.value,
                billAddress: dom.billAddress.value,
                pendingToPay: 0,
                transactions: []
            };
            vendors.push(vendor);
            vendorId = vendor.id;
            createdNewVendor = true;
        }
        
        
        const paid = parseFloat(dom.paidAmount.value) || 0;
        const pendingToPay = grandTotal - paid;

        const piData = {
            id: Date.now().toString(),
            piNo: dom.piNo.value,
            date: dom.purchaseDate.value,
            refNo: dom.refNo.value,
            dueDate: dom.dueDate.value,
            paymentTerms: dom.paymentTerms.value,
            vendorId: vendorId,
            vendorName: vendor ? vendor.vendorName : '',
            billingAddress: dom.billAddress.value,
            shippingAddress: dom.shipAddress.value,
            items: piItems,
            subTotal: getRawSubTotal(),
            discountPercent: parseFloat(dom.sumDiscountPercent.value) || 0,
            discountAmount: parseFloat(dom.sumDiscountAmount.value) || 0,
            totalTax: parseFloat(dom.sumSGST.textContent.replace('₹','')) * 2,
            amount: grandTotal,
            paidAmount: paid,
            pendingToPay: pendingToPay,
            note: dom.piNote.value
        };

        try {
            // 1. Update Vendor and Create New Vendor First (to satisfy Foreign Key constraint)
            if (vendor) {
                vendor.pendingToPay = (parseFloat(vendor.pendingToPay) || 0) + pendingToPay;
                if (!vendor.transactions) vendor.transactions = [];
                vendor.transactions.push({
                    id: Date.now().toString(),
                    date: dom.purchaseDate.value,
                    type: 'Purchase Invoice',
                    ref: dom.piNo.value,
                    amount: grandTotal,
                    balance: vendor.pendingToPay,
                    status: pendingToPay > 0 ? 'Unpaid' : 'Paid'
                });
                
                const vendorRes = await fetch('/api/vendors', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(vendors)
                });
                if (!vendorRes.ok) throw new Error('Failed to save vendor');
            }

            // 2. Update Item Stock/Prices and Create New Items
            let createdNewItems = 0;
            for (let r of piItems) {
                if (r.isNew || r.code === 'AI-TEMP') {
                    const newItemCode = 'ITM' + Math.floor(1000 + Math.random() * 9000);
                    const newItem = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2,5),
                        code: newItemCode,
                        name: r.name,
                        hsn: r.hsn || '',
                        unit: r.unit || 'Nos',
                        purchasePrice: r.rate,
                        sellingPrice: r.rate, // default to purchase rate
                        stock: r.qty
                    };
                    allItems.push(newItem);
                    r.code = newItemCode; // update invoice row code
                    r.isNew = false;
                    createdNewItems++;
                } else {
                    const idx = allItems.findIndex(i => String(i.code) === String(r.code));
                    if (idx > -1) {
                        allItems[idx].stock = (parseFloat(allItems[idx].stock) || 0) + r.qty;
                        allItems[idx].purchasePrice = r.rate; // update purchase price to latest
                    }
                }
            }
            const itemRes = await fetch('/api/items', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(allItems)
            });
            if (!itemRes.ok) throw new Error('Failed to save items');

            // 3. Fetch current PIs, add new one, and Save PI
            const piRes = await fetch(`/api/purchase-invoices?t=${Date.now()}`);
            if (!piRes.ok) throw new Error('Failed to fetch purchase invoices');
            const invoices = await piRes.json();
            invoices.push(piData);
            
            const saveRes = await fetch('/api/purchase-invoices', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(invoices)
            });
            if (!saveRes.ok) {
                const errData = await saveRes.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP error ${saveRes.status}`);
            }

            // 4. Increment Counter
            await fetch('/api/pi-counter', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ counter: currentPiCounter + 1 })
            });
            
            // Build Success Message
            let successMsg = "Saved Successfully!";
            if (createdNewVendor && createdNewItems > 0) {
                successMsg = `Saved successfully! New vendor and ${createdNewItems} new item(s) automatically created.`;
            } else if (createdNewVendor) {
                successMsg = `Saved successfully! New vendor automatically created.`;
            } else if (createdNewItems > 0) {
                successMsg = `Saved successfully! ${createdNewItems} new item(s) automatically created.`;
            }

            if (stayOnPage) {
                dom.savePiBtn.innerHTML = originalBtnText;
                dom.savePiBtn.disabled = false;
                dom.saveAddPiBtn.innerHTML = originalAddBtnText;
                dom.saveAddPiBtn.disabled = false;
                if (window.showToast) showToast(successMsg, 'success');
                setTimeout(() => location.reload(), 1500);
            } else {
                if (window.showToast) showToast(successMsg, 'success');
                setTimeout(() => window.location.href = 'purchase-invoice.html', 1500);
            }

        } catch (e) {
            console.error("Error saving PI:", e);
            if (window.showToast) {
                showToast(`Error: ${e.message}`, "error");
            } else {
                alert(`Error: ${e.message}`);
            }
            dom.savePiBtn.innerHTML = originalBtnText;
            dom.savePiBtn.disabled = false;
            dom.saveAddPiBtn.innerHTML = originalAddBtnText;
            dom.saveAddPiBtn.disabled = false;
        }
    }

    // ==========================================
    // AI INVOICE EXTRACTION LOGIC
    // ==========================================
    const generateAiBtn = document.getElementById('generateAiBtn');
    const aiGeneratorModal = document.getElementById('aiGeneratorModal');
    const closeAiModalBtn = document.getElementById('closeAiModalBtn');
    const aiPdfInput = document.getElementById('aiPdfInput');
    const aiImageInput = document.getElementById('aiImageInput');
    const aiCameraOption = document.getElementById('aiCameraOption');
    const aiLoadingOverlay = document.getElementById('aiLoadingOverlay');
    
    // Camera elements
    const aiCameraModal = document.getElementById('aiCameraModal');
    const closeAiCameraBtn = document.getElementById('closeAiCameraBtn');
    const aiCameraVideo = document.getElementById('aiCameraVideo');
    const aiCaptureBtn = document.getElementById('aiCaptureBtn');
    let aiMediaStream = null;

    if (generateAiBtn) {
        generateAiBtn.addEventListener('click', () => {
            aiGeneratorModal.style.display = 'flex';
        });
    }

    if (closeAiModalBtn) {
        closeAiModalBtn.addEventListener('click', () => {
            aiGeneratorModal.style.display = 'none';
        });
    }

    // Process file wrapper
    async function processAiFile(file) {
        aiGeneratorModal.style.display = 'none';
        aiLoadingOverlay.style.display = 'flex';
        
        const formData = new FormData();
        formData.append('invoiceFile', file);

        try {
            const res = await fetch('/api/ai/extract-invoice', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            
            if (!result.success) {
                alert('AI Extraction Failed: ' + (result.error || 'Unknown error'));
                aiLoadingOverlay.style.display = 'none';
                return;
            }

            mapAiDataToInvoice(result.data);
            
        } catch (e) {
            console.error('AI Processing error:', e);
            alert('Failed to process invoice with AI. Ensure backend and API key are configured.');
        } finally {
            aiLoadingOverlay.style.display = 'none';
        }
    }

    if (aiPdfInput) {
        aiPdfInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                processAiFile(e.target.files[0]);
                e.target.value = ''; // Reset
            }
        });
    }

    if (aiImageInput) {
        aiImageInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                processAiFile(e.target.files[0]);
                e.target.value = ''; // Reset
            }
        });
    }

    // Camera Capture Logic
    if (aiCameraOption) {
        aiCameraOption.addEventListener('click', async () => {
            try {
                aiMediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment' } 
                });
                aiCameraVideo.srcObject = aiMediaStream;
                aiGeneratorModal.style.display = 'none';
                aiCameraModal.style.display = 'flex';
            } catch (err) {
                console.error('Camera error:', err);
                alert('Could not access camera. Please allow permissions.');
            }
        });
    }

    if (closeAiCameraBtn) {
        closeAiCameraBtn.addEventListener('click', () => {
            if (aiMediaStream) {
                aiMediaStream.getTracks().forEach(track => track.stop());
            }
            aiCameraModal.style.display = 'none';
            aiGeneratorModal.style.display = 'flex';
        });
    }

    if (aiCaptureBtn) {
        aiCaptureBtn.addEventListener('click', () => {
            const canvas = document.createElement('canvas');
            canvas.width = aiCameraVideo.videoWidth;
            canvas.height = aiCameraVideo.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(aiCameraVideo, 0, 0, canvas.width, canvas.height);
            
            // Stop stream
            if (aiMediaStream) {
                aiMediaStream.getTracks().forEach(track => track.stop());
            }
            aiCameraModal.style.display = 'none';
            
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
                    processAiFile(file);
                }
            }, 'image/jpeg', 0.9);
        });
    }

    function mapAiDataToInvoice(data) {
        if (!data) return;

        // 1. Match/Map Vendor
        if (data.vendor && data.vendor.name) {
            let foundVendor = vendors.find(v => 
                (v.vendorName && v.vendorName.toLowerCase().includes(data.vendor.name.toLowerCase())) || 
                (data.vendor.gstin && v.gstin && v.gstin.toLowerCase() === data.vendor.gstin.toLowerCase())
            );
            
            if (foundVendor) {
                dom.vendorSelect.value = foundVendor.id;
                
                // Update Custom Dropdown UI
                const wrapper = dom.vendorSelect.closest('.custom-dropdown');
                if (wrapper) {
                    const triggerText = wrapper.querySelector('.trigger-text');
                    if (triggerText) {
                        triggerText.innerHTML = dom.vendorSelect.options[dom.vendorSelect.selectedIndex].text;
                        triggerText.classList.remove('placeholder');
                    }
                }
                
                // Trigger change to load addresses
                dom.vendorSelect.dispatchEvent(new Event('change')); 
            } else {
                // New Vendor - Show badge
                const wrapper = dom.vendorSelect.closest('.custom-dropdown');
                if (wrapper) {
                    const triggerText = wrapper.querySelector('.trigger-text');
                    if (triggerText) {
                        triggerText.innerHTML = `${data.vendor.name} <span style="background: #22C55E; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 8px;">New</span>`;
                        triggerText.classList.remove('placeholder');
                    }
                }
                dom.vendorSelect.innerHTML += `<option value="NEW_VENDOR_TEMP">${data.vendor.name}</option>`;
                dom.vendorSelect.value = "NEW_VENDOR_TEMP";
                if (data.vendor.address) dom.billAddress.value = data.vendor.address;
                if (data.vendor.gstin) dom.gstinNo.value = data.vendor.gstin;
            }
        }

        // 2. Invoice Details
        if (data.invoice) {
            if (data.invoice.invoiceNo) dom.refNo.value = data.invoice.invoiceNo;
            if (data.invoice.invoiceDate) dom.purchaseDate.value = data.invoice.invoiceDate;
            if (data.invoice.dueDate) dom.dueDate.value = data.invoice.dueDate;
        }

        // 3. Line Items
        if (data.items && Array.isArray(data.items)) {
            piItems = []; // Clear existing
            
            data.items.forEach(aiItem => {
                let matchedItem = allItems.find(i => 
                    (i.name && aiItem.name && i.name.toLowerCase() === aiItem.name.toLowerCase()) ||
                    (aiItem.hsn && i.hsn && String(i.hsn) === String(aiItem.hsn))
                );

                piItems.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    code: matchedItem ? matchedItem.code : 'AI-TEMP',
                    name: aiItem.name || 'Unknown Item',
                    hsn: aiItem.hsn || (matchedItem ? matchedItem.hsn : ''),
                    qty: aiItem.qty || 1,
                    unit: aiItem.unit || (matchedItem ? matchedItem.unit : 'Nos'),
                    rate: aiItem.rate || 0,
                    discount: aiItem.discount || 0,
                    taxRate: aiItem.taxPercent || 0,
                    unitsOptions: [aiItem.unit || 'Nos'],
                    isNew: !matchedItem
                });
            });
            
            renderTable();
        }
        
        // 4. Global Summary Overrides if needed
        if (data.summary && data.summary.discount) {
            const sumOfItemDiscounts = data.items ? data.items.reduce((acc, item) => acc + (parseFloat(item.discount) || 0), 0) : 0;
            // Only apply summary discount if there are no item discounts, to prevent double counting
            if (sumOfItemDiscounts === 0) {
                dom.sumDiscountAmount.value = data.summary.discount;
                dom.sumDiscountAmount.dispatchEvent(new Event('input')); // Triggers recalculation
            } else {
                dom.sumDiscountAmount.value = '';
                dom.sumDiscountPercent.value = '';
                calculateFinalSummary();
            }
        }
    }

    dom.savePiBtn.addEventListener('click', () => savePurchaseInvoice(false));
    dom.saveAddPiBtn.addEventListener('click', () => savePurchaseInvoice(true));
});
