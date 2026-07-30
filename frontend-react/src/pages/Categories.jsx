import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, X, ChevronDown, Plus, Trash2 } from 'lucide-react';

const Categories = () => {
    const [categories, setCategories] = useState([]);
    const [searchVal, setSearchVal] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteIndex, setDeleteIndex] = useState(-1);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        fetch('http://localhost:3000/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data || []))
            .catch(err => console.error(err));
    }, []);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleAdd = () => {
        if (!newCategoryName.trim()) {
            showToast('Please enter a Category Name', 'error');
            return;
        }
        setCategories([...categories, { name: newCategoryName.trim() }]);
        setNewCategoryName('');
    };

    const handleSave = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(categories)
            });
            const result = await res.json();
            if (result.success) {
                showToast('Saved successfully', 'success');
            } else {
                showToast('Failed to save categories', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to save categories', 'error');
        }
    };

    const updateCategory = (index, newName) => {
        const updated = [...categories];
        updated[index].name = newName;
        setCategories(updated);
    };

    const confirmDelete = async () => {
        if (deleteIndex > -1) {
            const updated = [...categories];
            updated.splice(deleteIndex, 1);
            setCategories(updated);
            
            // Persist immediately on delete
            try {
                await fetch('http://localhost:3000/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updated)
                });
                showToast('Deleted successfully', 'success');
            } catch (e) {
                console.error(e);
            }
            setShowDeleteModal(false);
            setDeleteIndex(-1);
        }
    };

    const filteredCategories = categories.filter(c => !searchVal || c.name.toLowerCase().includes(searchVal.toLowerCase()));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Tabs */}
            <div className="page-tabs" style={{ padding: '0 24px 0 0', borderBottom: '1px solid var(--border-color)', backgroundColor: '#F8F9FA' }}>
                <NavLink to="/items" className="tab">Item List</NavLink>
                <NavLink to="/categories" className="tab active">Category</NavLink>
                <NavLink to="/units" className="tab">Unit</NavLink>
            </div>

            <div className="summary-card" style={{ margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0, flex: 1, minHeight: 0 }}>
                {/* Page Header */}
                <div className="page-header" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
                    <div className="page-title-group">
                        <h1 className="page-title">Category List</h1>
                        <div className="search-box">
                            <input 
                                type="text" 
                                placeholder="Search" 
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                            />
                            <Search className="search-icon" size={16} />
                        </div>
                        <button 
                            className="btn btn-outline" 
                            style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '35px' }}
                            onClick={() => setSearchVal('')}
                            title="Clear Filter"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="header-actions">
                        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Export <ChevronDown size={16} />
                        </button>
                    </div>
                </div>

                {/* Table Area */}
                <div className="units-content-wrapper" style={{ flex: 1, overflowY: 'auto' }}>
                    <div className="units-table" style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px' }}>
                        <div className="units-header-row unified-row" style={{ display: 'flex', backgroundColor: '#F8FAFC', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', height: '40px', fontWeight: '600' }}>
                            <div className="col-sno-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>S. No.</div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-name-inner" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px' }}>Category</div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-action-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Action</div>
                        </div>
                        
                        <div className="units-body">
                            {filteredCategories.map((c, idx) => {
                                // Find real index in original array
                                const realIndex = categories.findIndex(orig => orig === c);
                                return (
                                    <div key={idx} className="unit-row unified-row" style={{ display: 'flex', minHeight: '40px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                                        <div className="col-sno-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</div>
                                        <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                                        <div className="col-name-inner" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                            <input 
                                                type="text" 
                                                value={c.name}
                                                onChange={(e) => updateCategory(realIndex, e.target.value)}
                                                className="inner-input name-field"
                                                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit' }}
                                            />
                                        </div>
                                        <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                                        <div className="col-action-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <button 
                                                className="btn-icon-danger delete-btn" 
                                                style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                onClick={() => { setDeleteIndex(realIndex); setShowDeleteModal(true); }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add Row */}
                        <div className="unit-row unified-row" style={{ display: 'flex', minHeight: '40px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                            <div className="col-sno-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{categories.length + 1}</div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-name-inner" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                <input 
                                    type="text" 
                                    placeholder="Category Name" 
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    className="inner-input"
                                    style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-action-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <button 
                                    className="btn-icon-primary" 
                                    style={{ background: '#000B58', color: 'white', border: 'none', borderRadius: '4px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    onClick={handleAdd}
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Modal */}
            {showDeleteModal && (
                <div className="modal show" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '320px', textAlign: 'center' }}>
                        <h3 className="modal-title" style={{ marginTop: 0, marginBottom: '12px', fontSize: '18px' }}>Delete Category</h3>
                        <p className="modal-message" style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Do you want to delete this item?</p>
                        <div className="modal-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)} style={{ flex: 1 }}>Cancel</button>
                            <button className="btn btn-primary" onClick={confirmDelete} style={{ background: '#EF4444', borderColor: '#EF4444', flex: 1 }}>Yes, Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sticky Bottom Bar */}
            <div className="sticky-action-bar" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-primary" onClick={handleSave} style={{ backgroundColor: '#000B58', color: 'white', padding: '8px 32px' }}>Save</button>
            </div>

            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999 }}>
                    <div className={`toast toast-${toast.type} show`} style={{ background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Categories;
