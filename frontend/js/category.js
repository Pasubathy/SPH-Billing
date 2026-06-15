let categories = [];
let deleteIndex = -1;

// Load categories from API
async function loadCategories() {
    try {
        const res = await fetch('/api/categories');
        categories = await res.json();
    } catch (err) {
        console.error('Error loading categories:', err);
        categories = [];
    }
    renderCategories();
}

// Save categories to API
async function saveCategories(silent = false) {
    updateCategoriesFromDOM();
    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(categories)
        });
        const result = await res.json();
        if (result.success && !silent) {
            showToast('Saved successfully', 'success');
        }
    } catch (err) {
        console.error('Error saving categories:', err);
        if (!silent) {
            showToast('Failed to save categories', 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCategories();

    // Elements
    const searchInput = document.getElementById('categorySearch') || document.querySelector('.search-box input');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const saveBtn = document.getElementById('saveCategoriesBtn');
    const newCategoryName = document.getElementById('newCategoryName');
    const clearFilterBtn = document.getElementById('clearCategoryFilterBtn');
    
    // Modal Elements
    const modal = document.getElementById('deleteModal');
    const cancelDeleteBtn = document.getElementById('cancelDelete');
    const confirmDeleteBtn = document.getElementById('confirmDelete');

    // Add Category
    addCategoryBtn.addEventListener('click', () => {
        const name = newCategoryName.value.trim();
        
        if (name) {
            categories.push({ name });
            newCategoryName.value = '';
            renderCategories();
        } else {
            showToast('Please enter a Category Name', 'error');
        }
    });

    // Save Categories
    saveBtn.addEventListener('click', () => {
        saveCategories();
    });

    // Search Categories
    searchInput.addEventListener('input', (e) => {
        renderCategories(e.target.value.trim().toLowerCase());
    });

    // Clear / Cancel Filter
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', () => {
            searchInput.value = '';
            renderCategories();
        });
    }

    // Modal Actions
    cancelDeleteBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        deleteIndex = -1;
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        if (deleteIndex > -1) {
            updateCategoriesFromDOM(); // Capture any inline edits on other rows first
            categories.splice(deleteIndex, 1);
            await saveCategories(true); // Persist deletion to API
            renderCategories(searchInput.value.trim().toLowerCase());
            modal.classList.remove('show');
            showToast('Deleted successfully', 'success');
            deleteIndex = -1;
        }
    });
});

function updateCategoriesFromDOM() {
    const rows = document.querySelectorAll('#categoryList .unit-row');
    rows.forEach((row, index) => {
        const nameInput = row.querySelector('.name-field');
        const realIndex = parseInt(row.getAttribute('data-index'), 10);
        if (!isNaN(realIndex) && categories[realIndex]) {
            categories[realIndex].name = nameInput.value;
        }
    });
}

function renderCategories(filterText = '') {
    const listContainer = document.getElementById('categoryList');
    listContainer.innerHTML = '';

    let displayCount = 1;
    
    categories.forEach((category, index) => {
        if (filterText && !category.name.toLowerCase().includes(filterText)) {
            return; // Skip if it doesn't match filter
        }

        const row = document.createElement('div');
        row.className = 'unit-row unified-row';
        row.setAttribute('data-index', index);
        
        row.innerHTML = `
            <div class="col-sno-inner">${displayCount}</div>
            <div class="vertical-divider"></div>
            <div class="col-name-inner">
                <input type="text" value="${category.name}" class="inner-input name-field">
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
    const newSnoInput = document.getElementById('newCategorySno');
    if (newSnoInput) {
        newSnoInput.textContent = categories.length + 1;
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

