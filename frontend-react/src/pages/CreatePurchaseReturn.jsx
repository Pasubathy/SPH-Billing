import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const textAreaStyle = { ...inputStyle, minHeight: '60px', paddingTop: '10px', resize: 'none' };

export default function CreatePurchaseReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isEditMode, setIsEditMode] = useState(false);
  const [originalItems, setOriginalItems] = useState([]);

  // Basic Form State
  const [prNo, setPrNo] = useState('PRET001');
  const [returnDate, setReturnDate] = useState('');
  
  // Selection
  const [vendors, setVendors] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [existingReturns, setExistingReturns] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  // Extracted Data
  const [vendor, setVendor] = useState('');
  const [refNo, setRefNo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('None');
  const [gstinNo, setGstinNo] = useState('');
  const [panNo, setPanNo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [billAddress, setBillAddress] = useState('');
  const [shipAddress, setShipAddress] = useState('');

  // Item List State
  const [items, setItems] = useState([]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [prNote, setPrNote] = useState('');

  // Summary State
  const [subTotal, setSubTotal] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Set today's date
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    setReturnDate(`${yyyy}-${mm}-${dd}`);

    // Fetch PR counter
    fetch('http://localhost:3000/api/pret-counter')
      .then(res => res.json())
      .then(data => {
        setPrNo('PRET' + String(data.counter || 1).padStart(3, '0'));
      })
      .catch(() => {});

    // Fetch Purchase Invoices, Vendors, and Returns
    Promise.all([
        fetch('http://localhost:3000/api/purchase-invoices').then(res => res.json()).catch(() => []),
        fetch('http://localhost:3000/api/vendors').then(res => res.json()).catch(() => []),
        fetch('http://localhost:3000/api/purchase-returns').then(res => res.json()).catch(() => [])
    ]).then(([piData, vendorData, prData]) => {
        setPurchaseInvoices(piData);
        setVendors(vendorData);
        setExistingReturns(prData || []);
    });
  }, []);

  // Populate for Edit Mode
  useEffect(() => {
    if (location.state?.editSale && vendors.length > 0) {
      const sale = location.state.editSale;
      setIsEditMode(true);
      setPrNo(sale.returnNo);

      let parsedDate = sale.date || '';
      if (parsedDate.includes('/')) {
          const parts = parsedDate.split('/');
          if (parts.length === 3) parsedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else if (parsedDate.includes('T')) {
          parsedDate = parsedDate.split('T')[0];
      }
      setReturnDate(parsedDate);
      
      setSelectedVendorId(sale.vendorId || '');
      
      setTimeout(() => {
          setSelectedInvoiceId(sale.invoiceId || '');
          setOriginalItems(sale.items || []); // Remember original for stock reversal
      }, 50);
      
      setPaidAmount(sale.refundAmount?.toString() || '0');
      setPrNote(sale.note || '');
      setDiscountAmount(sale.discountAmount || sale.discount || 0);
    }
  }, [location.state, vendors]);

  // When Vendor changes, populate vendor fields and clear selected PI
  useEffect(() => {
    if (!selectedVendorId) {
        setVendor('');
        setGstinNo('');
        setPanNo('');
        setBillAddress('');
        setShipAddress('');
        if (!isEditMode) {
            setSelectedInvoiceId('');
            setItems([]);
        }
        return;
    }

    const v = vendors.find(vend => vend.id === selectedVendorId);
    if (v) {
        setVendor(v.vendorName || '');
        setGstinNo(v.gstin || '');
        setPanNo(v.panNumber || '');
        setBillAddress(v.billAddress || '');
        setShipAddress(v.shipAddress || '');
    }
    
    // Only clear if not initially loading edit mode
    if (!isEditMode || location.state?.editSale?.vendorId !== selectedVendorId) {
        setSelectedInvoiceId('');
        setItems([]);
    }
  }, [selectedVendorId, vendors, isEditMode, location.state]);

  // When selected PI changes, populate items
  useEffect(() => {
    if (!selectedInvoiceId) {
      if (!isEditMode) setItems([]);
      return;
    }

    const pi = purchaseInvoices.find(p => p.id === selectedInvoiceId);
    if (pi) {
      if (pi.items) {
        // Calculate previously returned quantities for this invoice across all past returns
        const returnedMap = {};
        existingReturns.forEach(ret => {
            const matchesInvoice = (ret.invoiceId === selectedInvoiceId) || (ret.invoiceNo === pi.piNo);
            if (matchesInvoice && (!isEditMode || ret.returnNo !== prNo)) {
                (ret.items || []).forEach(retItem => {
                    const code = retItem.code || retItem.hsn || retItem.name;
                    returnedMap[code] = (returnedMap[code] || 0) + (parseFloat(retItem.qty) || 0);
                });
            }
        });

        // Map items and restrict maxQty based on prior returns
        const mappedItems = pi.items.map((item, idx) => {
          const code = item.code || item.hsn || item.name;
          const previouslyReturned = returnedMap[code] || 0;
          const maxAllowed = Math.max(0, (parseFloat(item.qty) || 0) - previouslyReturned);

          let currentQty = 0;
          if (isEditMode && (location.state?.editSale?.invoiceId === selectedInvoiceId || location.state?.editSale?.invoiceNo === pi.piNo)) {
              const editItem = (location.state.editSale.items || []).find(e => (e.code || e.hsn || e.name) === code);
              if (editItem) {
                  currentQty = parseFloat(editItem.qty) || 0;
              }
          }

          return {
            sNo: idx + 1,
            name: item.name || 'Unknown Item',
            hsn: item.hsn || item.code || '',
            qty: currentQty,
            maxQty: maxAllowed,
            unit: item.unit || 'Nos',
            rate: item.rate || 0,
            discount: item.discount || item.disc || 0,
            tax: item.taxPercent || item.tax || 0,
          };
        });
        setItems(mappedItems);
      }
    } else {
        setItems([]);
    }
  }, [selectedInvoiceId, purchaseInvoices, isEditMode, location.state, existingReturns, prNo]);

  useEffect(() => {
    calculateTotals();
  }, [items, discountAmount]);

  const calculateTotals = () => {
    let sub = 0;
    let tax = 0;
    items.forEach(item => {
      const qty = parseFloat(item.qty) || 0;
      const rate = parseFloat(item.rate) || 0;
      const amount = rate * qty;
      const discount = parseFloat(item.discount) || 0;
      const finalAmt = amount - discount;
      sub += finalAmt;
      tax += finalAmt * ((parseFloat(item.tax) || 0) / 100);
    });
    setSubTotal(sub);
    setTaxAmount(tax);
  };

  const updateItemQty = (index, newQty) => {
    const parsedQty = parseFloat(newQty);
    if (parsedQty < 0) return;
    
    const newItems = [...items];
    if (parsedQty > newItems[index].maxQty) {
        alert(`Cannot return more than purchased quantity (${newItems[index].maxQty})`);
        newItems[index].qty = newItems[index].maxQty;
    } else {
        newItems[index].qty = newQty;
    }
    setItems(newItems);
  };

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const saveReturn = async (stayOnPage = false) => {
    if (isSubmitting) return;

    if (!selectedInvoiceId || !selectedVendorId || !vendor) {
      alert("PR No, Purchase Invoice, and Vendor are required");
      return;
    }

    if (items.length === 0) {
      alert("No items to return");
      return;
    }

    // Filter out items with 0 qty
    const returnItems = items.filter(i => parseFloat(i.qty) > 0);
    if (returnItems.length === 0) {
      alert("Please enter a return quantity greater than 0 for at least one item.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        invoiceId: selectedInvoiceId,
        vendorId: selectedVendorId,
        items: returnItems.map(row => ({
            code: row.hsn,
            qty: parseFloat(row.qty)
        })),
        cashReceived: parseFloat(paidAmount) || 0,
        date: returnDate,
        note: prNote
      };

      const authToken = localStorage.getItem('sph_session_token');
      const saveRes = await fetch('http://localhost:3000/api/purchase-returns/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const resData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
          throw new Error(resData.error || "Failed to save purchase return");
      }

      alert(`Purchase Return ${resData.returnNo} saved successfully!`);

      if (stayOnPage) {
        window.location.reload();
      } else {
        navigate('/purchase-return');
      }

    } catch (err) {
      console.error(err);
      alert("Error saving: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const afterDiscount = subTotal - discountAmount;
  const grandTotal = Math.round(afterDiscount + taxAmount);
  const roundOff = grandTotal - (afterDiscount + taxAmount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <style>
        {`
          .responsive-grid {
            display: grid;
            grid-template-columns: repeat(10, 1fr);
            gap: 20px;
          }
          .summary-container {
            display: flex;
            gap: 24px;
            margin-top: 24px;
          }
          .summary-table-wrapper {
            width: 400px;
          }
          @media (max-width: 992px) {
            .responsive-grid {
              display: flex;
              flex-direction: column;
            }
            .summary-container {
              flex-direction: column;
            }
            .summary-table-wrapper {
              width: 100%;
            }
          }
        `}
      </style>
      
      {/* Page Header */}
      <div className="page-header" style={{ height: '45px', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => navigate('/purchase-return')}>
            <ChevronLeft size={20} color="var(--text-main)" />
            <h1 className="page-title" style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>{isEditMode ? 'Edit Purchase Return' : `${prNo} (New Return)`}</h1>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingBottom: '100px', background: '#F8FAFC' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Vendor Details */}
          <div className="create-card">
            <div className="create-card-title" style={{ background: '#F3F4F6', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>Vendor Details</div>
            <div className="create-card-body" style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px 20px' }}>
                
                {/* Row 1 */}
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Vendor Name</label>
                  <CustomSelect 
                    value={selectedVendorId} 
                    onChange={setSelectedVendorId} 
                    placeholder="Select Vendor"
                    options={vendors.map(v => ({ value: v.id, label: v.vendorName }))}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>PR No</label>
                  <input type="text" style={inputStyle} readOnly value={prNo} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Date</label>
                  <CustomDatePicker style={inputStyle} value={returnDate} onChange={(val) => setReturnDate(val)} />
                </div>

                {/* Row 2 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>GSTIN No</label>
                  <input type="text" style={inputStyle} readOnly value={gstinNo} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>PAN No</label>
                  <input type="text" style={inputStyle} readOnly value={panNo} />
                </div>
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Purchase Invoice No</label>
                  <CustomSelect 
                    value={selectedInvoiceId} 
                    onChange={setSelectedInvoiceId} 
                    placeholder={selectedVendorId ? 'Select PI' : 'Select Vendor First'}
                    disabled={!selectedVendorId}
                    options={purchaseInvoices
                        .filter(pi => {
                            const v = vendors.find(vend => vend.id === selectedVendorId);
                            return v && (pi.vendorName === v.vendorName || pi.vendorId === v.id);
                        })
                        .map(pi => ({ value: pi.id, label: pi.piNo || pi.invoiceNo }))}
                  />
                </div>

                {/* Row 3 */}
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Bill Address</label>
                  <textarea style={{...textAreaStyle, minHeight: '60px'}} readOnly value={billAddress}></textarea>
                </div>
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Shipping Address</label>
                      <span style={{ fontSize: '12px', color: '#4338CA', fontWeight: '500', cursor: 'pointer', textDecoration: 'underline' }}>Change Address</span>
                  </div>
                  <textarea style={{...textAreaStyle, minHeight: '60px'}} readOnly value={shipAddress}></textarea>
                </div>
                
              </div>
            </div>
          </div>

          {/* Item Details */}
          <div className="create-card">
            <div className="create-card-title">Item Details</div>
            <div className="create-card-body" style={{ padding: '16px' }}>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '60px' }}>S No</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>Item Name</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '100px' }}>HSN</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '100px' }}>Return Qty</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '100px' }}>Unit</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '100px' }}>Rate</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '100px' }}>Amount</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '100px' }}>Discount</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '100px' }}>Final Amt</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '80px' }}>Tax %</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '120px' }}>Total Amt</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', width: '60px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan="12" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          Select a Purchase Invoice to view returnable items.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => {
                        const qty = parseFloat(item.qty) || 0;
                        const rate = parseFloat(item.rate) || 0;
                        const amount = rate * qty;
                        const discount = parseFloat(item.discount) || 0;
                        const finalAmt = amount - discount;
                        const taxAmt = finalAmt * ((parseFloat(item.tax) || 0) / 100);
                        const totalAmt = finalAmt + taxAmt;
                        
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px', fontSize: '13px' }}>{idx + 1}</td>
                            <td style={{ padding: '12px' }}>
                              <input type="text" style={{...inputStyle, height: '30px', background: 'transparent', border: 'none'}} value={item.name} readOnly />
                            </td>
                            <td style={{ padding: '12px' }}><input type="text" style={{...inputStyle, height: '30px', background: 'transparent', border: 'none'}} value={item.hsn} readOnly /></td>
                            <td style={{ padding: '12px' }}>
                                <input 
                                    type="number" 
                                    style={{...inputStyle, height: '30px', border: '1px solid #4F46E5', backgroundColor: '#EEF2FF'}} 
                                    value={item.qty} 
                                    onChange={(e) => updateItemQty(idx, e.target.value)} 
                                    min="0"
                                    max={item.maxQty}
                                />
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'center' }}>Max: {item.maxQty}</div>
                            </td>
                            <td style={{ padding: '12px' }}><input type="text" style={{...inputStyle, height: '30px', background: 'transparent', border: 'none'}} value={item.unit} readOnly /></td>
                            <td style={{ padding: '12px' }}><input type="number" style={{...inputStyle, height: '30px', background: 'transparent', border: 'none'}} value={item.rate} readOnly /></td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>₹{amount.toFixed(2)}</td>
                            <td style={{ padding: '12px' }}><input type="number" style={{...inputStyle, height: '30px', background: 'transparent', border: 'none'}} value={item.discount} readOnly /></td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>₹{finalAmt.toFixed(2)}</td>
                            <td style={{ padding: '12px' }}><input type="number" style={{...inputStyle, height: '30px', background: 'transparent', border: 'none'}} value={item.tax} readOnly /></td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: '600' }}>₹{totalAmt.toFixed(2)}</td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                                    <Trash2 size={16} />
                                </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary Grid */}
              <div className="summary-container">
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Refund Amount</div>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', width: '200px', height: '38px', background: '#F8FAFC' }}>
                      <span style={{ padding: '0 12px', color: 'var(--text-muted)', borderRight: '1px solid var(--border-color)' }}>₹</span>
                      <input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '0 12px', fontSize: '14px', width: '100%', outline: 'none' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Note</div>
                    <textarea style={textAreaStyle} value={prNote} onChange={(e) => setPrNote(e.target.value)} placeholder="Reason for return..."></textarea>
                  </div>

                </div>

                <div className="summary-table-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                      <tr><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>Sub Total</td><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: '500' }}>₹{subTotal.toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>Discount</td><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: '500' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                           ₹ <input type="number" style={{ ...inputStyle, width: '80px', height: '26px' }} value={discountAmount} onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)} />
                        </div>
                      </td></tr>
                      <tr><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>After Discount</td><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: '500' }}>₹{afterDiscount.toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>SGST</td><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: '500' }}>₹{(taxAmount / 2).toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>CGST</td><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: '500' }}>₹{(taxAmount / 2).toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>Round Off</td><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: '500' }}>{roundOff.toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '12px', color: '#000B58', fontSize: '16px', fontWeight: '700' }}>Grand Total</td><td style={{ padding: '12px', color: '#000B58', fontSize: '16px', fontWeight: '700', textAlign: 'right' }}>₹{grandTotal.toFixed(2)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      <div className="sticky-action-bar-new" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', boxSizing: 'border-box' }}>
        <button onClick={() => navigate('/purchase-return')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button disabled={isSubmitting} onClick={() => saveReturn(true)} style={{ height: '35px', padding: '0 16px', border: '1px solid #000B58', color: '#000B58', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: isSubmitting ? 0.5 : 1 }}>Save & Add</button>
          <button disabled={isSubmitting} onClick={() => saveReturn(false)} style={{ height: '35px', padding: '0 16px', border: 'none', color: 'white', borderRadius: '8px', background: '#000B58', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: isSubmitting ? 0.5 : 1 }}>{isSubmitting ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

    </div>
  );
}
