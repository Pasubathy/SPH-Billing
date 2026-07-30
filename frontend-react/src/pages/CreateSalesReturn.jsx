import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Trash2, FileText, Calendar, Scan, PlusSquare, XSquare, PauseCircle, XCircle, ChevronDown, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import CustomSelect from '../components/CustomSelect';
import CustomerModal from '../components/CustomerModal';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function CreateSalesReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  // State for loaded data
  const [allItems, setAllItems] = useState([]);
  const [allUnits, setAllUnits] = useState([]);
  
  // State for invoice
  const [returnNumber, setReturnNumber] = useState('RET001');
  const [billingDate, setBillingDate] = useState('');
  
  // State for billing workspace
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [billingRows, setBillingRows] = useState([]);
  const [discountType, setDiscountType] = useState('rupee'); // 'rupee' or 'percent'
  const [discountVal, setDiscountVal] = useState(0);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const html5QrCodeRef = useRef(null);

  const startScanner = () => {
      setShowScanner(true);
      setTimeout(async () => {
          try {
              const html5QrCode = new Html5Qrcode("billing-qr-reader");
              html5QrCodeRef.current = html5QrCode;
              
              const devices = await Html5Qrcode.getCameras();
              if (devices && devices.length > 0) {
                  let cameraId = devices[0].id;
                  const backCamera = devices.find(device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment'));
                  if (backCamera) {
                      cameraId = backCamera.id;
                  }
                  
                  await html5QrCode.start(
                      cameraId,
                      { fps: 10, qrbox: { width: 250, height: 250 } },
                      (decodedText) => {
                          addItemByCode(decodedText.trim());
                          stopScanner();
                      }
                  );
              } else {
                  throw new Error("No cameras found in browser.");
              }
          } catch (err) {
              console.error("Camera access failed:", err);
              showToast("Camera not found or access denied.", "error");
              stopScanner();
          }
      }, 300);
  };

  const stopScanner = () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().then(() => {
              html5QrCodeRef.current.clear();
              setShowScanner(false);
          }).catch(err => {
              console.error(err);
              setShowScanner(false);
          });
      } else {
          setShowScanner(false);
      }
  };// Refund Given (Cash/Bank Out) state
  const [manualRefundAmt, setManualRefundAmt] = useState(null);

  // Stable invoice ID (sales_invoices.id) — set when an invoice is loaded
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState('');

  // Double-submit protection
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const loadInvoice = async () => {
    if (!originalInvoiceNo) return;
    try {
        const [salesRes, returnsRes] = await Promise.all([
            fetch('http://localhost:3000/api/sales'),
            fetch('http://localhost:3000/api/sales-returns').catch(() => ({ ok: false, json: () => [] }))
        ]);
        const sales = await salesRes.json();
        let allReturns = [];
        if (returnsRes.ok) {
            allReturns = await returnsRes.json();
        }
        
        const sale = sales.find(s => s.invoiceNo === originalInvoiceNo || s.invoiceNumber === originalInvoiceNo);
        if (sale) {
            // Store the stable invoice ID for the atomic create payload
            setSelectedInvoiceId(sale.id || null);

            setActiveCustomer({
                id: sale.customerId || 'walk-in',
                name: sale.customerName || 'Walk In Customer',
                mobile: sale.customerMobile || '',
                address: sale.customerAddress || '',
                gstin: sale.customerGst || ''
            });
            if (sale.discount) {
                setDiscountType('rupee');
                setDiscountVal(sale.discount);
            }
            if (sale.items) {
                // Find all existing ACTIVE returns for this invoice
                const existingReturns = allReturns.filter(r =>
                    (r.invoiceNo === originalInvoiceNo || r.invoiceNumber === originalInvoiceNo)
                    && (r.status === 'ACTIVE' || !r.status) // treat legacy rows without status as ACTIVE
                );
                
                // Aggregate returned quantities by item code
                const returnedQuantities = {};
                existingReturns.forEach(ret => {
                    if (ret.items && Array.isArray(ret.items)) {
                        ret.items.forEach(item => {
                            if (!returnedQuantities[item.code]) returnedQuantities[item.code] = 0;
                            returnedQuantities[item.code] += parseFloat(item.qty) || 0;
                        });
                    }
                });

                const rows = [];
                sale.items.forEach(item => {
                    const matchedItem = allItems.find(i => String(i.code) === String(item.code)) || {};
                    const totalQty = parseFloat(item.qty) || 0;
                    const returnedQty = returnedQuantities[item.code] || 0;
                    const remainingQty = totalQty - returnedQty;

                    if (remainingQty > 0) {
                        rows.push({
                            item: { code: item.code, name: item.name, unit: item.unit, sellingTaxType: matchedItem.sellingTaxType || 'without' },
                            qty: remainingQty,
                            maxQty: remainingQty,
                            unitIndex: 0,
                            unitOptions: [{ label: item.unit, price: item.rate, isBase: true }],
                            rate: item.rate,
                            disc: item.disc || 0,
                            taxPercent: item.taxPercent || 0,
                            sellingTaxType: matchedItem.sellingTaxType || 'without'
                        });
                    }
                });
                
                if (rows.length === 0) {
                    showToast("All items for this invoice have already been fully returned.", "error");
                } else {
                    setBillingRows(rows);
                    showToast("Invoice loaded successfully!");
                }
            } else {
                showToast("Invoice loaded successfully!");
            }
        } else {
            showToast("Invoice not found.", "error");
        }
    } catch (e) {
        showToast("Error loading invoice.", "error");
    }
  };


  // Customer Modal state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState({ id: 'walk-in', name: 'Walk In Customer', mobile: '9944093468' });
  
  const searchRef = useRef(null);



  useEffect(() => {
    // Set today's date
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    setBillingDate(`${dd}/${mm}/${yyyy}`);

    // Fetch data
    Promise.all([
        fetch('http://localhost:3000/api/items').then(res => res.json()).catch(() => []),
        fetch('http://localhost:3000/api/units').then(res => res.json()).catch(() => []),
        fetch('http://localhost:3000/api/customers').then(res => res.json()).catch(() => [])
    ]).then(([items, units, customersData]) => {
        setAllItems(items);
        setAllUnits(units);
        
        const walkInSaved = (customersData || []).find(c => c.name === 'Walk In Customer' || c.id === 'walk-in');
        if (walkInSaved && !location.state?.editSale) {
            setActiveCustomer(walkInSaved);
        }

        const editSale = location.state?.editSale;
        if (editSale) {
            setReturnNumber(editSale.returnNo);
            setOriginalInvoiceNo(editSale.invoiceNo);
            setBillingDate(editSale.date);
            setActiveCustomer({
                id: editSale.customerId || 'walk-in',
                name: editSale.customerName || 'Walk In Customer',
                mobile: editSale.customerMobile || '',
                address: editSale.customerAddress || '',
                city: editSale.city || '',
                state: editSale.state || '',
                pin: editSale.pin || '',
                gstin: editSale.customerGst || ''
            });
            if (editSale.refundAmount !== undefined) {
                setManualRefundAmt(editSale.refundAmount);
            }
            if (editSale.discount) {
                setDiscountType('rupee');
                setDiscountVal(editSale.discount);
            }
            const rows = (editSale.items || []).map(item => {
                const matchedItem = items.find(i => String(i.code) === String(item.code)) || {};
                return {
                    item: { code: item.code, name: item.name, unit: item.unit, sellingTaxType: matchedItem.sellingTaxType || 'without' },
                    qty: item.qty,
                    unitIndex: 0,
                    unitOptions: [{ label: item.unit, price: item.rate, isBase: true }],
                    rate: item.rate,
                    disc: item.disc || 0,
                    taxPercent: item.taxPercent || 0,
                    sellingTaxType: matchedItem.sellingTaxType || 'without'
                };
            });
            setBillingRows(rows);
            
            // Fetch maxQty asynchronously for edit mode
            Promise.all([
                fetch('http://localhost:3000/api/sales').then(res => res.json()).catch(() => []),
                fetch('http://localhost:3000/api/sales-returns').then(res => res.json()).catch(() => [])
            ]).then(([sales, returns]) => {
                const sale = sales.find(s => s.invoiceNo === editSale.invoiceNo || s.invoiceNumber === editSale.invoiceNo);
                if (sale && sale.items) {
                    const returnedQuantities = {};
                    returns.forEach(ret => {
                        // EXCLUDE the current return we are editing
                        if ((ret.invoiceNo === editSale.invoiceNo || ret.invoiceNumber === editSale.invoiceNo) && ret.returnNo !== editSale.returnNo) {
                            (ret.items || []).forEach(item => {
                                if (!returnedQuantities[item.code]) returnedQuantities[item.code] = 0;
                                returnedQuantities[item.code] += parseFloat(item.qty) || 0;
                            });
                        }
                    });

                    setBillingRows(prevRows => prevRows.map(row => {
                        const originalItem = sale.items.find(i => String(i.code) === String(row.item.code));
                        if (originalItem) {
                            const totalQty = parseFloat(originalItem.qty) || 0;
                            const previouslyReturned = returnedQuantities[row.item.code] || 0;
                            return { ...row, maxQty: totalQty - previouslyReturned };
                        }
                        return row;
                    }));
                }
            });
        } else {
            fetch('http://localhost:3000/api/return-counter').then(res => res.json()).catch(() => ({ counter: 1 })).then(counterData => {
                setReturnNumber('RET' + String(counterData.counter || 1).padStart(3, '0'));
            });
        }
    });

    const handleClickOutside = (event) => {
        if (searchRef.current && !searchRef.current.contains(event.target)) {
            setShowSearchDropdown(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getBaseRate = (rawPrice, item) => {
    const gstStr = item.gstRate || 'none';
    const gstPercent = parseFloat(gstStr.replace(/[^0-9.]/g, '')) || 0;
    if (item.sellingTaxType === 'with' && gstPercent > 0) {
        return rawPrice - (rawPrice * (gstPercent / 100));
    }
    return rawPrice;
  };

  const calcTaxAmt = (finalAmt, taxPercent, sellingTaxType) => {
    if (taxPercent <= 0) return 0;
    if (sellingTaxType === 'with') {
        return finalAmt * (taxPercent / (100 - taxPercent));
    }
    return finalAmt * (taxPercent / 100);
  };

  const addItemByCode = (code) => {
    const item = allItems.find(i => String(i.code) === String(code));
    if (!item) return;

    const existingIndex = billingRows.findIndex(r => String(r.item.code) === String(code));
    if (existingIndex > -1) {
        const newRows = [...billingRows];
        newRows[existingIndex].qty += 1;
        setBillingRows(newRows);
        return;
    }

    const taxPercent = parseFloat(item.gstRate) || 0;
    const unitOptions = [{
        label: item.unit || 'Unit',
        price: getBaseRate(parseFloat(item.sellingPrice) || 0, item),
        isBase: true
    }];

    if (item.conversions && item.conversions.length > 0) {
        item.conversions.forEach(conv => {
            unitOptions.push({
                label: conv.unit,
                price: getBaseRate(parseFloat(conv.price) || 0, item),
                isBase: false
            });
        });
    }

    setBillingRows([...billingRows, {
        item: item,
        qty: 1,
        unitIndex: 0,
        unitOptions: unitOptions,
        rate: unitOptions[0].price,
        disc: 0,
        taxPercent: taxPercent,
        sellingTaxType: item.sellingTaxType || 'without'
    }]);
  };

  const updateRow = (index, field, value) => {
    const newRows = [...billingRows];
    
    if (field === 'qty') {
        const val = parseFloat(value) || 0;
        const max = newRows[index].maxQty;
        if (max !== undefined && val > max) {
            showToast(`Quantity cannot exceed the remaining invoice quantity (${max})`, "error");
            newRows[index][field] = max;
        } else {
            newRows[index][field] = value;
        }
    } else {
        newRows[index][field] = value;
    }
    
    if (field === 'unitIndex') {
        newRows[index].rate = newRows[index].unitOptions[value].price;
    }
    setBillingRows(newRows);
  };

  const deleteRow = (index) => {
    const newRows = [...billingRows];
    newRows.splice(index, 1);
    setBillingRows(newRows);
  };

  // Calculations
  let subTotal = 0;
  let totalTaxAmt = 0;

  billingRows.forEach(row => {
    const qty = parseFloat(row.qty) || 0;
    const rate = parseFloat(row.rate) || 0;
    const amount = qty * rate;
    const disc = parseFloat(row.disc) || 0;
    const taxPercent = parseFloat(row.taxPercent) || 0;
    const finalAmt = amount - disc;
    const taxAmt = calcTaxAmt(finalAmt, taxPercent, row.sellingTaxType);
    
    subTotal += finalAmt;
    totalTaxAmt += taxAmt;
  });

  const parsedDiscountVal = parseFloat(discountVal) || 0;
  const globalDiscountAmt = discountType === 'percent' ? subTotal * (parsedDiscountVal / 100) : parsedDiscountVal;
  const totalDiscount = globalDiscountAmt;

  if (subTotal > 0 && globalDiscountAmt > 0) {
      const discountRatio = (subTotal - globalDiscountAmt) / subTotal;
      totalTaxAmt = totalTaxAmt * discountRatio;
  }

  const afterDiscount = subTotal - totalDiscount;
  const sgst = totalTaxAmt / 2;
  const cgst = totalTaxAmt / 2;
  const total = afterDiscount + totalTaxAmt;
  const grandTotal = Math.round(total);
  const roundOff = grandTotal - total;

  // Save Functionality — Single Atomic API call
  const handleSave = async (action = 'new') => {
    if (isSubmitting) return;

    if (billingRows.length === 0) {
        showToast("Please add items to the invoice before saving.", "error");
        return;
    }
    if (!selectedInvoiceId) {
        showToast("Please load the original invoice first.", "error");
        return;
    }

    setIsSubmitting(true);

    try {
        const itemsPayload = billingRows.map(row => ({
            code: row.item.code,
            qty: parseFloat(row.qty) || 0
        }));

        const refundAmt = manualRefundAmt !== null && manualRefundAmt !== '' ? parseFloat(manualRefundAmt) : 0;

        const payload = {
            invoiceId: selectedInvoiceId,
            customerId: (activeCustomer && activeCustomer.id !== 'walk-in') ? activeCustomer.id : null,
            customerName: activeCustomer ? activeCustomer.name : 'Walk In Customer',
            date: billingDate,
            refundAmount: refundAmt,
            items: itemsPayload
        };

        const authToken = localStorage.getItem('sph_session_token');
        const saveRes = await fetch('http://localhost:3000/api/sales-returns/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
            },
            body: JSON.stringify(payload)
        });

        const resData = await saveRes.json().catch(() => ({}));

        if (!saveRes.ok) {
            throw new Error(resData.error || 'Failed to save sales return');
        }

        if (action === 'print') {
            window.print();
        }

        showToast(`Sales Return ${resData.returnNo} saved successfully!`, 'success');
        setTimeout(() => {
            if (action === 'new') {
                navigate('/sales/create', { replace: true, state: {} });
                window.location.reload();
            } else {
                navigate('/sales#salesList', { replace: true, state: {} });
                window.location.reload();
            }
        }, 1000);

    } catch (err) {
        console.error(err);
        showToast('Error saving: ' + err.message, 'error');
    } finally {
        setIsSubmitting(false);
    }
  };

  // Search Results
  const searchResults = searchQuery.length > 0 
    ? allItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(item.code).toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#F8FAFC', fontFamily: 'Manrope, sans-serif' }}>
        {/* Tabs */}
        <div className="page-tabs" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '16px', backgroundColor: '#F8F9FA', height: '45px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', height: '100%' }}>
                <div className="tab active" style={{ display: 'flex', alignItems: 'center', cursor: 'default' }}>Billing</div>
                <Link to="/sales#salesList" className="tab" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Sales List</Link>
                <Link to="/sales#customer" className="tab" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Customer</Link>
                <Link to="/sales#amountReceived" className="tab" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Amount Received</Link>
                <Link to="/sales#salesReturn" className="tab" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Sales Return</Link>
            </div>
        </div>

        <div className="billing-workspace" style={{ flex: 1, overflow: 'hidden' }}>
            {/* Left Panel: Grid & Entry */}
            <div className="billing-left-panel">
                
                {/* Top Info Bar */}
                <div className="billing-info-bar">
                    <div className="billing-screen-tab">Sales Return</div>
                    <div className="billing-info-right">
                        <div className="billing-info-item">
                            <FileText style={{ width: '16px', height: '16px', color: 'var(--primary-color)' }} />
                            <span>{returnNumber}</span>
                        </div>
                        <div className="billing-info-item">
                            <Calendar style={{ width: '16px', height: '16px', color: 'var(--primary-color)' }} />
                            <span>{billingDate}</span>
                        </div>
                    </div>
                </div>

                
                <div className="billing-search-container" style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', backgroundColor: '#F0F9FF', display: 'flex', gap: '8px' }}>
                    <input 
                        type="text" 
                        placeholder="Original Invoice No (e.g. INV001)" 
                        value={originalInvoiceNo}
                        onChange={e => setOriginalInvoiceNo(e.target.value)}
                        style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontSize: '13px', outline: 'none', flex: 1 }}
                    />
                    <button onClick={loadInvoice} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '6px', padding: '0 16px', fontWeight: '500', cursor: 'pointer' }}>Load Invoice</button>
                </div>


                {/* Billing Grid Table */}
                <div className="billing-grid-container">
                    <table className="billing-table">
                        <thead>
                            <tr>
                                <th style={{ width: '60px' }}>S. No.</th>
                                <th style={{ width: '140px' }}>Item Name</th>
                                <th style={{ width: '80px' }}>Qty</th>
                                <th style={{ width: '100px' }}>Unit</th>
                                <th style={{ width: '100px' }}>Rate</th>
                                <th style={{ width: '120px' }}>Final Amt</th>
                                <th style={{ width: '80px' }}>Tax %</th>
                                <th style={{ width: '100px' }}>Tax Amt</th>
                                <th style={{ width: '120px' }}>Total Amt</th>
                                <th style={{ width: '60px' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {billingRows.map((row, index) => {
                                const amount = row.qty * row.rate;
                                const finalAmt = amount - (parseFloat(row.disc) || 0);
                                const taxAmt = calcTaxAmt(finalAmt, row.taxPercent, row.sellingTaxType);
                                const totalAmt = finalAmt + taxAmt;

                                return (
                                    <tr key={index}>
                                        <td style={{ textAlign: 'left' }}>{index + 1}</td>
                                        <td style={{ fontWeight: '500' }}>{row.item.name}</td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="cell-input" 
                                                value={row.qty}
                                                onChange={(e) => updateRow(index, 'qty', e.target.value)}
                                                min="0"
                                            />
                                        </td>
                                        <td>
                                            {row.unitOptions.length > 1 ? (
                                                <select 
                                                    className="cell-input" 
                                                    style={{ border: 'none', background: 'transparent' }}
                                                    value={row.unitIndex}
                                                    onChange={(e) => updateRow(index, 'unitIndex', parseInt(e.target.value))}
                                                >
                                                    {row.unitOptions.map((opt, i) => (
                                                        <option key={i} value={i}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div style={{ textAlign: 'left', paddingLeft: '8px' }}>{row.unitOptions[0].label}</div>
                                            )}
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="cell-input cell-rate-input" 
                                                value={row.rate}
                                                onChange={(e) => updateRow(index, 'rate', e.target.value)}
                                                step="0.01"
                                                min="0"
                                            />
                                        </td>
                                        <td className="cell-readonly">₹{finalAmt.toFixed(2)}</td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="cell-input" 
                                                value={row.taxPercent}
                                                onChange={(e) => updateRow(index, 'taxPercent', e.target.value)}
                                                step="0.01"
                                                min="0"
                                            />
                                        </td>
                                        <td className="cell-readonly">₹{taxAmt.toFixed(2)}</td>
                                        <td className="cell-readonly">₹{totalAmt.toFixed(2)}</td>
                                        <td style={{ textAlign: 'left' }}>
                                            <button className="btn-delete-row" onClick={() => deleteRow(index)}>
                                                <Trash2 style={{ width: '16px', height: '16px' }} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right Panel: Summary */}
            <div className="billing-right-panel">
                
                {/* Customer Details */}
                <div className="summary-card">
                    <div className="summary-card-header">
                        <span className="summary-card-title">Customer Details</span>
                        <button className="btn-text-primary" onClick={() => setShowCustomerModal(true)}><Plus style={{ width: '16px', height: '16px' }} /> Add</button>
                    </div>
                    {activeCustomer ? (
                        <div className="customer-selected-state" style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>{activeCustomer.name}</span>
                                <button className="btn-text-primary" onClick={() => setShowCustomerModal(true)} style={{ fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Change</button>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span>{activeCustomer.mobile}</span>
                                {activeCustomer.gstin && <span>GSTIN: {activeCustomer.gstin}</span>}
                            </div>
                        </div>
                    ) : (
                        <div className="customer-empty-state" onClick={() => setShowCustomerModal(true)} style={{ cursor: 'pointer' }}>
                            <PlusSquare style={{ width: '16px', height: '16px', color: 'var(--primary-color)' }} />
                            <span>Click here to add customer</span>
                        </div>
                    )}
                </div>

                {/* Price Summary */}
                <div className="summary-card">
                    <div 
                        className="summary-card-header" 
                        style={{ borderBottom: 'none', paddingBottom: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
                        onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    >
                        <span className="summary-card-title">Price Summary</span>
                        <button style={{ background: '#000B58', border: 'none', width: '20px', height: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, color: 'white' }}>
                            {isSummaryExpanded ? <span style={{fontSize: '16px', fontWeight: 'bold'}}>-</span> : <Plus style={{ width: '14px', height: '14px', strokeWidth: 3 }} />}
                        </button>
                    </div>
                    <div className={`price-summary-body ${isSummaryExpanded ? 'expanded' : ''}`}>
                        <div style={{ display: isSummaryExpanded ? 'flex' : 'none', flexDirection: 'column', gap: '4px' }}>
                            <div className="summary-row">
                                <span>Sub Total</span>
                                <span>₹{subTotal.toFixed(2)}</span>
                            </div>
                            <div className="summary-row">
                                <span>Discount</span>
                                <span>₹{totalDiscount.toFixed(2)}</span>
                            </div>
                            <div className="summary-row">
                                <span>After Discount</span>
                                <span>₹{afterDiscount.toFixed(2)}</span>
                            </div>
                            <div className="summary-row">
                                <span>SGST</span>
                                <span>₹{sgst.toFixed(2)}</span>
                            </div>
                            <div className="summary-row">
                                <span>CGST</span>
                                <span>₹{cgst.toFixed(2)}</span>
                            </div>
                            <div className="summary-row">
                                <span>Total</span>
                                <span>₹{total.toFixed(2)}</span>
                            </div>
                            <div className="summary-row">
                                <span>Round Off</span>
                                <span>{roundOff >= 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="summary-row grand-total-row">
                            <span>Grand Total</span>
                            <span>₹{grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Discount & Other Charges */}
                <div className="summary-card">
                    <div className="summary-card-header" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
                        <span className="summary-card-title">Discount & Other Charges</span>
                    </div>
                    <div style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <CustomSelect 
                                value={discountType}
                                onChange={(val) => setDiscountType(val)}
                                options={[
                                    { value: 'rupee', label: '₹' },
                                    { value: 'percent', label: '%' }
                                ]}
                                width="80px"
                                height="38px"
                            />
                            <input 
                                type="number" 
                                placeholder="0" 
                                min="0" 
                                value={discountVal === 0 ? '' : discountVal} 
                                onChange={(e) => setDiscountVal(e.target.value)}
                                style={{ flex: 1, height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', outline: 'none', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} 
                            />
                        </div>
                    </div>
                </div>

                {/* Refund Given (Cash/Bank Out) */}
                <div className="summary-card">
                    <div className="summary-card-header" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
                        <span className="summary-card-title">Refund Given (Cash/Bank Out)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '12px', fontSize: '13px', color: 'var(--text-main)', fontWeight: '500' }}>₹</span>
                                <input 
                                    type="number" 
                                    placeholder="0"
                                    value={manualRefundAmt !== null ? manualRefundAmt : ''} 
                                    onChange={(e) => setManualRefundAmt(e.target.value)}
                                    style={{ height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px 0 28px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%', background: 'white' }} 
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Footer Actions */}
        <div className="billing-footer">
            <div className="footer-left">
                <button className="btn-billing-outline">
                    <PlusSquare style={{ width: '16px', height: '16px' }} /> Add Items
                </button>
                <button className="btn-billing-outline" onClick={() => {
                    setBillingRows([]);
                    setManualRefundAmt(null);
                }}>
                    <XSquare style={{ width: '16px', height: '16px' }} /> Clear All
                </button>
                <button className="btn-billing-outline">
                    <PauseCircle style={{ width: '16px', height: '16px' }} /> Hold Bill
                </button>
                <button className="btn-billing-outline" onClick={() => navigate('/sales/create')} style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}>
                    <FileText style={{ width: '16px', height: '16px' }} /> Sale Invoice
                </button>
                
            </div>
            <div className="footer-right">
                <button className="btn-billing-primary" onClick={() => handleSave('new')} disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save & New'}
                </button>
                <button className="btn-billing-secondary" onClick={() => handleSave('print')} disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save & Print'}
                </button>
            </div>
        </div>

        {/* Customer Modal */}
        {showCustomerModal && (
            <CustomerModal 
                onClose={() => setShowCustomerModal(false)} 
                onSelect={(customer) => {
                    setActiveCustomer(customer);
                    setShowCustomerModal(false);
                }} 
            />
        )}

        {/* Barcode Scanner Modal */}
        {showScanner && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Scan Tag</h3>
                        <X style={{ cursor: 'pointer', width: '20px', height: '20px' }} onClick={stopScanner} />
                    </div>
                    <div id="billing-qr-reader" style={{ width: '100%', minHeight: '300px', backgroundColor: '#F3F4F6', borderRadius: '8px', overflow: 'hidden' }}></div>
                    <div style={{ textAlign: 'center', marginTop: '16px' }}>
                        <button onClick={stopScanner} style={{ padding: '10px 24px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* Toast */}
        {toast && (
            <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                {toast.msg}
            </div>
        )}
    </div>
  );
}
