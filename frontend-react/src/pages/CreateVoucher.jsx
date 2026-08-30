import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Plus, Sparkles, X } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import { numberToWords } from '../utils/numberToWords';
import apiFetch from '../utils/api';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function CreateVoucher() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  // State
  const [voucherNo, setVoucherNo] = useState('');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherType, setVoucherType] = useState('Payment'); // 'Payment' or 'Receipt'
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [category, setCategory] = useState('');
  const [partyName, setPartyName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [amount, setAmount] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [note, setNote] = useState('');

  const [categories, setCategories] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [newCatModal, setNewCatModal] = useState({ isOpen: false, name: '', type: 'Expense' });

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3000);
  };

  // Fetch Categories & Counter
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, cRes] = await Promise.all([
          apiFetch('/api/expense-categories').catch(() => ({ json: () => [] })),
          apiFetch('/api/voucher-counter').catch(() => ({ json: () => ({ nextPaymentNo: 'PAY-001', nextReceiptNo: 'REC-001' }) }))
        ]);
        
        const catData = await catRes.json();
        const cData = await cRes.json();
        
        setCategories(Array.isArray(catData) ? catData : []);
        if (!isEditMode) {
          setVoucherNo(voucherType === 'Payment' ? (cData.nextPaymentNo || 'PAY-001') : (cData.nextReceiptNo || 'REC-001'));
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    fetchData();
  }, []);

  // Update voucher number when type toggles in create mode
  const handleTypeChange = async (newType) => {
    setVoucherType(newType);
    setCategory('');
    if (!isEditMode) {
      try {
        const cRes = await apiFetch('/api/voucher-counter');
        const cData = await cRes.json();
        setVoucherNo(newType === 'Payment' ? (cData.nextPaymentNo || 'PAY-001') : (cData.nextReceiptNo || 'REC-001'));
      } catch {
        setVoucherNo(newType === 'Payment' ? 'PAY-001' : 'REC-001');
      }
    }
  };

  // Load existing voucher if edit mode
  useEffect(() => {
    if (isEditMode) {
      const loadVoucher = async () => {
        try {
          const res = await apiFetch(`/api/vouchers/${id}`);
          if (res.ok) {
            const data = await res.json();
            setVoucherNo(data.voucherNo || '');
            setVoucherType(data.voucherType || 'Payment');
            setPaymentMode(data.paymentMode || 'Cash');
            setCategory(data.category || '');
            setPartyName(data.partyName || '');
            setReferenceNo(data.referenceNo || '');
            setAmount(data.amount ? String(data.amount) : '');
            setTaxRate(data.taxRate ? String(data.taxRate) : '0');
            setNote(data.narration || '');
            
            // Format Date to YYYY-MM-DD
            if (data.date) {
              if (data.date.includes('/')) {
                const parts = data.date.split('/');
                if (parts.length === 3) {
                  setVoucherDate(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                }
              } else {
                setVoucherDate(data.date.split('T')[0]);
              }
            }
          }
        } catch (err) {
          console.error('Error loading voucher:', err);
        }
      };
      loadVoucher();
    }
  }, [id, isEditMode]);

  // Filter categories by type
  const filteredCategories = categories.filter(c => {
    const catType = (c.type || 'Expense').toLowerCase();
    return voucherType.toLowerCase() === 'payment' ? catType === 'expense' : catType === 'income';
  });

  // Handle Quick Add Category
  const handleAddCategory = async () => {
    if (!newCatModal.name.trim()) return;
    try {
      const res = await apiFetch('/api/expense-categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatModal.name.trim(),
          type: voucherType === 'Payment' ? 'Expense' : 'Income'
        })
      });
      if (res.ok) {
        const newCat = await res.json();
        setCategories(prev => [...prev, newCat]);
        setCategory(newCat.name);
        setNewCatModal({ isOpen: false, name: '', type: 'Expense' });
      }
    } catch (err) {
      console.error('Error adding category:', err);
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const words = numberToWords(parsedAmount);

  const handleSave = async (redirect = true) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!voucherDate) { showToast('Please select a date', 'error'); return; }
      if (!category) { showToast('Please select a category / purpose', 'error'); return; }
      if (!partyName.trim()) { showToast(voucherType === 'Payment' ? 'Please enter recipient name' : 'Please enter payer name', 'error'); return; }
      if (parsedAmount <= 0) { showToast('Amount must be greater than 0', 'error'); return; }

      const payload = {
        voucherType,
        voucherNo,
        date: voucherDate,
        paymentMode,
        referenceNo: referenceNo.trim() || null,
        category,
        partyName: partyName.trim(),
        amount: parsedAmount,
        taxRate: parseFloat(taxRate) || 0,
        amountInWords: words,
        narration: note.trim()
      };

      const url = isEditMode ? `/api/vouchers/${id}` : '/api/vouchers';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        showToast(errData.error || 'Failed to save voucher', 'error');
        return;
      }

      showToast(isEditMode ? 'Voucher updated successfully' : 'Voucher saved successfully', 'success');

      if (redirect) {
        setTimeout(() => navigate('/voucher'), 1000);
      } else {
        setCategory('');
        setPartyName('');
        setReferenceNo('');
        setAmount('');
        setNote('');
        try {
          const cRes = await apiFetch('/api/voucher-counter');
          const cData = await cRes.json();
          setVoucherNo(voucherType === 'Payment' ? (cData.nextPaymentNo || 'PAY-001') : (cData.nextReceiptNo || 'REC-001'));
        } catch {}
      }
    } catch (err) {
      showToast('Failed to save voucher', 'error');
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
          {isEditMode ? 'Edit Voucher' : 'Create Voucher'}
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
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Voucher No. <span style={{ color: '#EF4444' }}>*</span></label>
                <input type="text" style={{ ...inputStyle, backgroundColor: '#F8F9FA', cursor: 'not-allowed', fontWeight: '600', color: '#000B58' }} readOnly value={voucherNo} placeholder="Voucher No" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Date <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="date" 
                  value={voucherDate} 
                  onChange={e => setVoucherDate(e.target.value)} 
                  style={inputStyle} 
                />
              </div>
            </div>

            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Voucher Type <span style={{ color: '#EF4444' }}>*</span></label>
                <CustomSelect 
                  value={voucherType} 
                  onChange={handleTypeChange} 
                  placeholder="Select Type" 
                  options={[
                    { value: 'Payment', label: 'Payment Voucher (Expense)' },
                    { value: 'Receipt', label: 'Receipt Voucher (Income)' }
                  ]} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Payment Mode <span style={{ color: '#EF4444' }}>*</span></label>
                <CustomSelect 
                  value={paymentMode} 
                  onChange={setPaymentMode} 
                  placeholder="Select Mode" 
                  options={[
                    { value: 'Cash', label: 'Cash' },
                    { value: 'Bank Account (SBI)', label: 'Bank Account (SBI)' },
                    { value: 'Bank Account (HDFC)', label: 'Bank Account (HDFC)' },
                    { value: 'UPI / GPay', label: 'UPI / GPay' },
                    { value: 'Cheque', label: 'Cheque' },
                    { value: 'Card', label: 'Credit / Debit Card' }
                  ]} 
                />
              </div>
            </div>

            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Category / Purpose <span style={{ color: '#EF4444' }}>*</span></label>
                  <button
                    type="button"
                    onClick={() => setNewCatModal({ isOpen: true, name: '', type: voucherType === 'Payment' ? 'Expense' : 'Income' })}
                    style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', padding: 0 }}
                  >
                    <Plus size={12} /> Add Category
                  </button>
                </div>
                <CustomSelect 
                  value={category} 
                  onChange={setCategory} 
                  placeholder="Select Category" 
                  options={filteredCategories.map(c => ({ value: c.name, label: c.name }))} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>
                  {voucherType === 'Payment' ? 'Paid To (Party / Employee)' : 'Received From (Customer / Party)'} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input 
                  type="text" 
                  value={partyName} 
                  onChange={e => setPartyName(e.target.value)} 
                  placeholder={voucherType === 'Payment' ? 'e.g. Ramesh (Driver), Landlord, TNEB' : 'e.g. Anand Scrap Traders'}
                  style={inputStyle} 
                />
              </div>
            </div>

            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Reference / Cheque / UTR No.</label>
                <input 
                  type="text" 
                  value={referenceNo} 
                  onChange={e => setReferenceNo(e.target.value)} 
                  placeholder="Optional reference number"
                  style={inputStyle} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>GST Rate (Optional)</label>
                <CustomSelect 
                  value={taxRate} 
                  onChange={setTaxRate} 
                  placeholder="Select Tax" 
                  options={[
                    { value: '0', label: 'None / Exempted' },
                    { value: '5', label: '5% GST' },
                    { value: '12', label: '12% GST' },
                    { value: '18', label: '18% GST' },
                    { value: '28', label: '28% GST' }
                  ]} 
                />
              </div>
            </div>

          </div>

          {/* Amount in Words Card */}
          <div className="create-card">
            <div className="create-card-title">Amount in Words</div>
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '6px',
              padding: '12px 16px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Sparkles size={16} color="#000B58" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#000B58' }}>
                {words}
              </div>
            </div>
          </div>

        </div>

        {/* Right Sidebar Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Amount Details Card */}
          <div className="create-card">
            <div className="create-card-title">Amount Details</div>
            
            {/* Amount Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500' }}>Amount <span style={{ color: '#EF4444' }}>*</span></label>
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative', background: 'white' }}>
                <span style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRight: '1px solid var(--border-color)', padding: '0 12px', fontSize: '13px', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }}>₹</span>
                <input 
                  type="number" 
                  placeholder="0.00"
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', fontWeight: '700', color: voucherType === 'Payment' ? '#DC2626' : '#16A34A', background: 'transparent' }} 
                />
              </div>
            </div>

            {/* Total Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500' }}>Total Voucher Amount</label>
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative', background: '#F8F9FA' }}>
                <span style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRight: '1px solid var(--border-color)', padding: '0 12px', fontSize: '13px', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }}>₹</span>
                <input 
                  type="text" 
                  readOnly 
                  value={parsedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                  style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', background: 'transparent', fontWeight: '700', color: '#000B58', cursor: 'not-allowed' }} 
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
                placeholder="Enter optional narration / remarks" 
                style={{ ...inputStyle, height: '85px', padding: '8px 12px', resize: 'none' }} 
              />
            </div>
          </div>

        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky-action-bar-new" style={{ height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <button onClick={() => navigate('/voucher')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
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

      {/* Quick Add Category Modal */}
      {newCatModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '400px',
            maxWidth: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1E293B' }}>
                Add {voucherType === 'Payment' ? 'Expense' : 'Income'} Category
              </h3>
              <button onClick={() => setNewCatModal({ isOpen: false, name: '', type: 'Expense' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={18} />
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                Category Name <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input 
                type="text"
                autoFocus
                value={newCatModal.name}
                onChange={e => setNewCatModal(prev => ({ ...prev, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
                placeholder="e.g. Generator Fuel, Machine Repair"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setNewCatModal({ isOpen: false, name: '', type: 'Expense' })}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: 'white',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCategory}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#000B58',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            {toast.msg}
        </div>
      )}
    </div>
  );
}
