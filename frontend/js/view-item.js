// view-item.js - Logic for SPH Billing Item Detailed View page

let items = [];
let activeItem = null;
let itemImages = [];
let activeImageIndex = -1;
let qrCodeGenerator = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load data from API
    await loadAPIData();

    // 2. Parse URL Query parameters for specific item code
    const urlParams = new URLSearchParams(window.location.search);
    const itemCode = urlParams.get('code');

    if (itemCode) {
        activeItem = items.find(item => String(item.code) === String(itemCode));
    }

    if (!activeItem && items.length > 0) {
        activeItem = items[0];
    }

    // 3. Render side product list
    renderSidebarProducts();

    // 4. Load & render active item details
    if (activeItem) {
        renderActiveItemDetails();
    } else {
        showToast('No items found in database.', 'error');
    }

    // 5. Initialize Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // 6. Setup event listeners
    setupEventListeners();
});

// Load Items database from API
async function loadAPIData() {
    try {
        const res = await fetch('/api/items');
        items = await res.json();
    } catch (err) {
        console.error('Error loading items:', err);
        items = [];
    }
}

// Render left products list with search filter
function renderSidebarProducts(filterText = '') {
    const sidebarList = document.getElementById('sidebarProductsList');
    sidebarList.innerHTML = '';

    const query = filterText.toLowerCase().trim();
    const filtered = items.filter(item => {
        return item.name.toLowerCase().includes(query) || String(item.code).toLowerCase().includes(query);
    });

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = `sidebar-product-card ${activeItem && item.code === activeItem.code ? 'active' : ''}`;
        card.innerHTML = `
            <div class="sidebar-product-name">${item.name}</div>
            <div class="sidebar-product-cat">${item.category || 'N/A'}</div>
        `;
        card.addEventListener('click', () => {
            activeItem = item;
            // Update URL search parameters without reloading page
            const newUrl = `${window.location.pathname}?code=${item.code}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

            // Re-render sidebar highlights and details
            document.querySelectorAll('.sidebar-product-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            renderActiveItemDetails();
        });
        sidebarList.appendChild(card);
    });
}

// Render active item details to cards and tag sticker
function renderActiveItemDetails() {
    if (!activeItem) return;

    // Header Title
    document.getElementById('pageTitleName').textContent = activeItem.name;

    // Basic Details
    document.getElementById('viewCode').textContent = activeItem.code;
    document.getElementById('viewCategory').textContent = activeItem.category || '-';
    document.getElementById('viewItemName').textContent = activeItem.name;
    document.getElementById('viewHSN').textContent = activeItem.hsn || '-';
    
    let gstText = '-';
    if (activeItem.gstRate && activeItem.gstRate !== 'none') {
        const isIgst = activeItem.gstRate.startsWith('i');
        const rate = activeItem.gstRate.replace('i', '');
        gstText = `${isIgst ? 'IGST' : 'GST'} ${rate}%`;
    }
    document.getElementById('viewGST').textContent = gstText;

    // Purchase Details
    document.getElementById('viewPurchaseUnit').textContent = activeItem.unit || '-';
    const purchaseAmount = parseFloat(activeItem.purchaseAmount) || 0;
    const purchaseTaxText = activeItem.purchaseTaxType === 'with' ? 'With Tax' : 'Without Tax';
    document.getElementById('viewPurchaseAmount').textContent = `₹${purchaseAmount.toFixed(2)} ${purchaseTaxText}`;
    document.getElementById('viewStock').textContent = activeItem.stock !== undefined ? activeItem.stock : '-';

    // Selling Price Details
    const marginSymbol = activeItem.marginType === 'percent' ? '%' : '₹';
    document.getElementById('viewMargin').textContent = `${marginSymbol}${activeItem.sellingMargin || 0}`;

    const sellAmount = parseFloat(activeItem.sellingPrice) || 0;
    const sellTaxText = activeItem.sellingTaxType === 'with' ? 'With Tax' : 'Without Tax';
    document.getElementById('viewSellingAmount').textContent = `₹${sellAmount.toFixed(2)} ${sellTaxText}`;

    // Conversions table rendering
    const tableBody = document.getElementById('conversionsTableBody');
    tableBody.innerHTML = '';

    if (activeItem.conversions && activeItem.conversions.length > 0) {
        document.getElementById('conversionsTableView').style.display = 'block';
        activeItem.conversions.forEach(c => {
            const row = document.createElement('div');
            row.className = 'table-view-row';
            row.innerHTML = `
                <div>${c.unit}</div>
                <div>1 ${activeItem.unit || 'Unit'} = ${c.factor} ${c.unit}</div>
                <div>₹${parseFloat(c.price).toFixed(2)}</div>
            `;
            tableBody.appendChild(row);
        });
    } else {
        // Hide conversions table if no conversions were created
        document.getElementById('conversionsTableView').style.display = 'none';
    }

    // Product Images setup
    itemImages = activeItem.images || [];
    activeImageIndex = itemImages.length > 0 ? 0 : -1;
    refreshImageDisplay();

    // Tag Sticker rendering
    document.getElementById('tagCodeTag').textContent = activeItem.code;
    document.getElementById('tagNameTag').textContent = activeItem.name;
    document.getElementById('tagPriceTag').textContent = `₹${sellAmount.toFixed(2)}/${activeItem.unit || 'Unit'}`;
    updateQRCode(activeItem.code);
}

// Refresh Product Image preview pane inside carousel
function refreshImageDisplay() {
    const placeholder = document.getElementById('imagePlaceholder');
    const imgEl = document.getElementById('previewImage');
    const counter = document.getElementById('imgCounter');

    const prevBtn = document.getElementById('prevImgBtn');
    const nextBtn = document.getElementById('nextImgBtn');

    if (itemImages.length === 0) {
        placeholder.style.display = 'flex';
        imgEl.style.display = 'none';
        if (counter) counter.style.display = 'none';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else {
        placeholder.style.display = 'none';
        imgEl.style.display = 'block';
        imgEl.src = itemImages[activeImageIndex];
        if (counter) {
            counter.style.display = 'block';
            counter.textContent = `${activeImageIndex + 1}/${itemImages.length}`;
        }

        // Carousel buttons display if multiple images
        if (itemImages.length > 1) {
            if (prevBtn) prevBtn.style.display = 'flex';
            if (nextBtn) nextBtn.style.display = 'flex';
        } else {
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
        }
    }
}

function showPrevImage() {
    if (itemImages.length === 0) return;
    activeImageIndex = (activeImageIndex - 1 + itemImages.length) % itemImages.length;
    refreshImageDisplay();
}

function showNextImage() {
    if (itemImages.length === 0) return;
    activeImageIndex = (activeImageIndex + 1) % itemImages.length;
    refreshImageDisplay();
}

// Generate QR Code dynamically
function updateQRCode(text) {
    const qrContainer = document.getElementById('tagQRCode');
    if (!qrContainer) return;

    if (!text) {
        qrContainer.style.visibility = 'hidden';
        return;
    }

    qrContainer.style.visibility = 'visible';

    if (qrCodeGenerator) {
        qrCodeGenerator.clear();
        qrCodeGenerator.makeCode(text);
    } else if (window.QRCode) {
        qrContainer.innerHTML = '';
        qrCodeGenerator = new QRCode(qrContainer, {
            text: text,
            width: 80,
            height: 80,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }
}

// Listeners and Interactive events
function setupEventListeners() {
    // A. Sticky Sidebar Search box filter input
    const sidebarSearchInput = document.getElementById('sidebarSearch');
    sidebarSearchInput.addEventListener('input', (e) => {
        renderSidebarProducts(e.target.value);
    });

    // B. Image carousel navigation buttons
    document.getElementById('prevImgBtn').addEventListener('click', showPrevImage);
    document.getElementById('nextImgBtn').addEventListener('click', showNextImage);

    // C. Print tag trigger
    document.getElementById('printTagBtn').addEventListener('click', () => {
        if (!activeItem) return;
        
        const code = activeItem.code;
        const name = activeItem.name;
        const sellAmount = parseFloat(activeItem.sellingPrice) || 0;
        const displayPrice = `₹${sellAmount.toFixed(2)}/${activeItem.unit || 'Unit'}`;

        const qrCanvas = document.querySelector('#tagQRCode canvas');
        const qrImg = document.querySelector('#tagQRCode img');
        const qrDataUrl = qrCanvas ? qrCanvas.toDataURL() : (qrImg ? qrImg.src : '');

        openPrintTagModal({ code, name, displayPrice, qrDataUrl });
    });

    // C2. Preview Tag trigger
    const previewBtn = document.getElementById('previewTagBtn');
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            const modal = document.getElementById('tagPreviewModal');
            if (modal) modal.classList.add('show');
        });
    }

    const closePreviewBtn = document.getElementById('closeTagPreviewBtn');
    if (closePreviewBtn) {
        closePreviewBtn.addEventListener('click', () => {
            const modal = document.getElementById('tagPreviewModal');
            if (modal) modal.classList.remove('show');
        });
    }

    // D. Edit button redirect to edit screen
    document.getElementById('editItemBtn').addEventListener('click', () => {
        if (activeItem) {
            window.location.href = `create-item.html?edit=${activeItem.code}`;
        }
    });

    // E. Delete Modal Controls
    const deleteModal = document.getElementById('deleteModal');
    const deleteItemBtn = document.getElementById('deleteItemBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    deleteItemBtn.addEventListener('click', () => {
        deleteModal.classList.add('show');
    });

    cancelDeleteBtn.addEventListener('click', () => {
        deleteModal.classList.remove('show');
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        if (!activeItem) return;

        // Perform delete operation in API database
        const activeCode = activeItem.code;
        items = items.filter(item => String(item.code) !== String(activeCode));
        try {
            const res = await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items)
            });
            const result = await res.json();
            if (result.success) {
                deleteModal.classList.remove('show');
                showToast('Yes deleted successfully', 'success');

                // Redirect back to list page after deletion toast completes
                setTimeout(() => {
                    window.location.href = 'items.html';
                }, 1200);
            }
        } catch (err) {
            console.error('Error deleting item:', err);
            showToast('Failed to delete item', 'error');
        }
    });
}

