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
                <div className="vendor-table-container" style={{ margin: '0 16px 16px 16px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', overflowY: 'auto', flex: 1 }}>
                    <table className="vendor-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ height: '40px' }}>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '80px' }}>S. No.</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Category Name</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '80px' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCategories.map((c, idx) => {
                                const realIndex = categories.findIndex(orig => orig === c);
                                return (
                                    <tr key={idx} style={{ height: '40px', backgroundColor: 'white' }}>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', textAlign: 'center' }}>{idx + 1}</td>
                                        <td style={{ padding: '0 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                                            <input 
                                                type="text" 
                                                value={c.name}
                                                onChange={(e) => updateCategory(realIndex, e.target.value)}
                                                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', backgroundColor: 'transparent' }}
                                            />
                                        </td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px', textAlign: 'center' }}>
                                            <button 
                                                style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                onClick={() => { setDeleteIndex(realIndex); setShowDeleteModal(true); }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {/* Add Row */}
                            <tr style={{ height: '40px', backgroundColor: 'white' }}>
                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', textAlign: 'center' }}>{categories.length + 1}</td>
                                <td style={{ padding: '0 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Category Name" 
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', backgroundColor: 'transparent' }}
                                    />
                                </td>
                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px', textAlign: 'center' }}>
                                    <button 
                                        style={{ background: '#000B58', color: 'white', border: 'none', borderRadius: '4px', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        onClick={handleAdd}
                                    >
                                        <Plus size={16} />
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
