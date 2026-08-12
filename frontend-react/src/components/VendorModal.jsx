import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronLeft, ChevronDown, X } from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function VendorModal({ onClose, onSelect, defaultSelectedId }) {
    const [vendors, setVendors] = useState([]);
    const [searchVal, setSearchVal] = useState('');
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Form states
    const [vendorName, setVendorName] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [billAddress, setBillAddress] = useState('');
    const [billCountry, setBillCountry] = useState('India');
    const [billState, setBillState] = useState('Tamil Nadu');
    const [billCity, setBillCity] = useState('');
    const [billPinCode, setBillPinCode] = useState('');
    const [gstin, setGstin] = useState('');
    const [panNumber, setPanNumber] = useState('');

    useEffect(() => {
        fetch('/api/vendors')
            .then(res => res.json())
            .then(data => {
                let list = data;
                if (!list.find(v => v.vendorName === 'Walk In Vendor')) {
                    list = [{ id: 'general', vendorName: 'Walk In Vendor', contactNumber: '9944093468' }, ...list];
                }
                setVendors(list);
                
                if (defaultSelectedId) {
                    const found = list.find(v => v.id === defaultSelectedId);
                    if (found) selectVendorForView(found);
                } else {
                    selectVendorForView(list[0]);
                }
            })
            .catch(() => {
                const mock = [
                    { id: 'general', vendorName: 'Walk In Vendor', contactNumber: '9944093468' },
                ];
                setVendors(mock);
                if (defaultSelectedId) {
                    const found = mock.find(v => v.id === defaultSelectedId);
                    if (found) selectVendorForView(found);
                } else {
                    selectVendorForView(mock[0]);
                }
            });
    }, [defaultSelectedId]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const selectVendorForView = (vend) => {
        setSelectedVendor(vend);
        setIsCreatingNew(false);
        setVendorName(vend.vendorName || '');
        setContactNumber(vend.contactNumber || '');
        setBillAddress(vend.billAddress || '');
        setBillCountry(vend.billCountry || 'India');
        setBillState(vend.billState || 'Tamil Nadu');
        setBillCity(vend.billCity || '');
        setBillPinCode(vend.billPinCode || '');
        setGstin(vend.gstin || '');
        setPanNumber(vend.panNumber || '');
    };

    const startNewVendor = () => {
        setIsCreatingNew(true);
        setSelectedVendor(null);
        setVendorName('');
        setContactNumber('');
        setBillAddress('');
        setBillCountry('India');
        setBillState('Tamil Nadu');
        setBillCity('');
        setBillPinCode('');
        setGstin('');
        setPanNumber('');
    };

    const filtered = vendors.filter(v => 
        (v.vendorName && v.vendorName.toLowerCase().includes(searchVal.toLowerCase())) || 
        (v.contactNumber && v.contactNumber.includes(searchVal))
    );

    const handleSave = async () => {
        if (!vendorName || !contactNumber) {
            alert('Vendor Name and Mobile are required');
            return;
        }
        
        let targetVend;
        if (isCreatingNew) {
            targetVend = { 
                id: Date.now().toString(), 
                vendorName, 
                displayName: vendorName,
                contactNumber, 
                billAddress, 
                billCountry, 
                billState, 
                billCity, 
                billPinCode, 
                gstin, 
                panNumber 
            };
        } else {
            targetVend = { ...selectedVendor, vendorName, displayName: vendorName, contactNumber, billAddress, billCountry, billState, billCity, billPinCode, gstin, panNumber };
        }

        if (targetVend.id === 'general') {
            // Remap for CreatePurchaseReturn expectation: id, name, mobile, address, gstin
            onSelect({
                id: targetVend.id,
                name: targetVend.vendorName,
                mobile: targetVend.contactNumber,
                address: targetVend.billAddress,
                gstin: targetVend.gstin
            });
            return;
        }

        try {
            const res = await fetch('/api/vendors');
            let list = [];
            if (res.ok) list = await res.json();
            
            list = list.filter(v => v.id !== targetVend.id);
            list.push(targetVend);
            
            await fetch('/api/vendors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(list)
            });
            
            onSelect({
                id: targetVend.id,
                name: targetVend.vendorName,
                mobile: targetVend.contactNumber,
                address: targetVend.billAddress,
                gstin: targetVend.gstin
            });
        } catch (e) {
            console.error(e);
            alert('Error saving vendor');
        }
    };

    return (
        <div className="modal-overlay" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, justifyContent: 'center', alignItems: 'flex-end' }}>
            <div style={{ background: '#F8FAFC', width: '100%', height: 'calc(100% - 60px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -10px 25px rgba(0,0,0,0.1)' }}>
                
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '16px', gap: '24px' }}>
                    
                    {/* Left Pane: Vendor List */}
                    <div style={{ width: '320px', display: 'flex', flexDirection: 'column', background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ background: '#F3F4F6', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>Select Vendor</span>
                            <button onClick={startNewVendor} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#4F46E5' }}>
                                <Plus style={{ width: '16px', height: '16px' }} /> New
                            </button>
                        </div>
                        
                        <div style={{ height: '50px', alignItems: 'center', padding: '0px 16px 0 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                            <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '30px', flex: 1, overflow: 'hidden', alignItems: 'center', padding: '0 8px' }}>
                                <Search size={16} color="var(--text-muted)" style={{ marginRight: '6px' }} />
                                <input 
                                    type="text" 
                                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', height: '25px', backgroundColor: 'transparent' }} 
                                    placeholder="Search Vendor name/Mobile No." 
                                    value={searchVal} 
                                    onChange={e => setSearchVal(e.target.value)} 
                                />
                            </div>
                            {searchVal && (
                                <button onClick={() => setSearchVal('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
                                    <X size={18} color="var(--text-muted)" />
                                </button>
                            )}
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            {filtered.map(vend => {
                                const isSelected = selectedVendor && selectedVendor.id === vend.id;
                                return (
                                    <div 
                                        key={vend.id} 
                                        onClick={() => selectVendorForView(vend)} 
                                        style={{ 
                                            padding: '12px 16px', 
                                            borderBottom: '1px solid #F1F5F9', 
                                            cursor: 'pointer', 
                                            background: isSelected ? '#EEF2FF' : 'transparent', 
                                            borderLeft: isSelected ? '4px solid #000B58' : '4px solid transparent',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ fontWeight: '600', fontSize: '13px', color: isSelected ? '#000B58' : '#1E293B', marginBottom: '2px' }}>{vend.vendorName}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{vend.contactNumber}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Pane: Form Details */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
                        
                        {/* Vendor Details Card */}
                        <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ background: '#F3F4F6', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>Vendor Details</span>
                            </div>
                            <div style={{ padding: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Vendor Name <span style={{color: '#EF4444'}}>*</span></label>
                                        <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Mobile Number <span style={{color: '#EF4444'}}>*</span></label>
                                        <input type="text" value={contactNumber} onChange={e => setContactNumber(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Billing Address</label>
                                    <input type="text" value={billAddress} onChange={e => setBillAddress(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Country</label>
                                        <div style={{ position: 'relative', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white' }}>
                                            <select value={billCountry} onChange={e => setBillCountry(e.target.value)} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 12px', fontFamily: 'inherit', fontSize: '13px', appearance: 'none', cursor: 'pointer', zIndex: 1, position: 'relative' }}>
                                                <option value="India">India</option>
                                            </select>
                                            <ChevronDown size={16} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 0, pointerEvents: 'none' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>State</label>
                                        <div style={{ position: 'relative', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white' }}>
                                            <select value={billState} onChange={e => setBillState(e.target.value)} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 12px', fontFamily: 'inherit', fontSize: '13px', appearance: 'none', cursor: 'pointer', zIndex: 1, position: 'relative' }}>
                                                <option value="Tamil Nadu">Tamil Nadu</option>
                                                <option value="Kerala">Kerala</option>
                                                <option value="Karnataka">Karnataka</option>
                                            </select>
                                            <ChevronDown size={16} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 0, pointerEvents: 'none' }} />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>City</label>
                                        <input type="text" value={billCity} onChange={e => setBillCity(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Pin Code</label>
                                        <input type="text" value={billPinCode} onChange={e => setBillPinCode(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* GST & PAN Details Card */}
                        <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px', flexShrink: 0 }}>
                            <div style={{ background: '#F3F4F6', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>GST & PAN Details</span>
                            </div>
                            
                            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>GSTIN No</label>
                                    <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px', textTransform: 'uppercase' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>PAN Number</label>
                                    <input type="text" value={panNumber} onChange={e => setPanNumber(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px', textTransform: 'uppercase' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ height: '50px', padding: '0 16px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <button 
                        onClick={onClose} 
                        style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid #4F46E5', borderRadius: '8px', padding: '0 20px', fontFamily: 'inherit', fontSize: '14px', fontWeight: '600', color: '#4F46E5', cursor: 'pointer', boxSizing: 'border-box' }}
                    >
                        <ChevronLeft style={{ width: '18px', height: '18px' }} /> Back
                    </button>
                    <button 
                        onClick={handleSave} 
                        style={{ height: '36px', background: '#000B58', border: 'none', borderRadius: '8px', padding: '0 32px', fontFamily: 'inherit', fontSize: '14px', fontWeight: '600', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
                    >
                        Save
                    </button>
                </div>

            </div>
        </div>
    );
}
