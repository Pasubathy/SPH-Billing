import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Trash2, FileText, Calendar, Scan, PlusSquare, XSquare, PauseCircle, XCircle, ChevronDown, ChevronUp, X, Check } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import CustomSelect from '../components/CustomSelect';
import CustomerModal from '../components/CustomerModal';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function CreateSalesInvoice() {
  const navigate = useNavigate();
  const location = useLocation();

  // State for loaded data
  const [allItems, setAllItems] = useState([]);
  const [allUnits, setAllUnits] = useState([]);
  // Note: salesReturns fetch removed — store credit now read from customers.storeCreditBalance
  
  // State for invoice
  const [invoiceNumber, setInvoiceNumber] = useState('INV001');
  const [billingDate, setBillingDate] = useState('');
  
  // State for billing workspace
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [billingRows, setBillingRows] = useState([]);
  const [discountType, setDiscountType] = useState('rupee'); // 'rupee' or 'percent'
  const [discountVal, setDiscountVal] = useState(0);
  const [applyCredit, setApplyCredit] = useState(false);
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
  };// Received Amount state
  const [manualReceivedAmt, setManualReceivedAmt] = useState(null);

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

    // Fetch data (sales-returns fetch removed — credit now from customers.storeCreditBalance)
    Promise.all([
        fetch('http://localhost:3000/api/items').then(res => res.json()).catch(() => []),
        fetch('http://localhost:3000/api/units').then(res => res.json()).catch(() => []),
        fetch('http://localhost:3000/api/customers').then(res => res.json()).catch(() => [])
    ]).then(([items, units, customersData]) => {
        setAllItems(items);
        setAllUnits(units);
        
        const walkInSaved = (customersData || []).find(c => c.name === 'Walk In Customer' || c.id === 'walk-in');
        if (walkInSaved) {
            setActiveCustomer(walkInSaved);
        }

        fetch('http://localhost:3000/api/invoice-counter').then(res => res.json()).catch(() => ({ counter: 1 })).then(counterData => {
            setInvoiceNumber('INV' + String(counterData.counter || 1).padStart(3, '0'));
        });
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
    newRows[index][field] = value;
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
  
  // Available credit now comes from the persistent store_credit_balance on the customer record.
  // The old mechanism (summing sales_returns.storeCredit by name match) has been replaced.
  // store_credit_balance is returned by GET /api/customers as "storeCreditBalance".
  const availableCredit = (() => {
      if (!activeCustomer || !activeCustomer.id || activeCustomer.id === 'walk-in') return 0;
      return parseFloat(activeCustomer.storeCreditBalance || activeCustomer.store_credit_balance || 0);
  })();
  
  const appliedCreditAmt = (applyCredit && activeCustomer) ? availableCredit : 0;
  
  const grandTotal = Math.max(0, Math.round(total - appliedCreditAmt));
  const roundOff = grandTotal - (total - appliedCreditAmt);


  // Submit Lock State to Prevent Double-Submissions
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Save Functionality (Atomic API Transaction)
  const handleSave = async (action = 'new') => {
    if (isSubmitting) return;

    if (billingRows.length === 0) {
        showToast("Please add items to the invoice before saving.", "error");
        return;
    }

    setIsSubmitting(true);

    try {
        const itemsPayload = billingRows.map(row => ({
            code: row.item.code,
            name: row.item.name,
            qty: row.qty,
            unit: row.unitOptions[row.unitIndex]?.label || row.item.unit,
            rate: row.rate,
            disc: row.disc || 0,
            taxPercent: row.taxPercent || 0,
            taxAmount: calcTaxAmt(row.qty * row.rate - (row.disc || 0), row.taxPercent, row.sellingTaxType)
        }));

        const payload = {
            date: billingDate,
            refNo: '',
            dueDate: null,
            paymentTerms: '',
            customerId: (activeCustomer && activeCustomer.id !== 'walk-in') ? activeCustomer.id : null,
            customerName: activeCustomer ? activeCustomer.name : 'Walk In Customer',
            customerMobile: activeCustomer ? activeCustomer.mobile : '',
            customerAddress: activeCustomer ? (activeCustomer.address || activeCustomer.billingAddress || '') : '',
            city: activeCustomer ? (activeCustomer.city || '') : '',
            state: activeCustomer ? (activeCustomer.state || '') : '',
            pin: activeCustomer ? (activeCustomer.pin || activeCustomer.pincode || '') : '',
            customerGst: activeCustomer ? activeCustomer.gstin : '',
            subTotal: subTotal,
            discount: totalDiscount,
            taxAmount: totalTaxAmt,
            grandTotal: grandTotal,
            receivedAmount: (() => {
                const enteredAmt = manualReceivedAmt !== null && manualReceivedAmt !== '' ? parseFloat(manualReceivedAmt) : grandTotal;
                return enteredAmt > grandTotal ? grandTotal : enteredAmt;
            })(),
            items: itemsPayload,
            manualInvoiceNumber: null,
            // Store Credit: send apply-intent and advisory amount; backend validates from DB
            applyStoreCredit: applyCredit && (activeCustomer?.id !== 'walk-in') ? true : false,
            requestedCredit: applyCredit ? appliedCreditAmt : 0
        };

        const targetEndpoint = 'http://localhost:3000/api/sales/create';

        const saveRes = await fetch(targetEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resData = await saveRes.json().catch(() => ({}));

        if (!saveRes.ok || !resData.success) {
            throw new Error(resData.error || "Failed to save sales invoice");
        }

        if (action === 'print') {
            window.print();
        }

        showToast("Sales Invoice saved successfully!", "success");
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
        console.error("Sales Invoice Save Error:", err);
        showToast(err.message || "Error saving invoice", "error");
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

        <div className="pos-workspace">
            {/* Left Pane: Search, Customer, Product Grid */}
            <div className="pos-left-pane">
                {/* Top Info Bar & Customer */}
                <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-main)' }}>Screen 1</div>
                    <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileText style={{ width: '14px', height: '14px', color: 'var(--primary-color)' }} />
                            <span>{invoiceNumber}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar style={{ width: '14px', height: '14px', color: 'var(--primary-color)' }} />
                            <span>{billingDate}</span>
                        </div>
                    </div>
                </div>

                <div style={{ backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', padding: '12px 16px' }}>
                    {activeCustomer ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setShowCustomerModal(true)}>
                                <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '14px' }}>{activeCustomer.name}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{activeCustomer.mobile}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Credit: <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>₹{availableCredit.toFixed(2)}</span>
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="checkbox" id="applyCredit" checked={applyCredit} onChange={(e) => setApplyCredit(e.target.checked)} style={{ cursor: 'pointer' }} />
                                    <label htmlFor="applyCredit" style={{ fontSize: '11px', color: 'var(--text-main)', cursor: 'pointer' }}>Apply</label>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div onClick={() => setShowCustomerModal(true)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: 'var(--primary-color)', gap: '8px', fontSize: '14px', padding: '6px 0' }}>
                            <PlusSquare style={{ width: '16px', height: '16px' }} />
                            <span>Click here to add customer</span>
                        </div>
                    )}
                </div>

                {/* Search Bar */}
                <div className="pos-search-bar" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="billing-search-group" style={{ flex: 1, borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                        <div className="billing-search-input-wrapper">
                            <input 
                                type="text" 
                                className="billing-search-input" 
                                placeholder="Search by Code, Item Name" 
                                autoComplete="off" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button className="billing-barcode-btn" onClick={startScanner} style={{ borderLeft: '1px solid var(--border-color)', background: '#F8FAFC' }}>
                            <Scan style={{ width: '18px', height: '18px', marginRight: '8px', strokeWidth: '2.2', color: 'var(--text-main)' }} />
                            <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>Scan Tag</span>
                        </button>
                    </div>
                </div>

                {/* Product Grid */}
                <div className="pos-product-grid">
                    {allItems
                        .filter(item => 
                            searchQuery === '' || 
                            item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            String(item.code).toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((item, idx) => {
                            const isAdded = billingRows.some(row => row.item.code === item.code);
                            return (
                                <div key={idx} className="pos-product-card" onClick={() => addItemByCode(item.code)}>
                                    <div className="pos-product-image-container">
                                        {item.images && item.images.length > 0 ? (
                                            <img src={item.images[0]} alt={item.name} className="pos-product-image" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                                        ) : null}
                                        <div className="pos-product-image-placeholder" style={{ display: (item.images && item.images.length > 0) ? 'none' : 'block' }}>
                                            {item.name ? item.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                    </div>
                                    <div className="pos-product-details">
                                        <div className="pos-product-code">{item.code}</div>
                                        <div className="pos-product-name">{item.name}</div>
                                        <div className="pos-product-unit-price">
                                            ₹{parseFloat(item.sellingPrice || 0).toFixed(2)} / {item.unit || 'Kg'}
                                        </div>
                                        <div className="pos-product-price">₹{parseFloat(item.sellingPrice || 0).toFixed(2)}</div>
                                    </div>
                                    {isAdded && (
                                        <div className="pos-product-added-icon">
                                            <Check style={{ width: '10px', height: '10px', strokeWidth: 3 }} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
            </div>

            {/* Right Pane: Cart & Checkout */}
            <div className="pos-right-pane">

                {/* Cart Table */}
                <div className="pos-cart-container">
                    <table className="pos-cart-table">
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left' }}>Item Name</th>
                                <th style={{ width: '60px', textAlign: 'center' }}>Qty</th>
                                <th style={{ width: '70px', textAlign: 'center' }}>Unit</th>
                                <th style={{ width: '80px', textAlign: 'right' }}>Rate</th>
                                <th style={{ width: '80px', textAlign: 'right' }}>Amt</th>
                                <th style={{ width: '70px', textAlign: 'right' }}>Tax %</th>
                                <th style={{ width: '90px', textAlign: 'right' }}>Tot Amt</th>
                                <th style={{ width: '40px', textAlign: 'center' }}></th>
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
                                        <td>
                                            <div className="pos-cart-item-name">{row.item.name}</div>
                                            <div className="pos-cart-item-desc" style={{ color: 'var(--text-muted)' }}>{row.item.code}</div>
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="cell-input pos-transparent-input" 
                                                value={row.qty}
                                                onChange={(e) => updateRow(index, 'qty', e.target.value)}
                                                min="0"
                                                style={{ textAlign: 'center' }}
                                            />
                                        </td>
                                        <td>
                                            {row.unitOptions.length > 1 ? (
                                                <select 
                                                    className="cell-input pos-transparent-input"
                                                    value={row.unitIndex}
                                                    onChange={(e) => updateRow(index, 'unitIndex', parseInt(e.target.value))}
                                                    style={{ textAlignLast: 'center', appearance: 'auto' }}
                                                >
                                                    {row.unitOptions.map((u, i) => (
                                                        <option key={i} value={i}>{u.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-main)' }}>
                                                    {row.unitOptions[0]?.label}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                                <span style={{ fontSize: '13px', color: 'var(--text-main)', marginRight: '4px' }}>₹</span>
                                                <input 
                                                    type="number" 
                                                    className="cell-input pos-transparent-input" 
                                                    value={row.rate}
                                                    onChange={(e) => updateRow(index, 'rate', e.target.value)}
                                                    min="0"
                                                    style={{ textAlign: 'right' }}
                                                />
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-main)' }}>₹{finalAmt.toFixed(2)}</td>
                                        <td style={{ textAlign: 'right', fontSize: '12px', width: '80px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
                                                <input 
                                                    type="number" 
                                                    className="cell-input pos-transparent-input" 
                                                    value={row.taxPercent}
                                                    onChange={(e) => updateRow(index, 'taxPercent', e.target.value)}
                                                    min="0"
                                                    style={{ textAlign: 'right', paddingRight: '16px' }}
                                                />
                                                <span style={{ position: 'absolute', right: '8px', pointerEvents: 'none', color: 'var(--text-main)', fontSize: '13px' }}>%</span>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', marginTop: '2px', paddingRight: '8px' }}>₹{taxAmt.toFixed(2)}</div>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: '600', fontSize: '13px', color: 'var(--text-main)' }}>₹{totalAmt.toFixed(2)}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button className="btn-delete-row" onClick={() => deleteRow(index)} style={{ margin: '0 auto', color: '#EF4444' }}>
                                                <Trash2 style={{ width: '16px', height: '16px' }} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {billingRows.length === 0 && (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                                        Cart is empty
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                          {/* Glassmorphic Summary */}
                <div className="pos-summary-section">
                    {/* Expand/Collapse Line Button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, right: 0, height: '1px', backgroundColor: 'var(--border-color)', zIndex: 1 }} />
                        <button 
                            type="button"
                            onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                            style={{ 
                                position: 'relative', 
                                zIndex: 2, 
                                width: '28px', 
                                height: '28px', 
                                borderRadius: '50%', 
                                border: '1px solid var(--border-color)', 
                                backgroundColor: 'white', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                color: 'var(--text-muted)',
                                outline: 'none'
                            }}
                        >
                            {isSummaryExpanded ? (
                                <ChevronUp style={{ width: '16px', height: '16px' }} />
                            ) : (
                                <ChevronDown style={{ width: '16px', height: '16px' }} />
                            )}
                        </button>
                    </div>
                                  {isSummaryExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px', paddingLeft: '16px', paddingRight: '16px' }}>
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
                            {totalTaxAmt > 0 && (
                                <>
                                    <div className="summary-row">
                                        <span>SGST {((billingRows[0]?.taxPercent || 0) / 2).toFixed(1).replace(/\.0$/, '')}%  - ₹</span>
                                        <span>₹{(totalTaxAmt / 2).toFixed(2)}</span>
                                    </div>
                                    <div className="summary-row">
                                        <span>CGST {((billingRows[0]?.taxPercent || 0) / 2).toFixed(1).replace(/\.0$/, '')}%</span>
                                        <span>₹{(totalTaxAmt / 2).toFixed(2)}</span>
                                    </div>
                                </>
                            )}
                            <div className="summary-row">
                                <span>Total</span>
                                <span>₹{total.toFixed(2)}</span>
                            </div>
                            {applyCredit && activeCustomer && (
                                <div className="summary-row">
                                    <span>Credit Applied</span>
                                    <span style={{ color: 'var(--primary-color)', fontWeight: '600' }}>-₹{appliedCreditAmt.toFixed(2)}</span>
                                </div>
                            )}
                            {roundOff !== 0 && (
                                <div className="summary-row">
                                    <span>Round Off</span>
                                    <span>₹{roundOff.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="summary-row grand-total-row" style={{ marginTop: '4px', paddingTop: '8px', paddingLeft: '16px', paddingRight: '16px', borderTop: isSummaryExpanded ? '1px dashed var(--border-color)' : 'none' }}>
                        <span>Grand Total</span>
                        <span style={{ color: '#000B58', fontWeight: '700', fontSize: '18px' }}>₹{grandTotal.toFixed(2)}</span>
                    </div>

                    {/* Bottom Inputs Row: Discount & Amount Received */}
                    <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid var(--border-color)', padding: '16px 16px' }}>
                        {/* Discount Column */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}>Discount</span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <CustomSelect 
                                    value={discountType}
                                    onChange={(val) => setDiscountType(val)}
                                    options={[
                                        { value: 'rupee', label: '₹' },
                                        { value: 'percent', label: '%' }
                                    ]}
                                    width="60px"
                                    height="38px"
                                />
                                <input 
                                    type="number" 
                                    placeholder="0" 
                                    min="0" 
                                    value={discountVal === 0 ? '' : discountVal} 
                                    onChange={(e) => setDiscountVal(e.target.value)}
                                    style={{ flex: 1, height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#F4F4F5' }} 
                                />
                            </div>
                        </div>

                        {/* Amount Received Column */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}>Amount Received</span>
                                {manualReceivedAmt !== null && manualReceivedAmt !== '' && (() => {
                                    const enteredVal = parseFloat(manualReceivedAmt) || 0;
                                    if (enteredVal > grandTotal) {
                                        return (
                                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#EF4444' }}>
                                                Return : {(enteredVal - grandTotal).toFixed(2)}
                                            </span>
                                        );
                                    } else if (enteredVal < grandTotal) {
                                        return (
                                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#EF4444' }}>
                                                Pending : {(grandTotal - enteredVal).toFixed(2)}
                                            </span>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '12px', fontSize: '14px', color: 'var(--text-muted)' }}>₹</span>
                                <input 
                                    type="number" 
                                    placeholder="0"
                                    value={manualReceivedAmt !== null ? manualReceivedAmt : ''} 
                                    onChange={(e) => setManualReceivedAmt(e.target.value)}
                                    style={{ width: '100%', height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px 0 28px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#F4F4F5' }} 
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
                    setManualReceivedAmt(null);
                }}>
                    <XSquare style={{ width: '16px', height: '16px' }} /> Clear All
                </button>
                <button className="btn-billing-outline">
                    <PauseCircle style={{ width: '16px', height: '16px' }} /> Hold Bill
                </button>
                <button className="btn-billing-outline" onClick={() => navigate('/sales/return/create')}><XCircle style={{ width: '16px', height: '16px' }} /> Sale Return</button>
            </div>
            <div className="footer-right">
                <button className="btn-billing-primary" disabled={isSubmitting} onClick={() => handleSave('new')}>
                    {isSubmitting ? 'Saving...' : 'Save & New'}
                </button>
                <button className="btn-billing-secondary" disabled={isSubmitting} onClick={() => handleSave('print')}>
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
