import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import CustomSelect from './CustomSelect';

export default function CreateAmountReceived({ onBack, customers, salesInvoices, editAR }) {
    const [arNo, setArNo] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [customerId, setCustomerId] = useState('');
    
    // Reference Type & Payment Mode
    const [referenceType, setReferenceType] = useState('AGAINST_REFERENCE'); // AGAINST_REFERENCE, ON_ACCOUNT, ADVANCE
    const [paymentMode, setPaymentMode] = useState('CASH'); // CASH, BANK, UPI, CARD
    const [referenceNo, setReferenceNo] = useState('');
    const [referenceDate, setReferenceDate] = useState('');
    const [note, setNote] = useState('');

    // Amount details
    const [receivedAmount, setReceivedAmount] = useState('');
    const [allocations, setAllocations] = useState({}); // { [invoiceId]: amountString }
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Initialize Receipt sequence number on load
    useEffect(() => {
        if (editAR) {
            setArNo(editAR.arNo);
            let d = editAR.date;
            if (d && d.includes('/')) {
                const parts = d.split('/');
                if (parts.length === 3) d = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            setDate(d || new Date().toISOString().split('T')[0]);
            
            if (customers && customers.length > 0) {
                const cust = customers.find(c => (c.name || c.customerName) === editAR.customerName);
                if (cust) setCustomerId(cust.id);
            }
            setReceivedAmount(editAR.amount || '');
        } else {
            const fetchCounter = async () => {
                try {
                    const res = await fetch('/api/payment-counter');
                    const data = await res.json();
                    setArNo('AR' + String(data.counter || 1).padStart(3, '0'));
                } catch (err) {
                    console.error('Error fetching AR counter:', err);
                    setArNo('AR001');
                }
            };
            fetchCounter();
        }
    }, [editAR, customers]);

    // Pending bills logic based on customer selection
    const pendingBills = useMemo(() => {
        if (!customerId) return [];
        const selectedCustomer = customers.find(c => c.id === customerId);
        if (!selectedCustomer) return [];

        const cName = (selectedCustomer.name || selectedCustomer.customerName || '').toLowerCase();
        
        let bills = salesInvoices.filter(si => {
            if ((si.customerName || '').toLowerCase() !== cName) return false;
            const amt = parseFloat(si.grandTotal || si.amount) || 0;
            const rec = parseFloat(si.receivedAmount || si.paid_amount) || 0;
            const pend = Math.max(0, amt - rec);
            return pend > 0;
        }).map(si => {
            const amt = parseFloat(si.grandTotal || si.amount) || 0;
            const rec = parseFloat(si.receivedAmount || si.paid_amount) || 0;
            const pend = Math.max(0, amt - rec);
            
            return {
                id: si.id || si.invoiceNumber,
                invoiceNumber: si.invoiceNumber || si.invoice_no,
                date: si.date,
                amount: amt,
                pending: pend,
                originalSale: si
            };
        });

        // Sort oldest first
        bills.sort((a, b) => new Date(a.date) - new Date(b.date));
        return bills;
    }, [customerId, customers, salesInvoices]);

    const totalPending = pendingBills.reduce((sum, b) => sum + b.pending, 0);

    const handleReceivedChange = (val) => {
        setReceivedAmount(val);
        setAllocations({});
    };

    const handleAllocationChange = (invoiceId, val, maxVal) => {
        const num = parseFloat(val) || 0;
        if (num > maxVal) {
            showToast(`Allocation cannot exceed pending amount of ${maxVal}`, 'warning');
            setAllocations(prev => ({ ...prev, [invoiceId]: String(maxVal) }));
            return;
        }
        setAllocations(prev => ({ ...prev, [invoiceId]: val }));
    };

    const handleAutoAllocate = () => {
        const amt = parseFloat(receivedAmount) || 0;
        if (amt <= 0) {
            showToast('Please enter received amount first', 'error');
            return;
        }

        let remaining = amt;
        const newAllocations = {};
        for (const bill of pendingBills) {
            if (remaining <= 0) break;
            const apply = Math.min(remaining, bill.pending);
            newAllocations[bill.id] = String(apply);
            remaining -= apply;
        }
        setAllocations(newAllocations);
        showToast('Oldest first allocation applied', 'success');
    };

    const sumAllocated = Object.entries(allocations).reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0);
    const advanceAmount = Math.max(0, (parseFloat(receivedAmount) || 0) - sumAllocated);

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const recAmt = parseFloat(receivedAmount) || 0;
            if (!customerId) {
                showToast('Please select a customer', 'error');
                return;
            }
            if (!date) {
                showToast('Please select a date', 'error');
                return;
            }
            if (recAmt <= 0) {
                showToast('Amount received must be greater than 0', 'error');
                return;
            }

            let backendAllocations = [];
            if (referenceType === 'AGAINST_REFERENCE') {
                backendAllocations = Object.entries(allocations)
                    .map(([invoiceId, val]) => ({
                        invoiceId,
                        allocatedAmount: parseFloat(val) || 0
                    }))
                    .filter(a => a.allocatedAmount > 0);

                if (backendAllocations.length === 0) {
                    showToast('Please allocate the payment to at least one invoice', 'error');
                    return;
                }

                if (sumAllocated > recAmt) {
                    showToast('Total allocated amount exceeds received amount', 'error');
                    return;
                }
            }

            const payload = {
                customerId,
                amount: recAmt,
                date,
                referenceType,
                paymentMode,
                referenceNo: ['BANK', 'UPI', 'CARD'].includes(paymentMode) ? referenceNo : '',
                referenceDate: ['BANK', 'UPI', 'CARD'].includes(paymentMode) ? referenceDate : null,
                note,
                allocations: referenceType === 'AGAINST_REFERENCE' ? backendAllocations : []
            };

            const token = localStorage.getItem('token');
            const res = await fetch('/api/receipts/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Failed to save customer receipt', 'error');
                return;
            }

            showToast('Receipt saved successfully', 'success');
            setTimeout(() => {
                window.location.reload(); 
            }, 1000);

        } catch (err) {
            showToast('Failed to save receipt', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div style={{ fontWeight: '700', fontSize: '18px', color: 'var(--text-main)', marginTop: '8px' }}>
                Create Customer Receipt
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flex: 1 }}>
                {/* Left Side: Basic Details & Pending Bills */}
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                    
                    <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>
                            Basic Details
                        </div>
                        
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Receipt No <span style={{ color: '#EF4444' }}>*</span></label>
                                <input type="text" value={arNo} disabled style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', background: '#F3F4F6', boxSizing: 'border-box', width: '100%' }} />
                            </div>
                            
                            <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Date <span style={{ color: '#EF4444' }}>*</span></label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                            </div>

                            <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Reference Type <span style={{ color: '#EF4444' }}>*</span></label>
                                <CustomSelect
                                    value={referenceType}
                                    onChange={(val) => {
                                        setReferenceType(val);
                                        setAllocations({});
                                    }}
                                    options={[
                                        { value: 'AGAINST_REFERENCE', label: 'Against Reference' },
                                        { value: 'ON_ACCOUNT', label: 'On Account' },
                                        { value: 'ADVANCE', label: 'Advance' }
                                    ]}
                                />
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Customer <span style={{ color: '#EF4444' }}>*</span></label>
                                <CustomSelect
                                    value={customerId}
                                    onChange={(val) => {
                                        setCustomerId(val);
                                        setAllocations({});
                                        setReceivedAmount('');
                                    }}
                                    placeholder="Select Customer"
                                    options={customers.map(c => ({ value: c.id, label: c.customerName || c.name }))}
                                />
                            </div>
                        </div>
                    </div>
                    
                    {referenceType === 'AGAINST_REFERENCE' && (
                        <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '200px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', padding: '12px 16px', background: 'white' }}>
                                <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>
                                    Pending Bills Allocation
                                </span>
                                <button
                                    onClick={handleAutoAllocate}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        border: '1px solid #E2E8F0',
                                        background: '#F8FAFC',
                                        borderRadius: '6px',
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        color: '#0F172A',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Sparkles style={{ width: '13px', height: '13px', color: '#6366F1' }} />
                                    Auto Allocate (Oldest First)
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ height: '40px', backgroundColor: '#F8FAFC' }}>
                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>S. No.</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Date</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>INV No</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Invoice Amount</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>Pending</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', width: '120px' }}>Allocated Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingBills.length > 0 ? pendingBills.map((b, idx) => (
                                            <tr key={b.id || idx}>
                                                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>{new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>{b.invoiceNumber}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>₹{b.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                                                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>₹{b.pending.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                                                <td style={{ padding: '6px 16px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                                                    <input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={allocations[b.id] || ''}
                                                        onChange={e => handleAllocationChange(b.id, e.target.value, b.pending)}
                                                        style={{
                                                            height: '32px',
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: '6px',
                                                            padding: '0 8px',
                                                            fontFamily: 'inherit',
                                                            fontSize: '13px',
                                                            outline: 'none',
                                                            boxSizing: 'border-box',
                                                            width: '100%',
                                                            textAlign: 'right'
                                                        }}
                                                    />
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                                    {customerId ? 'No pending bills for the selected customer.' : 'Select a customer to view pending bills.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Right Side: Amount Details */}
                <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0 }}>
                    <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>
                            Amount Details
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Received Amount <span style={{ color: '#EF4444' }}>*</span></label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '12px', fontSize: '13px', color: 'var(--text-main)', fontWeight: '500' }}>₹</span>
                                <input type="number" placeholder="0.00" value={receivedAmount} onChange={e => handleReceivedChange(e.target.value)} style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px 0 28px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                            </div>
                        </div>

                        {referenceType === 'AGAINST_REFERENCE' && (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Allocated Amount</label>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <span style={{ position: 'absolute', left: '12px', fontSize: '13px', color: 'var(--text-main)', fontWeight: '500' }}>₹</span>
                                        <input type="text" value={sumAllocated.toFixed(2)} readOnly style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px 0 28px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', background: '#F3F4F6', boxSizing: 'border-box', width: '100%' }} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Excess to Advance</label>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <span style={{ position: 'absolute', left: '12px', fontSize: '13px', color: 'var(--text-main)', fontWeight: '500' }}>₹</span>
                                        <input type="text" value={advanceAmount.toFixed(2)} readOnly style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px 0 28px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', background: '#F3F4F6', boxSizing: 'border-box', width: '100%' }} />
                                    </div>
                                </div>
                            </>
                        )}
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Pending Amount</label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '12px', fontSize: '13px', color: 'var(--text-main)', fontWeight: '500' }}>₹</span>
                                <input type="text" value={totalPending.toFixed(2)} readOnly style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px 0 28px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', background: '#F3F4F6', boxSizing: 'border-box', width: '100%', fontWeight: '600' }} />
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>
                            Payment Method
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Payment Mode <span style={{ color: '#EF4444' }}>*</span></label>
                            <CustomSelect
                                value={paymentMode}
                                onChange={(val) => {
                                    setPaymentMode(val);
                                    setReferenceNo('');
                                    setReferenceDate('');
                                }}
                                options={[
                                    { value: 'CASH', label: 'Cash' },
                                    { value: 'BANK', label: 'Bank Transfer' },
                                    { value: 'UPI', label: 'UPI' },
                                    { value: 'CARD', label: 'Card Payment' }
                                ]}
                            />
                        </div>

                        {paymentMode !== 'CASH' && (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Ref. No / UTR</label>
                                    <input type="text" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Enter transaction reference" style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Ref. Date</label>
                                    <input type="date" value={referenceDate} onChange={e => setReferenceDate(e.target.value)} style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                                </div>
                            </>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Note / Remarks</label>
                            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Enter optional remarks" style={{ height: '60px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%', resize: 'none' }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border-color)', color: 'var(--text-main)', background: 'white', borderRadius: '6px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                    <ChevronLeft style={{ width: '16px', height: '16px' }} /> Back
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <style>
                        {`
                            @keyframes spin {
                                from { transform: rotate(0deg); }
                                to { transform: rotate(360deg); }
                            }
                        `}
                    </style>
                    <button onClick={handleSave} disabled={isSaving} style={{ border: 'none', color: 'white', background: isSaving ? '#6B7280' : '#000B58', borderRadius: '6px', padding: '8px 24px', fontSize: '14px', fontWeight: '500', cursor: isSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isSaving && <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />}
                        {isSaving ? 'Saving...' : 'Save Receipt'}
                    </button>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
