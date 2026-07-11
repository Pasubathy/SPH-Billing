// Initialize Lucide icons
lucide.createIcons();

document.addEventListener('DOMContentLoaded', () => {
    setupProfileMenu();

    const togglePasswordBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const loginForm = document.getElementById('loginForm');

    // Toggle Password Visibility
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Toggle the icon
        const icon = togglePasswordBtn.querySelector('i');
        if (type === 'text') {
            icon.setAttribute('data-lucide', 'eye');
        } else {
            icon.setAttribute('data-lucide', 'eye-off');
        }
        
        // Re-initialize this specific icon
        lucide.createIcons({
            icons: {
                Eye: lucide.icons.Eye,
                EyeOff: lucide.icons.EyeOff
            },
            nameAttr: 'data-lucide',
            attrs: {
                class: 'eye-icon'
            }
        });
        
        togglePasswordBtn.innerHTML = type === 'text' ? '<i data-lucide="eye" class="eye-icon"></i>' : '<i data-lucide="eye-off" class="eye-icon"></i>';
        lucide.createIcons();
        });
    }

    // Handle form submission
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        console.log('Login attempt:', { username, password });
        
        // Add loading state to button
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalContent = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i data-lucide="loader-2" class="btn-icon" style="animation: spin 1s linear infinite;"></i> Logging in...';
        lucide.createIcons();
        submitBtn.disabled = true;
        
        // Simulate network request
        setTimeout(() => {
            // Restore button
            submitBtn.innerHTML = originalContent;
            lucide.createIcons();
            submitBtn.disabled = false;
            
            if (username === 'SPH.admin' && password === 'SPH@26') {
                window.location.href = 'items.html';
            } else {
                showToast('Invalid username or password', 'error');
            }
        }, 1500);
        });
    }
});

// Profile Menu Setup
function setupProfileMenu() {
    const profileContainer = document.querySelector('.user-profile');
    if (!profileContainer) return;

    // Update the profile to look like "SPH Admin"
    const nameSpan = profileContainer.querySelector('.user-name');
    if (nameSpan && nameSpan.textContent.trim() === 'SPH') {
        nameSpan.textContent = 'SPH Admin';
    }
    
    // Add custom avatar styling
    const avatar = profileContainer.querySelector('.user-avatar');
    if (avatar) {
        avatar.style.backgroundColor = '#FFD54F';
        avatar.style.color = '#000B58';
        avatar.style.fontWeight = '700';
        avatar.style.fontSize = '11px';
        avatar.innerHTML = 'SPH';
    }

    // Redirect to settings page on click
    profileContainer.style.cursor = 'pointer';
    profileContainer.addEventListener('click', () => {
        window.location.href = 'settings.html';
    });
}

// Toast Notification System
function showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '9999';
        toastContainer.style.display = 'flex';
        toastContainer.style.flexDirection = 'column';
        toastContainer.style.gap = '10px';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.background = type === 'success' ? '#22C55E' : (type === 'error' ? '#EF4444' : '#3B82F6');
    toast.style.color = 'white';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.fontFamily = 'Outfit, sans-serif';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', type === 'success' ? 'check-circle' : 'alert-circle');
    icon.style.width = '18px';
    icon.style.height = '18px';

    const text = document.createElement('span');
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    toastContainer.appendChild(toast);

    if (window.lucide) {
        lucide.createIcons();
    }

    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    }, 10);

    // Remove after 3s
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Global Tag Print Modal function
window.openPrintTagModal = function(data) {
    // Show prompt for number of copies
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '10000';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';

    const popup = document.createElement('div');
    popup.style.background = 'white';
    popup.style.padding = '16px';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    popup.style.width = '240px'; // Minimized size
    popup.style.fontFamily = "'Outfit', sans-serif";

    popup.innerHTML = `
        <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #000B58;">Print Tag</h3>
        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px;">Number of copies</label>
        <input type="number" id="tagCopiesInput" value="1" min="1" style="width: 100%; height: 32px; padding: 0 8px; border: 1px solid #E2E8F0; border-radius: 6px; box-sizing: border-box; font-family: inherit; margin-bottom: 16px; outline: none; font-size: 13px;">
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button id="cancelTagBtn" style="padding: 6px 12px; border: 1px solid #000B58; border-radius: 6px; background: white; color: #000B58; cursor: pointer; font-family: inherit; font-weight: 500; font-size: 12px;">Cancel</button>
            <button id="confirmTagBtn" style="padding: 6px 12px; border: none; border-radius: 6px; background: #000B58; color: white; cursor: pointer; font-family: inherit; font-weight: 500; font-size: 12px;">Print</button>
        </div>
    `;
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    const copiesInput = popup.querySelector('#tagCopiesInput');
    copiesInput.focus();

    popup.querySelector('#cancelTagBtn').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    popup.querySelector('#confirmTagBtn').addEventListener('click', () => {
        const copies = parseInt(copiesInput.value) || 1;
        document.body.removeChild(overlay);
        executePrint(copies);
    });

    function executePrint(copies) {
        let tsData = {};
        try {
            const saved = localStorage.getItem('tagSettings');
            if (saved) tsData = JSON.parse(saved);
        } catch(e) {}

        const width = tsData.tsWidth || 50;
        const height = tsData.tsHeight || 25;
        const mt = tsData.tsMarginTop || 0;
        const mb = tsData.tsMarginBottom || 0;
        const ml = tsData.tsMarginLeft || 0;
        const mr = tsData.tsMarginRight || 0;

        const showCode = tsData.tsOptCode !== false;
        const showName = tsData.tsOptName !== false;
        const showPrice = tsData.tsOptPrice !== false;
        const showQR = tsData.tsOptQR !== false;

        const sizeCode = tsData.tsSizeCode || 12;
        const sizeName = tsData.tsSizeName || 14;
        const sizePrice = tsData.tsSizePrice || 16;
        const sizeQR = tsData.tsSizeQR || 35;
        
        const alignText = (tsData.tsAlign || 'left').toLowerCase();
        const jContent = alignText === 'center' ? 'center' : (alignText === 'left' ? 'flex-start' : 'flex-end');
        const qrImgWidthMm = width * (sizeQR / 100);

        let tagsHtml = '';
        for (let i = 0; i < copies; i++) {
            tagsHtml += `
            <div class="tag">
                <div class="tag-content">
                    <div class="tag-inner-group" style="justify-content: ${jContent};">
                        <div class="qr-col" style="display: ${showQR ? 'flex' : 'none'}; width: ${showQR ? qrImgWidthMm + 'mm' : '0mm'}; height: ${showQR ? qrImgWidthMm + 'mm' : '0mm'};">
                            ${data.qrDataUrl ? `<img src="${data.qrDataUrl}" alt="QR">` : ''}
                        </div>
                        <div class="text-col" style="width: auto; align-items: ${alignText === 'center' ? 'center' : (alignText === 'left' ? 'flex-start' : 'flex-end')}; text-align: ${alignText};">
                            ${showCode ? `<div class="code">${data.code || ''}</div>` : ''}
                            ${showName ? `<div class="name">${data.name || 'Unknown Item'}</div>` : ''}
                            ${showPrice ? `<div class="price">${data.displayPrice || ''}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        }

        const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Print Item Tag</title>
<style>
@media print { 
    @page { 
        margin: 0; 
        size: ${width}mm ${height}mm;
    } 
    body { margin: 0; padding: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .tag { margin: 0 !important; page-break-after: always; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
body { 
    font-family: 'Inter', sans-serif; 
    margin: 0;
    padding: 0;
    background: #fff;
}
.tag { 
    width: ${width}mm; 
    height: ${height}mm; 
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: white;
    margin: 0 auto;
    overflow: hidden;
}
.tag-content {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding-top: ${mt}mm;
    padding-bottom: ${mb}mm;
    padding-left: ${ml}mm;
    padding-right: ${mr}mm;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: ${jContent};
}
.tag-inner-group {
    display: flex;
    gap: 10px;
    max-width: 100%;
    align-items: center;
}
.qr-col { 
    display: flex; 
    align-items: center; 
    justify-content: center;
    flex-shrink: 0;
}
.qr-col img { 
    width: 100%; 
    height: 100%; 
    object-fit: contain; 
}
.text-col { 
    display: flex; 
    flex-direction: column; 
    justify-content: center; 
    gap: 2px; 
    flex: 0 1 auto;
    min-width: 0;
}
.name, .code, .price { 
    line-height: 1.2; 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    color: #000; 
    font-weight: 600; 
}
.name { font-size: ${sizeName}px; }
.code { font-size: ${sizeCode}px; }
.price { font-size: ${sizePrice}px; }
</style>
</head>
<body>
    ${tagsHtml}
    <script>
        window.onload = function() { 
            setTimeout(function() { 
                window.print(); 
                setTimeout(function() { window.close(); }, 500);
            }, 500); 
        }
    </script>
</body>
</html>`;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    }
};