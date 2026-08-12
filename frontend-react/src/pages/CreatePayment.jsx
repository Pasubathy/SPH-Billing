import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function CreatePayment() {
  const navigate = useNavigate();

  // State
  const [pmtNo, setPmtNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendorId, setVendorId] = useState('');
  
  // Reference Type & Payment Mode
  const [referenceType, setReferenceType] = useState('AGAINST_REFERENCE'); // AGAINST_REFERENCE, ON_ACCOUNT, ADVANCE
  const [paymentMode, setPaymentMode] = useState('CASH'); // CASH, BANK, UPI, CARD
  const [referenceNo, setReferenceNo] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [note, setNote] = useState('');

  // Amount details
  const [paidAmount, setPaidAmount] = useState('');
  const [allocations, setAllocations] = useState({}); // { [invoiceId]: amountString }
  
  const [vendors, setVendors] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vRes, piRes, cRes] = await Promise.all([
          fetch('/api/vendors').catch(() => ({ json: () => [] })),
          fetch('/api/purchase-invoices').catch(() => ({ json: () => [] })),
          fetch('/api/vendor-payment-counter').catch(() => ({ json: () => ({ counter: 1 }) }))
        ]);
        
        const vData = await vRes.json();
        const piData = await piRes.json();
        const cData = await cRes.json();
        
        setVendors(vData || []);
        setPurchaseInvoices(piData || []);
        setPmtNo('PMT' + String(cData.counter || 1).padStart(3, '0'));
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    fetchData();
  }, []);

  const pendingBills = useMemo(() => {
    if (!vendorId) return [];
    
    let bills = purchaseInvoices.filter(pi => {
      if (String(pi.vendorId) !== String(vendorId)) return false;
      const pend = parseFloat(pi.pendingToPay || pi.pending_to_pay) || 0;
      return pend > 0;
    }).map(pi => {
      const amt = parseFloat(pi.amount) || 0;
      const pend = parseFloat(pi.pendingToPay || pi.pending_to_pay) || 0;
      return {
        id: pi.id || pi.piNo,
        piNo: pi.piNo,
        date: pi.date,
        amount: amt,
        pending: pend,
        originalPI: pi
      };
    });

    // Sort oldest first
    bills.sort((a, b) => new Date(a.date) - new Date(b.date));
    return bills;
  }, [vendorId, purchaseInvoices]);

  const totalPending = pendingBills.reduce((sum, b) => sum + b.pending, 0);

  const handlePaidAmountChange = (val) => {
    setPaidAmount(val);
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
    const amt = parseFloat(paidAmount) || 0;
    if (amt <= 0) {
        showToast('Please enter paid amount first', 'error');
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

  // Calculate totals
  const sumAllocated = Object.entries(allocations).reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0);
  const advanceAmount = Math.max(0, (parseFloat(paidAmount) || 0) - sumAllocated);

  const handleSave = async (redirect = true) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
        const pmtAmt = parseFloat(paidAmount) || 0;
        
        if (!vendorId) { showToast('Please select a vendor', 'error'); return; }
        if (!paymentDate) { showToast('Please select a date', 'error'); return; }
        if (pmtAmt <= 0) { showToast('Paid amount must be greater than 0', 'error'); return; }

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

            if (sumAllocated > pmtAmt) {
                showToast('Total allocated amount exceeds paid amount', 'error');
                return;
            }
        }

        const payload = {
            vendorId,
            amount: pmtAmt,
            date: paymentDate,
            referenceType,
            paymentMode,
            referenceNo: ['BANK', 'UPI', 'CARD'].includes(paymentMode) ? referenceNo : '',
            referenceDate: ['BANK', 'UPI', 'CARD'].includes(paymentMode) ? referenceDate : null,
            note,
            allocations: referenceType === 'AGAINST_REFERENCE' ? backendAllocations : []
        };

        const token = localStorage.getItem('token');
        const res = await fetch('/api/vendor-payments/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Failed to save vendor payment', 'error');
            return;
        }

        showToast('Payment saved successfully', 'success');
        
        if (redirect) {
          setTimeout(() => navigate('/payment'), 1000);
        } else {
          setTimeout(() => window.location.reload(), 1000);
        }
    } catch (err) {
        showToast('Failed to save payment', 'error');
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>
        {`
          .responsive-layout { display: flex; gap: 16px; align-items: flex-start; flex: 1; padding-bottom: 80px; width: 100%; }
          .responsive-right-col { width: 320px; flex-shrink: 0; }
          .responsive-grid-2 { display: flex; gap: 16px; }
          @media (max-width: 992px) {
            .responsive-layout { flex-direction: column; }
            .responsive-right-col { width: 100%; }
            .responsive-grid-2 { flex-direction: column; }
          }
          @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div className="page-header" style={{ height: '45px', padding: '0 16px', display: 'flex', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Create Vendor Payment</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#F8FAFC' }}>
        <div className="responsive-layout">
          
          {/* Left Column */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, width: '100%' }}>
            
            <div className="create-card" style={{ marginBottom: 0, background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div className="create-card-title" style={{ padding: '16px', fontWeight: '600', borderBottom: '1px solid var(--border-color)' }}>Basic Details</div>
              <div className="create-card-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="responsive-grid-2">
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>PMT No. <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="text" style={{ ...inputStyle, background: '#F3F4F6' }} readOnly value={pmtNo} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Date <span style={{ color: '#EF4444' }}>*</span></label>
                    <CustomDatePicker 
                        value={paymentDate} 
                        onChange={(val) => setPaymentDate(val)} 
                        style={inputStyle} 
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                
                <div className="responsive-grid-2">
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Vendor <span style={{ color: '#EF4444' }}>*</span></label>
                    <CustomSelect 
                        value={vendorId} 
                        onChange={(val) => {
                            setVendorId(val);
                            setAllocations({});
                            setPaidAmount('');
                        }} 
                        placeholder="Select Vendor" 
                        options={vendors.map(v => ({ value: v.id, label: v.vendorName }))} 
                    />
                  </div>
                </div>
              </div>
            </div>

            {referenceType === 'AGAINST_REFERENCE' && (
              <div className="create-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: '200px', overflow: 'hidden', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>Pending Bills</span>
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
                      <tr style={{ height: '40px', background: '#F1F3F5', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '500', color: '#1A1A1A', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '500', color: '#1A1A1A', borderRight: '1px solid var(--border-color)', width: '150px' }}>Date</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '500', color: '#1A1A1A', borderRight: '1px solid var(--border-color)', width: '150px' }}>PI No.</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '500', color: '#1A1A1A', borderRight: '1px solid var(--border-color)' }}>Purchase Amount</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '500', color: '#1A1A1A', borderRight: '1px solid var(--border-color)', width: '150px' }}>Pending</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '500', color: '#1A1A1A', width: '120px' }}>Allocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBills.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Select a vendor to view pending bills</td>
                        </tr>
                      ) : (
                        pendingBills.map((bill, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px 16px', fontSize: '13px', borderRight: '1px solid var(--border-color)' }}>{idx + 1}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', borderRight: '1px solid var(--border-color)' }}>{bill.date}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', borderRight: '1px solid var(--border-color)', color: '#2563EB', fontWeight: '500' }}>{bill.piNo}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', borderRight: '1px solid var(--border-color)' }}>₹{bill.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', borderRight: '1px solid var(--border-color)', color: '#EF4444', fontWeight: '600' }}>₹{bill.pending.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                            <td style={{ padding: '6px 16px', textAlign: 'right' }}>
                              <input
                                  type="number"
                                  placeholder="0.00"
                                  value={allocations[bill.id] || ''}
                                  onChange={e => handleAllocationChange(bill.id, e.target.value, bill.pending)}
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

          {/* Right Column */}
          <div className="responsive-right-col" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="create-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div className="create-card-title" style={{ margin: '-16px -16px 16px -16px', borderBottom: '1px solid var(--border-color)', padding: '16px', fontWeight: '600' }}>Amount Details</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Paid Amount <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '12px', fontSize: '13px', fontWeight: '500' }}>₹</span>
                  <input type="number" value={paidAmount} onChange={(e) => handlePaidAmountChange(e.target.value)} style={{ ...inputStyle, paddingLeft: '28px' }} />
                </div>
              </div>

              {referenceType === 'AGAINST_REFERENCE' && (
                  <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Allocated Amount</label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <span style={{ position: 'absolute', left: '12px', fontSize: '13px', fontWeight: '500' }}>₹</span>
                              <input type="text" readOnly value={sumAllocated.toFixed(2)} style={{ ...inputStyle, paddingLeft: '28px', background: '#F3F4F6' }} />
                          </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Excess to Advance</label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <span style={{ position: 'absolute', left: '12px', fontSize: '13px', fontWeight: '500' }}>₹</span>
                              <input type="text" readOnly value={advanceAmount.toFixed(2)} style={{ ...inputStyle, paddingLeft: '28px', background: '#F3F4F6' }} />
                          </div>
                      </div>
                  </>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Pending Amount</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '12px', fontSize: '13px', fontWeight: '500' }}>₹</span>
                  <input type="text" readOnly value={totalPending.toFixed(2)} style={{ ...inputStyle, paddingLeft: '28px', background: '#F3F4F6', fontWeight: '600' }} />
                </div>
              </div>
            </div>

            <div className="create-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div className="create-card-title" style={{ margin: '-16px -16px 16px -16px', borderBottom: '1px solid var(--border-color)', padding: '16px', fontWeight: '600' }}>Payment Method</div>

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
                        { value: 'CARD', label: 'Card' }
                    ]} 
                />
              </div>

              {paymentMode !== 'CASH' && (
                  <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Ref. No / UTR</label>
                          <input type="text" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Enter transaction reference" style={inputStyle} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Ref. Date</label>
                          <input type="date" value={referenceDate} onChange={e => setReferenceDate(e.target.value)} style={inputStyle} />
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
      </div>

      <div className="sticky-action-bar-new" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxSizing: 'border-box' }}>
        <button onClick={() => navigate('/payment')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => handleSave(false)} disabled={isSaving} style={{ height: '35px', padding: '0 16px', border: '1px solid #000B58', color: '#000B58', borderRadius: '8px', background: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>Save & Add</button>
          <button onClick={() => handleSave(true)} disabled={isSaving} style={{ height: '35px', padding: '0 16px', border: 'none', color: 'white', borderRadius: '8px', background: isSaving ? '#6B7280' : '#000B58', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isSaving && <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />}
              {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            {toast.msg}
        </div>
      )}
    </div>
  );
}
