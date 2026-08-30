import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function CreatePayment() {
  const navigate = useNavigate();

  // State
  const [pmtNo, setPmtNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendorId, setVendorId] = useState('');
  const [note, setNote] = useState('');

  // Amount details
  const [paidAmount, setPaidAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
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
    bills.sort((a, b) => {
        const parseDateVal = (s) => {
            if (!s) return 0;
            if (typeof s === 'string' && s.includes('/')) {
                const parts = s.split('/');
                if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
            }
            return new Date(s).getTime() || 0;
        };
        return parseDateVal(a.date) - parseDateVal(b.date);
    });
    return bills;
  }, [vendorId, purchaseInvoices]);

  const formatBillDate = (dStr) => {
    if (!dStr) return '-';
    if (typeof dStr === 'string' && dStr.includes('/')) return dStr;
    try {
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return String(dStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return String(dStr);
    }
  };

  const totalPending = pendingBills.reduce((sum, b) => sum + b.pending, 0);
  const remainingPending = Math.max(0, totalPending - (parseFloat(paidAmount) || 0) - (parseFloat(discountAmount) || 0));

  // Auto-allocate paid amount across pending bills when typed
  const handlePaidAmountChange = (val) => {
    setPaidAmount(val);
    const paid = parseFloat(val) || 0;
    if (paid <= 0 || pendingBills.length === 0) {
      setAllocations({});
    } else {
      let remaining = paid;
      const newAlloc = {};
      for (const bill of pendingBills) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, bill.pending);
        newAlloc[bill.id] = String(apply);
        remaining -= apply;
      }
      setAllocations(newAlloc);
    }
  };

  const sumAllocated = Object.entries(allocations).reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0);

  const handleSave = async (redirect = true) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
        const pmtAmt = parseFloat(paidAmount) || 0;
        const parsedDisc = parseFloat(discountAmount) || 0;
        
        if (!vendorId) { showToast('Please select a vendor', 'error'); return; }
        if (!paymentDate) { showToast('Please select a date', 'error'); return; }
        if (pmtAmt <= 0) { showToast('Paid amount must be greater than 0', 'error'); return; }
        if (parsedDisc < 0) { showToast('Discount cannot be negative', 'error'); return; }

        const backendAllocations = [];
        let remDisc = parsedDisc;

        for (const bill of pendingBills) {
            const allocVal = parseFloat(allocations[bill.id]) || 0;
            let discVal = 0;
            if (remDisc > 0) {
                const maxDiscPossible = Math.max(0, bill.pending - allocVal);
                discVal = Math.min(remDisc, maxDiscPossible);
                remDisc -= discVal;
            }

            if (allocVal > 0 || discVal > 0) {
                backendAllocations.push({
                    invoiceId: bill.id,
                    allocatedAmount: allocVal,
                    discountAmount: discVal
                });
            }
        }

        if (remDisc > 0.01) {
            showToast(`Discount of ₹${parsedDisc.toFixed(2)} exceeds remaining unpaid balance on pending bills`, 'error');
            return;
        }

        if (backendAllocations.length === 0) {
            showToast('Please enter an amount to allocate against pending bills', 'error');
            return;
        }

        if (Math.abs(sumAllocated - pmtAmt) > 0.01) {
            showToast(`Total allocated (₹${sumAllocated.toFixed(2)}) must equal paid amount (₹${pmtAmt.toFixed(2)})`, 'error');
            return;
        }

        const payload = {
            vendorId,
            amount: pmtAmt,
            discount: parsedDisc,
            date: paymentDate,
            note,
            allocations: backendAllocations
        };

        const token = localStorage.getItem('sph_auth_token') || localStorage.getItem('token');
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
          setVendorId('');
          setPaidAmount('');
          setDiscountAmount('');
          setAllocations({});
          setNote('');
          try {
            const cRes = await fetch('/api/vendor-payment-counter');
            const cData = await cRes.json();
            setPmtNo('PMT' + String(cData.counter || 1).padStart(3, '0'));
          } catch {
            // ignore
          }
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
          @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* Header */}
      <div className="page-header" style={{ height: '45px', padding: '0 16px', display: 'flex', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-main)' }}>
          Create Vendor Payment
        </h1>
      </div>

      {/* Grid Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', background: '#F8FAFC' }}>
        
        {/* Left Form Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Basic Details */}
          <div className="create-card">
            <div className="create-card-title">Basic Details</div>
            
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>PMT No. <span style={{ color: '#EF4444' }}>*</span></label>
                <input type="text" style={{ ...inputStyle, backgroundColor: '#F8F9FA', cursor: 'not-allowed' }} readOnly value={pmtNo} placeholder="PMT No" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Date <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="date" 
                  value={paymentDate} 
                  onChange={e => setPaymentDate(e.target.value)} 
                  style={inputStyle} 
                />
              </div>
            </div>
            
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Vendor <span style={{ color: '#EF4444' }}>*</span></label>
                <CustomSelect 
                  value={vendorId} 
                  onChange={(val) => {
                    setVendorId(val);
                    setAllocations({});
                    setPaidAmount('');
                    setDiscountAmount('');
                  }} 
                  placeholder="Select Vendor" 
                  options={vendors.map(v => ({ value: v.id, label: v.vendorName }))} 
                />
              </div>
            </div>
          </div>

          {/* Pending Bills Allocation Table */}
          <div className="create-card" style={{ paddingBottom: '16px' }}>
            <div className="create-card-title">Pending Bills Allocation</div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ height: '38px', backgroundColor: '#F8FAFC' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', width: '60px' }}>S. No.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', width: '110px' }}>Date</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', width: '130px' }}>PI No.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', width: '130px' }}>Purchase Amount</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', width: '130px' }}>Pending</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', width: '150px' }}>Allocated Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingBills.length > 0 ? (
                    pendingBills.map((bill, idx) => (
                      <tr key={bill.id || idx} style={{ borderBottom: idx === pendingBills.length - 1 ? 'none' : '1px solid var(--border-color)', background: 'white' }}>
                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>{formatBillDate(bill.date)}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', color: '#2563EB', fontWeight: '500' }}>{bill.piNo}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right' }}>₹{bill.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', color: '#DC2626', fontWeight: '600' }}>₹{bill.pending.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: allocations[bill.id] && parseFloat(allocations[bill.id]) > 0 ? '#16A34A' : 'var(--text-muted)' }}>
                          ₹{parseFloat(allocations[bill.id] || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '13px', background: 'white' }}>
                        {vendorId ? 'No pending bills for the selected vendor.' : 'Select a vendor to view pending bills.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Sidebar Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Amount Details Card */}
          <div className="create-card">
            <div className="create-card-title">Amount Details</div>
            
            {/* Paid Amount */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500' }}>Paid Amount <span style={{ color: '#EF4444' }}>*</span></label>
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative', background: 'white' }}>
                <span style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRight: '1px solid var(--border-color)', padding: '0 12px', fontSize: '13px', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }}>₹</span>
                <input 
                  type="number" 
                  placeholder="0.00"
                  value={paidAmount} 
                  onChange={(e) => handlePaidAmountChange(e.target.value)} 
                  style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', background: 'transparent' }} 
                />
              </div>
            </div>

            {/* Discount */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500' }}>Discount</label>
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative', background: 'white' }}>
                <span style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRight: '1px solid var(--border-color)', padding: '0 12px', fontSize: '13px', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }}>₹</span>
                <input 
                  type="number" 
                  placeholder="0.00"
                  value={discountAmount} 
                  onChange={(e) => setDiscountAmount(e.target.value)} 
                  style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', background: 'transparent' }} 
                />
              </div>
            </div>

            {/* Pending Amount */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500' }}>Pending Amount</label>
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative', background: '#F8F9FA' }}>
                <span style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRight: '1px solid var(--border-color)', padding: '0 12px', fontSize: '13px', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }}>₹</span>
                <input 
                  type="text" 
                  readOnly 
                  value={remainingPending.toFixed(2)} 
                  style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', background: 'transparent', fontWeight: '600', color: '#DC2626', cursor: 'not-allowed' }} 
                />
              </div>
            </div>
          </div>

          {/* Remarks Card */}
          <div className="create-card">
            <div className="create-card-title">Remarks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <textarea 
                value={note} 
                onChange={e => setNote(e.target.value)} 
                placeholder="Enter optional remarks" 
                style={{ ...inputStyle, height: '70px', padding: '8px 12px', resize: 'none' }} 
              />
            </div>
          </div>

        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky-action-bar-new" style={{ height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <button onClick={() => navigate('/payment')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => handleSave(false)} disabled={isSaving} style={{ height: '35px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500' }}>
            Save & Add
          </button>
          <button onClick={() => handleSave(true)} disabled={isSaving} style={{ height: '35px', padding: '0 32px', border: 'none', borderRadius: '8px', background: isSaving ? '#6B7280' : '#000B58', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isSaving && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
              {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            {toast.msg}
        </div>
      )}
    </div>
  );
}

