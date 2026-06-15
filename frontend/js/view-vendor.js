document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) {
        lucide.createIcons();
    }

    let vendors = [];
    let activeVendorId = null;

    try {
        const res = await fetch('/api/vendors');
        vendors = await res.json();
    } catch (err) {
        console.error('Error fetching vendors:', err);
    }

    const urlParams = new URLSearchParams(window.location.search);
    activeVendorId = urlParams.get('id');

    if (!activeVendorId && vendors.length > 0) {
        activeVendorId = vendors[0].id;
    }

    renderSidebar(vendors, activeVendorId);
    if (activeVendorId) {
        renderVendorDetails(vendors.find(v => v.id === activeVendorId));
    }

    // Search functionality
    const searchInput = document.getElementById('sidebarSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = vendors.filter(v => (v.vendorName || '').toLowerCase().includes(term));
            renderSidebar(filtered, activeVendorId);
        });
    }

    // Tabs functionality (Visual only for now)
    const tabs = document.querySelectorAll('.vendor-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // Currently only Vendor Details is implemented
        });
    });

    // Delete
    const deleteBtn = document.getElementById('deleteVendorBtn');
    const deleteModal = document.getElementById('deleteModal');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    if (deleteBtn && deleteModal) {
        deleteBtn.addEventListener('click', () => {
            deleteModal.classList.add('show');
        });
    }
    if (cancelDeleteBtn && deleteModal) {
        cancelDeleteBtn.addEventListener('click', () => {
            deleteModal.classList.remove('show');
        });
    }
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!activeVendorId) return;
            const updated = vendors.filter(v => v.id !== activeVendorId);
            try {
                const saveRes = await fetch('/api/vendors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updated)
                });
                if (saveRes.ok) {
                    window.location.href = 'vendor.html';
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    // Edit
    const editBtn = document.getElementById('editVendorBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (activeVendorId) {
                window.location.href = `edit-vendor.html?id=${activeVendorId}`;
            }
        });
    }
});

function renderSidebar(vendorsList, activeId) {
    const listContainer = document.getElementById('sidebarVendorsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (vendorsList.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 20px;">No vendors found</div>`;
        return;
    }

    vendorsList.forEach(v => {
        const card = document.createElement('div');
        card.className = `sidebar-vendor-card ${v.id === activeId ? 'active' : ''}`;
        
        const amount = v.pendingToPay || 0;
        const amountClass = amount > 0 ? 'red-amount' : '';
        const formattedAmount = '₹' + amount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2});

        card.innerHTML = `
            <div class="sidebar-vendor-name">${v.vendorName || '-'}</div>
            <div class="sidebar-vendor-amount ${amountClass}">${formattedAmount}</div>
        `;

        card.addEventListener('click', () => {
            window.location.href = `view-vendor.html?id=${v.id}`;
        });

        listContainer.appendChild(card);
    });
}

function renderVendorDetails(vendor) {
    if (!vendor) return;

    // Header Title
    document.getElementById('pageTitleName').textContent = vendor.vendorName || '-';

    // Basic Details
    document.getElementById('viewCompanyName').textContent = vendor.vendorName || '-';
    document.getElementById('viewDisplayName').textContent = vendor.displayName || '-';
    document.getElementById('viewContactPerson').textContent = vendor.contactPerson || '-';
    document.getElementById('viewContactNumber').textContent = vendor.contactNumber || '-';
    document.getElementById('viewEmailId').textContent = vendor.emailId || '-';
    document.getElementById('viewGstin').textContent = vendor.gstin || '-';
    document.getElementById('viewPanNumber').textContent = vendor.panNumber || '-';

    // Address Details
    const formatAddr = (addr, city, state, pin, country) => {
        let lines = [];
        if (addr) lines.push(addr);
        if (city) lines.push(city);
        
        let thirdLine = [];
        if (city && state) thirdLine.push(state);
        else if (state) lines.push(state);
        
        if (thirdLine.length) lines.push(thirdLine.join(', '));
        
        if (country) lines.push(country);
        if (pin) lines.push(pin);
        return lines.length > 0 ? lines.join('\n') : '-';
    };

    document.getElementById('viewBillingAddress').textContent = formatAddr(
        vendor.billAddress, vendor.billCity, vendor.billState, vendor.billPinCode, vendor.billCountry
    );
    
    document.getElementById('viewShippingAddress').textContent = formatAddr(
        vendor.shipAddress, vendor.shipCity, vendor.shipState, vendor.shipPinCode, vendor.shipCountry
    );

    // Account Details
    const accHolder = document.getElementById('viewAccHolderName');
    if (accHolder) {
        document.getElementById('viewAccHolderName').textContent = vendor.accHolderName || '-';
        document.getElementById('viewAccNumber').textContent = vendor.accNumber || '-';
        document.getElementById('viewIfscCode').textContent = vendor.ifscCode || '-';
        document.getElementById('viewBankName').textContent = vendor.bankName || '-';
        document.getElementById('viewBranchName').textContent = vendor.branchName || '-';
    }

    // Additional Details
    document.getElementById('viewOpeningBalance').textContent = '₹' + (vendor.openingBalance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2});
    document.getElementById('viewBalanceType').textContent = vendor.balanceType || '-';
    document.getElementById('viewPaymentTerms').textContent = vendor.paymentTerms || 'None';
}
