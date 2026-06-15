let items = [];
let categories = [];
let units = [];
let currentView = 'grid'; // 'list' or 'grid' by default
let html5QrCode = null;

// Load all initial data from APIs
async function loadInitialData() {
    try {
        const [resCats, resUnits, resItems] = await Promise.all([
            fetch('/api/categories'),
            fetch('/api/units'),
            fetch('/api/items')
        ]);
        categories = await resCats.json();
        units = await resUnits.json();
        items = await resItems.json();
    } catch (err) {
        console.error('Error loading initial data:', err);
    }
    
    populateCategoryFilter();
    renderItems();
}

document.addEventListener('DOMContentLoaded', () => {
    loadInitialData();

    // Elements
    const searchInput = document.getElementById('itemSearch');
    const categoryFilter = document.getElementById('categoryFilter');

    // Dual-Filter Event Listeners
    searchInput.addEventListener('input', () => {
        filterAndRender();
    });

    categoryFilter.addEventListener('change', () => {
        filterAndRender();
    });

    const clearFilterBtn = document.getElementById('clearFilterBtn');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', () => {
            searchInput.value = '';
            categoryFilter.value = '';
            // Reset custom dropdown UI trigger text
            const triggerText = document.querySelector('#categoryFilterDropdown .trigger-text');
            if (triggerText) {
                triggerText.textContent = 'Category';
                triggerText.classList.add('placeholder');
            }
            // Remove active selected status in dropdown panel
            document.querySelectorAll('#categoryFilterDropdown .custom-dropdown-option').forEach(el => el.classList.remove('selected'));
            filterAndRender();
        });
    }

    // Global click to close custom dropdowns
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        }
    });

    const toggleViewBtn = document.getElementById('toggleViewBtn');
    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', () => {
            currentView = currentView === 'list' ? 'grid' : 'list';
            // Swap icon based on new view
            toggleViewBtn.innerHTML = `<i data-lucide="${currentView === 'grid' ? 'list' : 'layout-grid'}" style="width: 18px; height: 18px;"></i>`;
            if (window.lucide) {
                lucide.createIcons();
            }
            filterAndRender();
        });
    }

    // QR Code Scanner Logic
    const scanTagBtn = document.getElementById('scanTagBtn');
    const closeScannerBtn = document.getElementById('closeScannerBtn');
    const scannerModal = document.getElementById('scannerModal');

    if (scanTagBtn) {
        scanTagBtn.addEventListener('click', () => {
            scannerModal.style.display = 'flex';
            startQRScanner();
        });
    }

    if (closeScannerBtn) {
        closeScannerBtn.addEventListener('click', () => {
            stopQRScanner();
        });
    }
});

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
            const searchInput = document.getElementById('itemSearch');
            if (searchInput) {
                searchInput.value = decodedText.trim();
                filterAndRender();
                showToast(`Scanned Tag Code: ${decodedText}`, 'success');
            }
            stopQRScanner();
        };

        // Try environment/back camera first
        html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScanSuccess
        ).catch(err => {
            console.warn("Environment camera failed, trying user camera", err);
            // Fallback to user/front camera
            html5QrCode.start(
                { facingMode: "user" },
                config,
                onScanSuccess
            ).catch(innerErr => {
                console.error("Camera access failed", innerErr);
                showToast("Failed to access camera", "error");
                document.getElementById('scannerModal').style.display = 'none';
            });
        });
    } catch (e) {
        console.error(e);
        showToast("Error initializing camera scanner", "error");
    }
}

function stopQRScanner() {
    const scannerModal = document.getElementById('scannerModal');
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

function populateCategoryFilter() {
    const filterSelect = document.getElementById('categoryFilter');

    // Clear existing besides first default option
    filterSelect.innerHTML = '<option value="">Category</option>';

    categories.forEach(cat => {
        const option1 = document.createElement('option');
        option1.value = cat.name;
        option1.textContent = cat.name;
        filterSelect.appendChild(option1);
    });

    initCustomDropdown('categoryFilterDropdown');
}

function initCustomDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    let trigger = dropdown.querySelector('.custom-dropdown-trigger');
    // Replace trigger to avoid duplicate event listeners if initialized multiple times
    const newTrigger = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(newTrigger, trigger);
    trigger = newTrigger;

    const select = dropdown.querySelector('select');
    const triggerText = trigger.querySelector('.trigger-text');
    const panel = dropdown.querySelector('.custom-dropdown-panel');

    // Clear existing panel content
    panel.innerHTML = '';

    // Populate panel based on select options
    Array.from(select.options).forEach((opt, index) => {
        if (opt.value === "" && index === 0) return; // Skip empty placeholder

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

    trigger.addEventListener('click', (e) => {
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        if (!isOpen) {
            dropdown.classList.add('open');
        }
    });
}

function filterAndRender() {
    const searchVal = document.getElementById('itemSearch').value.trim().toLowerCase();
    const selectedCategory = document.getElementById('categoryFilter').value;
    
    renderItems(searchVal, selectedCategory);
}

function renderItems(searchVal = '', selectedCategory = '') {
    const listContainer = document.getElementById('itemsListContainer');
    const gridContainer = document.getElementById('itemsGridContainer');
    const listBody = document.getElementById('itemsList');
    
    // Toggle container visibility
    if (currentView === 'list') {
        listContainer.style.display = 'block';
        gridContainer.style.display = 'none';
        listBody.innerHTML = '';
    } else {
        listContainer.style.display = 'none';
        gridContainer.style.display = 'grid';
        gridContainer.innerHTML = '';
    }

    let displayCount = 1;

    items.forEach((item) => {
        // Search Filter: matches Code or Item Name
        const matchesSearch = !searchVal || 
            item.code.toLowerCase().includes(searchVal) || 
            item.name.toLowerCase().includes(searchVal);

        // Category Filter: matches Category field
        const matchesCategory = !selectedCategory || item.category === selectedCategory;

        if (matchesSearch && matchesCategory) {
            const pPrice = parseFloat(item.purchasePrice !== undefined ? item.purchasePrice : item.purchaseAmount) || 0;
            const sPrice = parseFloat(item.sellingPrice !== undefined ? item.sellingPrice : item.sellingAmount) || 0;
            
            // Check for image thumbnail
            let thumbnailHtml = '<i data-lucide="package" style="width: 24px; height: 24px; color: white;"></i>';
            if (item.images && item.images.length > 0) {
                thumbnailHtml = `<img src="${item.images[0]}" alt="${item.name}">`;
            }

            if (currentView === 'list') {
                const row = document.createElement('div');
                row.className = 'unit-row unified-row';
                
                let listThumbnailHtml = '<i data-lucide="package"></i>';
                if (item.images && item.images.length > 0) {
                    listThumbnailHtml = `<img src="${item.images[0]}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover;">`;
                }

                row.innerHTML = `
                    <div class="col-item-sno">${displayCount}</div>
                    <div class="vertical-divider"></div>
                    <div class="col-item-code">${item.code}</div>
                    <div class="vertical-divider"></div>
                    <div class="col-item-name">
                        <div class="item-thumbnail">
                            ${listThumbnailHtml}
                        </div>
                        <a href="view-item.html?code=${item.code}" class="item-link" style="text-decoration: none; color: #000B58; font-weight: 600;">${item.name}</a>
                    </div>
                    <div class="vertical-divider"></div>
                    <div class="col-item-category">${item.category}</div>
                    <div class="vertical-divider"></div>
                    <div class="col-item-stock">${item.stock}</div>
                    <div class="vertical-divider"></div>
                    <div class="col-item-unit">${item.unit}</div>
                    <div class="vertical-divider"></div>
                    <div class="col-item-pprice">₹${pPrice.toFixed(2)}</div>
                    <div class="vertical-divider"></div>
                    <div class="col-item-sprice">₹${sPrice.toFixed(2)}</div>
                `;
                listBody.appendChild(row);
            } else {
                // Determine if there are conversions to show in second column
                let conversionHtml = '';
                if (item.conversions && item.conversions.length > 0) {
                    const firstConv = item.conversions[0];
                    conversionHtml = `
                        <div class="item-card-price-col" style="border-left: 1px solid var(--border-color); padding-left: 16px;">
                            <span class="item-card-price-val">₹${parseFloat(firstConv.price).toFixed(2)}</span>
                            <span class="item-card-price-unit">/ ${firstConv.unit}</span>
                        </div>
                    `;
                }

                // Grid View Rendering
                const card = document.createElement('div');
                card.className = 'item-card';
                card.innerHTML = `
                    <div class="item-card-top">
                        <div class="item-card-image" style="background-color: ${item.images && item.images.length > 0 ? 'transparent' : '#F87171'}">
                            ${thumbnailHtml}
                        </div>
                        <div class="item-card-details">
                            <div class="item-card-code">${item.code}</div>
                            <div class="item-card-name"><a href="view-item.html?code=${item.code}" style="text-decoration: none; color: inherit;">${item.name}</a></div>
                            <div class="item-card-category">${item.category}</div>
                            <div class="item-card-purchase">₹${pPrice} / ${item.unit}</div>
                        </div>
                    </div>
                    <div class="item-card-bottom">
                        <div class="item-card-bottom-title">Selling Price</div>
                        <div class="item-card-prices">
                            <div class="item-card-price-col">
                                <span class="item-card-price-val">₹${sPrice.toFixed(2)}</span>
                                <span class="item-card-price-unit">/ ${item.unit}</span>
                            </div>
                            ${conversionHtml}
                        </div>
                    </div>
                `;
                gridContainer.appendChild(card);
            }
            displayCount++;
        }
    });

    // Style cleanup for empty state or last child border in list view
    if (currentView === 'list') {
        const lastChild = listBody.querySelector('.unit-row:last-child');
        if (lastChild) {
            lastChild.style.borderBottom = 'none';
        }
    }

    // Initialize Lucide package icons
    if (window.lucide) {
        lucide.createIcons();
    }
}


