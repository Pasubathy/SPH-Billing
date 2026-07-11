let allPayments = [];
let allCustomers = [];
let allSales = [];
let currentAr = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) {
        lucide.createIcons();
    }
    
    await loadData();
    setupEvents();
    
    // Parse URL parameter for initial active AR
    const urlParams = new URLSearchParams(window.location.search);
    const arId = urlParams.get('id');
    
    if (arId) {
        const found = allPayments.find(p => p.arNo === arId);
        if (found) {
            currentAr = found;
        }
    }
    
    if (!currentAr && allPayments.length > 0) {
        // default to first in list (newest if reversed)
        currentAr = [...allPayments].reverse()[0];
    }
    
    renderSidebar('');
    if (currentAr) {
        renderArPreview(currentAr);
    } else {
        document.getElementById('arPreviewCanvas').innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">No Amount Received records found.</div>';
    }
});

async function loadData() {
    try {
        const [resPayments, resCust, resSales] = await Promise.all([
            fetch('/api/payments'),
            fetch('/api/customers'),
            fetch('/api/sales')
        ]);
        allPayments = await resPayments.json();
        allCustomers = await resCust.json();
        allSales = await resSales.json();
    } catch (err) {
        console.error('Error loading data:', err);
    }
}

function setupEvents() {
    const searchInput = document.getElementById('sidebarSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderSidebar(e.target.value);
        });
    }

    const printBtn = document.getElementById('printArBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            if (currentAr) window.print();
        });
    }

    const deleteBtn = document.getElementById('deleteArBtn');
    const deleteModal = document.getElementById('deleteModal');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    if (deleteBtn && deleteModal) {
        deleteBtn.addEventListener('click', () => {
            deleteModal.style.display = 'flex';
        });
    }

    if (cancelDeleteBtn && deleteModal) {
        cancelDeleteBtn.addEventListener('click', () => {
            deleteModal.style.display = 'none';
        });
    }

    if (confirmDeleteBtn && deleteModal) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!currentAr) return;

            try {
                // Delete from allPayments
                allPayments = allPayments.filter(p => p.arNo !== currentAr.arNo);
                
                await fetch('/api/payments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(allPayments)
                });
                
                deleteModal.style.display = 'none';
                
                // Show toast or alert
                alert('Amount Received record deleted successfully');
                
                // Redirect back to sales list
                window.location.href = 'sales.html';
                
            } catch (err) {
                console.error('Error deleting record:', err);
                alert('Failed to delete record');
                deleteModal.style.display = 'none';
            }
        });
    }
}

function renderSidebar(searchQuery = '') {
    const listContainer = document.getElementById('sidebarArList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    const query = searchQuery.toLowerCase().trim();
    
    let filtered = [...allPayments].reverse().filter(p => {
        return (p.arNo && p.arNo.toLowerCase().includes(query)) ||
               (p.customerName && p.customerName.toLowerCase().includes(query));
    });
    
    if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 13px; text-align: center;">No records found</div>';
        return;
    }
    
    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'sidebar-product-card';
        if (currentAr && p.arNo === currentAr.arNo) {
            card.classList.add('active');
        }
        
        const dateStr = p.date ? new Date(p.date).toLocaleDateString('en-GB') : '';
        const amt = parseFloat(p.amount) || 0;
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div class="sidebar-product-name">${p.arNo}</div>
                <div style="font-size: 13px; font-weight: 600; color: #1e293b;">₹${amt.toFixed(2)}</div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px;">
                <div style="font-size: 12px; color: var(--text-muted);">${p.customerName || 'Walk In Customer'}</div>
                <div style="font-size: 11px; color: #64748B;">${dateStr}</div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            currentAr = p;
            
            // Update URL without reload
            const url = new URL(window.location);
            url.searchParams.set('id', p.arNo);
            window.history.pushState({}, '', url);
            
            renderSidebar(document.getElementById('sidebarSearch').value);
            renderArPreview(p);
        });
        
        listContainer.appendChild(card);
    });
}

function renderArPreview(p) {
    const container = document.getElementById('arPreviewCanvas');
    if (!container) return;
    
    // Update header title
    document.getElementById('pageTitleName').textContent = p.arNo || 'View Record';
    
    const accDataStr = localStorage.getItem('myAccountData');
    const accData = accDataStr ? JSON.parse(accDataStr) : {};
    
    let addrParts = [];
    if(accData.address) addrParts.push(accData.address);
    if(accData.city) addrParts.push(accData.city);
    if(accData.state || accData.pin) addrParts.push((accData.state || '') + (accData.state && accData.pin ? ' - ' : '') + (accData.pin || ''));
    let finalAddr = addrParts.join('<br>');

    // Find customer for extra info
    const custObj = allCustomers.find(c => c.name === p.customerName);
    let custAddr = '';
    let custGST = '';
    
    if (custObj) {
        let parts = [];
        if (custObj.address) parts.push(custObj.address);
        if (custObj.city) parts.push(custObj.city);
        if (custObj.state || custObj.pin) {
            parts.push((custObj.state || '') + (custObj.state && custObj.pin ? ' - ' : '') + (custObj.pin || ''));
        }
        custAddr = parts.join(', ');
        custGST = custObj.gstin || '';
    }

    const arAmt = parseFloat(p.amount) || 0;
    const arDisc = parseFloat(p.discount) || 0;
    const totalApplied = arAmt + arDisc;
    const arDate = p.date ? new Date(p.date).toLocaleDateString('en-GB') : '';

    // Let's gather "Paid Bills" context by looking at sales invoices for this customer
    // We will find all sales invoices for this customer that have receivedAmount > 0
    let custSales = allSales.filter(s => s.customerName && p.customerName && s.customerName.toLowerCase() === p.customerName.toLowerCase());
    // Sort oldest first
    custSales.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    let paidBillsHTML = '';
    let billsRendered = 0;
    
    // We display recent bills that have some payment on them
    custSales.forEach(s => {
        const received = parseFloat(s.receivedAmount) || 0;
        if (received > 0) {
            const grandTotal = parseFloat(s.grandTotal) || 0;
            const pendingAmt = Math.max(0, grandTotal - received);
            const sDate = s.date ? new Date(s.date).toLocaleDateString('en-GB') : '';
            paidBillsHTML += `
                <tr>
                    <td style="text-align: center;">${billsRendered + 1}</td>
                    <td>${sDate}</td>
                    <td>${s.invoiceNumber}</td>
                    <td style="text-align: right;">₹${grandTotal.toFixed(2)}</td>
                    <td style="text-align: right;">₹${pendingAmt.toFixed(2)}</td>
                </tr>
            `;
            billsRendered++;
        }
    });
    
    if (billsRendered === 0) {
        paidBillsHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No specific bill allocations found for this customer.</td></tr>';
    }

    const htmlContent = `
        <div class="header">
            ${accData.logo ? `<img src="${accData.logo}" style="position: absolute; top: 0px; left: 0; max-width: 60px; max-height: 60px; object-fit: contain;">` : ''}
            <div class="comp-name">${accData.company || 'Company Name'}</div>
            <div class="comp-detail">${finalAddr}</div>
            ${accData.mobile ? `<div class="comp-detail">Ph No : ${accData.mobile}</div>` : ''}
            <div style="text-align: center; font-size: 14px; font-weight: 700; background: #000; color: #fff; display: inline-block; padding: 2px 12px; border-radius: 4px; margin-top: 12px; margin-bottom: 8px;">AMOUNT RECEIVED</div>
        </div>
        
        <div style="border-bottom: 1px dashed #000; margin-bottom: 16px;">
            <div class="ar-info-grid">
                <div class="ar-info-label">Customer Name</div>
                <div>: ${p.customerName || 'Walk In Customer'}</div>
                <div class="ar-info-label">AR No</div>
                <div>: ${p.arNo}</div>
                
                <div class="ar-info-label">Mobile Number</div>
                <div>: ${p.mobile || ''}</div>
                <div class="ar-info-label">Date</div>
                <div>: ${arDate}</div>
                
                ${custAddr ? `<div class="ar-info-label">Address</div><div style="grid-column: 2 / -1;">: ${custAddr}</div>` : ''}
            </div>
        </div>
        
        <div style="font-weight: 700; margin-bottom: 8px; font-size: 12px;">Paid Bills Summary</div>
        <table class="print-table">
            <thead>
                <tr>
                    <th style="width: 50px; text-align: center;">S.No</th>
                    <th style="width: 100px;">Date</th>
                    <th style="width: 120px;">INV No</th>
                    <th style="text-align: right;">Invoice Amount</th>
                    <th style="text-align: right;">Pending Amount</th>
                </tr>
            </thead>
            <tbody>
                ${paidBillsHTML}
            </tbody>
        </table>
        
        <div style="margin-top: 16px; margin-bottom: 24px; padding-top: 8px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding-bottom: 8px;">
            ${arDisc > 0 ? `
                <div style="display: flex; justify-content: space-between; font-weight: 500; font-size: 13px; margin-bottom: 8px;">
                    <div>Discount Amount</div>
                    <div style="font-weight: 600;">₹${arDisc.toFixed(2)}</div>
                </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-weight: 500; font-size: 13px; margin-bottom: 8px;">
                <div>Total Received</div>
                <div style="font-weight: 600;">₹${arAmt.toFixed(2)}</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 500; font-size: 13px;">
                <div>Overall Pending</div>
                <div style="font-weight: 600;">₹${(parseFloat(p.pending) || 0).toFixed(2)}</div>
            </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 40px; font-size: 11px;">
            <div style="border-top: 1px dashed #000; padding-top: 8px; width: 150px; text-align: center;">Customer Signature</div>
            <div style="border-top: 1px dashed #000; padding-top: 8px; width: 150px; text-align: center;">Authorised Signatory</div>
        </div>
    `;
    
    container.innerHTML = htmlContent;
}
