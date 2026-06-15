document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) {
        lucide.createIcons();
    }

    let vendors = [];
    let purchaseInvoices = [];

    // Filter states
    let currentVendorFilter = '';
    let currentSearchTerm = '';
    let currentDateFilter = { type: 'all' };

    try {
        const [vRes, piRes] = await Promise.all([
            fetch(`/api/vendors?t=${Date.now()}`),
            fetch(`/api/purchase-invoices?t=${Date.now()}`)
        ]);
        vendors = await vRes.json();
        purchaseInvoices = await piRes.json();
    } catch (err) {
        console.error('Error fetching data:', err);
    }

    // Vendor Name Filter
    const vendorDropdown = document.getElementById('piVendorFilter');
    if (vendorDropdown) {
        vendorDropdown.addEventListener('change', (e) => {
            currentVendorFilter = e.target.value;
            renderPI();
        });
    }

    // Search Input
    const searchInput = document.getElementById('piSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.toLowerCase();
            renderPI();
        });
    }

    // Clear Filters
    const clearBtn = document.getElementById('clearPiFilterBtn');

    populateVendorDropdown();
    renderPI();

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (vendorDropdown) vendorDropdown.value = '';
            if (searchInput) searchInput.value = '';
            currentVendorFilter = '';
            currentSearchTerm = '';
            
            // update custom dropdown UI
            const ddTrigger = document.querySelector('#piVendorFilterDropdown .trigger-text');
            if (ddTrigger) {
                ddTrigger.textContent = 'Vendor Name';
                ddTrigger.classList.add('placeholder');
                ddTrigger.style.color = '';
            }
            const ddPanel = document.querySelector('#piVendorFilterDropdown .custom-dropdown-panel');
            if (ddPanel) {
                ddPanel.querySelectorAll('.custom-dropdown-option').forEach(el => el.classList.remove('selected'));
            }

            // Reset Date filter if DateFilterModal functions are available
            if (window.resetDateFilter) {
                window.resetDateFilter('piList');
            } else {
                currentDateFilter = { type: 'all' };
                const dtText = document.getElementById('piDateFilterText');
                if (dtText) dtText.textContent = 'Date';
            }
            renderPI();
        });
    }

    window.triggerWorkspaceRender = function(target) {
        if (target === 'piList') {
            currentDateFilter = window.dateFilters['piList'] || { type: 'all' };
            renderPI();
        }
    };

    function populateVendorDropdown() {
        if (!vendorDropdown) return;
        vendorDropdown.innerHTML = '<option value="">Vendor Name</option>';
        vendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.vendorName;
            vendorDropdown.appendChild(opt);
        });
        
        setupVendorFilterDropdown();
    }

    function setupVendorFilterDropdown() {
        const dropdown = document.getElementById('piVendorFilterDropdown');
        if (!dropdown) return;

        const trigger = dropdown.querySelector('.custom-dropdown-trigger');
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
            optionDiv.style.fontSize = '13px'; // UI match

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
                
                // Dispatch change event to trigger existing listener
                select.dispatchEvent(new Event('change'));
            });

            panel.appendChild(optionDiv);
        });

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
            if (!isOpen) {
                dropdown.classList.add('open');
            }
        });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        }
    });

    function renderPI() {
        const tbody = document.getElementById('piTableBody');
        if (!tbody) return;

        let filtered = purchaseInvoices.filter(pi => {
            // Vendor filter
            if (currentVendorFilter && pi.vendorId !== currentVendorFilter) return false;
            
            // Search filter
            if (currentSearchTerm) {
                const searchString = `${pi.piNo || ''} ${pi.vendorName || ''}`.toLowerCase();
                if (!searchString.includes(currentSearchTerm)) return false;
            }

            // Date filter
            if (currentDateFilter.type !== 'all' && window.checkDateFilter) {
                if (!window.checkDateFilter(pi.date, currentDateFilter)) return false;
            }

            return true;
        }).reverse();

        tbody.innerHTML = '';
        let totalPurchase = 0;
        let totalPending = 0;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">No purchase invoices found.</td></tr>`;
        } else {
            filtered.forEach((pi, idx) => {
                const amt = parseFloat(pi.amount) || 0;
                const pend = parseFloat(pi.pendingToPay) || 0;
                
                totalPurchase += amt;
                totalPending += pend;

                const isPaid = pend === 0;
                const statusBadgeHTML = isPaid 
                    ? `<span style="display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; color: white; text-align: center; min-width: 80px; box-sizing: border-box; background-color: #22C55E;">Paid</span>`
                    : `<span style="display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; color: white; text-align: center; min-width: 80px; box-sizing: border-box; background-color: #EF4444;">Pending</span>`;

                const tr = document.createElement('tr');
                tr.style.height = '40px';
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td>${formatDate(pi.date) || '-'}</td>
                    <td>${formatDate(pi.dueDate) || '-'}</td>
                    <td><a href="view-purchase-invoice.html?id=${pi.id}" class="vendor-link" style="color: #2563EB; text-decoration: none; font-weight: 500;">${pi.piNo || '-'}</a></td>
                    <td>${pi.vendorName || '-'}</td>
                    <td>₹${amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                    <td>₹${pend.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                    <td>${statusBadgeHTML}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Update Score Cards
        const purchaseAmtEl = document.getElementById('statPurchaseAmount');
        const pendingAmtEl = document.getElementById('statPendingToPay');

        if (purchaseAmtEl) purchaseAmtEl.textContent = '₹' + totalPurchase.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2});
        if (pendingAmtEl) pendingAmtEl.textContent = '₹' + totalPending.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2});
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
});
