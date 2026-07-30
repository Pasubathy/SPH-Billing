import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronLeft, ChevronDown, X } from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function CustomerModal({ onClose, onSelect, defaultSelectedId }) {
    const [customers, setCustomers] = useState([]);
    const [searchVal, setSearchVal] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Form states
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [address, setAddress] = useState('');
    const [country, setCountry] = useState('India');
    const [state, setState] = useState('Tamil Nadu');
    const [city, setCity] = useState('');
    const [pin, setPin] = useState('');
    const [showInInvoice, setShowInInvoice] = useState(false);
    const [gstin, setGstin] = useState('');
    const [pan, setPan] = useState('');

    useEffect(() => {
        // Fetch or use mock customers
        fetch('http://localhost:3000/api/customers')
            .then(res => res.json())
            .then(data => {
                let list = data;
                // Ensure Walk In Customer exists
                if (!list.find(c => c.name === 'Walk In Customer')) {
                    list = [{ id: 'walk-in', name: 'Walk In Customer', mobile: '9944093468' }, ...list];
                }
                setCustomers(list);
                
                if (defaultSelectedId) {
                    const found = list.find(c => c.id === defaultSelectedId);
                    if (found) selectCustomerForView(found);
                } else {
                    selectCustomerForView(list[0]);
                }
            })
            .catch(() => {
                // Fallback mock data
                const mock = [
                    { id: 'walk-in', name: 'Walk In Customer', mobile: '9944093468' },
                    { id: '1', name: 'Ashok Kumar', mobile: '8545896877', address: '1st Cross Street, Anna Salai', country: 'India', state: 'Tamil Nadu', city: 'Chennai', pin: '600028' }
                ];
                setCustomers(mock);
                if (defaultSelectedId) {
                    const found = mock.find(c => c.id === defaultSelectedId);
                    if (found) selectCustomerForView(found);
                } else {
                    selectCustomerForView(mock[0]);
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

    const selectCustomerForView = (cust) => {
        setSelectedCustomer(cust);
        setIsCreatingNew(false);
        setName(cust.name || '');
        setMobile(cust.mobile || '');
        setAddress(cust.address || '');
        setCountry(cust.country || 'India');
        setState(cust.state || 'Tamil Nadu');
        setCity(cust.city || '');
        setPin(cust.pin || '');
        setGstin(cust.gstin || '');
        setPan(cust.pan || '');
        setShowInInvoice(!!cust.showInInvoice);
    };

    const startNewCustomer = () => {
        setIsCreatingNew(true);
        setSelectedCustomer(null);
        setName('');
        setMobile('');
        setAddress('');
        setCountry('India');
        setState('Tamil Nadu');
        setCity('');
        setPin('');
        setGstin('');
        setPan('');
        setShowInInvoice(false);
    };

    const filtered = customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(searchVal.toLowerCase())) || 
        (c.mobile && c.mobile.includes(searchVal))
    );

    const handleSave = async () => {
        if (!name || !mobile) {
            alert('Name and Mobile are required');
            return;
        }
        
        let targetCust;
        if (isCreatingNew) {
            targetCust = { id: Date.now().toString(), name, mobile, address, country, state, city, pin, gstin, pan, showInInvoice };
        } else {
            targetCust = { ...selectedCustomer, name, mobile, address, country, state, city, pin, gstin, pan, showInInvoice };
        }

        try {
            const res = await fetch('http://localhost:3000/api/customers');
            let list = [];
            if (res.ok) list = await res.json();
            
            list = list.filter(c => c.id !== targetCust.id && c.name !== targetCust.name);
            list.push(targetCust);
            
            await fetch('http://localhost:3000/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(list)
            });
            
            onSelect(targetCust);
        } catch (e) {
            console.error(e);
            alert('Error saving customer');
        }
    };

    return (
        <div className="modal-overlay" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, justifyContent: 'center', alignItems: 'flex-end' }}>
            <div style={{ background: '#F8FAFC', width: '100%', height: 'calc(100% - 60px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -10px 25px rgba(0,0,0,0.1)' }}>
                
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '24px', gap: '24px' }}>
                    
                    {/* Left Pane: Customer List */}
                    <div style={{ width: '320px', display: 'flex', flexDirection: 'column', background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ background: '#F3F4F6', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>Select Customer</span>
                            <button onClick={startNewCustomer} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#4F46E5' }}>
                                <Plus style={{ width: '16px', height: '16px' }} /> New
                            </button>
                        </div>
                        
                        <div style={{ height: '50px', alignItems: 'center', padding: '0px 16px 0 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                            <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '30px', flex: 1, overflow: 'hidden', alignItems: 'center', padding: '0 8px' }}>
                                <Search size={16} color="var(--text-muted)" style={{ marginRight: '6px' }} />
                                <input 
                                    type="text" 
                                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', height: '25px', backgroundColor: 'transparent' }} 
                                    placeholder="Search Customer name/Mobile No." 
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
                            {filtered.map(cust => {
                                const isSelected = selectedCustomer && selectedCustomer.id === cust.id;
                                return (
                                    <div 
                                        key={cust.id} 
                                        onClick={() => selectCustomerForView(cust)} 
                                        style={{ 
                                            padding: '12px 16px', 
                                            borderBottom: '1px solid #F1F5F9', 
                                            cursor: 'pointer', 
                                            background: isSelected ? '#EEF2FF' : 'transparent', 
                                            borderLeft: isSelected ? '4px solid #000B58' : '4px solid transparent',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ fontWeight: '600', fontSize: '13px', color: isSelected ? '#000B58' : '#1E293B', marginBottom: '2px' }}>{cust.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cust.mobile}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Pane: Form Details */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
                        
                        {/* Customer Details Card */}
                        <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ background: '#F3F4F6', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>Customer Details</span>
                            </div>
                            <div style={{ padding: '24px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Customer Name <span style={{color: '#EF4444'}}>*</span></label>
                                        <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Mobile Number <span style={{color: '#EF4444'}}>*</span></label>
                                        <input type="text" value={mobile} onChange={e => setMobile(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Address</label>
                                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Country</label>
                                        <div style={{ position: 'relative', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white' }}>
                                            <select value={country} onChange={e => setCountry(e.target.value)} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 12px', fontFamily: 'inherit', fontSize: '13px', appearance: 'none', cursor: 'pointer', zIndex: 1, position: 'relative' }}>
                                                <option value="India">India</option>
                                            </select>
                                            <ChevronDown size={16} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 0, pointerEvents: 'none' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>State</label>
                                        <div style={{ position: 'relative', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white' }}>
                                            <select value={state} onChange={e => setState(e.target.value)} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 12px', fontFamily: 'inherit', fontSize: '13px', appearance: 'none', cursor: 'pointer', zIndex: 1, position: 'relative' }}>
                                                <option value="Tamil Nadu">Tamil Nadu</option>
                                            </select>
                                            <ChevronDown size={16} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 0, pointerEvents: 'none' }} />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>City</label>
                                        <input type="text" value={city} onChange={e => setCity(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>Pin Code</label>
                                        <input type="text" value={pin} onChange={e => setPin(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* GST & PAN Details Card */}
                        <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px', flexShrink: 0 }}>
                            <div style={{ background: '#F3F4F6', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>GST & PAN Details</span>
                                
                                {/* Toggle Switch */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-main)' }}>Show in Invoice Print</span>
                                    <div 
                                        onClick={() => setShowInInvoice(!showInInvoice)}
                                        style={{ 
                                            width: '44px', height: '24px', 
                                            background: showInInvoice ? '#4F46E5' : '#D1D5DB', 
                                            borderRadius: '12px', 
                                            position: 'relative', 
                                            cursor: 'pointer',
                                            transition: 'background 0.3s'
                                        }}
                                    >
                                        <div style={{ 
                                            width: '20px', height: '20px', 
                                            background: 'white', 
                                            borderRadius: '50%', 
                                            position: 'absolute', 
                                            top: '2px', 
                                            left: showInInvoice ? '22px' : '2px', 
                                            transition: 'left 0.3s',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                        }}></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>GSTIN No</label>
                                    <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginBottom: '8px' }}>PAN Number</label>
                                    <input type="text" value={pan} onChange={e => setPan(e.target.value)} style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', fontSize: '13px' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ height: '50px', padding: '0 24px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
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
