document.addEventListener('DOMContentLoaded', () => {
    // Check which page we are on
    const isCreateVendor = document.getElementById('saveVendorBtn');
    const isVendorList = document.querySelector('.vendor-table');

    if (isCreateVendor) {
        initCreateVendor();
    }
    
    if (isVendorList) {
        loadVendorsList();
    }
});

function initCreateVendor() {
    const saveBtn = document.getElementById('saveVendorBtn');
    const saveAddBtn = document.getElementById('saveAddVendorBtn');

    if (saveBtn) saveBtn.addEventListener('click', () => saveVendor(false));
    if (saveAddBtn) saveAddBtn.addEventListener('click', () => saveVendor(true));
}

async function saveVendor(isAddMore) {
    const vendorName = document.getElementById('vendorName').value.trim();
    const displayName = document.getElementById('displayName').value.trim();
    const contactPerson = document.getElementById('contactPerson').value.trim();
    const contactNumber = document.getElementById('contactNumber').value.trim();
    const emailId = document.getElementById('emailId').value.trim();
    const gstin = document.getElementById('gstin').value.trim();
    const panNumber = document.getElementById('panNumber').value.trim();
    
    // Address Details
    const billAddress = document.getElementById('billingAddress').value.trim();
    const billCountry = document.getElementById('billCountry').value;
    const billState = document.getElementById('billState').value;
    const billCity = document.getElementById('billCity').value.trim();
    const billPinCode = document.getElementById('billPinCode').value.trim();
    
    const shipAddress = document.getElementById('shipAddress').value.trim();
    const shipCountry = document.getElementById('shipCountry').value;
    const shipState = document.getElementById('shipState').value;
    const shipCity = document.getElementById('shipCity').value.trim();
    const shipPinCode = document.getElementById('shipPinCode').value.trim();

    // Account Details
    const accHolderName = document.getElementById('accHolderName').value.trim();
    const accNumber = document.getElementById('accNumber').value.trim();
    const ifscCode = document.getElementById('ifscCode').value.trim();
    const bankName = document.getElementById('bankName').value.trim();
    const branchName = document.getElementById('branchName').value.trim();

    const openingBalance = parseFloat(document.getElementById('openingBalance').value) || 0;
    const balanceType = document.getElementById('balanceType').value;
    const paymentTerms = document.getElementById('paymentTerms').value;

    if (!vendorName) {
        showToast('Vendor Name is required', 'error');
        return;
    }
    if (!displayName) {
        showToast('Display Name is required', 'error');
        return;
    }

    let pendingToPay = 0;
    let creditBalance = 0;
    
    if (balanceType === 'To Pay') {
        pendingToPay = openingBalance;
    } else if (balanceType === 'To Collect') {
        creditBalance = openingBalance;
    }

    const newVendor = {
        id: Date.now().toString(),
        vendorName,
        displayName,
        contactPerson,
        contactNumber,
        emailId,
        gstin,
        panNumber,
        billAddress,
        billCountry,
        billState,
        billCity,
        billPinCode,
        shipAddress,
        shipCountry,
        shipState,
        shipCity,
        shipPinCode,
        accHolderName,
        accNumber,
        ifscCode,
        bankName,
        branchName,
        pendingToPay,
        creditBalance,
        openingBalance,
        balanceType,
        paymentTerms,
        createdAt: new Date().toISOString()
    };

    try {
        const res = await fetch('/api/vendors');
        const vendors = await res.json();
        vendors.push(newVendor);

        const saveRes = await fetch('/api/vendors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vendors)
        });

        if (saveRes.ok) {
            showToast('Vendor saved successfully', 'success');
            if (isAddMore) {
                // Clear inputs
                document.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], textarea').forEach(el => el.value = '');
            } else {
                setTimeout(() => {
                    window.location.href = 'vendor.html';
                }, 1000);
            }
        } else {
            showToast('Error saving vendor', 'error');
        }
    } catch (err) {
        console.error('Error:', err);
        showToast('Error connecting to server', 'error');
    }
}

async function loadVendorsList() {
    try {
        const [vRes, piRes] = await Promise.all([
            fetch('/api/vendors'),
            fetch('/api/purchase-invoices')
        ]);
        const vendors = await vRes.json();
        const purchaseInvoices = await piRes.json();
        
        const tbody = document.querySelector('.vendor-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        let totalVendorPending = 0;
        let totalVendorPurchase = 0;

        if (!vendors || vendors.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">No vendors available.</td></tr>`;
        } else {
            vendors.forEach((v, idx) => {
                // Calculate aggregated values from purchase invoices
                const vendorInvoices = purchaseInvoices.filter(pi => String(pi.vendorId) === String(v.id));
                
                let vendorPurchaseAmt = 0;
                let vendorPendingToPay = 0;

                vendorInvoices.forEach(pi => {
                    vendorPurchaseAmt += parseFloat(pi.amount) || 0;
                    vendorPendingToPay += parseFloat(pi.pendingToPay) || 0;
                });

                // Include opening balance logic if applicable (assuming opening balance is also part of pending)
                if (v.balanceType === 'To Pay') {
                    vendorPendingToPay += parseFloat(v.openingBalance) || 0;
                }

                totalVendorPending += vendorPendingToPay;
                totalVendorPurchase += vendorPurchaseAmt;

                const tr = document.createElement('tr');
                tr.style.height = '40px';
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td><a href="view-vendor.html?id=${v.id}" class="vendor-link">${v.vendorName}</a></td>
                    <td>${v.contactPerson || '-'}</td>
                    <td>${v.contactNumber || '-'}</td>
                    <td>₹${vendorPurchaseAmt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                    <td>₹${vendorPendingToPay.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Update score cards
        const statValues = document.querySelectorAll('.vendor-stat-value');
        if (statValues.length >= 3) {
            statValues[0].textContent = vendors ? vendors.length : 0; // Total Vendor
            statValues[1].textContent = '₹' + totalVendorPurchase.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2}); // Purchase Amount
            statValues[2].textContent = '₹' + totalVendorPending.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2}); // Pending to Pay
        }

    } catch (err) {
        console.error('Error fetching vendors:', err);
    }
}
