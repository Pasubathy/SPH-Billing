// create-item.js - Logic for SPH Billing Item Creation page

let categories = [];
let units = [];
let items = [];
let itemImages = [];
let activeImageIndex = -1;
let videoStream = null;
let qrCodeGenerator = null;

let editItemCode = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load data from API
    await loadAPIData();

    // 2. Populate form dropdowns
    populateDropdowns();

    // 3. Initialize QR Code generator
    initQRCode();

    // 4. Initialize Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // 5. Setup event listeners
    setupEventListeners();

    // 6. Initialize Custom Dropdown (GST)
    initCustomDropdown('gstRateDropdown');

    // 7. Check if in edit mode
    const urlParams = new URLSearchParams(window.location.search);
    const editCode = urlParams.get('edit');
    if (editCode) {
        editItemCode = editCode;
        // Update header title to Edit Item
        const pageTitle = document.querySelector('.page-title');
        if (pageTitle) pageTitle.textContent = 'Edit Item';
        const pageHeader = document.querySelector('.page-header');
        if (pageHeader) pageHeader.style.height = '45px';
        loadItemForEditing(editCode);
    }

    // 8. Global click to close custom dropdowns and reset row z-index
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
            document.querySelectorAll('.conversion-grid-row').forEach(row => row.style.zIndex = '1');
        }
    });
});

// Load Categories, Units, and Items
async function loadAPIData() {
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
}

// Populate Category & Unit Dropdowns
function populateDropdowns() {
    const categorySelect = document.getElementById('itemCategory');
    categorySelect.innerHTML = '<option value="">Select Category</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.name;
        categorySelect.appendChild(option);
    });

    const unitSelect = document.getElementById('purchaseUnit');
    unitSelect.innerHTML = '<option value="">Select Unit</option>';
    units.forEach(u => {
        const option = document.createElement('option');
        const shortName = u.shortName || u.name;
        option.value = shortName;
        option.textContent = `${u.name} (${shortName})`;
        option.setAttribute('data-decimal', u.allowDecimal === 'Yes' ? 'true' : 'false');
        unitSelect.appendChild(option);
    });

    initCustomDropdown('categoryDropdown');
    initCustomDropdown('purchaseUnitDropdown');
    initCustomDropdown('purchaseTaxDropdown');
    initCustomDropdown('marginTypeDropdown');
    initCustomDropdown('sellingTaxDropdown');
}

// Initialize a custom dropdown
function initCustomDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const select = dropdown.querySelector('select');
    const trigger = dropdown.querySelector('.custom-dropdown-trigger');
    const triggerText = trigger.querySelector('.trigger-text');
    const panel = dropdown.querySelector('.custom-dropdown-panel');

    // Clear existing panel content
    panel.innerHTML = '';

    // Populate panel based on select options
    Array.from(select.options).forEach((opt, index) => {
        // Skip hidden placeholder options if desired, but here we include all as per standard
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
            // Update select
            select.value = opt.value;
            // Update trigger UI
            triggerText.textContent = opt.textContent;
            triggerText.classList.remove('placeholder');
            // Update selected state in panel
            panel.querySelectorAll('.custom-dropdown-option').forEach(el => el.classList.remove('selected'));
            optionDiv.classList.add('selected');
            // Close dropdown
            dropdown.classList.remove('open');
            // Trigger change event on original select (important for other listeners like purchaseUnit change)
            select.dispatchEvent(new Event('change'));
        });

        panel.appendChild(optionDiv);
    });

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        const isOpen = dropdown.classList.contains('open');
        // Close all other dropdowns
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        if (!isOpen) {
            dropdown.classList.add('open');
        }
    });
}

// Initialize a custom dropdown by DOM element (for dynamic rows)
function initCustomDropdownEl(dropdown, onChangeCb) {
    const select = dropdown.querySelector('select');
    const trigger = dropdown.querySelector('.custom-dropdown-trigger');
    const triggerText = trigger.querySelector('.trigger-text');
    const panel = dropdown.querySelector('.custom-dropdown-panel');

    panel.innerHTML = '';

    Array.from(select.options).forEach((opt, index) => {
        if (opt.value === '' && index === 0) return; // skip empty placeholder

        const optionDiv = document.createElement('div');
        optionDiv.className = 'custom-dropdown-option';
        optionDiv.textContent = opt.textContent;
        optionDiv.dataset.value = opt.value;

        if (select.value === opt.value && opt.value !== '') {
            optionDiv.classList.add('selected');
            triggerText.textContent = opt.textContent;
            triggerText.classList.remove('placeholder');
        }

        optionDiv.addEventListener('click', () => {
            select.value = opt.value;
            triggerText.textContent = opt.textContent;
            triggerText.classList.remove('placeholder');
            panel.querySelectorAll('.custom-dropdown-option').forEach(el => el.classList.remove('selected'));
            optionDiv.classList.add('selected');
            dropdown.classList.remove('open');
            
            // Reset z-index on all rows when closed
            document.querySelectorAll('.conversion-grid-row').forEach(row => row.style.zIndex = '1');
            
            select.dispatchEvent(new Event('change'));
            if (onChangeCb) onChangeCb(opt.value, opt.textContent);
        });

        panel.appendChild(optionDiv);
    });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        
        // Reset z-index for all rows
        document.querySelectorAll('.conversion-grid-row').forEach(row => {
            row.style.position = 'relative';
            row.style.zIndex = '1';
        });
        
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        
        if (!isOpen) {
            dropdown.classList.add('open');
            // Elevate this row so the panel goes over subsequent rows
            const parentRow = dropdown.closest('.conversion-grid-row');
            if (parentRow) {
                parentRow.style.zIndex = '999';
            }
        }
    });
}

// Update QR Code inside Tagsticker dynamically
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

// Validate mandatory fields and update Tag Sticker preview
function validateAndRenderTag() {
    const code = document.getElementById('itemCode').value.trim();
    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value;
    const unit = document.getElementById('purchaseUnit').value;
    const price = document.getElementById('sellingAmount').value.trim();

    const isCodeValid = code !== '';
    const isNameValid = name !== '';
    const isCategoryValid = category !== '';
    const isUnitValid = unit !== '';
    const isPriceValid = price !== '' && parseFloat(price) >= 0;

    const isValid = isCodeValid && isNameValid && isCategoryValid && isUnitValid && isPriceValid;

    const tagCodeEl = document.getElementById('tagCodeTag');
    const tagNameEl = document.getElementById('tagNameTag');
    const tagPriceEl = document.getElementById('tagPriceTag');
    const printBtn = document.getElementById('printTagBtn');
    const previewBtn = document.getElementById('previewTagBtn');

    if (isValid) {
        tagCodeEl.textContent = code;
        tagNameEl.textContent = name;
        tagPriceEl.textContent = `₹${parseFloat(price).toFixed(2)}/${unit}`;
        updateQRCode(code);

        if (printBtn) {
            printBtn.removeAttribute('disabled');
            printBtn.style.opacity = '';
            printBtn.style.cursor = '';
        }
        if (previewBtn) {
            previewBtn.removeAttribute('disabled');
            previewBtn.style.opacity = '';
            previewBtn.style.cursor = '';
        }
    } else {
        tagCodeEl.textContent = '---';
        tagNameEl.textContent = '---';
        tagPriceEl.textContent = '---';
        updateQRCode('');

        if (printBtn) {
            printBtn.setAttribute('disabled', 'true');
            printBtn.style.opacity = '0.5';
            printBtn.style.cursor = 'not-allowed';
        }
        if (previewBtn) {
            previewBtn.setAttribute('disabled', 'true');
            previewBtn.style.opacity = '0.5';
            previewBtn.style.cursor = 'not-allowed';
        }
    }
}

// Initialize QR Code inside Tagsticker
function initQRCode() {
    updateQRCode(''); // initialize empty
}

// Setup Form, Image, Camera & Bidirectional Calculation Event Listeners
function setupEventListeners() {
    // A. HSN Code: Numeric entry only (no decimal, no letters)
    const hsnInput = document.getElementById('itemHSN');
    hsnInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    // Tag preview validation triggers
    document.getElementById('itemCode').addEventListener('input', validateAndRenderTag);
    document.getElementById('itemName').addEventListener('input', validateAndRenderTag);
    document.getElementById('itemCategory').addEventListener('change', validateAndRenderTag);
    document.getElementById('purchaseUnit').addEventListener('change', validateAndRenderTag);
    document.getElementById('sellingAmount').addEventListener('input', validateAndRenderTag);

    // B. Stock Code: Numeric and decimal allowed
    const stockInput = document.getElementById('itemStock');
    stockInput.addEventListener('input', (e) => {
        const unitSelect = document.getElementById('purchaseUnit');
        const selectedOpt = unitSelect.options[unitSelect.selectedIndex];
        const allowDecimal = selectedOpt && selectedOpt.getAttribute('data-decimal') === 'true';
        
        if (allowDecimal) {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
            const parts = e.target.value.split('.');
            if (parts.length > 2) {
                e.target.value = parts[0] + '.' + parts.slice(1).join('');
            }
        } else {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        }
    });

    // C. Unique Code Generator
    const generateBtn = document.getElementById('generateCodeBtn');
    generateBtn.addEventListener('click', () => {
        let uniqueCode = "";
        let attempts = 0;
        const maxAttempts = 1000;

        while (attempts < maxAttempts) {
            // Generate a random code up to 5 digits
            const randNum = Math.floor(Math.random() * 90000) + 10000; // 5 digit random number
            uniqueCode = String(randNum);

            // Check uniqueness against existing items in database
            const isDuplicate = items.some(item => String(item.code) === uniqueCode);
            if (!isDuplicate) {
                document.getElementById('itemCode').value = uniqueCode;
                validateAndRenderTag();
                showToast('Unique code generated successfully', 'success');
                break;
            }
            attempts++;
        }

        if (attempts >= maxAttempts) {
            if (window.showToast) showToast('Could not generate unique code.', 'error');
            else alert('Could not generate unique code.');
        }
    });

    // D. Removed old Live Tag updates here because validateAndRenderTag now handles it

    // E. Bidirectional Selling Price & Margin calculation
    const purchaseAmountInput = document.getElementById('purchaseAmount');
    const sellingMarginInput = document.getElementById('sellingMargin');
    const marginTypeSelect = document.getElementById('marginType');

    // Trigger calculation when Purchase Price, Margin or Margin Type changes
    purchaseAmountInput.addEventListener('input', calcSellingPrice);
    sellingMarginInput.addEventListener('input', calcSellingPrice);
    marginTypeSelect.addEventListener('change', calcSellingPrice);

    // Trigger calculation when Selling Amount is manually changed
    const sellAmountInput = document.getElementById('sellingAmount');
    sellAmountInput.addEventListener('input', calcMarginFromSelling);

    // F. Conversions Sub-table Add/Remove rows
    const addRowBtn = document.getElementById('addConversionRowBtn');
    addRowBtn.addEventListener('click', addConversionRow);

    // F2. Update sell base unit prefix when purchase unit changes
    const purchaseUnitSelect = document.getElementById('purchaseUnit');
    purchaseUnitSelect.addEventListener('change', updateSellUnitPrefix);

    // G. Image upload handling
    const uploadBtn = document.getElementById('uploadImgBtn');
    const fileInput = document.getElementById('imageFileInput');

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImageUpload);

    // H. Camera Webcam capture handling
    const cameraBtn = document.getElementById('cameraImgBtn');
    const cameraOverlay = document.getElementById('cameraOverlay');
    const closeCameraBtn = document.getElementById('closeCameraBtn');
    const cancelCaptureBtn = document.getElementById('cancelCaptureBtn');
    const captureBtn = document.getElementById('captureBtn');

    cameraBtn.addEventListener('click', openWebcam);
    closeCameraBtn.addEventListener('click', closeWebcam);
    cancelCaptureBtn.addEventListener('click', closeWebcam);
    captureBtn.addEventListener('click', captureWebcamPhoto);

    // I. Carousel Navigation
    document.getElementById('prevImgBtn').addEventListener('click', showPrevImage);
    document.getElementById('nextImgBtn').addEventListener('click', showNextImage);
    document.getElementById('deleteImgBtn').addEventListener('click', deleteActiveImage);

    // J. Print tag button
    document.getElementById('printTagBtn').addEventListener('click', () => {
        const code = document.getElementById('itemCode').value.trim();
        const name = document.getElementById('itemName').value.trim();
        const unitSelect = document.getElementById('purchaseUnit');
        const unit = unitSelect.options[unitSelect.selectedIndex]?.text.match(/\(([^)]+)\)/)?.[1] || unitSelect.value || 'Unit';
        const price = document.getElementById('sellingAmount').value.trim();
        const displayPrice = `₹${parseFloat(price).toFixed(2)}/${unit}`;
        
        const qrCanvas = document.querySelector('#tagQRCode canvas');
        const qrImg = document.querySelector('#tagQRCode img');
        const qrDataUrl = qrCanvas ? qrCanvas.toDataURL() : (qrImg ? qrImg.src : '');

        openPrintTagModal({ code, name, displayPrice, qrDataUrl });
    });

    // J2. Preview Tag button
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

    // K. Save Item Form Submission
    document.getElementById('saveItemBtn').addEventListener('click', saveItem);

    // L. Save & Add: save item then reset form for another entry
    document.getElementById('saveAddBtn').addEventListener('click', saveAndAddItem);
}

// Calculate Selling Price from Purchase + Margin
function calcSellingPrice() {
    const purchaseVal = parseFloat(document.getElementById('purchaseAmount').value) || 0;
    const marginVal = parseFloat(document.getElementById('sellingMargin').value) || 0;
    const marginType = document.getElementById('marginType').value;
    const sellAmountInput = document.getElementById('sellingAmount');

    let sellingPrice = 0;
    if (marginType === 'rupee') {
        sellingPrice = purchaseVal + marginVal;
    } else {
        sellingPrice = purchaseVal * (1 + marginVal / 100);
    }

    // Update form and tag preview (rounded to max 2 decimals)
    sellAmountInput.value = sellingPrice > 0 ? parseFloat(sellingPrice.toFixed(2)) : '';
    validateAndRenderTag();
    updateConversionRowPrices();
}

// Calculate Margin from Selling Amount & Purchase Price
function calcMarginFromSelling() {
    const purchaseVal = parseFloat(document.getElementById('purchaseAmount').value) || 0;
    const sellVal = parseFloat(document.getElementById('sellingAmount').value) || 0;
    const marginType = document.getElementById('marginType').value;
    const marginInput = document.getElementById('sellingMargin');

    let margin = 0;
    if (marginType === 'rupee') {
        margin = sellVal - purchaseVal;
    } else {
        margin = purchaseVal > 0 ? ((sellVal - purchaseVal) / purchaseVal) * 100 : 0;
    }

    marginInput.value = margin !== 0 ? parseFloat(margin.toFixed(2)) : '';
    validateAndRenderTag();
    updateConversionRowPrices();
}

// Update the "1 Unit =" prefix label based on selected purchase unit
function updateSellUnitPrefix() {
    const unitSelect = document.getElementById('purchaseUnit');
    const prefix = document.getElementById('sellBaseUnitPrefix');
    const selectedOption = unitSelect.options[unitSelect.selectedIndex];
    if (unitSelect.value) {
        // Show short name from the option text, e.g. "Kilogram (Kg)" -> "Kg"
        const match = selectedOption.textContent.match(/\(([^)]+)\)/);
        const shortName = match ? match[1] : unitSelect.value;
        prefix.textContent = `1 ${shortName} =`;
    } else {
        prefix.textContent = '1 Unit =';
    }
}

// Add conversions row in the dynamic div-based grid
function addConversionRow() {
    const gridBody = document.getElementById('conversionsGridBody');
    const container = document.getElementById('conversionsGridContainer');

    // Show the grid container when first row is added
    container.style.display = 'block';

    // Get current base/purchase unit short name for the left prefix
    const purchaseUnitSelect = document.getElementById('purchaseUnit');
    const getBaseUnitShort = () => {
        const selectedOpt = purchaseUnitSelect.options[purchaseUnitSelect.selectedIndex];
        if (purchaseUnitSelect.value) {
            const match = selectedOpt.textContent.match(/\(([^)]+)\)/);
            return match ? match[1] : purchaseUnitSelect.value;
        }
        return 'Unit';
    };

    const row = document.createElement('div');
    row.className = 'conversion-grid-row';
    row.innerHTML = `
        <div class="form-group" style="margin-bottom:0; position:relative;">
            <div class="custom-dropdown conv-unit-dropdown custom-dropdown-up" style="height:34px; position:relative;">
                <select class="conversion-unit-select" style="display:none;">
                    <option value="">Select Unit</option>
                </select>
                <div class="custom-dropdown-trigger" style="height:100%; padding:0 10px; border:1px solid var(--border-color); border-radius:6px; background:#fff; display:flex; align-items:center; justify-content:space-between; cursor:pointer; gap:6px;">
                    <span class="trigger-text placeholder" style="font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Select Unit</span>
                    <svg class="trigger-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; flex-shrink:0; transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="custom-dropdown-panel" style="min-width:100%;"></div>
            </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <div class="input-addon-group conversion-factor-group" style="height:34px;">
                <span class="conversion-prefix-label">1 ${getBaseUnitShort()} =</span>
                <input type="number" class="conversion-factor-input" placeholder="1.00" min="0.0001" step="any" style="font-size:14px; text-align:center;">
                <span class="conversion-suffix-label conversion-unit-badge">Unit</span>
            </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <div class="input-addon-group" style="height:34px;">
                <span class="input-prefix-icon" style="font-size:14px;">₹</span>
                <input type="number" class="conversion-price-input" placeholder="0.00" step="0.01" min="0" style="font-size:14px; padding-left:4px;">
            </div>
        </div>
        <div style="display:flex; align-items:center; justify-content:center;">
            <button type="button" class="btn-icon-danger delete-conv-row-btn" style="background:transparent; border:none; cursor:pointer; color:#EF4444;">
                <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
            </button>
        </div>
    `;

    // Populate native select options (custom dropdown reads from these)
    const select = row.querySelector('.conversion-unit-select');
    units.forEach(u => {
        const option = document.createElement('option');
        const shortName = u.shortName || u.name;
        option.value = shortName;
        option.textContent = `${u.name} (${shortName})`;
        select.appendChild(option);
    });

    const convDropdown = row.querySelector('.conv-unit-dropdown');
    const prefixLabel = row.querySelector('.conversion-prefix-label');
    const unitBadge = row.querySelector('.conversion-unit-badge');

    // Init custom dropdown UI; on select → update unit badge in conversion factor
    initCustomDropdownEl(convDropdown, (value) => {
        unitBadge.textContent = value || 'Unit';
    });

    // Update left-side prefix label when purchase/base unit changes (live sync)
    const syncPrefix = () => {
        prefixLabel.textContent = `1 ${getBaseUnitShort()} =`;
    };
    purchaseUnitSelect.addEventListener('change', syncPrefix);

    // Recalculate conversion price when factor changes (force-override manual price)
    const factorInput = row.querySelector('.conversion-factor-input');
    factorInput.addEventListener('input', (e) => {
        const pUnitSelect = document.getElementById('purchaseUnit');
        const pSelectedOpt = pUnitSelect.options[pUnitSelect.selectedIndex];
        const allowDecimal = pSelectedOpt && pSelectedOpt.getAttribute('data-decimal') === 'true';
        
        if (allowDecimal) {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
            const parts = e.target.value.split('.');
            if (parts.length > 2) {
                e.target.value = parts[0] + '.' + parts.slice(1).join('');
            }
        } else {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        }
        calculateConversionPrice(row, true);
    });

    // Delete row handler — also remove the purchase unit listener to avoid leaks
    const deleteBtn = row.querySelector('.delete-conv-row-btn');
    deleteBtn.addEventListener('click', () => {
        purchaseUnitSelect.removeEventListener('change', syncPrefix);
        row.remove();
        toggleConversionsVisibility();
    });

    gridBody.appendChild(row);
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Show/hide conversions grid based on whether rows exist
function toggleConversionsVisibility() {
    const gridBody = document.getElementById('conversionsGridBody');
    const container = document.getElementById('conversionsGridContainer');
    const rows = gridBody.querySelectorAll('.conversion-grid-row');
    container.style.display = rows.length > 0 ? 'block' : 'none';
}

// Calculate the conversion unit selling price from factor.
// Only auto-fills if the price field is empty (respects manual user input).
function calculateConversionPrice(row, forceOverride = false) {
    const sellPrice = parseFloat(document.getElementById('sellingAmount').value) || 0;
    const factorInput = row.querySelector('.conversion-factor-input');
    const priceInput = row.querySelector('.conversion-price-input');
    const factor = parseFloat(factorInput.value) || 0;
    const currentPrice = parseFloat(priceInput.value) || 0;

    // Auto-calculate only when factor is being changed (forceOverride=true)
    // or when price is still empty/zero (not yet manually set)
    if (factor > 0 && (forceOverride || currentPrice === 0)) {
        const convPrice = sellPrice / factor;
        priceInput.value = convPrice.toFixed(2);
    } else if (factor <= 0) {
        priceInput.value = '';
    }
}

// Update all conversion row prices when base selling amount changes.
// Passes forceOverride=true so the auto-calc runs regardless of current value.
function updateConversionRowPrices() {
    const gridBody = document.getElementById('conversionsGridBody');
    const rows = gridBody.querySelectorAll('.conversion-grid-row');
    rows.forEach(row => {
        calculateConversionPrice(row, true);
    });
}

// Image Carousel upload handling (Base64)
function handleImageUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function (evt) {
            itemImages.push(evt.target.result);
            activeImageIndex = itemImages.length - 1;
            refreshImageDisplay();
        };
        reader.readAsDataURL(file);
    });

    // Reset input value to allow upload same file twice
    e.target.value = '';
}

// Open webcam camera video stream
function openWebcam() {
    const overlay = document.getElementById('cameraOverlay');
    const video = document.getElementById('webcamVideo');

    overlay.classList.add('show');
    navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 480, height: 480 }
    })
        .then(stream => {
            videoStream = stream;
            video.srcObject = stream;
        })
        .catch(err => {
            console.error('Camera stream access failed:', err);
            showToast('Unable to access camera webcam. Please check settings.', 'error');
            overlay.classList.remove('show');
        });
}

// Close webcam stream
function closeWebcam() {
    const overlay = document.getElementById('cameraOverlay');
    overlay.classList.remove('show');

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

// Take photo frame from webcam video stream
function captureWebcamPhoto() {
    const video = document.getElementById('webcamVideo');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    // Crop center square
    const size = Math.min(canvas.width, canvas.height);
    const startX = (canvas.width - size) / 2;
    const startY = (canvas.height - size) / 2;

    canvas.width = 480;
    canvas.height = 480;
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 480, 480);

    const dataUrl = canvas.toDataURL('image/jpeg');
    itemImages.push(dataUrl);
    activeImageIndex = itemImages.length - 1;

    refreshImageDisplay();
    closeWebcam();
    showToast('Photo captured successfully', 'success');
}

// Refresh Image preview pane and navigation arrows
function refreshImageDisplay() {
    const placeholder = document.getElementById('imagePlaceholder');
    const imgEl = document.getElementById('previewImage');
    const counter = document.getElementById('imgCounter');

    const prevBtn = document.getElementById('prevImgBtn');
    const nextBtn = document.getElementById('nextImgBtn');
    const deleteBtn = document.getElementById('deleteImgBtn');

    if (itemImages.length === 0) {
        placeholder.style.display = 'flex';
        imgEl.style.display = 'none';
        counter.style.display = 'none';

        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
    } else {
        placeholder.style.display = 'none';
        imgEl.style.display = 'block';
        imgEl.src = itemImages[activeImageIndex];
        counter.style.display = 'block';
        counter.textContent = `${activeImageIndex + 1}/${itemImages.length}`;

        // Carousel buttons
        if (itemImages.length > 1) {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'flex';
        } else {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
        }
        deleteBtn.style.display = 'flex';
    }
}

// Show previous item photo
function showPrevImage() {
    if (itemImages.length === 0) return;
    activeImageIndex = (activeImageIndex - 1 + itemImages.length) % itemImages.length;
    refreshImageDisplay();
}

// Show next item photo
function showNextImage() {
    if (itemImages.length === 0) return;
    activeImageIndex = (activeImageIndex + 1) % itemImages.length;
    refreshImageDisplay();
}

// Delete currently previewed item photo
function deleteActiveImage() {
    if (itemImages.length === 0) return;
    itemImages.splice(activeImageIndex, 1);
    if (itemImages.length === 0) {
        activeImageIndex = -1;
    } else {
        activeImageIndex = Math.max(0, activeImageIndex - 1);
    }
    refreshImageDisplay();
    showToast('Photo deleted successfully', 'success');
}

// Save complete item object to API database and navigate back
async function saveItem() {
    const codeInput = document.getElementById('itemCode');
    const nameInput = document.getElementById('itemName');
    const categorySelect = document.getElementById('itemCategory');
    const hsnInput = document.getElementById('itemHSN');
    const gstRateSelect = document.getElementById('itemGSTRate');

    const purchaseAmountInput = document.getElementById('purchaseAmount');
    const purchaseTaxTypeSelect = document.getElementById('purchaseTaxType');
    const purchaseUnitSelect = document.getElementById('purchaseUnit');
    const stockInput = document.getElementById('itemStock');

    const sellingMarginInput = document.getElementById('sellingMargin');
    const marginTypeSelect = document.getElementById('marginType');
    const sellingAmountInput = document.getElementById('sellingAmount');

    // Values parsing
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    const category = categorySelect.value;
    const hsn = hsnInput.value.trim();
    const gstRate = gstRateSelect.value;

    const purchaseAmount = parseFloat(purchaseAmountInput.value) || 0;
    const purchaseTaxType = purchaseTaxTypeSelect.value;
    const unit = purchaseUnitSelect.value;
    const stock = parseFloat(stockInput.value) || 0;

    const sellingMargin = parseFloat(sellingMarginInput.value) || 0;
    const marginType = marginTypeSelect.value;
    const sellingPrice = parseFloat(sellingAmountInput.value) || 0;

    // 1. Validations
    if (!code) {
        showToast('Please enter or generate a unique random Item Code', 'error');
        return;
    }
    if (!name) {
        showToast('Please enter Item Name', 'error');
        return;
    }
    if (!category) {
        showToast('Please select Item Category', 'error');
        return;
    }
    if (!unit) {
        showToast('Please select Base/Purchase Unit', 'error');
        return;
    }

    // 2. Uniqueness check in database (only if not editing the same item)
    if (!editItemCode || String(editItemCode) !== String(code)) {
        const codeExists = items.some(item => String(item.code) === String(code));
        if (codeExists) {
            showToast('An item with this Code already exists. Please generate a unique code.', 'error');
            return;
        }
    }

    // 3. Compile dynamic other units conversions factor values
    const conversionRows = document.getElementById('conversionsGridBody').querySelectorAll('.conversion-grid-row');
    const conversionsList = [];
    let conversionValidationFail = false;

    for (let row of conversionRows) {
        const cUnit = row.querySelector('.conversion-unit-select').value;
        const cFactor = parseFloat(row.querySelector('.conversion-factor-input').value) || 0;
        const cPrice = parseFloat(row.querySelector('.conversion-price-input').value) || 0;

        if (!cUnit || cFactor <= 0) {
            conversionValidationFail = true;
            break;
        }

        conversionsList.push({
            unit: cUnit,
            factor: cFactor,
            price: cPrice
        });
    }

    if (conversionValidationFail) {
        showToast('Please enter both Unit and a valid Conversion Factor for all conversion rows.', 'error');
        return;
    }

    // 4. Construct Item Object
    const newItem = {
        code,
        name,
        category,
        hsn,
        gstRate,
        purchaseAmount,
        purchaseTaxType,
        unit,
        stock,
        sellingMargin,
        marginType,
        sellingPrice,
        sellingTaxType: document.getElementById('sellingTaxType').value,
        images: itemImages,
        conversions: conversionsList
    };

    // 5. Save back to API database
    if (editItemCode) {
        items = items.map(item => String(item.code) === String(editItemCode) ? newItem : item);
    } else {
        items.push(newItem);
    }
    
    try {
        const res = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        const result = await res.json();
        if (result.success) {
            if (editItemCode) {
                showToast('Item updated and saved successfully!', 'success');
            } else {
                showToast('Item created and saved successfully!', 'success');
            }
        }
    } catch (err) {
        console.error('Error saving item:', err);
        showToast('Failed to save item', 'error');
        return;
    }

    // 6. Navigate back to Items list page or view page
    setTimeout(() => {
        if (editItemCode) {
            window.location.href = `view-item.html?code=${code}`;
        } else {
            window.location.href = 'items.html';
        }
    }, 1000);
}

// Save & Add: save the item, then reset the form for another entry
async function saveAndAddItem() {
    const codeInput = document.getElementById('itemCode');
    const nameInput = document.getElementById('itemName');
    const categorySelect = document.getElementById('itemCategory');
    const purchaseUnitSelect = document.getElementById('purchaseUnit');

    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    const category = categorySelect.value;
    const unit = purchaseUnitSelect.value;

    // Minimum validations
    if (!code) { showToast('Please enter or generate a unique Item Code', 'error'); return; }
    if (!name) { showToast('Please enter Item Name', 'error'); return; }
    if (!category) { showToast('Please select Item Category', 'error'); return; }
    if (!unit) { showToast('Please select Base/Purchase Unit', 'error'); return; }

    if (!editItemCode || String(editItemCode) !== String(code)) {
        const codeExists = items.some(item => String(item.code) === String(code));
        if (codeExists) { showToast('An item with this Code already exists.', 'error'); return; }
    }

    // Compile conversions
    const conversionRows = document.getElementById('conversionsGridBody').querySelectorAll('.conversion-grid-row');
    const conversionsList = [];
    for (let row of conversionRows) {
        const cUnit = row.querySelector('.conversion-unit-select').value;
        const cFactor = parseFloat(row.querySelector('.conversion-factor-input').value) || 0;
        const cPrice = parseFloat(row.querySelector('.conversion-price-input').value) || 0;
        if (cUnit && cFactor > 0) {
            conversionsList.push({ unit: cUnit, factor: cFactor, price: cPrice });
        }
    }

    const newItem = {
        code,
        name,
        category,
        hsn: document.getElementById('itemHSN').value.trim(),
        gstRate: document.getElementById('itemGSTRate').value,
        purchaseAmount: parseFloat(document.getElementById('purchaseAmount').value) || 0,
        purchaseTaxType: document.getElementById('purchaseTaxType').value,
        unit,
        stock: parseFloat(document.getElementById('itemStock').value) || 0,
        sellingMargin: parseFloat(document.getElementById('sellingMargin').value) || 0,
        marginType: document.getElementById('marginType').value,
        sellingPrice: parseFloat(document.getElementById('sellingAmount').value) || 0,
        sellingTaxType: document.getElementById('sellingTaxType').value,
        images: itemImages,
        conversions: conversionsList
    };

    items.push(newItem);
    
    try {
        const res = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        const result = await res.json();
        if (result.success) {
            showToast('Item saved! Form reset for next entry.', 'success');
        }
    } catch (err) {
        console.error('Error saving item:', err);
        showToast('Failed to save item', 'error');
        return;
    }

    // Reset form fields
    resetFormForNextItem();
}

// Reset the form fields for a fresh new item entry
function resetFormForNextItem() {
    document.getElementById('itemCode').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemCategory').selectedIndex = 0;
    document.getElementById('itemHSN').value = '';
    document.getElementById('itemGSTRate').selectedIndex = 0;
    document.getElementById('purchaseUnit').selectedIndex = 0;
    document.getElementById('purchaseAmount').value = '';
    document.getElementById('purchaseTaxType').selectedIndex = 0;
    document.getElementById('itemStock').value = '';
    document.getElementById('sellingMargin').value = '';
    document.getElementById('marginType').selectedIndex = 0;
    document.getElementById('sellingAmount').value = '';
    document.getElementById('sellBaseUnitPrefix').textContent = '1 Unit =';

    // Reset custom dropdown trigger text
    const categoryTrigger = document.querySelector('#categoryDropdown .trigger-text');
    if (categoryTrigger) {
        categoryTrigger.textContent = 'Select Category';
        categoryTrigger.classList.add('placeholder');
    }
    const unitTrigger = document.querySelector('#purchaseUnitDropdown .trigger-text');
    if (unitTrigger) {
        unitTrigger.textContent = 'Select Unit';
        unitTrigger.classList.add('placeholder');
    }
    const gstTrigger = document.querySelector('#gstRateDropdown .trigger-text');
    if (gstTrigger) {
        gstTrigger.textContent = 'None';
        gstTrigger.classList.remove('placeholder');
    }

    // Clear conversion rows
    document.getElementById('conversionsGridBody').innerHTML = '';
    document.getElementById('conversionsGridContainer').style.display = 'none';

    // Clear images
    itemImages = [];
    activeImageIndex = -1;
    refreshImageDisplay();

    // Reset QR code
    qrCodeGenerator = null;
    document.getElementById('tagQRCode').innerHTML = '';

    // Reset tag preview
    validateAndRenderTag();
}

// Populate form with existing item values for edit mode
function loadItemForEditing(code) {
    const item = items.find(i => String(i.code) === String(code));
    if (!item) {
        showToast('Item to edit not found.', 'error');
        return;
    }

    // Set simple text/number inputs
    document.getElementById('itemCode').value = item.code;
    // Disable editing item code to prevent duplicate/integrity issues
    document.getElementById('itemCode').disabled = true;
    document.getElementById('generateCodeBtn').style.display = 'none';

    document.getElementById('itemName').value = item.name;
    document.getElementById('itemHSN').value = item.hsn || '';
    document.getElementById('itemStock').value = item.stock || '';
    document.getElementById('purchaseAmount').value = item.purchaseAmount || '';
    document.getElementById('sellingMargin').value = item.sellingMargin || '';
    document.getElementById('sellingAmount').value = item.sellingPrice || '';

    // Dropdowns selection & custom trigger styling
    if (item.category) {
        const catSelect = document.getElementById('itemCategory');
        catSelect.value = item.category;
        const catTrigger = document.querySelector('#categoryDropdown .trigger-text');
        if (catTrigger) {
            catTrigger.textContent = item.category;
            catTrigger.classList.remove('placeholder');
        }
    }

    if (item.unit) {
        const unitSelect = document.getElementById('purchaseUnit');
        unitSelect.value = item.unit;
        const unitTrigger = document.querySelector('#purchaseUnitDropdown .trigger-text');
        if (unitTrigger) {
            const selectedOption = Array.from(unitSelect.options).find(opt => opt.value === item.unit);
            unitTrigger.textContent = selectedOption ? selectedOption.textContent : item.unit;
            unitTrigger.classList.remove('placeholder');
        }
        updateSellUnitPrefix();
    }

    if (item.gstRate) {
        const gstSelect = document.getElementById('itemGSTRate');
        gstSelect.value = item.gstRate;
        const gstTrigger = document.querySelector('#gstRateDropdown .trigger-text');
        if (gstTrigger) {
            const selectedOption = Array.from(gstSelect.options).find(opt => opt.value === item.gstRate);
            gstTrigger.textContent = selectedOption ? selectedOption.textContent : 'None';
        }
    }

    if (item.purchaseTaxType) {
        document.getElementById('purchaseTaxType').value = item.purchaseTaxType;
    }
    if (item.marginType) {
        document.getElementById('marginType').value = item.marginType;
    }
    if (item.sellingTaxType) {
        document.getElementById('sellingTaxType').value = item.sellingTaxType;
    }

    // Load images
    itemImages = item.images || [];
    activeImageIndex = itemImages.length > 0 ? 0 : -1;
    refreshImageDisplay();

    // Populate conversion grid rows
    const gridBody = document.getElementById('conversionsGridBody');
    gridBody.innerHTML = '';
    const container = document.getElementById('conversionsGridContainer');
    
    if (item.conversions && item.conversions.length > 0) {
        container.style.display = 'block';
        item.conversions.forEach(c => {
            // Re-use standard add conversion row but prefill values
            addConversionRowPrefilled(c);
        });
    } else {
        container.style.display = 'none';
    }

    // Initial tags rendering
    validateAndRenderTag();
}

// Prefilled version of addConversionRow for edits
function addConversionRowPrefilled(conv) {
    const gridBody = document.getElementById('conversionsGridBody');
    const purchaseUnitSelect = document.getElementById('purchaseUnit');
    const getBaseUnitShort = () => {
        const selectedOpt = purchaseUnitSelect.options[purchaseUnitSelect.selectedIndex];
        if (purchaseUnitSelect.value) {
            const match = selectedOpt.textContent.match(/\(([^)]+)\)/);
            return match ? match[1] : purchaseUnitSelect.value;
        }
        return 'Unit';
    };

    const row = document.createElement('div');
    row.className = 'conversion-grid-row';
    row.innerHTML = `
        <div class="form-group" style="margin-bottom:0; position:relative;">
            <div class="custom-dropdown conv-unit-dropdown custom-dropdown-up" style="height:34px; position:relative;">
                <select class="conversion-unit-select" style="display:none;">
                    <option value="">Select Unit</option>
                </select>
                <div class="custom-dropdown-trigger" style="height:100%; padding:0 10px; border:1px solid var(--border-color); border-radius:6px; background:#fff; display:flex; align-items:center; justify-content:space-between; cursor:pointer; gap:6px;">
                    <span class="trigger-text placeholder" style="font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Select Unit</span>
                    <svg class="trigger-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; flex-shrink:0; transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="custom-dropdown-panel" style="min-width:100%;"></div>
            </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <div class="input-addon-group conversion-factor-group" style="height:34px;">
                <span class="conversion-prefix-label">1 ${getBaseUnitShort()} =</span>
                <input type="number" class="conversion-factor-input" value="${conv.factor}" placeholder="1.00" min="0.0001" step="any" style="font-size:14px; text-align:center;">
                <span class="conversion-suffix-label conversion-unit-badge">${conv.unit}</span>
            </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <div class="input-addon-group" style="height:34px;">
                <span class="input-prefix-icon" style="font-size:14px;">₹</span>
                <input type="number" class="conversion-price-input" value="${parseFloat(conv.price).toFixed(2)}" placeholder="0.00" step="0.01" min="0" style="font-size:14px; padding-left:4px;">
            </div>
        </div>
        <div style="display:flex; align-items:center; justify-content:center;">
            <button type="button" class="btn-icon-danger delete-conv-row-btn" style="background:transparent; border:none; cursor:pointer; color:#EF4444;">
                <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
            </button>
        </div>
    `;

    // Populate native select with units; pre-select saved unit
    const select = row.querySelector('.conversion-unit-select');
    units.forEach(u => {
        const option = document.createElement('option');
        const shortName = u.shortName || u.name;
        option.value = shortName;
        option.textContent = `${u.name} (${shortName})`;
        if (shortName === conv.unit) option.selected = true;
        select.appendChild(option);
    });

    const convDropdown = row.querySelector('.conv-unit-dropdown');
    const prefixLabel = row.querySelector('.conversion-prefix-label');
    const unitBadge = row.querySelector('.conversion-unit-badge');

    // Init custom dropdown UI (will read pre-selected option and show in trigger)
    initCustomDropdownEl(convDropdown, (value) => {
        unitBadge.textContent = value || 'Unit';
    });

    // Update left-side prefix label when purchase/base unit changes (live sync)
    const syncPrefix = () => {
        prefixLabel.textContent = `1 ${getBaseUnitShort()} =`;
    };
    purchaseUnitSelect.addEventListener('change', syncPrefix);

    // Recalculate conversion price when factor changes (force-override manual price)
    const factorInput = row.querySelector('.conversion-factor-input');
    factorInput.addEventListener('input', (e) => {
        const pUnitSelect = document.getElementById('purchaseUnit');
        const pSelectedOpt = pUnitSelect.options[pUnitSelect.selectedIndex];
        const allowDecimal = pSelectedOpt && pSelectedOpt.getAttribute('data-decimal') === 'true';
        
        if (allowDecimal) {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
            const parts = e.target.value.split('.');
            if (parts.length > 2) {
                e.target.value = parts[0] + '.' + parts.slice(1).join('');
            }
        } else {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        }
        calculateConversionPrice(row, true);
    });

    // Delete row handler
    const deleteBtn = row.querySelector('.delete-conv-row-btn');
    deleteBtn.addEventListener('click', () => {
        purchaseUnitSelect.removeEventListener('change', syncPrefix);
        row.remove();
        toggleConversionsVisibility();
    });

    gridBody.appendChild(row);
    if (window.lucide) {
        lucide.createIcons();
    }
}

