let units = [];
let deleteIndex = -1;

// Load units from API
async function loadUnits() {
    try {
        const res = await fetch('/api/units');
        units = await res.json();
    } catch (err) {
        console.error('Error loading units:', err);
        units = [];
    }
    renderUnits();
}

// Save units to API
async function saveUnits(silent = false) {
    updateUnitsFromDOM();
    try {
        const res = await fetch('/api/units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(units)
        });
        const result = await res.json();
        if (result.success && !silent) {
            showToast('Saved successfully', 'success');
        }
    } catch (err) {
        console.error('Error saving units:', err);
        if (!silent) {
            showToast('Failed to save units: ' + err.message, 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadUnits();

    // Elements
    const searchInput = document.getElementById('unitSearch') || document.querySelector('.search-box input');
    const addUnitBtn = document.getElementById('addUnitBtn');
    const saveBtn = document.getElementById('saveUnitsBtn');
    const newUnitName = document.getElementById('newUnitName');
    const newUnitShortName = document.getElementById('newUnitShortName');
    const newUnitDecimal = document.getElementById('newUnitDecimal');
    const clearFilterBtn = document.getElementById('clearUnitFilterBtn');
    
    // Modal Elements
    const modal = document.getElementById('deleteModal');
    const cancelDeleteBtn = document.getElementById('cancelDelete');
    const confirmDeleteBtn = document.getElementById('confirmDelete');

    // Add Unit
    addUnitBtn.addEventListener('click', () => {
        const name = newUnitName.value.trim();
        const shortName = newUnitShortName.value.trim();
        const allowDecimal = newUnitDecimal ? newUnitDecimal.value : 'No';
        
        if (name && shortName) {
            units.push({ name, shortName, allowDecimal });
            newUnitName.value = '';
            newUnitShortName.value = '';
            if (newUnitDecimal) newUnitDecimal.value = 'No';
            renderUnits();
        } else {
            showToast('Please enter both Unit Name and Short Name', 'error');
        }
    });

    // Save Units
    saveBtn.addEventListener('click', () => {
        saveUnits();
    });

    // Search Units
    searchInput.addEventListener('input', (e) => {
        renderUnits(e.target.value.trim().toLowerCase());
    });

    // Clear / Cancel Filter
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', () => {
            searchInput.value = '';
            renderUnits();
        });
    }

    // Modal Actions
    cancelDeleteBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        deleteIndex = -1;
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        if (deleteIndex > -1) {
            updateUnitsFromDOM(); // Capture any inline edits on other rows first
            units.splice(deleteIndex, 1);
            await saveUnits(true); // Persist the deletion to API
            renderUnits(searchInput.value.trim().toLowerCase());
            modal.classList.remove('show');
            showToast('Deleted successfully', 'success');
            deleteIndex = -1;
        }
    });
});

function updateUnitsFromDOM() {
    const rows = document.querySelectorAll('#unitsList .unit-row');
    rows.forEach((row, index) => {
        const nameInput = row.querySelector('.name-field');
        const shortNameInput = row.querySelector('.shortname-field');
        const decimalSelect = row.querySelector('.decimal-field');
        const realIndex = parseInt(row.getAttribute('data-index'), 10);
        if (!isNaN(realIndex) && units[realIndex]) {
            units[realIndex].name = nameInput.value;
            units[realIndex].shortName = shortNameInput.value;
            if (decimalSelect) {
                units[realIndex].allowDecimal = decimalSelect.value;
            }
        }
    });
}

function renderUnits(filterText = '') {
    const listContainer = document.getElementById('unitsList');
    listContainer.innerHTML = '';

    let displayCount = 1;
    
    units.forEach((unit, index) => {
        if (filterText && !unit.name.toLowerCase().includes(filterText) && !unit.shortName.toLowerCase().includes(filterText)) {
            return; // Skip if it doesn't match filter
        }

        const row = document.createElement('div');
        row.className = 'unit-row unified-row';
        row.setAttribute('data-index', index);
        
        row.innerHTML = `
            <div class="col-sno-inner">${displayCount}</div>
            <div class="vertical-divider"></div>
            <div class="col-name-inner">
                <input type="text" value="${unit.name}" class="inner-input name-field">
            </div>
            <div class="vertical-divider"></div>
            <div class="col-shortname-inner">
                <input type="text" value="${unit.shortName}" class="inner-input shortname-field">
            </div>
            <div class="vertical-divider"></div>
            <div class="col-decimal-inner">
                <select class="inner-input decimal-field" style="cursor: pointer; text-align: center;">
                    <option value="Yes" ${unit.allowDecimal === 'Yes' ? 'selected' : ''}>Yes</option>
                    <option value="No" ${unit.allowDecimal !== 'Yes' ? 'selected' : ''}>No</option>
                </select>
            </div>
            <div class="vertical-divider"></div>
            <div class="col-action-inner">
                <button class="btn-icon-danger delete-btn" data-index="${index}"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        
        listContainer.appendChild(row);
        displayCount++;
    });

    // Update the S.No for the Add row
    const newSnoInput = document.getElementById('newUnitSno');
    if (newSnoInput) {
        newSnoInput.textContent = units.length + 1;
    }

    // Attach delete listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            deleteIndex = index;
            document.getElementById('deleteModal').classList.add('show');
        });
    });

    // Initialize icons for new elements
    if (window.lucide) {
        lucide.createIcons();
    }
}

