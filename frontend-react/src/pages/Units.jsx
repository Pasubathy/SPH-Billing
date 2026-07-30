import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, X, ChevronDown, Plus, Trash2 } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

const Units = () => {
    const [units, setUnits] = useState([]);
    const [searchVal, setSearchVal] = useState('');
    
    // New Unit state
    const [newName, setNewName] = useState('');
    const [newShortName, setNewShortName] = useState('');
    const [newAllowDecimal, setNewAllowDecimal] = useState('No');
    
    // Delete Modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteIndex, setDeleteIndex] = useState(-1);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        fetch('http://localhost:3000/api/units')
            .then(res => res.json())
            .then(data => {
                const mapped = data.map(u => ({
                    name: u.name,
                    shortName: u.unitPrefix || '',
                    allowDecimal: u.acceptDecimal ? 'Yes' : 'No'
                }));
                setUnits(mapped);
            })
            .catch(err => console.error(err));
    }, []);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleAdd = () => {
        if (!newName.trim() || !newShortName.trim()) {
            showToast('Please enter both Unit Name and Short Name', 'error');
            return;
        }
        setUnits([...units, { 
            name: newName.trim(), 
            shortName: newShortName.trim(), 
            allowDecimal: newAllowDecimal 
        }]);
        setNewName('');
        setNewShortName('');
        setNewAllowDecimal('No');
    };

    const handleSave = async () => {
        try {
            const payload = units.map(u => ({
                name: u.name,
                unitPrefix: u.shortName,
                acceptDecimal: u.allowDecimal === 'Yes'
            }));
            
            const res = await fetch('http://localhost:3000/api/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                showToast('Saved successfully', 'success');
            } else {
                showToast('Failed to save units', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to save units', 'error');
        }
    };

    const updateUnit = (index, field, value) => {
        const updated = [...units];
        updated[index][field] = value;
        setUnits(updated);
    };

    const confirmDelete = async () => {
        if (deleteIndex > -1) {
            const updated = [...units];
            updated.splice(deleteIndex, 1);
            setUnits(updated);
            
            // Persist immediately on delete
            try {
                const payload = updated.map(u => ({
                    name: u.name,
                    unitPrefix: u.shortName,
                    acceptDecimal: u.allowDecimal === 'Yes'
                }));
                await fetch('http://localhost:3000/api/units', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                showToast('Deleted successfully', 'success');
            } catch (e) {
                console.error(e);
            }
            setShowDeleteModal(false);
            setDeleteIndex(-1);
        }
    };

    const filteredUnits = units.filter(u => {
        if (!searchVal) return true;
        const s = searchVal.toLowerCase();
        return u.name.toLowerCase().includes(s) || u.shortName.toLowerCase().includes(s);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Tabs */}
            <div className="page-tabs" style={{ padding: '0 24px 0 0', borderBottom: '1px solid var(--border-color)', backgroundColor: '#F8F9FA' }}>
                <NavLink to="/items" className="tab">Item List</NavLink>
                <NavLink to="/categories" className="tab">Category</NavLink>
                <NavLink to="/units" className="tab active">Unit</NavLink>
            </div>

            <div className="summary-card" style={{ margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0, flex: 1, minHeight: 0 }}>
                {/* Page Header */}
                <div className="page-header" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
                    <div className="page-title-group">
                        <h1 className="page-title">Units List</h1>
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
                            <div className="col-name-inner" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px' }}>Unit Name</div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-shortname-inner" style={{ width: '200px', display: 'flex', alignItems: 'center', padding: '0 12px' }}>Short Name</div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-decimal-inner" style={{ width: '150px', display: 'flex', alignItems: 'center', padding: '0 12px' }}>Decimal</div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-action-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Action</div>
                        </div>
                        
                        <div className="units-body">
                            {filteredUnits.map((u, idx) => {
                                const realIndex = units.findIndex(orig => orig === u);
                                return (
                                    <div key={idx} className="unit-row unified-row" style={{ display: 'flex', minHeight: '40px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                                        <div className="col-sno-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</div>
                                        <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                                        <div className="col-name-inner" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                            <input 
                                                type="text" 
                                                value={u.name}
                                                onChange={(e) => updateUnit(realIndex, 'name', e.target.value)}
                                                className="inner-input"
                                                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit' }}
                                            />
                                        </div>
                                        <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                                        <div className="col-shortname-inner" style={{ width: '200px', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                            <input 
                                                type="text" 
                                                value={u.shortName}
                                                onChange={(e) => updateUnit(realIndex, 'shortName', e.target.value)}
                                                className="inner-input"
                                                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit' }}
                                            />
                                        </div>
                                        <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                                        <div className="col-decimal-inner" style={{ width: '150px', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                            <CustomSelect
                                                value={u.allowDecimal}
                                                onChange={(val) => updateUnit(realIndex, 'allowDecimal', val)}
                                                options={[
                                                    { value: 'Yes', label: 'Yes' },
                                                    { value: 'No', label: 'No' }
                                                ]}
                                                height="30px"
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
                            <div className="col-sno-inner" style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{units.length + 1}</div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-name-inner" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                <input 
                                    type="text" 
                                    placeholder="Unit Name" 
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="inner-input"
                                    style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-shortname-inner" style={{ width: '200px', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                <input 
                                    type="text" 
                                    placeholder="Short Name" 
                                    value={newShortName}
                                    onChange={(e) => setNewShortName(e.target.value)}
                                    className="inner-input"
                                    style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div className="vertical-divider" style={{ width: '1px', backgroundColor: 'var(--border-color)' }}></div>
                            <div className="col-decimal-inner" style={{ width: '150px', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                                    <CustomSelect
                                        value={newAllowDecimal}
                                        onChange={setNewAllowDecimal}
                                        options={[
                                            { value: 'Yes', label: 'Yes' },
                                            { value: 'No', label: 'No' }
                                        ]}
                                        height="30px"
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
                        <h3 className="modal-title" style={{ marginTop: 0, marginBottom: '12px', fontSize: '18px' }}>Delete Unit</h3>
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

export default Units;
