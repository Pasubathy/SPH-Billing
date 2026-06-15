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
        } else {
            dom.billAddress.value = '';
            dom.shipAddress.value = '';
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
                    <div style="font-weight: 500;">₹${parseFloat(item.purchasePrice || 0).toFixed(2)}</div>
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

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><div style="font-weight:500;">${row.name}</div><div style="font-size:11px; color:var(--text-muted);">${row.code}</div></td>
                <td><input type="text" value="${row.hsn}" class="custom-form-input hsn-input" data-id="${row.id}"></td>
                <td><input type="number" value="${row.qty}" class="custom-form-input qty-input" data-id="${row.id}" min="1"></td>
                <td>
                    <select class="custom-form-input unit-input" data-id="${row.id}">
                        ${row.unitsOptions.map(u => `<option value="${u}" ${u===row.unit?'selected':''}>${u}</option>`).join('')}
                    </select>
                </td>
                <td><input type="number" value="${row.rate}" class="custom-form-input rate-input amount-input" data-id="${row.id}"></td>
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

        // Update footer totals
        // dom.tableTotalAmount.textContent = `₹${tAmt.toFixed(2)}`;
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

        const vendorId = dom.vendorSelect.value;
        const vendor = vendors.find(v => String(v.id) === String(vendorId));
        
        const gTotalStr = dom.sumGrandTotal.textContent.replace('₹', '').replace(/,/g, '');
        const grandTotal = parseFloat(gTotalStr) || 0;
        
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
            pendingToPay: pendingToPay
        };

        try {
            // 1. Fetch current PIs and add new one
            const piRes = await fetch(`/api/purchase-invoices?t=${Date.now()}`);
            const invoices = await piRes.json();
            invoices.push(piData);
            await fetch('/api/purchase-invoices', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(invoices)
            });

            // 2. Increment Counter
            await fetch('/api/pi-counter', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ counter: currentPiCounter + 1 })
            });

            // 3. Update Vendor pending payment
            if (vendor) {
                vendor.pendingToPay = (parseFloat(vendor.pendingToPay) || 0) + pendingToPay;
                // Add transaction to vendor
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
                
                await fetch('/api/vendors', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(vendors)
                });
            }

            // 4. Update Item Stock/Prices (optional, usually purchases increase stock)
            for (let r of piItems) {
                const idx = allItems.findIndex(i => String(i.code) === String(r.code));
                if (idx > -1) {
                    allItems[idx].stock = (parseFloat(allItems[idx].stock) || 0) + r.qty;
                    allItems[idx].purchasePrice = r.rate; // update purchase price to latest
                }
            }
            await fetch('/api/items', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(allItems)
            });

            if (stayOnPage) {
                dom.savePiBtn.innerHTML = originalBtnText;
                dom.savePiBtn.disabled = false;
                dom.saveAddPiBtn.innerHTML = originalAddBtnText;
                dom.saveAddPiBtn.disabled = false;
                alert("Saved Successfully!");
                location.reload();
            } else {
                alert("Saved Successfully!");
                window.location.href = 'purchase-invoice.html';
            }

        } catch (e) {
            console.error("Error saving PI:", e);
            alert("Error saving Purchase Invoice");
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
                        triggerText.textContent = dom.vendorSelect.options[dom.vendorSelect.selectedIndex].text;
                        triggerText.classList.remove('placeholder');
                    }
                }
                
                // Trigger change to load addresses
                dom.vendorSelect.dispatchEvent(new Event('change')); 
            } else {
                alert(`New Vendor Detected: "${data.vendor.name}". Please map manually or create a new vendor.`);
                if (data.vendor.address) dom.billAddress.value = data.vendor.address;
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
                    unitsOptions: [aiItem.unit || 'Nos']
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
