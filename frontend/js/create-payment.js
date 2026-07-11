document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) {
        lucide.createIcons();
    }

    let pmtCounter = 1;
    let vendors = [];
    let allInvoices = [];
    let selectedVendorId = '';
    let pendingBillsForVendor = [];
    let currentOpeningBalance = 0;
    let uiOpeningBalancePaid = 0;

    const dom = {
        pmtNo: document.getElementById('pmtNo'),
        paymentDate: document.getElementById('paymentDate'),
        vendorDropdownWrapper: document.getElementById('vendorDropdownWrapper'),
        vendorSelect: document.getElementById('vendorSelect'),
        openingBalanceAmount: document.getElementById('openingBalanceAmount'),
        openingBalanceAction: document.getElementById('openingBalanceAction'),
        pendingBillsBody: document.getElementById('pendingBillsBody'),
        discountAmount: document.getElementById('discountAmount'),
        pendingAmount: document.getElementById('pendingAmount'),
        paidAmount: document.getElementById('paidAmount'),
        saveBtn: document.getElementById('saveBtn'),
        saveAddBtn: document.getElementById('saveAddBtn'),
        alertModal: document.getElementById('alertModal'),
        alertMessage: document.getElementById('alertMessage')
    };

    // Initialize Date to today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dom.paymentDate.value = `${yyyy}-${mm}-${dd}`;

    try {
        const [cRes, vRes, piRes] = await Promise.all([
            fetch(`/api/vendor-payment-counter?t=${Date.now()}`),
            fetch(`/api/vendors?t=${Date.now()}`),
            fetch(`/api/purchase-invoices?t=${Date.now()}`)
        ]);
        
        const counterData = await cRes.json();
        pmtCounter = counterData.counter || 1;
        dom.pmtNo.value = `PMT${String(pmtCounter).padStart(3, '0')}`;

        vendors = await vRes.json();
        allInvoices = await piRes.json();

        populateVendorDropdown(vendors);
    } catch (err) {
        console.error("Error fetching initial data", err);
    }

    // --- Custom Dropdown Logic ---
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

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        }
    });

    function populateVendorDropdown(list) {
        dom.vendorSelect.innerHTML = '<option value="">Select Vendor</option>';
        list.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = `${v.vendorName}${v.contactNumber && v.contactNumber !== 'undefined' ? ` - ${v.contactNumber}` : ''}`;
            dom.vendorSelect.appendChild(opt);
        });
        initCustomDropdown('vendorDropdownWrapper');
    }

    dom.vendorSelect.addEventListener('change', (e) => {
        selectedVendorId = e.target.value;
        handleVendorSelection();
    });

    function handleVendorSelection() {
        if (!selectedVendorId) return;

        const vendor = vendors.find(v => String(v.id) === selectedVendorId);
        currentOpeningBalance = vendor ? (parseFloat(vendor.openingBalance) || 0) : 0;
        dom.openingBalanceAmount.value = currentOpeningBalance % 1 === 0 ? currentOpeningBalance.toString() : currentOpeningBalance.toFixed(2);
        dom.openingBalanceAction.value = 'include';
        uiOpeningBalancePaid = 0;
        dom.paidAmount.value = '';
        dom.discountAmount.value = '';

        // Filter invoices for this vendor that have pending balance
        pendingBillsForVendor = allInvoices.filter(pi => 
            String(pi.vendorId) === selectedVendorId && (parseFloat(pi.pendingToPay) || 0) > 0
        ).map(pi => ({ ...pi, uiPaidAmount: 0 }));

        recalculateTotalPending();
        renderPendingBills();
    }

    function recalculateTotalPending() {
        let totalPending = 0;
        if (dom.openingBalanceAction.value === 'include') {
            totalPending += currentOpeningBalance;
        }
        pendingBillsForVendor.forEach(pi => {
            totalPending += (parseFloat(pi.pendingToPay) || 0);
        });
        dom.pendingAmount.value = totalPending.toFixed(2);
    }

    function distributeGlobalPaidAmount() {
        if (!selectedVendorId) return;
        const globalPaid = parseFloat(dom.paidAmount.value) || 0;
        const disc = parseFloat(dom.discountAmount.value) || 0;
        let remaining = globalPaid + disc;

        if (dom.openingBalanceAction.value === 'include' && currentOpeningBalance > 0) {
            uiOpeningBalancePaid = Math.min(remaining, currentOpeningBalance);
            remaining -= uiOpeningBalancePaid;
        } else {
            uiOpeningBalancePaid = 0;
        }

        pendingBillsForVendor.forEach(bill => {
            const pend = parseFloat(bill.pendingToPay) || 0;
            const toPay = Math.min(remaining, pend);
            bill.uiPaidAmount = toPay;
            remaining -= toPay;
        });

        renderPendingBills();
    }

    function recalculateGlobalPaidAmountFromInputs() {
        let total = 0;
        if (dom.openingBalanceAction.value === 'include') {
            total += uiOpeningBalancePaid;
        }
        pendingBillsForVendor.forEach(bill => {
            total += (parseFloat(bill.uiPaidAmount) || 0);
        });
        
        const disc = parseFloat(dom.discountAmount.value) || 0;
        let newPaid = total - disc;
        if (newPaid < 0) newPaid = 0;
        
        dom.paidAmount.value = newPaid > 0 ? newPaid.toFixed(2) : '';
    }

    dom.openingBalanceAction.addEventListener('change', () => {
        recalculateTotalPending();
        distributeGlobalPaidAmount();
    });

    dom.paidAmount.addEventListener('input', () => {
        distributeGlobalPaidAmount();
    });

    dom.discountAmount.addEventListener('input', () => {
        distributeGlobalPaidAmount();
    });

    function renderPendingBills() {
        dom.pendingBillsBody.innerHTML = '';
        let totalPending = 0;

        if (pendingBillsForVendor.length === 0) {
            dom.pendingBillsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted); border-left: none; border-right: none; border-bottom: none;">No pending bills for this vendor</td></tr>`;
        } else {
            pendingBillsForVendor.forEach((pi, idx) => {
                const amt = parseFloat(pi.amount) || 0;
                const pend = parseFloat(pi.pendingToPay) || 0;
                const paidVal = pi.uiPaidAmount > 0 ? pi.uiPaidAmount.toFixed(2) : '';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td>${formatDate(pi.date)}</td>
                    <td><a href="view-purchase-invoice.html?id=${pi.id}" style="color: #2563EB; text-decoration: underline; font-weight: 400;">${pi.piNo || '-'}</a></td>
                    <td>₹${amt.toLocaleString('en-IN', {minimumFractionDigits: amt % 1 === 0 ? 0 : 2, maximumFractionDigits:2})}</td>
                    <td>₹${pend.toLocaleString('en-IN', {minimumFractionDigits: pend % 1 === 0 ? 0 : 2, maximumFractionDigits:2})}</td>
                    <td style="padding: 4px 16px;">
                        <input type="number" class="bill-paid-input" data-idx="${idx}" style="width: 100%; height: 32px; border: 1px solid #CBD5E1; border-radius: 4px; padding: 0 8px; font-family: inherit; font-size: 13px; outline: none; box-sizing: border-box; color: #1A1A1A;" value="${paidVal}">
                    </td>
                `;
                dom.pendingBillsBody.appendChild(tr);
            });

            document.querySelectorAll('.bill-paid-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    let val = parseFloat(e.target.value) || 0;
                    const pend = parseFloat(pendingBillsForVendor[idx].pendingToPay) || 0;
                    
                    if (val > pend) {
                        val = pend;
                        e.target.value = val.toFixed(2);
                    }
                    
                    pendingBillsForVendor[idx].uiPaidAmount = val;
                    recalculateGlobalPaidAmountFromInputs();
                });
            });
        }
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-GB'); // dd/mm/yyyy
    }

    function showAlert(msg) {
        dom.alertMessage.textContent = msg;
        dom.alertModal.style.display = 'flex';
    }

    async function savePayment(stayOnPage = false) {
        if (!selectedVendorId) {
            showAlert("Please select a vendor.");
            return;
        }

        if (pendingBillsForVendor.length === 0) {
            showAlert("There are no pending bills for this vendor. Cannot save payment.");
            return;
        }

        const paid = parseFloat(dom.paidAmount.value) || 0;
        if (paid <= 0) {
            showAlert("Please enter a valid Paid Amount greater than 0.");
            return;
        }

        const disc = parseFloat(dom.discountAmount.value) || 0;
        const totalPending = parseFloat(dom.pendingAmount.value) || 0;
        const effectivePayment = paid + disc;

        if (effectivePayment > totalPending) {
            showAlert(`The sum of Paid Amount (₹${paid}) and Discount (₹${disc}) cannot exceed the Total Pending Amount (₹${totalPending}).`);
            return;
        }

        // Disable buttons
        dom.saveBtn.textContent = 'Saving...';
        dom.saveBtn.disabled = true;
        dom.saveAddBtn.disabled = true;

        const vendor = vendors.find(v => String(v.id) === selectedVendorId);

        // 1. Create Payment object
        const paymentObj = {
            id: Date.now().toString(),
            paymentNo: dom.pmtNo.value,
            date: dom.paymentDate.value,
            vendorId: selectedVendorId,
            vendorName: vendor ? vendor.vendorName : '',
            amount: paid,
            discount: disc
        };

        try {
            // Fetch existing payments and add new
            const pRes = await fetch(`/api/vendor-payments?t=${Date.now()}`);
            const existingPayments = await pRes.json();
            existingPayments.push(paymentObj);
            
            await fetch('/api/vendor-payments', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(existingPayments)
            });

            // 2. Increment Counter
            await fetch('/api/vendor-payment-counter', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ counter: pmtCounter + 1 })
            });

            // 3. Update specific purchase invoices using the user's distribution
            pendingBillsForVendor.forEach(bill => {
                if (!bill.uiPaidAmount || bill.uiPaidAmount <= 0) return;
                
                const deductAmount = bill.uiPaidAmount;
                
                // Update it in allInvoices array too
                const mainIndex = allInvoices.findIndex(pi => String(pi.id) === String(bill.id));
                if (mainIndex > -1) {
                    const realBill = allInvoices[mainIndex];
                    realBill.paidAmount = (parseFloat(realBill.paidAmount) || 0) + deductAmount;
                    realBill.pendingToPay = (parseFloat(realBill.pendingToPay) || 0) - deductAmount;
                    allInvoices[mainIndex] = realBill;
                }
            });

            await fetch('/api/purchase-invoices', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(allInvoices)
            });

            // 4. Update Vendor pendingToPay, openingBalance & add transaction
            if (vendor) {
                if (dom.openingBalanceAction.value === 'include' && uiOpeningBalancePaid > 0) {
                    let ob = parseFloat(vendor.openingBalance) || 0;
                    ob -= uiOpeningBalancePaid;
                    if (ob < 0) ob = 0;
                    vendor.openingBalance = ob.toString();
                }

                vendor.pendingToPay = (parseFloat(vendor.pendingToPay) || 0) - effectivePayment;
                if (vendor.pendingToPay < 0) vendor.pendingToPay = 0;

                if (!vendor.transactions) vendor.transactions = [];
                vendor.transactions.push({
                    id: Date.now().toString(),
                    date: dom.paymentDate.value,
                    type: 'Payment',
                    ref: dom.pmtNo.value,
                    amount: paid,
                    balance: vendor.pendingToPay,
                    status: 'Paid'
                });
                
                await fetch('/api/vendors', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(vendors)
                });
            }

            // Finish
            if (stayOnPage) {
                window.location.reload();
            } else {
                window.location.href = 'payment.html';
            }

        } catch (err) {
            console.error('Error saving payment:', err);
            showAlert('An error occurred while saving the payment.');
            dom.saveBtn.textContent = 'Save';
            dom.saveBtn.disabled = false;
            dom.saveAddBtn.disabled = false;
        }
    }

    dom.saveBtn.addEventListener('click', () => savePayment(false));
    dom.saveAddBtn.addEventListener('click', () => savePayment(true));
});
