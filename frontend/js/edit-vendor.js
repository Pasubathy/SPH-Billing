document.addEventListener('DOMContentLoaded', async () => {
    let vendors = [];
    let currentVendor = null;

    const urlParams = new URLSearchParams(window.location.search);
    const vendorId = urlParams.get('id');

    if (!vendorId) {
        showToast('No vendor selected for editing', 'error');
        setTimeout(() => window.location.href = 'vendor.html', 1500);
        return;
    }

    try {
        const res = await fetch('/api/vendors');
        vendors = await res.json();
        currentVendor = vendors.find(v => v.id === vendorId);

        if (!currentVendor) {
            showToast('Vendor not found', 'error');
            setTimeout(() => window.location.href = 'vendor.html', 1500);
            return;
        }

        populateForm(currentVendor);

    } catch (err) {
        console.error('Error fetching vendors:', err);
        showToast('Error connecting to server', 'error');
    }

    const saveBtn = document.getElementById('saveVendorBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveVendorUpdates(false));

    const saveAddBtn = document.getElementById('saveAddVendorBtn');
    if (saveAddBtn) saveAddBtn.style.display = 'none'; // Hide Save & Add on Edit page
    
    // update back button
    const backBtn = document.querySelector('.sticky-action-bar-new .btn-footer-outline');
    if(backBtn) backBtn.href = `view-vendor.html?id=${vendorId}`;
});

function populateForm(vendor) {
    document.getElementById('vendorName').value = vendor.vendorName || '';
    document.getElementById('displayName').value = vendor.displayName || '';
    document.getElementById('contactPerson').value = vendor.contactPerson || '';
    document.getElementById('contactNumber').value = vendor.contactNumber || '';
    document.getElementById('emailId').value = vendor.emailId || '';
    document.getElementById('gstin').value = vendor.gstin || '';
    document.getElementById('panNumber').value = vendor.panNumber || '';

    document.getElementById('billingAddress').value = vendor.billAddress || '';
    setDropdown('billCountry', 'billCountryDropdown', vendor.billCountry);
    setDropdown('billState', 'billStateDropdown', vendor.billState);
    document.getElementById('billCity').value = vendor.billCity || '';
    document.getElementById('billPinCode').value = vendor.billPinCode || '';

    document.getElementById('shipAddress').value = vendor.shipAddress || '';
    setDropdown('shipCountry', 'shipCountryDropdown', vendor.shipCountry);
    setDropdown('shipState', 'shipStateDropdown', vendor.shipState);
    document.getElementById('shipCity').value = vendor.shipCity || '';
    document.getElementById('shipPinCode').value = vendor.shipPinCode || '';

    const accHolder = document.getElementById('accHolderName');
    if(accHolder) {
        accHolder.value = vendor.accHolderName || '';
        document.getElementById('accNumber').value = vendor.accNumber || '';
        document.getElementById('ifscCode').value = vendor.ifscCode || '';
        document.getElementById('bankName').value = vendor.bankName || '';
        document.getElementById('branchName').value = vendor.branchName || '';
    }

    document.getElementById('openingBalance').value = vendor.openingBalance || '';
    setDropdown('balanceType', 'balanceTypeDropdown', vendor.balanceType);
    setDropdown('paymentTerms', 'paymentTermsDropdown', vendor.paymentTerms);
}

function setDropdown(selectId, dropdownId, value) {
    if (!value) return;
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Check if option exists
    let exists = false;
    for (let opt of select.options) {
        if (opt.value === value) exists = true;
    }
    if (!exists) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
    
    select.value = value;

    setTimeout(() => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            const triggerText = dropdown.querySelector('.trigger-text');
            if (triggerText) {
                triggerText.textContent = value;
                triggerText.classList.remove('placeholder');
                triggerText.style.color = 'var(--text-main)';
            }
            const panel = dropdown.querySelector('.custom-dropdown-panel');
            if (panel) {
                panel.querySelectorAll('.custom-dropdown-option').forEach(el => {
                    if(el.dataset.value === value) el.classList.add('selected');
                    else el.classList.remove('selected');
                });
            }
        }
    }, 100);
}

async function saveVendorUpdates() {
    const urlParams = new URLSearchParams(window.location.search);
    const vendorId = urlParams.get('id');

    const vendorName = document.getElementById('vendorName').value.trim();
    const displayName = document.getElementById('displayName').value.trim();
    const contactPerson = document.getElementById('contactPerson').value.trim();
    const contactNumber = document.getElementById('contactNumber').value.trim();
    const emailId = document.getElementById('emailId').value.trim();
    const gstin = document.getElementById('gstin').value.trim();
    const panNumber = document.getElementById('panNumber').value.trim();

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

    let accHolderName = '', accNumber = '', ifscCode = '', bankName = '', branchName = '';
    const accHolder = document.getElementById('accHolderName');
    if (accHolder) {
        accHolderName = accHolder.value.trim();
        accNumber = document.getElementById('accNumber').value.trim();
        ifscCode = document.getElementById('ifscCode').value.trim();
        bankName = document.getElementById('bankName').value.trim();
        branchName = document.getElementById('branchName').value.trim();
    }

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

    try {
        const res = await fetch('/api/vendors');
        const vendors = await res.json();
        
        const index = vendors.findIndex(v => v.id === vendorId);
        if (index === -1) {
            showToast('Vendor not found', 'error');
            return;
        }

        vendors[index] = {
            ...vendors[index],
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
            updatedAt: new Date().toISOString()
        };

        const saveRes = await fetch('/api/vendors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vendors)
        });

        if (saveRes.ok) {
            showToast('Vendor updated successfully', 'success');
            setTimeout(() => {
                window.location.href = `view-vendor.html?id=${vendorId}`;
            }, 1000);
        } else {
            showToast('Error saving vendor', 'error');
        }
    } catch (err) {
        console.error('Error:', err);
        showToast('Error connecting to server', 'error');
    }
}
