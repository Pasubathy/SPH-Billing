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
        fetch('/api/categories')
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
            const res = await fetch('/api/categories', {
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
                await fetch('/api/categories', {
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
            <style>
                {`
                    .category-table td {
                        padding: 0 !important;
                        height: 38px !important;
                    }
                    .category-table th {
                        padding: 8px 12px !important;
                    }
                    .category-table-input {
                        width: 100%;
                        height: 100%;
                        min-height: 36px;
                        border: 1px solid transparent;
                        border-radius: 4px;
                        padding: 0 4px;
                        font-size: 13px;
                        font-family: inherit;
                        background-color: transparent;
                        color: var(--text-main);
                        outline: none;
                        transition: all 0.12s ease;
                        box-sizing: border-box;
                    }
                    .category-table-input:hover {
                        background-color: #F8FAFC;
                        border-color: #CBD5E1;
                    }
                    .category-table-input:focus {
                        background-color: #FFFFFF;
                        border-color: #000B58 !important;
                        box-shadow: 0 0 0 2px rgba(0, 11, 88, 0.12);
                    }
                    .category-add-input {
                        width: 100%;
                        height: 100%;
                        min-height: 36px;
                        border: 1px solid transparent;
                        border-radius: 4px;
                        padding: 0 4px;
                        font-size: 13px;
                        font-family: inherit;
                        background-color: transparent;
                        color: var(--text-main);
                        outline: none;
                        transition: all 0.12s ease;
                        box-sizing: border-box;
                    }
                    .category-add-input::placeholder {
                        color: #94A3B8;
                    }
                    .category-add-input:hover {
                        background-color: #F8FAFC;
                        border-color: #CBD5E1;
                    }
                    .category-add-input:focus {
                        background-color: #FFFFFF;
                        border-color: #000B58 !important;
                        box-shadow: 0 0 0 2px rgba(0, 11, 88, 0.12);
                    }
                    .category-table-row {
                        height: 38px;
                        background-color: #FFFFFF;
                    }
                    .category-table-row:hover {
                        background-color: #F8FAFC;
                    }
                    .category-btn-action {
                        transition: all 0.12s ease;
                    }
                    .category-btn-action:hover {
                        transform: translateY(-1px);
                    }
                `}
            </style>

            {/* Tabs */}
            <div className="page-tabs" style={{ padding: '0 16px 0 0', borderBottom: '1px solid var(--border-color)', backgroundColor: '#F8F9FA' }}>
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
                <div className="vendor-table-container" style={{ margin: '0 0 16px 0', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', overflowY: 'auto', flex: 1 }}>
                    <table className="vendor-table category-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ height: '40px' }}>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Category Name</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '80px' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCategories.map((c, idx) => {
                                const realIndex = categories.findIndex(orig => orig === c);
                                return (
                                    <tr key={idx} className="category-table-row">
                                        <td style={{ padding: '1px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                        <td style={{ padding: '1px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
                                            <input 
                                                type="text" 
                                                className="category-table-input"
                                                value={c.name}
                                                placeholder="Enter category name"
                                                onChange={(e) => updateCategory(realIndex, e.target.value)}
                                            />
                                        </td>
                                        <td style={{ padding: '1px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px', textAlign: 'center' }}>
                                            <button 
                                                className="category-btn-action"
                                                style={{ background: '#FEE2E2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '4px', width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                onClick={() => { setDeleteIndex(realIndex); setShowDeleteModal(true); }}
                                                title="Delete category"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {/* Add Row */}
                            <tr style={{ height: '42px', backgroundColor: 'white' }}>
                                <td style={{ padding: '1px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', textAlign: 'center', color: '#6366F1', fontWeight: '600' }}>
                                    {categories.length + 1}
                                </td>
                                <td style={{ padding: '1px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
                                    <input 
                                        type="text" 
                                        className="category-add-input"
                                        placeholder="Enter New Category Name (e.g. Electricals)" 
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    />
                                </td>
                                <td style={{ padding: '1px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px', textAlign: 'center' }}>
                                    <button 
                                        className="category-btn-action"
                                        style={{ background: '#000B58', color: 'white', border: 'none', borderRadius: '4px', width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0, 11, 88, 0.15)' }}
                                        onClick={handleAdd}
                                        title="Add Category"
                                    >
                                        <Plus size={15} />
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Modal */}
            {showDeleteModal && (
                <div className="modal show" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" style={{ background: 'white', padding: '16px', borderRadius: '12px', width: '320px', textAlign: 'center' }}>
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
            <div className="sticky-action-bar" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)' }}>
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
