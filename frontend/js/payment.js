document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) {
        lucide.createIcons();
    }

    let vendors = [];
    let payments = [];

    // Filter states
    let currentVendorFilter = '';
    let currentSearchTerm = '';
    let currentDateFilter = { type: 'all' };

    try {
        const [vRes, pRes] = await Promise.all([
            fetch(`/api/vendors?t=${Date.now()}`),
            fetch(`/api/vendor-payments?t=${Date.now()}`)
        ]);
        vendors = await vRes.json();
        payments = await pRes.json();
    } catch (err) {
        console.error('Error fetching data:', err);
    }

    // Vendor Name Filter
    const vendorDropdown = document.getElementById('paymentVendorFilter');
    if (vendorDropdown) {
        vendorDropdown.addEventListener('change', (e) => {
            currentVendorFilter = e.target.value;
            renderPayments();
        });
    }

    // Search Input
    const searchInput = document.getElementById('paymentSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.toLowerCase();
            renderPayments();
        });
    }

    // Clear Filters
    const clearBtn = document.getElementById('clearPaymentFilterBtn');

    populateVendorDropdown();
    renderPayments();

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (vendorDropdown) vendorDropdown.value = '';
            if (searchInput) searchInput.value = '';
            currentVendorFilter = '';
            currentSearchTerm = '';
            
            // update custom dropdown UI
            const ddTrigger = document.querySelector('#paymentVendorFilterDropdown .trigger-text');
            if (ddTrigger) {
                ddTrigger.textContent = 'Vendor Name';
                ddTrigger.classList.add('placeholder');
                ddTrigger.style.color = '';
            }
            const ddPanel = document.querySelector('#paymentVendorFilterDropdown .custom-dropdown-panel');
            if (ddPanel) {
                ddPanel.querySelectorAll('.custom-dropdown-option').forEach(el => el.classList.remove('selected'));
            }

            // Reset Date filter if DateFilterModal functions are available
            if (window.resetDateFilter) {
                window.resetDateFilter('paymentList');
            } else {
                currentDateFilter = { type: 'all' };
                const dtText = document.getElementById('paymentDateFilterText');
                if (dtText) dtText.textContent = 'Date';
            }
            renderPayments();
        });
    }

    window.triggerWorkspaceRender = function(target) {
        if (target === 'paymentList') {
            currentDateFilter = window.dateFilters['paymentList'] || { type: 'all' };
            renderPayments();
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
        const dropdown = document.getElementById('paymentVendorFilterDropdown');
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

    function renderPayments() {
        const tbody = document.getElementById('paymentTableBody');
        if (!tbody) return;

        let filtered = payments.filter(p => {
            // Vendor filter
            if (currentVendorFilter && String(p.vendorId) !== String(currentVendorFilter)) return false;
            
            // Search filter
            if (currentSearchTerm) {
                const searchString = `${p.paymentNo || ''} ${p.vendorName || ''}`.toLowerCase();
                if (!searchString.includes(currentSearchTerm)) return false;
            }

            // Date filter
            if (currentDateFilter.type !== 'all' && window.checkDateFilter) {
                if (!window.checkDateFilter(p.date, currentDateFilter)) return false;
            }

            return true;
        }).reverse();

        tbody.innerHTML = '';

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">No payments found.</td></tr>`;
        } else {
            filtered.forEach((p, idx) => {
                const amt = parseFloat(p.amount || p.paidAmount) || 0;
                
                const vendor = vendors.find(v => String(v.id) === String(p.vendorId));
                const contactNumber = vendor && vendor.contactNumber && vendor.contactNumber !== 'undefined' ? vendor.contactNumber : '-';

                const tr = document.createElement('tr');
                tr.style.height = '40px';
                tr.innerHTML = `
                    <td>${idx + 1}</td>
                    <td>${formatDate(p.date) || '-'}</td>
                    <td><a href="#" class="payment-link">${p.paymentNo || '-'}</a></td>
                    <td>${p.vendorName || '-'}</td>
                    <td>${contactNumber}</td>
                    <td>₹${amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }); 
    }
});
