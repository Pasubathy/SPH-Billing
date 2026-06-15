// sales.js - Full Billing Logic for SPH Billing Sales Page

let allItems = [];
let allUnits = [];
let billingRows = []; // Array of { item, qty, unitIndex, rate, taxPercent }
let html5QrCode = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // 2. Load data from APIs
    await loadAPIData();

    // 3. Set Invoice Number (auto-increment)
    await initInvoiceNumber();

    // 4. Set today's date
    initBillingDate();

    // 5. Setup search
    setupSearch();

    // 6. Setup barcode scanner
    setupBarcodeScanner();

    // 7. Setup footer buttons
    setupFooterButtons();

    // 8. Setup Price Summary toggle
    setupPriceSummaryToggle();

    // 9. Setup Customer selection modal
    await setupCustomerModal();

    // 10. Setup Bill Discount listeners
    setupBillDiscountListeners();

    // Init custom export dropdowns
    initGenericDropdown('salesListExportDropdown');
    initGenericDropdown('custExportDropdown');
    initGenericDropdown('arExportDropdown');

    // 11. Setup Sales List Tab toggles
    setupSalesListTabs();

    // 12. Setup Received Payments
    renderReceivedPayments();

    // 13. Setup Amount Received Workspace
    await setupAmountReceivedWorkspace();

    // 9. Close search dropdown on outside click
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('billingSearchDropdown');
        const searchInput = document.getElementById('billingSearchInput');
        if (dropdown && !dropdown.contains(e.target) && e.target !== searchInput) {
            dropdown.classList.remove('show');
        }
    });
});

async function loadAPIData() {
    try {
        const [resItems, resUnits] = await Promise.all([
            fetch('/api/items'),
            fetch('/api/units')
        ]);
        allItems = await resItems.json();
        allUnits = await resUnits.json();
    } catch (err) {
        console.error('Error loading API data:', err);
        allItems = [];
        allUnits = [];
    }
}

// ============================================================
// INVOICE NUMBER
// ============================================================
let invoiceCounter = 1;

async function initInvoiceNumber() {
    try {
        const res = await fetch('/api/invoice-counter');
        const data = await res.json();
        invoiceCounter = data.counter || 1;
    } catch (err) {
        console.error('Error loading invoice counter:', err);
    }
    const invoiceSpan = document.getElementById('invoiceNumber');
    if (invoiceSpan) {
        invoiceSpan.textContent = 'INV' + String(invoiceCounter).padStart(3, '0');
    }
}

async function incrementInvoiceNumber() {
    invoiceCounter++;
    try {
        await fetch('/api/invoice-counter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ counter: invoiceCounter })
        });
    } catch (err) {
        console.error('Error updating invoice counter:', err);
    }
    await initInvoiceNumber();
}

// ============================================================
// BILLING DATE
// ============================================================
function initBillingDate() {
    const dateSpan = document.getElementById('billingDate');
    if (dateSpan) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        dateSpan.textContent = `${dd}/${mm}/${yyyy}`;
    }
}

// ============================================================
// SEARCH & ADD ITEM
// ============================================================
function setupSearch() {
    const searchInput = document.getElementById('billingSearchInput');
    const dropdown = document.getElementById('billingSearchDropdown');

    if (!searchInput || !dropdown) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length === 0) {
            dropdown.classList.remove('show');
            dropdown.innerHTML = '';
            return;
        }

        const matches = allItems.filter(item =>
            item.name.toLowerCase().includes(query) ||
            String(item.code).toLowerCase().includes(query)
        );

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="billing-search-dropdown-empty">No items found</div>';
            dropdown.classList.add('show');
            return;
        }

        dropdown.innerHTML = matches.map(item => `
            <div class="billing-search-dropdown-item" data-code="${item.code}">
                <div>
                    <span class="item-name">${item.name}</span>
                    <span class="item-code">${item.code}</span>
                </div>
                <span class="item-price">₹${parseFloat(item.sellingPrice || 0).toFixed(2)}</span>
            </div>
        `).join('');

        dropdown.classList.add('show');

        // Attach click listeners to dropdown items
        dropdown.querySelectorAll('.billing-search-dropdown-item').forEach(el => {
            el.addEventListener('click', () => {
                const code = el.getAttribute('data-code');
                addItemByCode(code);
                searchInput.value = '';
                dropdown.classList.remove('show');
                dropdown.innerHTML = '';
            });
        });
    });

    // Also handle Enter key to add first match
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim().toLowerCase();
            if (!query) return;

            const match = allItems.find(item =>
                item.name.toLowerCase().includes(query) ||
                String(item.code).toLowerCase().includes(query)
            );

            if (match) {
                addItemByCode(match.code);
                searchInput.value = '';
                dropdown.classList.remove('show');
                dropdown.innerHTML = '';
            }
        }
    });
}

// Helper: Extract base (ex-tax) rate from item's selling price
// If sellingTaxType is 'with', the stored price is tax-inclusive.
// Base Rate = SellingPrice - (SellingPrice × GST%)
function getBaseRate(rawPrice, item) {
    const gstStr = item.gstRate || 'none';
    // Parse numeric GST % from values like '5', '12', 'i18'
    const gstPercent = parseFloat(gstStr.replace(/[^0-9.]/g, '')) || 0;

    if (item.sellingTaxType === 'with' && gstPercent > 0) {
        const taxAmt = rawPrice * (gstPercent / 100);
        return rawPrice - taxAmt;
    }
    return rawPrice; // 'without tax' or no GST — rate is already base
}

// Helper: Calculate tax amount for a billing row.
// 'with' tax (inclusive): tax = base × (GST% / (100 − GST%))
//   e.g. base=190, GST=5% → 190 × (5/95) = 10  → total = 200 ✓
// 'without' tax (exclusive): tax = finalAmt × (GST% / 100)
function calcTaxAmt(finalAmt, taxPercent, sellingTaxType) {
    if (taxPercent <= 0) return 0;
    if (sellingTaxType === 'with') {
        // Back-calculate tax from inclusive base
        return finalAmt * (taxPercent / (100 - taxPercent));
    }
    return finalAmt * (taxPercent / 100);
}

function addItemByCode(code) {
    const item = allItems.find(i => String(i.code) === String(code));
    if (!item) {
        showToast('Item not found', 'error');
        return;
    }

    // Check if item already exists in billing rows - if so, increment qty
    const existingIndex = billingRows.findIndex(r => String(r.item.code) === String(code));
    if (existingIndex > -1) {
        billingRows[existingIndex].qty += 1;
        renderBillingTable();
        updateSummary();
        showToast(`${item.name} qty updated`, 'success');
        return;
    }

    // Determine tax from item's gstRate
    let taxPercent = 0;
    if (item.gstRate) {
        taxPercent = parseFloat(item.gstRate) || 0;
    }

    // Build unit options: base unit + conversions
    // Use getBaseRate() so rate in billing is always the ex-tax (base) price
    const unitOptions = [];
    unitOptions.push({
        label: item.unit || 'Unit',
        price: getBaseRate(parseFloat(item.sellingPrice) || 0, item),
        isBase: true
    });

    if (item.conversions && item.conversions.length > 0) {
        item.conversions.forEach(conv => {
            unitOptions.push({
                label: conv.unit,
                price: getBaseRate(parseFloat(conv.price) || 0, item),
                isBase: false
            });
        });
    }

    billingRows.push({
        item: item,
        qty: 1,
        unitIndex: 0, // default to base unit
        unitOptions: unitOptions,
        rate: unitOptions[0].price,
        disc: 0,
        taxPercent: taxPercent,
        sellingTaxType: item.sellingTaxType || 'without'
    });

    renderBillingTable();
    updateSummary();
    showToast(`${item.name} added`, 'success');
}

// ============================================================
// BILLING TABLE RENDERING
// ============================================================
function renderBillingTable() {
    const tbody = document.getElementById('billingTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    billingRows.forEach((row, index) => {
        const amount = row.qty * row.rate;
        const disc = parseFloat(row.disc) || 0;
        const finalAmt = amount - disc;
        const taxAmt = calcTaxAmt(finalAmt, row.taxPercent, row.sellingTaxType);
        const totalAmt = finalAmt + taxAmt;

        const tr = document.createElement('tr');

        // S. No.
        const tdSno = document.createElement('td');
        tdSno.textContent = index + 1;
        tdSno.style.textAlign = 'left';
        tr.appendChild(tdSno);

        // Item Name
        const tdName = document.createElement('td');
        tdName.textContent = row.item.name;
        tdName.style.fontWeight = '500';
        tr.appendChild(tdName);

        // Qty (editable)
        const tdQty = document.createElement('td');
        const qtyInput = document.createElement('input');
        qtyInput.type = 'text';
        qtyInput.inputMode = 'decimal';
        qtyInput.className = 'cell-input';
        qtyInput.value = row.qty;
        qtyInput.setAttribute('data-row', index);
        qtyInput.addEventListener('input', (e) => {
            const rowData = billingRows[index];
            const currentUnitLabel = rowData.unitOptions[rowData.unitIndex].label;
            const unitDef = allUnits.find(u => u.shortName === currentUnitLabel || u.name === currentUnitLabel);
            const allowDecimal = unitDef ? (unitDef.allowDecimal === 'Yes') : true; // Default true if not found
            
            if (allowDecimal) {
                e.target.value = e.target.value.replace(/[^0-9.]/g, '');
                const parts = e.target.value.split('.');
                if (parts.length > 2) {
                    e.target.value = parts[0] + '.' + parts.slice(1).join('');
                }
            } else {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            }
            
            const val = parseFloat(e.target.value) || 0;
            billingRows[index].qty = val;
            recalcRow(index, 'qty');
        });
        tdQty.appendChild(qtyInput);
        tr.appendChild(tdQty);

        // Unit
        const tdUnit = document.createElement('td');
        if (row.unitOptions.length > 1) {
            // Multiple units -> custom dropdown
            const dropdownDiv = document.createElement('div');
            dropdownDiv.className = 'custom-dropdown';
            const dropdownId = `billingUnitDropdown_${index}_${Date.now()}`;
            dropdownDiv.id = dropdownId;
            dropdownDiv.style.width = '100%';
            dropdownDiv.style.height = '34px';

            const unitSelect = document.createElement('select');
            unitSelect.style.display = 'none';
            unitSelect.setAttribute('data-row', index);

            let selectedLabel = row.unitOptions[0].label;

            row.unitOptions.forEach((uOpt, uIdx) => {
                const opt = document.createElement('option');
                opt.value = uIdx;
                opt.textContent = uOpt.label;
                if (uIdx === row.unitIndex) {
                    opt.selected = true;
                    selectedLabel = uOpt.label;
                }
                unitSelect.appendChild(opt);
            });

            unitSelect.addEventListener('change', (e) => {
                const uIdx = parseInt(e.target.value);
                billingRows[index].unitIndex = uIdx;
                billingRows[index].rate = billingRows[index].unitOptions[uIdx].price;
                recalcRow(index, 'unit');
            });
            dropdownDiv.appendChild(unitSelect);

            const trigger = document.createElement('div');
            trigger.className = 'custom-dropdown-trigger';
            trigger.style.height = '100%';
            trigger.style.padding = '0 8px';
            trigger.style.borderRadius = '4px';
            trigger.style.border = '1px solid var(--border-color)';
            trigger.style.backgroundColor = 'white';
            trigger.style.display = 'flex';
            trigger.style.alignItems = 'center';
            trigger.style.justifyContent = 'space-between';
            trigger.style.cursor = 'pointer';
            trigger.style.fontSize = '13px';
            
            trigger.innerHTML = `
                <span class="trigger-text">${selectedLabel}</span>
                <svg class="trigger-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; color: var(--text-muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>
            `;
            dropdownDiv.appendChild(trigger);

            const panel = document.createElement('div');
            panel.className = 'custom-dropdown-panel';
            panel.style.top = 'calc(100% + 4px)';
            panel.style.zIndex = '100';
            panel.style.width = '100%';
            dropdownDiv.appendChild(panel);

            tdUnit.appendChild(dropdownDiv);

            setTimeout(() => {
                if (document.getElementById(dropdownId)) {
                    initGenericDropdown(dropdownId);
                }
            }, 0);
        } else {
            // Single unit -> text
            tdUnit.textContent = row.unitOptions[0].label;
            tdUnit.style.textAlign = 'left';
        }
        tr.appendChild(tdUnit);

        // Rate (editable)
        const tdRate = document.createElement('td');
        const rateInput = document.createElement('input');
        rateInput.type = 'number';
        rateInput.className = 'cell-input cell-rate-input';
        rateInput.value = row.rate.toFixed(2);
        rateInput.min = '0';
        rateInput.step = '0.01';
        rateInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            billingRows[index].rate = val;
            recalcRow(index, 'rate');
        });
        tdRate.appendChild(rateInput);
        tr.appendChild(tdRate);




        // Final Amt (readonly)
        const tdFinal = document.createElement('td');
        tdFinal.className = 'cell-readonly';
        tdFinal.textContent = '₹' + finalAmt.toFixed(2);
        tdFinal.setAttribute('data-field', 'finalAmt');
        tr.appendChild(tdFinal);

        // Tax % (editable)
        const tdTax = document.createElement('td');
        const taxInput = document.createElement('input');
        taxInput.type = 'number';
        taxInput.className = 'cell-input';
        taxInput.value = row.taxPercent;
        taxInput.min = '0';
        taxInput.step = '0.01';
        taxInput.setAttribute('data-row', index);
        taxInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            billingRows[index].taxPercent = val;
            recalcRow(index, 'tax');
        });
        tdTax.appendChild(taxInput);
        tr.appendChild(tdTax);

        // Tax Amt
        const tdTaxAmt = document.createElement('td');
        tdTaxAmt.className = 'cell-readonly';
        tdTaxAmt.textContent = '₹' + taxAmt.toFixed(2);
        tdTaxAmt.setAttribute('data-field', 'taxAmt');
        tr.appendChild(tdTaxAmt);

        // Total Amt
        const tdTotal = document.createElement('td');
        tdTotal.className = 'cell-readonly';
        tdTotal.textContent = '₹' + totalAmt.toFixed(2);
        tdTotal.setAttribute('data-field', 'totalAmt');
        tr.appendChild(tdTotal);

        // Action (delete)
        const tdAction = document.createElement('td');
        tdAction.style.textAlign = 'left';
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete-row';
        delBtn.innerHTML = '<i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>';
        delBtn.setAttribute('data-row', index);
        delBtn.addEventListener('click', () => {
            billingRows.splice(index, 1);
            renderBillingTable();
            updateSummary();
        });
        tdAction.appendChild(delBtn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });

    // Re-init lucide icons for new delete buttons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Recalculate a single row and update its cells in-place (without full re-render)
function recalcRow(index, triggerField, customAmountVal) {
    const row = billingRows[index];
    let amount = row.qty * row.rate;
    if (triggerField === 'amount') {
        amount = customAmountVal !== undefined ? customAmountVal : amount;
    }
    const finalAmt = amount - (parseFloat(row.disc) || 0);
    const taxAmt = calcTaxAmt(finalAmt, row.taxPercent, row.sellingTaxType);
    const totalAmt = finalAmt + taxAmt;

    const tbody = document.getElementById('billingTableBody');
    const tr = tbody.children[index];
    if (!tr) return;

    // Update Rate input (if rate wasn't the trigger, update it)
    if (triggerField !== 'rate') {
        const rateInput = tr.querySelector('.cell-rate-input');
        if (rateInput) rateInput.value = row.rate.toFixed(2);
    }



    // Update Final Amt cell
    const finalAmtCell = tr.querySelector('[data-field="finalAmt"]');
    if (finalAmtCell) finalAmtCell.textContent = '₹' + finalAmt.toFixed(2);

    // Update Tax Amt cell
    const taxAmtCell = tr.querySelector('[data-field="taxAmt"]');
    if (taxAmtCell) taxAmtCell.textContent = '₹' + taxAmt.toFixed(2);

    // Update Total Amt cell
    const totalAmtCell = tr.querySelector('[data-field="totalAmt"]');
    if (totalAmtCell) totalAmtCell.textContent = '₹' + totalAmt.toFixed(2);

    updateSummary();
}

// ============================================================
// PRICE SUMMARY
// ============================================================
function setupPriceSummaryToggle() {
    const header = document.getElementById('priceSummaryHeader');
    const toggleBtn = document.getElementById('toggleSummaryBtn');
    const details = document.getElementById('priceSummaryDetails');
    const body = document.querySelector('.price-summary-body');

    if (!header || !toggleBtn || !details || !body) return;

    header.addEventListener('click', () => {
        const isExpanded = body.classList.toggle('expanded');
        if (isExpanded) {
            details.style.display = 'flex';
            toggleBtn.innerHTML = '<i data-lucide="minus" style="width: 14px; height: 14px; stroke-width: 3;"></i>';
        } else {
            details.style.display = 'none';
            toggleBtn.innerHTML = '<i data-lucide="plus" style="width: 14px; height: 14px; stroke-width: 3;"></i>';
        }
        if (window.lucide) {
            lucide.createIcons();
        }
    });
}

function updateSummary() {
    let subTotal = 0;
    let totalDiscount = 0;
    let totalTaxAmt = 0;

    billingRows.forEach(row => {
        const amount = row.qty * row.rate;
        const disc = parseFloat(row.disc) || 0;
        const finalAmt = amount - disc;
        const taxAmt = calcTaxAmt(finalAmt, row.taxPercent, row.sellingTaxType);
        
        subTotal += finalAmt; // subTotal starts post row-level discounts
        totalTaxAmt += taxAmt;
    });

    // Global discount calculation
    const globalDiscountSelect = document.getElementById('billDiscountType');
    const globalDiscountInput = document.getElementById('billDiscountInput');
    let globalDiscountVal = 0;
    if (globalDiscountInput) {
        globalDiscountVal = parseFloat(globalDiscountInput.value) || 0;
    }

    let globalDiscountAmt = 0;
    if (globalDiscountSelect && globalDiscountSelect.value === 'percent') {
        globalDiscountAmt = subTotal * (globalDiscountVal / 100);
    } else {
        globalDiscountAmt = globalDiscountVal;
    }

    // Only show the global bill-level discount in the summary card
    totalDiscount = globalDiscountAmt;

    // Deduct global discount proportionally from taxAmt
    if (subTotal > 0 && globalDiscountAmt > 0) {
        const discountRatio = (subTotal - globalDiscountAmt) / subTotal;
        totalTaxAmt = totalTaxAmt * discountRatio;
    }

    const afterDiscount = subTotal - totalDiscount;
    const sgst = totalTaxAmt / 2;
    const cgst = totalTaxAmt / 2;
    const total = afterDiscount + totalTaxAmt;
    const grandTotal = Math.round(total);
    const roundOff = grandTotal - total;

    // Update received payments total if it's the initial single row (auto-updated)
    if (window.receivedPayments && receivedPayments.length === 1 && (receivedPayments[0].amount === 0 || receivedPayments[0].isAutoUpdated)) {
        receivedPayments[0].amount = grandTotal;
        receivedPayments[0].isAutoUpdated = true;
        renderReceivedPayments();
    }

    document.getElementById('summarySubTotal').textContent = '₹' + subTotal.toFixed(2);
    document.getElementById('summaryDiscount').textContent = '₹' + totalDiscount.toFixed(2);
    document.getElementById('summaryAfterDiscount').textContent = '₹' + afterDiscount.toFixed(2);
    document.getElementById('summarySGST').textContent = '₹' + sgst.toFixed(2);
    document.getElementById('summaryCGST').textContent = '₹' + cgst.toFixed(2);
    document.getElementById('summaryTotal').textContent = '₹' + total.toFixed(2);
    document.getElementById('summaryRoundOff').textContent = roundOff >= 0 ? '+' + roundOff.toFixed(2) : roundOff.toFixed(2);
    document.getElementById('summaryGrandTotal').textContent = '₹' + grandTotal.toFixed(2);
}

// ============================================================
// BARCODE SCANNER
// ============================================================
function setupBarcodeScanner() {
    const barcodeBtn = document.getElementById('billingBarcodeBtn');
    const scannerModal = document.getElementById('billingScannerModal');
    const closeBtn = document.getElementById('closeBillingScannerBtn');

    if (barcodeBtn) {
        barcodeBtn.addEventListener('click', () => {
            scannerModal.style.display = 'flex';
            startBillingQRScanner();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            stopBillingQRScanner();
        });
    }
}

function startBillingQRScanner() {
    if (!window.Html5Qrcode) {
        showToast('QR Code library failed to load.', 'error');
        return;
    }

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("billing-qr-reader");
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
            const code = decodedText.trim();
            addItemByCode(code);
            stopBillingQRScanner();
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
                document.getElementById('billingScannerModal').style.display = 'none';
            });
        });
    } catch (e) {
        console.error(e);
        showToast("Error initializing camera scanner", "error");
    }
}

function stopBillingQRScanner() {
    const scannerModal = document.getElementById('billingScannerModal');
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

// ============================================================
// FOOTER BUTTONS
// ============================================================
function setupFooterButtons() {
    // Clear All
    const clearAllBtn = document.getElementById('clearAllBillBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            billingRows = [];
            renderBillingTable();
            updateSummary();
            showToast('Bill cleared', 'success');
        });
    }

    // Add Items - focus search input
    const addItemsBtn = document.getElementById('addItemsBtn');
    if (addItemsBtn) {
        addItemsBtn.addEventListener('click', () => {
            const searchInput = document.getElementById('billingSearchInput');
            if (searchInput) searchInput.focus();
        });
    }

    // Save & New
    const saveNewBtn = document.getElementById('saveNewBtn');
    if (saveNewBtn) {
        saveNewBtn.addEventListener('click', async () => {
            if (!activeCustomer) {
                showToast('Customer selection is mandatory.', 'error');
                return;
            }
            if (billingRows.length === 0) {
                showToast('No items in bill', 'error');
                return;
            }
            await saveBill();
            clearInvoiceForm();
            await incrementInvoiceNumber();
            showToast('Bill saved! New bill started.', 'success');
        });
    }

    // Save & Print
    const savePrintBtn = document.getElementById('savePrintBtn');
    if (savePrintBtn) {
        savePrintBtn.addEventListener('click', async () => {
            if (!activeCustomer) {
                showToast('Customer selection is mandatory.', 'error');
                return;
            }
            if (billingRows.length === 0) {
                showToast('No items in bill', 'error');
                return;
            }
            await saveBill();
            clearInvoiceForm();
            await incrementInvoiceNumber();
            showToast('Bill saved!', 'success');
            // Trigger print after a short delay
            setTimeout(() => window.print(), 500);
        });
    }
}

async function saveBill() {
    const invoiceNumber = document.getElementById('invoiceNumber').textContent;
    const billingDate = document.getElementById('billingDate').textContent;

    const grandTotal = Math.round(parseFloat(document.getElementById('summaryGrandTotal').textContent.replace('₹', '')) || 0);
    const receivedAmount = receivedPayments.reduce((sum, p) => sum + p.amount, 0);
    const customerName = activeCustomer ? activeCustomer.name : 'Walk In Customer';

    const billData = {
        invoiceNumber,
        date: billingDate,
        customerName,
        receivedAmount,
        grandTotal,
        payments: receivedPayments,
        items: billingRows.map(row => {
            const amount = row.qty * row.rate;
            const disc = parseFloat(row.disc) || 0;
            const finalAmt = amount - disc;
            const taxAmt = calcTaxAmt(finalAmt, row.taxPercent, row.sellingTaxType);
            const totalAmt = finalAmt + taxAmt;
            return {
                code: row.item.code,
                name: row.item.name,
                qty: row.qty,
                unit: row.unitOptions[row.unitIndex].label,
                rate: row.rate,
                amount: amount,
                disc: disc,
                finalAmt: finalAmt,
                taxPercent: row.taxPercent,
                taxAmt: taxAmt,
                totalAmt: totalAmt
            };
        })
    };

    // Save to sales history via API
    try {
        const resSales = await fetch('/api/sales');
        const salesHistory = await resSales.json();
        salesHistory.push(billData);
        await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(salesHistory)
        });
    } catch (err) {
        console.error('Error saving bill:', err);
    }
}

// ============================================================
// RECEIVED PAYMENTS DYNAMIC ROWS
// ============================================================
let receivedPayments = [{ mode: 'Cash', amount: 0, isAutoUpdated: true }];

function renderReceivedPayments() {
    console.log("renderReceivedPayments called, current receivedPayments:", receivedPayments);
    const container = document.getElementById('receivedRowsContainer');
    if (!container) {
        console.error("receivedRowsContainer element not found!");
        return;
    }
    container.innerHTML = '';

    if (receivedPayments.length === 0) {
        receivedPayments.push({ mode: 'Cash', amount: 0, isAutoUpdated: true });
    }

    const payment = receivedPayments[0];
    console.log("Rendering payment:", payment);

    // Amount input group matching the uploaded image exactly
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-addon-group';
    inputWrapper.style.height = '38px';

    const rupeeSpan = document.createElement('span');
    rupeeSpan.className = 'input-prefix-icon';
    rupeeSpan.textContent = '₹';
    rupeeSpan.style.borderRadius = '6px 0 0 6px';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'received-amount-input';
    input.value = payment.amount;
    input.min = '0';
    input.style.borderRadius = '0 6px 6px 0';

    input.addEventListener('input', (e) => {
        payment.amount = parseFloat(e.target.value) || 0;
        payment.isAutoUpdated = false;
    });

    inputWrapper.appendChild(rupeeSpan);
    inputWrapper.appendChild(input);

    container.appendChild(inputWrapper);
    console.log("Successfully appended inputWrapper to container:", container.innerHTML);

    if (window.lucide) {
        lucide.createIcons();
    }
}

// ============================================================
// CUSTOMER SELECTION MODAL
// ============================================================
let activeCustomer = null;

async function setupCustomerModal() {
    let customers = [];
    try {
        const res = await fetch('/api/customers');
        customers = await res.json();
    } catch (err) {
        console.error('Error loading customers:', err);
    }
    ensureWalkInCustomer(customers);

    // Auto-select Walk In Customer on page load if none selected
    if (!activeCustomer) {
        activeCustomer = customers.find(c => c.name === 'Walk In Customer') || customers[0];
        updateSelectedCustomerUI();
    }

    const modal = document.getElementById('customerModal');
    const openBtnHeader = document.getElementById('addCustomerBtnHeader');
    const openBtnEmpty = document.getElementById('customerEmptyState');
    const openBtnChange = document.getElementById('changeCustomerBtn');
    const backBtn = document.getElementById('modalCustBackBtn');
    const saveBtn = document.getElementById('modalCustSaveBtn');
    const newBtn = document.getElementById('modalNewCustBtn');
    const searchInput = document.getElementById('modalCustomerSearch');
    const taxToggle = document.getElementById('custFormTaxToggle');
    const taxFields = document.getElementById('taxFieldsContainer');
    const listContainer = document.getElementById('modalCustomerList');

    let currentSelectedId = null;

    // Initialize Custom Dropdowns for Customer Form
    initGenericDropdown('custFormCountryDropdown');
    initGenericDropdown('custFormStateDropdown');

    // Populate Right Details Pane
    function loadCustomerForm(customer) {
        if (!customer) {
            document.getElementById('custFormName').value = '';
            document.getElementById('custFormMobile').value = '';
            document.getElementById('custFormAddress').value = '';
            document.getElementById('custFormCountry').value = 'India';
            document.getElementById('custFormState').value = 'Tamil Nadu';
            const countryTrigger = document.querySelector('#custFormCountryDropdown .trigger-text');
            if(countryTrigger) countryTrigger.textContent = 'India';
            const stateTrigger = document.querySelector('#custFormStateDropdown .trigger-text');
            if(stateTrigger) stateTrigger.textContent = 'Tamil Nadu';
            document.getElementById('custFormCity').value = '';
            document.getElementById('custFormPin').value = '';
            taxToggle.checked = false;
            document.getElementById('custFormGSTIN').value = '';
            document.getElementById('custFormPAN').value = '';
            currentSelectedId = null;
        } else {
            document.getElementById('custFormName').value = customer.name || '';
            document.getElementById('custFormMobile').value = customer.mobile || '';
            document.getElementById('custFormAddress').value = customer.address || '';
            const countryVal = customer.country || 'India';
            document.getElementById('custFormCountry').value = countryVal;
            const countryTrigger = document.querySelector('#custFormCountryDropdown .trigger-text');
            if(countryTrigger) countryTrigger.textContent = countryVal;
            
            const stateVal = customer.state || 'Tamil Nadu';
            document.getElementById('custFormState').value = stateVal;
            const stateTrigger = document.querySelector('#custFormStateDropdown .trigger-text');
            if(stateTrigger) stateTrigger.textContent = stateVal;
            
            document.getElementById('custFormCity').value = customer.city || '';
            document.getElementById('custFormPin').value = customer.pin || '';
            taxToggle.checked = !!customer.taxToggle;
            document.getElementById('custFormGSTIN').value = customer.gstin || '';
            document.getElementById('custFormPAN').value = customer.pan || '';
            currentSelectedId = customer.id;
        }
        
        // Ensure custom dropdown selections are updated
        document.querySelectorAll('#custFormCountryDropdown .custom-dropdown-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.value === document.getElementById('custFormCountry').value);
        });
        document.querySelectorAll('#custFormStateDropdown .custom-dropdown-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.value === document.getElementById('custFormState').value);
        });
    }

    // Render Left Hand list
    function renderCustomerList(filter = '') {
        const query = filter.trim().toLowerCase();
        
        const filtered = customers.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.mobile.includes(query)
        );

        listContainer.innerHTML = '';
        if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">No customers found</div>';
            return;
        }

        filtered.forEach(c => {
            const card = document.createElement('div');
            card.className = 'customer-list-card';
            if (c.id === currentSelectedId) {
                card.classList.add('active');
            }
            card.innerHTML = `
                <span class="cust-card-name">${c.name}</span>
                <span class="cust-card-mobile">${c.mobile}</span>
            `;
            card.addEventListener('click', () => {
                listContainer.querySelectorAll('.customer-list-card').forEach(el => el.classList.remove('active'));
                card.classList.add('active');
                currentSelectedId = c.id;
                loadCustomerForm(c);
            });
            listContainer.appendChild(card);
        });
    }

    // Modal Visibility Control
    const openModal = async () => {
        modal.style.display = 'flex';
        try {
            const res = await fetch('/api/customers');
            customers = await res.json();
        } catch (err) {
            console.error(err);
        }
        ensureWalkInCustomer(customers);
        if (activeCustomer) {
            currentSelectedId = activeCustomer.id;
            loadCustomerForm(activeCustomer);
        } else if (customers.length > 0) {
            currentSelectedId = customers[0].id;
            loadCustomerForm(customers[0]);
        } else {
            loadCustomerForm(null);
        }
        renderCustomerList();
        if (window.lucide) lucide.createIcons();
    };

    const closeModal = () => {
        modal.style.display = 'none';
    };

    openBtnHeader.addEventListener('click', openModal);
    openBtnEmpty.addEventListener('click', openModal);
    openBtnChange.addEventListener('click', openModal);
    backBtn.addEventListener('click', closeModal);

    const openBtnList = document.getElementById('addCustFromListBtn');
    if (openBtnList) {
        openBtnList.addEventListener('click', openModal);
    }

    newBtn.addEventListener('click', () => {
        loadCustomerForm(null);
        listContainer.querySelectorAll('.customer-list-card').forEach(el => el.classList.remove('active'));
    });

    searchInput.addEventListener('input', () => {
        renderCustomerList(searchInput.value);
    });

    saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('custFormName').value.trim();
        const mobile = document.getElementById('custFormMobile').value.trim();
        const address = document.getElementById('custFormAddress').value.trim();
        const country = document.getElementById('custFormCountry').value;
        const state = document.getElementById('custFormState').value;
        const city = document.getElementById('custFormCity').value.trim();
        const pin = document.getElementById('custFormPin').value.trim();
        const isTaxToggled = taxToggle.checked;
        const gstin = document.getElementById('custFormGSTIN').value.trim();
        const pan = document.getElementById('custFormPAN').value.trim();

        if (!name || !mobile) {
            showToast('Customer Name and Mobile Number are required!', 'error');
            return;
        }

        let savedCust = null;

        if (currentSelectedId) {
            customers = customers.map(c => {
                if (c.id === currentSelectedId) {
                    savedCust = {
                        ...c, name, mobile, address, country, state, city, pin,
                        taxToggle: isTaxToggled, gstin, pan
                    };
                    return savedCust;
                }
                return c;
            });
            showToast('customer updated', 'success');
        } else {
            const newId = String(Date.now());
            savedCust = {
                id: newId, name, mobile, address, country, state, city, pin,
                taxToggle: isTaxToggled, gstin, pan
            };
            customers.push(savedCust);
            showToast('customer added', 'success');
        }

        try {
            await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customers)
            });
        } catch (err) {
            console.error('Error saving customers:', err);
        }
        activeCustomer = savedCust;

        updateSelectedCustomerUI();
        closeModal();
        await renderCustomerWorkspace();
    });

    function updateSelectedCustomerUI() {
        const emptyState = document.getElementById('customerEmptyState');
        const selectedState = document.getElementById('customerSelectedState');
        const nameSpan = document.getElementById('selectedCustName');
        const mobileSpan = document.getElementById('selectedCustMobile');
        const taxInfoSpan = document.getElementById('selectedCustTaxInfo');
        const gstSpan = document.getElementById('selectedCustGST');

        if (activeCustomer) {
            emptyState.style.display = 'none';
            selectedState.style.display = 'block';
            nameSpan.textContent = activeCustomer.name;
            mobileSpan.textContent = activeCustomer.mobile;

            if (activeCustomer.taxToggle && activeCustomer.gstin) {
                taxInfoSpan.style.display = 'block';
                gstSpan.textContent = activeCustomer.gstin;
            } else {
                taxInfoSpan.style.display = 'none';
            }
        } else {
            emptyState.style.display = 'flex';
            selectedState.style.display = 'none';
        }
    }
}

// ============================================================
// BILL DISCOUNT SETUP
// ============================================================
function setupBillDiscountListeners() {
    initGenericDropdown('billDiscountDropdown');
    const typeSelect = document.getElementById('billDiscountType');
    const discountInput = document.getElementById('billDiscountInput');

    if (!typeSelect || !discountInput) return;

    typeSelect.addEventListener('change', () => {
        updateSummary();
    });

    discountInput.addEventListener('input', () => {
        updateSummary();
    });
}

// ============================================================
// SALES LIST TAB MANAGEMENT
// ============================================================
function setupSalesListTabs() {
    const tabBilling = document.getElementById('tabBilling');
    const tabSalesList = document.getElementById('tabSalesList');
    const tabCustomer = document.getElementById('tabCustomer');
    const tabAmountReceived = document.getElementById('tabAmountReceived');

    const billingWorkspace = document.querySelector('.billing-workspace');
    const salesListWorkspace = document.getElementById('salesListWorkspace');
    const customerWorkspace = document.getElementById('customerWorkspace');
    const amountReceivedWorkspace = document.getElementById('amountReceivedWorkspace');
    const billingFooter = document.getElementById('mainBillingFooter');

    if (!tabBilling || !tabSalesList || !billingWorkspace || !salesListWorkspace || !billingFooter) return;

    const tabs = [tabBilling, tabSalesList, tabCustomer, tabAmountReceived];
    const workspaces = [billingWorkspace, salesListWorkspace, customerWorkspace, amountReceivedWorkspace];

    function activateTab(activeTab, activeWorkspace, showFooter = false) {
        tabs.forEach(t => { if (t) t.classList.remove('active'); });
        workspaces.forEach(w => { if (w) w.style.display = 'none'; });
        
        const createArWS = document.getElementById('createAmountReceivedWorkspace');
        if (createArWS) createArWS.style.display = 'none';
        const createArF = document.getElementById('createArFooter');
        if (createArF) createArF.style.display = 'none';
        
        if (activeTab) {
            activeTab.classList.add('active');
            sessionStorage.setItem('activeSalesTab', activeTab.id);
        }
        if (activeWorkspace) activeWorkspace.style.display = 'flex';
        if (billingFooter) billingFooter.style.display = showFooter ? 'flex' : 'none';
    }

    tabBilling.addEventListener('click', (e) => {
        e.preventDefault();
        activateTab(tabBilling, billingWorkspace, true);
    });

    tabSalesList.addEventListener('click', async (e) => {
        e.preventDefault();
        activateTab(tabSalesList, salesListWorkspace, false);
        await renderSalesList();
    });

    if (tabCustomer) {
        tabCustomer.addEventListener('click', async (e) => {
            e.preventDefault();
            activateTab(tabCustomer, customerWorkspace, false);
            await renderCustomerWorkspace();
        });
    }

    if (tabAmountReceived) {
        tabAmountReceived.addEventListener('click', async (e) => {
            e.preventDefault();
            activateTab(tabAmountReceived, amountReceivedWorkspace, false);
            await renderAmountReceivedWorkspace();
        });
    }

    // Wire up search filter on sales list
    const searchInput = document.getElementById('salesListSearchInput');
    const clearBtn = document.getElementById('clearSalesSearchBtn');
    const searchIcon = document.getElementById('salesSearchIcon');
    
    if (searchInput && clearBtn && searchIcon) {
        searchInput.addEventListener('input', async () => {
            const query = searchInput.value.trim();
            await renderSalesList(query);
        });

        clearBtn.addEventListener('click', async () => {
            searchInput.value = '';
            if (window.clearDateFilter) window.clearDateFilter('salesList');
            await renderSalesList();
        });
    }

    // Wire up search filter on customer list
    const custSearchInput = document.getElementById('custSearchInput');
    const clearCustSearchBtn = document.getElementById('clearCustSearchBtn');
    
    if (custSearchInput && clearCustSearchBtn) {
        custSearchInput.addEventListener('input', async () => {
            const query = custSearchInput.value.trim();
            await renderCustomerWorkspace(query);
        });

        clearCustSearchBtn.addEventListener('click', async () => {
            custSearchInput.value = '';
            await renderCustomerWorkspace();
        });
    }

    // Restore active tab from session storage
    const savedTabId = sessionStorage.getItem('activeSalesTab');
    if (savedTabId) {
        const savedTab = document.getElementById(savedTabId);
        if (savedTab) savedTab.click();
    }
}

async function renderSalesList(filterQuery = '') {
    let salesHistory = [];
    try {
        const res = await fetch('/api/sales');
        salesHistory = await res.json();
    } catch (err) {
        console.error('Error loading sales:', err);
    }
    const tableBody = document.getElementById('salesListTableBody');
    if (!tableBody) return;

    // 1. Sort sales history descending (last created first)
    const sortedSales = [...salesHistory].reverse();

    // 2. Filter sales if query exists
    const query = filterQuery.toLowerCase().trim();
    let filteredSales = sortedSales.filter(sale => 
        sale.invoiceNumber.toLowerCase().includes(query) ||
        (sale.customerName && sale.customerName.toLowerCase().includes(query))
    );

    if (window.dateFilters && window.dateFilters.salesList) {
        const { start, end } = window.dateFilters.salesList;
        filteredSales = filteredSales.filter(sale => {
            const saleDate = window.parseFilterDate(sale.date);
            if (!saleDate) return false;
            saleDate.setHours(0,0,0,0);
            return saleDate >= start && saleDate <= end;
        });
    }

    // 3. Compute stats
    let grandTotalSum = 0;
    let totalReceivedSum = 0;
    let totalPendingSum = 0;

    sortedSales.forEach(sale => {
        const total = parseFloat(sale.grandTotal) || 0;
        const received = parseFloat(sale.receivedAmount) || 0;
        const pending = Math.max(0, total - received);
        const actualReceived = total - pending; // invoice - pending amount

        grandTotalSum += total;
        totalReceivedSum += actualReceived;
        totalPendingSum += pending;
    });

    document.getElementById('salesStatTotalAmount').textContent = '₹' + grandTotalSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('salesStatTotalReceived').textContent = '₹' + totalReceivedSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('salesStatTotalPending').textContent = '₹' + totalPendingSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // 4. Render Table Rows
    tableBody.innerHTML = '';
    if (filteredSales.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No sales records found</td></tr>';
        return;
    }

    filteredSales.forEach((sale, index) => {
        const total = parseFloat(sale.grandTotal) || 0;
        const received = parseFloat(sale.receivedAmount) || 0;
        const pending = Math.max(0, total - received);
        const isPaid = pending === 0;

        const tr = document.createElement('tr');
        tr.style.height = '40px';

        // S. No.
        const tdSno = document.createElement('td');
        tdSno.textContent = index + 1;
        tr.appendChild(tdSno);

        // Date
        const tdDate = document.createElement('td');
        tdDate.textContent = sale.date || '';
        tr.appendChild(tdDate);

        // INV No (Clickable blue link)
        const tdInv = document.createElement('td');
        const invLink = document.createElement('a');
        invLink.href = '#';
        invLink.textContent = sale.invoiceNumber;
        invLink.style.color = '#2563EB';
        invLink.style.textDecoration = 'none';
        invLink.style.fontWeight = '500';
        invLink.addEventListener('click', (e) => {
            e.preventDefault();
            showToast(`Viewing details for ${sale.invoiceNumber}`, 'success');
        });
        tdInv.appendChild(invLink);
        tr.appendChild(tdInv);

        // Customer Name
        const tdCust = document.createElement('td');
        tdCust.textContent = sale.customerName || 'Walk In Customer';
        tr.appendChild(tdCust);

        // Invoice Amount
        const tdAmount = document.createElement('td');
        tdAmount.textContent = '₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        tr.appendChild(tdAmount);

        // Pending
        const tdPending = document.createElement('td');
        tdPending.textContent = '₹' + pending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        tr.appendChild(tdPending);

        // Status
        const tdStatus = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.textContent = isPaid ? 'Paid' : 'Pending';
        statusBadge.style.display = 'inline-block';
        statusBadge.style.padding = '4px 12px';
        statusBadge.style.borderRadius = '4px';
        statusBadge.style.fontSize = '12px';
        statusBadge.style.fontWeight = '600';
        statusBadge.style.color = 'white';
        statusBadge.style.textAlign = 'center';
        statusBadge.style.minWidth = '80px';
        statusBadge.style.boxSizing = 'border-box';
        
        if (isPaid) {
            statusBadge.style.backgroundColor = '#22C55E'; // green
        } else {
            statusBadge.style.backgroundColor = '#EF4444'; // red
        }
        
        tdStatus.appendChild(statusBadge);
        tr.appendChild(tdStatus);

        tableBody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

// ============================================================
// CLEAR INVOICE FORM
// ============================================================
function clearInvoiceForm() {
    billingRows = [];
    activeCustomer = { name: 'Walk In Customer', mobile: '9994121042', taxToggle: false };
    
    // Reset selected customer UI
    const emptyState = document.getElementById('customerEmptyState');
    const selectedState = document.getElementById('customerSelectedState');
    const nameSpan = document.getElementById('selectedCustName');
    const mobileSpan = document.getElementById('selectedCustMobile');
    const taxInfoSpan = document.getElementById('selectedCustTaxInfo');
    
    if (emptyState && selectedState) {
        emptyState.style.display = 'none';
        selectedState.style.display = 'block';
        if (nameSpan) nameSpan.textContent = activeCustomer.name;
        if (mobileSpan) mobileSpan.textContent = activeCustomer.mobile;
        if (taxInfoSpan) taxInfoSpan.style.display = 'none';
    }
    
    // Reset discount
    const discountInput = document.getElementById('billDiscountInput');
    if (discountInput) discountInput.value = '0';
    const discountType = document.getElementById('billDiscountType');
    if (discountType) discountType.value = 'rupee';
    // Removed discountSymbol reference
    
    // Reset received amount input
    receivedPayments = [{ mode: 'Cash', amount: 0, isAutoUpdated: true }];
    renderReceivedPayments();
    
    renderBillingTable();
    updateSummary();
}

async function renderCustomerWorkspace(filterQuery = '') {
    let customers = [];
    let salesHistory = [];
    try {
        const resCust = await fetch('/api/customers');
        customers = await resCust.json();
    } catch (err) {
        console.error('Error loading customers:', err);
    }

    try {
        const resSales = await fetch('/api/sales');
        salesHistory = await resSales.json();
    } catch (err) {
        console.error('Error loading sales:', err);
    }

    ensureWalkInCustomer(customers);

    // Filter by customer name query (case-insensitive)
    const query = filterQuery.toLowerCase().trim();
    const filteredCustomers = customers.filter(c => 
        c.name.toLowerCase().includes(query)
    );

    // Compute stats
    const totalCustomersCount = customers.length;
    let totalAmountToReceive = 0;

    const customerRows = [];
    filteredCustomers.forEach(cust => {
        let totalAmountPurchase = 0;
        let totalPending = 0;
        let hasTransactionsInDateRange = false;

        salesHistory.forEach(sale => {
            if (sale.customerName && sale.customerName.toLowerCase() === cust.name.toLowerCase()) {
                const total = parseFloat(sale.grandTotal) || 0;
                const received = parseFloat(sale.receivedAmount) || 0;
                const pending = Math.max(0, total - received);
                totalAmountPurchase += total;
                totalPending += pending;
            }
        });

        customerRows.push({
            name: cust.name,
            mobile: cust.mobile || '',
            totalAmountPurchase,
            totalPending
        });
    });

    // Compute total pending across all customers
    customers.forEach(cust => {
        let custPending = 0;
        salesHistory.forEach(sale => {
            if (sale.customerName && sale.customerName.toLowerCase() === cust.name.toLowerCase()) {
                const total = parseFloat(sale.grandTotal) || 0;
                const received = parseFloat(sale.receivedAmount) || 0;
                const pending = Math.max(0, total - received);
                custPending += pending;
            }
        });

        totalAmountToReceive += custPending;
    });

    // Update stats UI
    const totalCustSpan = document.getElementById('custStatTotalCustomer');
    const amountToReceiveSpan = document.getElementById('custStatAmountToReceive');
    
    if (totalCustSpan) totalCustSpan.textContent = totalCustomersCount;
    if (amountToReceiveSpan) {
        amountToReceiveSpan.textContent = '₹' + totalAmountToReceive.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // Render Table Rows
    const tableBody = document.getElementById('customerTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (customerRows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No customers found</td></tr>';
        return;
    }

    customerRows.forEach((cust, index) => {
        const tr = document.createElement('tr');
        tr.style.height = '40px';

        // S. No.
        const tdSno = document.createElement('td');
        tdSno.textContent = index + 1;
        tr.appendChild(tdSno);

        // Customer Name
        const tdName = document.createElement('td');
        tdName.textContent = cust.name;
        tdName.style.fontWeight = '500';
        tr.appendChild(tdName);

        // Mobile Number
        const tdMobile = document.createElement('td');
        tdMobile.textContent = cust.mobile;
        tr.appendChild(tdMobile);

        // Total Amount
        const tdTotal = document.createElement('td');
        const totalVal = cust.totalAmountPurchase;
        const totalFormatted = '₹' + totalVal.toLocaleString('en-IN', {
            minimumFractionDigits: (totalVal % 1 === 0 && totalVal < 1000) ? 0 : 2,
            maximumFractionDigits: 2
        });
        tdTotal.textContent = totalFormatted;
        tr.appendChild(tdTotal);

        // Pending
        const tdPending = document.createElement('td');
        const pendingVal = cust.totalPending;
        const pendingFormatted = '₹' + pendingVal.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        tdPending.textContent = pendingFormatted;
        if (pendingVal > 0) {
            tdPending.style.color = '#EF4444';
            tdPending.style.fontWeight = '600';
        } else {
            tdPending.style.color = '#1A1A1A';
        }
        tr.appendChild(tdPending);

        tableBody.appendChild(tr);
    });

    if (window.lucide) {
        lucide.createIcons();
    }
}

function ensureWalkInCustomer(custArray) {
    if (!custArray) return;
    const hasWalkIn = custArray.some(c => c.name === 'Walk In Customer' || c.mobile === '9994121042');
    if (!hasWalkIn) {
        custArray.unshift({
            id: '1',
            name: 'Walk In Customer',
            mobile: '9994121042',
            address: '',
            country: 'India',
            state: 'Tamil Nadu',
            city: '',
            pin: '',
            taxToggle: false,
            gstin: '',
            pan: ''
        });
    } else {
        const walkInObj = custArray.find(c => c.name === 'Walk In Customer');
        if (walkInObj) {
            walkInObj.mobile = '9994121042';
        }
    }
}

async function setupAmountReceivedWorkspace() {
    // 1. Show creation page when Create button is clicked
    const createBtn = document.getElementById('createArBtn');
    const amountReceivedWorkspace = document.getElementById('amountReceivedWorkspace');
    const createArWorkspace = document.getElementById('createAmountReceivedWorkspace');
    const billingFooter = document.getElementById('mainBillingFooter');
    const createArFooter = document.getElementById('createArFooter');

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            if (amountReceivedWorkspace) amountReceivedWorkspace.style.display = 'none';
            if (billingFooter) billingFooter.style.display = 'none';
            if (createArWorkspace) createArWorkspace.style.display = 'flex';
            if (createArFooter) createArFooter.style.display = 'flex';
            await initCreateAmountReceived();
        });
    }

    // 2. Handle Back button click
    const backBtn = document.getElementById('createArBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (createArWorkspace) createArWorkspace.style.display = 'none';
            if (createArFooter) createArFooter.style.display = 'none';
            if (amountReceivedWorkspace) amountReceivedWorkspace.style.display = 'flex';
            renderAmountReceivedWorkspace();
        });
    }

    // 3. Handle Save & Save Add buttons
    const saveBtn = document.getElementById('createArSaveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const success = await saveCreateAmountReceived();
            if (success) {
                if (createArWorkspace) createArWorkspace.style.display = 'none';
                if (createArFooter) createArFooter.style.display = 'none';
                if (amountReceivedWorkspace) amountReceivedWorkspace.style.display = 'flex';
                await renderAmountReceivedWorkspace();
                await renderCustomerWorkspace();
            }
        });
    }

    const saveAddBtn = document.getElementById('createArSaveAddBtn');
    if (saveAddBtn) {
        saveAddBtn.addEventListener('click', async () => {
            const success = await saveCreateAmountReceived();
            if (success) {
                await initCreateAmountReceived();
                await renderCustomerWorkspace();
            }
        });
    }

    // 4. Handle Customer Dropdown Selection
    const customerSelect = document.getElementById('createArCustomerSelect');
    if (customerSelect) {
        customerSelect.addEventListener('change', async () => {
            await handleArCustomerChange();
        });
    }

    // 5. Handle Discount Input to recalculate Pending & Received fields
    const discountInput = document.getElementById('createArDiscountInput');
    if (discountInput) {
        discountInput.addEventListener('input', () => {
            handleArDiscountInput();
        });
    }

    // 6. Search filters
    const searchInput = document.getElementById('arSearchInput');
    const clearBtn = document.getElementById('clearArSearchBtn');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderAmountReceivedWorkspace(searchInput.value);
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (window.clearDateFilter) window.clearDateFilter('arList');
            renderAmountReceivedWorkspace();
        });
    }
}

let currentCustomerPendingSales = [];
let totalPendingSum = 0;

async function initCreateAmountReceived() {
    // Set default date to today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('createArDateInput').value = `${yyyy}-${mm}-${dd}`;

    // Reset discount, pending, received fields
    document.getElementById('createArDiscountInput').value = '0.00';
    document.getElementById('createArPendingInput').value = '0.00';
    document.getElementById('createArReceivedInput').value = '0.00';

    // Fetch and generate AR No Suffix
    let counter = 1;
    try {
        const res = await fetch('/api/payment-counter');
        const data = await res.json();
        counter = data.counter || 1;
    } catch (err) {
        console.error('Error fetching payment counter:', err);
    }
    const arNo = 'AR' + String(counter).padStart(2, '0');
    document.getElementById('createArNoInput').value = arNo;

    // Load customers to select dropdown
    let customers = [];
    try {
        const res = await fetch('/api/customers');
        customers = await res.json();
    } catch (err) {
        console.error('Error fetching customers:', err);
    }
    ensureWalkInCustomer(customers);

    const select = document.getElementById('createArCustomerSelect');
    if (select) {
        select.innerHTML = '<option value="">Select Customer</option>';
        customers.forEach(c => {
            const opt = document.createElement('option');
            const mobile = c.mobile || '9994121042';
            opt.value = c.name;
            opt.dataset.mobile = mobile;
            opt.textContent = `${c.name}-${mobile}`;
            select.appendChild(opt);
        });
        
        select.value = '';

        setupArCustomerDropdown();

        // Initialize table and calculations
        await handleArCustomerChange();
    }
}

function setupArCustomerDropdown() {
    const dropdown = document.getElementById('createArCustomerDropdown');
    if (!dropdown) return;

    const select = dropdown.querySelector('select');
    const trigger = dropdown.querySelector('.custom-dropdown-trigger');
    const triggerText = trigger.querySelector('.trigger-text');
    const panel = dropdown.querySelector('.custom-dropdown-panel');

    // Populate panel
    panel.innerHTML = '';
    const options = Array.from(select.options);

    options.forEach((opt, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'custom-dropdown-option';
        optionDiv.textContent = opt.textContent;
        optionDiv.dataset.value = opt.value;
        optionDiv.dataset.index = index;
        optionDiv.style.fontSize = '14px'; // Set dropdown text to 14px

        if (select.value === opt.value) {
            optionDiv.classList.add('selected');
            if (opt.value) {
                triggerText.textContent = opt.textContent;
                triggerText.style.color = 'var(--text-main)';
            } else {
                triggerText.textContent = opt.textContent;
                triggerText.style.color = 'var(--text-muted)';
            }
        }

        optionDiv.addEventListener('click', () => {
            select.value = opt.value;
            // Re-query trigger text because the trigger might have been replaced
            const currentTriggerText = dropdown.querySelector('.trigger-text');
            if (currentTriggerText) {
                currentTriggerText.textContent = opt.textContent;
                
                if (opt.value) {
                    currentTriggerText.style.color = 'var(--text-main)';
                } else {
                    currentTriggerText.style.color = 'var(--text-muted)';
                }
            }

            panel.querySelectorAll('.custom-dropdown-option').forEach(el => el.classList.remove('selected'));
            optionDiv.classList.add('selected');
            dropdown.classList.remove('open');

            // Dispatch change event on select
            select.dispatchEvent(new Event('change'));
        });

        panel.appendChild(optionDiv);
    });

    // Remove previous listeners by replacing trigger clone
    const newTrigger = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(newTrigger, trigger);
    
    newTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        if (!isOpen) {
            dropdown.classList.add('open');
        }
    });
    
    // Add global click listener once
    if (!window.arDropdownListenerAdded) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-dropdown')) {
                document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
            }
        });
        window.arDropdownListenerAdded = true;
    }
}

function initGenericDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const select = dropdown.querySelector('select');
    const trigger = dropdown.querySelector('.custom-dropdown-trigger');
    const triggerText = trigger.querySelector('.trigger-text');
    const panel = dropdown.querySelector('.custom-dropdown-panel');

    // Populate panel
    panel.innerHTML = '';
    const options = Array.from(select.options);

    options.forEach((opt, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'custom-dropdown-option';
        optionDiv.textContent = opt.textContent;
        optionDiv.dataset.value = opt.value;
        optionDiv.style.fontSize = '13px'; // Match standard form font size
        
        if (select.value === opt.value) {
            optionDiv.classList.add('selected');
            triggerText.textContent = opt.textContent;
        }

        optionDiv.addEventListener('click', () => {
            select.value = opt.value;
            const currentTriggerText = dropdown.querySelector('.trigger-text');
            if (currentTriggerText) {
                currentTriggerText.textContent = opt.textContent;
            }

            panel.querySelectorAll('.custom-dropdown-option').forEach(el => el.classList.remove('selected'));
            optionDiv.classList.add('selected');
            dropdown.classList.remove('open');

            // Dispatch change event on select
            select.dispatchEvent(new Event('change'));
        });

        panel.appendChild(optionDiv);
    });

    // Remove previous listeners by replacing trigger clone
    const newTrigger = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(newTrigger, trigger);
    
    newTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        if (!isOpen) {
            dropdown.classList.add('open');
        }
    });
    
    // Add global click listener once
    if (!window.genericDropdownListenerAdded) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-dropdown')) {
                document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
            }
        });
        window.genericDropdownListenerAdded = true;
    }
}

async function handleArCustomerChange() {
    const select = document.getElementById('createArCustomerSelect');
    if (!select) return;
    const customerName = select.value;

    let salesHistory = [];
    try {
        const res = await fetch('/api/sales');
        salesHistory = await res.json();
    } catch (err) {
        console.error('Error fetching sales:', err);
    }

    // Filter pending bills of this customer (total - received > 0)
    currentCustomerPendingSales = salesHistory.filter(sale => {
        if (!sale.customerName) return false;
        if (sale.customerName.toLowerCase() !== customerName.toLowerCase()) return false;
        const total = parseFloat(sale.grandTotal) || 0;
        const received = parseFloat(sale.receivedAmount) || 0;
        return (total - received) > 0.01;
    });

    const tableBody = document.getElementById('createArPendingBillsBody');
    if (tableBody) {
        tableBody.innerHTML = '';
        if (currentCustomerPendingSales.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No pending bills found for this customer</td></tr>';
        } else {
            currentCustomerPendingSales.forEach((sale, index) => {
                const tr = document.createElement('tr');
                tr.style.height = '40px';

                // S. No.
                const tdSno = document.createElement('td');
                tdSno.textContent = index + 1;
                tdSno.style.paddingLeft = '16px';
                tr.appendChild(tdSno);

                // Date
                const tdDate = document.createElement('td');
                tdDate.textContent = formatArDateShort(sale.date);
                tr.appendChild(tdDate);

                // INV No (clickable link)
                const tdInv = document.createElement('td');
                const a = document.createElement('a');
                a.href = '#';
                a.textContent = sale.invoiceNumber;
                a.style.color = '#2563EB';
                a.style.textDecoration = 'none';
                a.style.fontWeight = '500';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    alert(`Invoice Details:\nInvoice No: ${sale.invoiceNumber}\nDate: ${sale.date}\nAmount: ₹${sale.grandTotal}\nReceived: ₹${sale.receivedAmount}`);
                });
                tdInv.appendChild(a);
                tr.appendChild(tdInv);

                // Invoice Amount
                const tdAmount = document.createElement('td');
                tdAmount.textContent = '₹' + (parseFloat(sale.grandTotal) || 0).toLocaleString('en-IN');
                tr.appendChild(tdAmount);

                // Pending Amount
                const tdPending = document.createElement('td');
                const pending = Math.max(0, (parseFloat(sale.grandTotal) || 0) - (parseFloat(sale.receivedAmount) || 0));
                tdPending.textContent = '₹' + pending.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
                tdPending.style.paddingRight = '16px';
                tr.appendChild(tdPending);

                tableBody.appendChild(tr);
            });
        }
    }

    // Calculate sum of pending bills
    totalPendingSum = currentCustomerPendingSales.reduce((sum, sale) => {
        const total = parseFloat(sale.grandTotal) || 0;
        const received = parseFloat(sale.receivedAmount) || 0;
        return sum + Math.max(0, total - received);
    }, 0);

    document.getElementById('createArPendingInput').value = totalPendingSum.toFixed(2);
    document.getElementById('createArReceivedInput').value = totalPendingSum.toFixed(2);
    document.getElementById('createArDiscountInput').value = '0.00';
}

function handleArDiscountInput() {
    const discountInput = document.getElementById('createArDiscountInput');
    const pendingInput = document.getElementById('createArPendingInput');
    const receivedInput = document.getElementById('createArReceivedInput');

    if (!discountInput || !pendingInput || !receivedInput) return;

    const discountVal = parseFloat(discountInput.value) || 0;
    const adjustedPending = Math.max(0, totalPendingSum - discountVal);

    pendingInput.value = adjustedPending.toFixed(2);
    receivedInput.value = adjustedPending.toFixed(2);
}

async function saveCreateAmountReceived() {
    const select = document.getElementById('createArCustomerSelect');
    if (!select) return false;
    const customerName = select.value;
    const selectedOpt = select.options[select.selectedIndex];
    const mobile = selectedOpt ? selectedOpt.dataset.mobile : '9994121042';

    const date = document.getElementById('createArDateInput').value;
    const arNo = document.getElementById('createArNoInput').value;
    const discountAmount = parseFloat(document.getElementById('createArDiscountInput').value) || 0;
    const receivedAmount = parseFloat(document.getElementById('createArReceivedInput').value) || 0;

    if (!customerName) {
        showToast('Please select a customer', 'error');
        return false;
    }
    if (!date) {
        showToast('Please select a date', 'error');
        return false;
    }
    if (currentCustomerPendingSales.length === 0) {
        showToast('At least one pending bill is required', 'error');
        return false;
    }
    if (receivedAmount <= 0) {
        showToast('Amount received must be greater than 0', 'error');
        return false;
    }
    if (discountAmount < 0) {
        showToast('Discount cannot be negative', 'error');
        return false;
    }
    // Fetch sales to allocate payment
    let salesHistory = [];
    try {
        const res = await fetch('/api/sales');
        salesHistory = await res.json();
    } catch (err) {
        console.error('Error fetching sales:', err);
    }

    // Distribute total applied (received + discount) to pending bills of this customer (oldest first)
    let totalApplied = receivedAmount + discountAmount;
    salesHistory.forEach(sale => {
        if (totalApplied <= 0) return;
        if (!sale.customerName) return;
        if (sale.customerName.toLowerCase() !== customerName.toLowerCase()) return;

        const total = parseFloat(sale.grandTotal) || 0;
        const received = parseFloat(sale.receivedAmount) || 0;
        const pending = Math.max(0, total - received);
        if (pending <= 0) return;

        const applyAmt = Math.min(totalApplied, pending);
        sale.receivedAmount = (received + applyAmt);
        totalApplied -= applyAmt;
    });

    // Save sales back to database
    try {
        await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(salesHistory)
        });
    } catch (err) {
        console.error('Error updating sales with payment:', err);
        showToast('Failed to save payments to sales invoices', 'error');
        return false;
    }

    // Save new payment record to /api/payments
    let payments = [];
    try {
        const res = await fetch('/api/payments');
        payments = await res.json();
    } catch (err) {
        console.error('Error fetching payments:', err);
    }

    const newPayment = {
        arNo,
        date,
        customerName,
        mobile,
        amount: receivedAmount,
        discount: discountAmount,
        pending: totalPendingSum
    };
    payments.push(newPayment);

    try {
        await fetch('/api/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payments)
        });
    } catch (err) {
        console.error('Error saving payment record:', err);
        showToast('Failed to save payment record', 'error');
        return false;
    }

    // Increment payment counter
    const match = arNo.match(/\d+$/);
    const currentCounter = match ? parseInt(match[0]) : 1;
    try {
        await fetch('/api/payment-counter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ counter: currentCounter + 1 })
        });
    } catch (err) {
        console.error('Error updating payment counter:', err);
    }

    showToast('Payment received saved successfully', 'success');
    return true;
}

async function renderAmountReceivedWorkspace(filterQuery = '') {
    let payments = [];
    try {
        const res = await fetch('/api/payments');
        payments = await res.json();
    } catch (err) {
        console.error('Error fetching payments:', err);
    }

    const tableBody = document.getElementById('arTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const query = filterQuery.toLowerCase().trim();
    let filtered = payments.filter(p => {
        if (!p || Object.keys(p).length === 0 || !p.arNo) return false;
        const custName = (p.customerName || '').toLowerCase();
        const custMobile = (p.mobile || '');
        return custName.includes(query) || custMobile.includes(query);
    });

    if (window.dateFilters && window.dateFilters.arList) {
        const { start, end } = window.dateFilters.arList;
        filtered = filtered.filter(p => {
            const pDate = window.parseFilterDate(p.date);
            if (!pDate) return false;
            pDate.setHours(0,0,0,0);
            return pDate >= start && pDate <= end;
        });
    }

    const displayed = [...filtered].reverse();

    if (displayed.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No payments found</td></tr>';
        return;
    }

    displayed.forEach((p, index) => {
        const tr = document.createElement('tr');
        tr.style.height = '40px';

        // S. No.
        const tdSno = document.createElement('td');
        tdSno.textContent = index + 1;
        tr.appendChild(tdSno);

        // Date
        const tdDate = document.createElement('td');
        tdDate.textContent = formatArDate(p.date);
        tr.appendChild(tdDate);

        // AR No
        const tdArNo = document.createElement('td');
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = p.arNo || '';
        a.style.color = '#000B58';
        a.style.textDecoration = 'none';
        a.style.fontWeight = '600';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            alert(`Payment Details:\nAR No: ${p.arNo}\nCustomer: ${p.customerName}\nMobile: ${p.mobile}\nAmount: ₹${p.amount}\nDate: ${p.date}\nDiscount: ₹${p.discount || 0}`);
        });
        tdArNo.appendChild(a);
        tr.appendChild(tdArNo);

        // Customer Name
        const tdName = document.createElement('td');
        tdName.textContent = p.customerName || '';
        tdName.style.fontWeight = '500';
        tr.appendChild(tdName);

        // Mobile Number
        const tdMobile = document.createElement('td');
        tdMobile.textContent = p.mobile || '';
        tr.appendChild(tdMobile);

        // Amount Received
        const tdAmount = document.createElement('td');
        const amtVal = parseFloat(p.amount) || 0;
        tdAmount.textContent = '₹' + amtVal.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        tr.appendChild(tdAmount);

        tableBody.appendChild(tr);
    });

    if (window.lucide) {
        lucide.createIcons();
    }
}

function formatArDate(dateStr) {
    if (!dateStr) return '';
    // YYYY-MM-DD to DD/MM/YY
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const y = parts[0].slice(-2);
        const m = parts[1];
        const d = parts[2];
        return `${d}/${m}/${y}`;
    }
    return dateStr;
}

function formatArDateShort(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const y = parts[0].slice(-2);
        const m = parts[1];
        const d = parts[2];
        return `${d}/${m}/${y}`;
    }
    return dateStr;
}

window.parseFilterDate = function(dateStr) {
    if (!dateStr) return null;
    let parts;
    if (dateStr.includes('/')) {
        parts = dateStr.split('/');
        return new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (dateStr.includes('-')) {
        parts = dateStr.split('-');
        if (parts[0].length === 4) { // YYYY-MM-DD
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }
    }
    return null;
};

window.triggerWorkspaceRender = function(target) {
    if (target === 'salesList') {
        const searchInput = document.getElementById('salesListSearchInput');
        renderSalesList(searchInput ? searchInput.value : '');
    } else if (target === 'customerList') {
        const searchInput = document.getElementById('custSearchInput');
        renderCustomerWorkspace(searchInput ? searchInput.value : '');
    } else if (target === 'arList') {
        const searchInput = document.getElementById('arSearchInput');
        renderAmountReceivedWorkspace(searchInput ? searchInput.value : '');
    }
};
