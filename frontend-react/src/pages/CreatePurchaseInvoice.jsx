import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Sparkles, ChevronDown, Scan, Upload, FileText, Camera, Image as ImageIcon, X, Trash2 } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';
import { Html5Qrcode } from 'html5-qrcode';
import '../assets/css/sales.css';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const textAreaStyle = { ...inputStyle, minHeight: '60px', paddingTop: '10px', resize: 'none' };

export default function CreatePurchaseInvoice() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalItems, setOriginalItems] = useState([]);

  // Basic Form State
  const [piNo, setPiNo] = useState('PI-001');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [vendorsList, setVendorsList] = useState([]);
  const [vendor, setVendor] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState(null); // Stable vendor PK — null means new vendor
  const [refNo, setRefNo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('None');
  const [gstinNo, setGstinNo] = useState('');
  const [panNo, setPanNo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [billAddress, setBillAddress] = useState('');
  const [billCity, setBillCity] = useState('');
  const [billState, setBillState] = useState('');
  const [billPincode, setBillPincode] = useState('');
  const [shipAddress, setShipAddress] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipPincode, setShipPincode] = useState('');

  // Item List State
  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [unitsList, setUnitsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef(null);
  const [activeDropdownRow, setActiveDropdownRow] = useState(null);
  
  const [showScanner, setShowScanner] = useState(false);
  const html5QrCodeRef = useRef(null);

  const [paidAmount, setPaidAmount] = useState('0');
  const [piNote, setPiNote] = useState('');

  // AI Modal & Loading
  const [showAiModal, setShowAiModal] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // Summary State (derived or explicitly set by AI)
  const [subTotal, setSubTotal] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);

  
  useEffect(() => {
    if (location.state?.editMode && location.state?.invoiceData) {
        const data = location.state.invoiceData;
        setPiNo(data.piNo || data.pi_no || '');
        setPurchaseDate(data.date || '');
        
        setSelectedVendorId(data.vendorId || data.vendor_id || null);
        setVendor(data.vendorName || data.vendor_name || '');
        setRefNo(data.refNo || data.ref_no || '');
        setPaymentTerms(data.paymentTerms || data.payment_terms || 'None');
        setDueDate(data.dueDate || data.due_date || '');
        
        const parsedItems = typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || []);
        setItems(parsedItems.map(it => ({
            code: it.code || '',
            name: it.name || 'Unknown Item',
            hsn: it.hsn || '',
            qty: parseFloat(it.qty) || 1,
            unit: it.unit || 'Nos',
            rate: parseFloat(it.rate) || 0,
            amount: (parseFloat(it.qty) || 1) * (parseFloat(it.rate) || 0),
            discount: parseFloat(it.disc || it.discount) || 0,
            tax: parseFloat(it.taxPercent || it.tax) || 0,
            isNew: false
        })));
        
        setPaidAmount(data.paidAmount || data.paid_amount || 0);
        setDiscountAmount(data.discountAmount || data.discount_amount || 0);
        setPiNote(data.note || '');
    }
  }, [location]);

  useEffect(() => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => setVendorsList(data || []))
      .catch(err => console.error('Failed to fetch vendors:', err));
      
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setAllItems(data || []))
      .catch(err => console.error('Failed to fetch items:', err));

    fetch('/api/units')
      .then(res => res.json())
      .then(data => setUnitsList(data || []))
      .catch(err => console.error('Failed to fetch units:', err));

    const handleClickOutside = (event) => {
        if (searchRef.current && !searchRef.current.contains(event.target)) {
            setShowSearchDropdown(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetch('/api/purchase-invoices')
      .then(res => res.json())
      .then(data => {
         const nextNum = (data || []).length + 1;
         setPiNo('PI-' + String(nextNum).padStart(3, '0'));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let sub = 0;
    let tax = 0;
    items.forEach(item => {
      const amt = (parseFloat(item.rate) || 0) * (parseFloat(item.qty) || 0);
      const finalAmt = amt - (parseFloat(item.discount) || 0);
      sub += finalAmt;
      tax += finalAmt * ((parseFloat(item.tax) || 0) / 100);
    });
    setSubTotal(sub);
    setTaxAmount(tax);
  }, [items]);

  const handleVendorSelect = (val) => {
    // val is now vendor ID (stable PK) for existing vendors
    const selectedV = vendorsList.find(v => v.id === val);
    if (selectedV) {
      // Existing vendor selected — store stable ID and display name separately
      setSelectedVendorId(selectedV.id);
      setVendor(selectedV.vendorName);
      setGstinNo(selectedV.gstin || selectedV.gstIn || '');
      setPanNo(selectedV.panNumber || selectedV.pan || '');
      setBillAddress(selectedV.billAddress || selectedV.address || '');
      setBillCity(selectedV.billCity || selectedV.city || '');
      setBillState(selectedV.billState || selectedV.state || '');
      setBillPincode(selectedV.billPinCode || selectedV.pin || '');
      setShipAddress(selectedV.shipAddress || '');
      setShipCity(selectedV.shipCity || '');
      setShipState(selectedV.shipState || '');
      setShipPincode(selectedV.shipPinCode || '');
    } else {
      // New vendor typed manually — clear vendor ID so backend creates a new record
      setSelectedVendorId(null);
      setVendor(val);
      setGstinNo('');
      setPanNo('');
      setBillAddress('');
      setBillCity('');
      setBillState('');
      setBillPincode('');
      setShipAddress('');
      setShipCity('');
      setShipState('');
      setShipPincode('');
    }
  };

  // Double-submit protection state
  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveInvoice = async (stayOnPage = false) => {
    if (isSubmitting) return;

    if (!piNo || !vendor) {
      showToast("PI No and Vendor are required", "error");
      return;
    }

    if (items.length === 0) {
      showToast("Please add items to the invoice before saving.", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const exactTotal = subTotal - discountAmount + taxAmount;
      const calculatedGrandTotal = Math.round(exactTotal);
      const parsedPaid = parseFloat(paidAmount) || 0;

      const payload = {
        date: purchaseDate,
        refNo: refNo,
        dueDate: dueDate,
        paymentTerms: paymentTerms,
        vendorId: selectedVendorId || null, // Stable PK — null means new vendor
        vendorName: vendor,
        gstinNo: gstinNo,
        panNo: panNo,
        billAddress: billAddress,
        billCity: billCity,
        billState: billState,
        billPincode: billPincode,
        shipAddress: shipAddress,
        shipCity: shipCity,
        shipState: shipState,
        shipPincode: shipPincode,
        subTotal: subTotal,
        discount: discountAmount,
        taxAmount: taxAmount,
        grandTotal: calculatedGrandTotal,
        paidAmount: parsedPaid,
        items: items,
        manualPiNumber: null,
        updatedAt: location.state?.editMode ? location.state.invoiceData.updated_at : undefined
      };

      const targetEndpoint = location.state?.editMode ? `/api/purchases/${location.state.invoiceData.id}` : '/api/purchases/create';
      const method = location.state?.editMode ? 'PUT' : 'POST';

      const saveRes = await fetch(targetEndpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await saveRes.json().catch(() => ({}));

      if (!saveRes.ok || !resData.success) {
          throw new Error(resData.error || "Failed to save purchase invoice");
      }

      showToast("Purchase Invoice saved successfully!", "success");

      setTimeout(() => {
          if (stayOnPage) {
              window.location.reload();
          } else {
              navigate('/purchase-invoice');
          }
      }, 1000);

    } catch (err) {
      console.error("Purchase Save Error:", err);
      alert("Error saving: " + err.message);
      setIsSubmitting(false);
    }
  };


  const processAiFile = async (file) => {
    setShowAiModal(false);
    setIsAiLoading(true);

    const formData = new FormData();
    formData.append('invoiceFile', file);

    try {
      const res = await fetch('/api/ai/extract-invoice', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      
      if (!result.success) {
        alert('AI Extraction Failed: ' + (result.error || 'Unknown error'));
        setIsAiLoading(false);
        return;
      }

      const data = result.data;

      // Populate Form
      if (data.invoice) {
        if (data.invoice.invoiceNo) setRefNo(data.invoice.invoiceNo);
        if (data.invoice.invoiceDate) setPurchaseDate(data.invoice.invoiceDate);
        if (data.invoice.dueDate) setDueDate(data.invoice.dueDate);
      }

      if (data.vendor && data.vendor.name) {
        // Since we don't have the vendor list fetched here, we just put the name in the dropdown component as a custom option
        setVendor(data.vendor.name);
        if (data.vendor.address) setBillAddress(data.vendor.address);
        if (data.vendor.gstin) setGstinNo(data.vendor.gstin);
      }

      if (data.items && Array.isArray(data.items)) {
        const newItems = data.items.map((aiItem, index) => ({
          sNo: index + 1,
          name: aiItem.name || 'Unknown Item',
          hsn: aiItem.hsn || '',
          qty: aiItem.qty || 1,
          unit: aiItem.unit || 'Nos',
          rate: aiItem.rate || 0,
          amount: (aiItem.qty || 1) * (aiItem.rate || 0),
          discount: aiItem.discount || 0,
          tax: aiItem.taxPercent || 0,
          isNew: true // Flag to show it was extracted
        }));
        setItems(newItems);
      }

      if (data.summary && data.summary.discount) {
        setDiscountAmount(parseFloat(data.summary.discount));
      }

    } catch (e) {
      console.error('AI Processing error:', e);
      alert('Failed to process invoice with AI. Ensure backend and API key are configured.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processAiFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const triggerPdfUpload = () => fileInputRef.current && fileInputRef.current.click();
  const triggerImageUpload = () => imageInputRef.current && imageInputRef.current.click();

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
  };

  const addItemByCode = (code) => {
    const item = allItems.find(i => String(i.code) === String(code));
    if (!item) return;

    const existingIndex = items.findIndex(r => String(r.code) === String(code) || String(r.name) === String(item.name));
    if (existingIndex > -1) {
        const newItems = [...items];
        newItems[existingIndex].qty += 1;
        setItems(newItems);
        setShowSearchDropdown(false);
        setSearchQuery('');
        return;
    }

    const newItem = {
      code: item.code,
      sNo: items.length + 1,
      name: item.name || 'Unknown Item',
      hsn: item.hsn || '',
      qty: 1,
      unit: item.unit || 'Nos',
      rate: item.purchaseAmount || 0,
      amount: item.purchaseAmount || 0,
      discount: 0,
      tax: parseFloat(item.gstRate) || 0,
      isNew: false
    };

    setItems([...items, newItem]);
    setShowSearchDropdown(false);
    setSearchQuery('');
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const deleteItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const searchResults = searchQuery.length > 0 
    ? allItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(item.code).toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  // Summary Calc
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
      <div className="page-header" style={{ height: '45px', padding: '0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>{isEditMode ? 'Edit Purchase Invoice' : 'Create Purchase Invoice'}</h1>
        <button onClick={() => setShowAiModal(true)} style={{ height: '28px', padding: '0 12px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#F3F0FF', color: '#4338CA', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '500' }}>
          <Sparkles size={14} /> Generate with AI
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: '100px', background: '#F8FAFC' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Vendor Details */}
          <div className="create-card">
            <div className="create-card-title">Vendor Details</div>
            <div className="create-card-body" style={{ padding: '16px' }}>
              <div className="responsive-grid">
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>PI No <span style={{ color: 'red' }}>*</span></label>
                  <input type="text" style={{ ...inputStyle, background: '#F8FAFC' }} readOnly value={piNo} />
                </div>
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Purchase Date <span style={{ color: 'red' }}>*</span></label>
                  <CustomDatePicker style={inputStyle} value={purchaseDate} onChange={(val) => setPurchaseDate(val)} />
                </div>
                <div style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Vendor Name <span style={{ color: 'red' }}>*</span>
                    {vendor && !selectedVendorId && (
                        <span style={{ fontSize: '10px', color: '#B45309', background: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>New Vendor</span>
                    )}
                  </label>
                  <CustomSelect 
                    value={selectedVendorId || ''} 
                    onChange={handleVendorSelect} 
                    placeholder="Select Vendor"
                    options={[
                      ...vendorsList.map(v => ({ value: v.id, label: v.vendorName })),
                    ]}
                  />
                </div>

                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Ref No</label>
                  <input type="text" style={inputStyle} value={refNo} onChange={(e) => setRefNo(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Payments Terms</label>
                  <CustomSelect value={paymentTerms} onChange={setPaymentTerms} options={[
                    { value: 'None', label: 'None' },
                    { value: '10 days', label: '10 days' },
                    { value: '15 days', label: '15 days' },
                    { value: '30 days', label: '30 days' },
                    { value: '45 days', label: '45 days' }
                  ]} />
                </div>
                <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>GSTIN No</label>
                  <input type="text" style={{ ...inputStyle, textTransform: 'uppercase' }} value={gstinNo} onChange={(e) => setGstinNo(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>PAN No</label>
                  <input type="text" style={{ ...inputStyle, textTransform: 'uppercase' }} value={panNo} onChange={(e) => setPanNo(e.target.value)} />
                </div>

                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Due Date</label>
                  <CustomDatePicker style={inputStyle} value={dueDate} onChange={(val) => setDueDate(val)} />
                </div>
                <div style={{ gridColumn: 'span 2' }}></div>
                <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Bill Address</label>
                  <input type="text" style={inputStyle} value={billAddress} onChange={(e) => setBillAddress(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Ship Address</label>
                  <input type="text" style={inputStyle} value={shipAddress} onChange={(e) => setShipAddress(e.target.value)} />
                </div>
                
                <div style={{ gridColumn: 'span 4' }}></div>
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Bill City</label>
                  <input type="text" style={inputStyle} value={billCity} onChange={(e) => setBillCity(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Bill State</label>
                  <input type="text" style={inputStyle} value={billState} onChange={(e) => setBillState(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Bill Pin</label>
                  <input type="text" style={inputStyle} value={billPincode} onChange={(e) => setBillPincode(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Ship City</label>
                  <input type="text" style={inputStyle} value={shipCity} onChange={(e) => setShipCity(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Ship State</label>
                  <input type="text" style={inputStyle} value={shipState} onChange={(e) => setShipState(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500' }}>Ship Pin</label>
                  <input type="text" style={inputStyle} value={shipPincode} onChange={(e) => setShipPincode(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Item Details */}
          <div className="create-card">
            <div className="create-card-title">Item Details</div>
            <div className="create-card-body" style={{ padding: '16px' }}>
              
                <div className="billing-search-container" style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div className="billing-search-group">
                        <div className="billing-search-input-wrapper" ref={searchRef}>
                            <input 
                                type="text" 
                                className="billing-search-input" 
                                placeholder="Search by Code, Item Name" 
                                autoComplete="off" 
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setShowSearchDropdown(true);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && searchResults.length > 0) {
                                        addItemByCode(searchResults[0].code);
                                        setSearchQuery('');
                                        setShowSearchDropdown(false);
                                    }
                                }}
                            />
                            {showSearchDropdown && searchResults.length > 0 && (
                                <div className="billing-search-dropdown show">
                                    {searchResults.map((item, idx) => (
                                        <div 
                                            key={idx} 
                                            className="billing-search-dropdown-item" 
                                            onClick={() => {
                                                addItemByCode(item.code);
                                                setSearchQuery('');
                                                setShowSearchDropdown(false);
                                            }}
                                        >
                                            <div>
                                                <span className="item-name">{item.name}</span>
                                                <span className="item-code">({item.code})</span>
                                            </div>
                                            <span className="item-price">{item.unit || 'Unit'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {showSearchDropdown && searchQuery.length > 0 && searchResults.length === 0 && (
                                <div className="billing-search-dropdown show">
                                    <div className="billing-search-dropdown-empty">No items found</div>
                                </div>
                            )}
                        </div>
                        <button className="billing-barcode-btn" onClick={startScanner}>
                            <Scan style={{ width: '18px', height: '18px', marginRight: '8px', strokeWidth: '2.2' }} />
                            <span>Scan Tag</span>
                        </button>
                    </div>
                </div>

              <div className="billing-grid-container" style={{ minHeight: '350px', paddingBottom: '200px' }}>
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>S No</th>
                      <th style={{ width: '140px' }}>Item Name</th>
                      <th style={{ width: '80px' }}>HSN</th>
                      <th style={{ width: '80px' }}>Qty</th>
                      <th style={{ width: '80px' }}>Unit</th>
                      <th style={{ width: '100px' }}>Rate</th>
                      <th style={{ width: '100px' }}>Amount</th>
                      <th style={{ width: '80px' }}>Discount</th>
                      <th style={{ width: '100px' }}>Final Amt</th>
                      <th style={{ width: '80px' }}>Tax %</th>
                      <th style={{ width: '120px' }}>Total Amt</th>
                      <th style={{ width: '50px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan="12" style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          No items added yet. Search or use AI to generate invoice.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => {
                        const amount = (parseFloat(item.rate) || 0) * (parseFloat(item.qty) || 0);
                        const finalAmt = amount - (parseFloat(item.discount) || 0);
                        const taxAmt = finalAmt * ((parseFloat(item.tax) || 0) / 100);
                        const totalAmt = finalAmt + taxAmt;
                        
                        return (
                          <tr key={idx}>
                            <td style={{ textAlign: 'left' }}>{idx + 1}</td>
                            <td style={{ fontWeight: '500', position: 'relative' }}>
                              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                <input 
                                  className="cell-input" 
                                  value={item.name}
                                  onFocus={() => setActiveDropdownRow(idx)}
                                  onBlur={() => setTimeout(() => setActiveDropdownRow(null), 150)}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateItem(idx, 'name', val);
                                    updateItem(idx, 'isNew', true);
                                    setActiveDropdownRow(idx);
                                  }} 
                                  style={{ width: '100%', boxSizing: 'border-box' }} 
                                />
                                {activeDropdownRow === idx && (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', background: 'white', border: '1px solid var(--border-color)', borderRadius: '4px', zIndex: 100, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    {allItems.filter(i => i.name.toLowerCase().includes(item.name.toLowerCase()) || String(i.code).toLowerCase().includes(item.name.toLowerCase())).map(i => (
                                      <div 
                                        key={i.code} 
                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          updateItem(idx, 'name', i.name);
                                          updateItem(idx, 'isNew', false);
                                          updateItem(idx, 'hsn', i.hsn || '');
                                          updateItem(idx, 'unit', i.unit || 'Nos');
                                          updateItem(idx, 'rate', i.purchaseAmount || i.purchasePrice || 0);
                                          updateItem(idx, 'tax', parseFloat(i.gstRate) || 0);
                                          setActiveDropdownRow(null);
                                        }}
                                        onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.target.style.background = 'white'}
                                      >
                                        {i.name}
                                      </div>
                                    ))}
                                    {allItems.filter(i => i.name.toLowerCase().includes(item.name.toLowerCase()) || String(i.code).toLowerCase().includes(item.name.toLowerCase())).length === 0 && (
                                      <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>No items found</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              {item.isNew && <span style={{ fontSize: '8px', color: '#B45309', background: '#FEF3C7', padding: '2px 4px', borderRadius: '50%', fontWeight: '700', position: 'absolute', top: '16px', right: '16px' }} title="New Item">●</span>}
                            </td>
                            <td>
                              <input type="text" className="cell-input" value={item.hsn} onChange={(e) => updateItem(idx, 'hsn', e.target.value)} />
                            </td>
                            <td>
                              <input type="number" className="cell-input" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} min="0" />
                            </td>
                            <td style={{ minWidth: '110px' }}>
                              {item.isNew ? (
                                <CustomSelect 
                                  value={item.unit || ''}
                                  onChange={(val) => updateItem(idx, 'unit', val)}
                                  placeholder="Unit"
                                  height="32px"
                                  menuDirection={idx >= items.length - 2 && items.length > 1 ? 'up' : 'down'}
                                  options={[
                                    ...unitsList.map(u => ({ value: u.name, label: u.name })),
                                    ...(item.unit && !unitsList.find(u => u.name === item.unit) ? [{ value: item.unit, label: item.unit }] : [])
                                  ]}
                                />
                              ) : (
                                <div style={{ textAlign: 'left', paddingLeft: '8px', fontSize: '13px' }}>{item.unit}</div>
                              )}
                            </td>
                            <td>
                              <input type="number" className="cell-input cell-rate-input" value={item.rate} onChange={(e) => updateItem(idx, 'rate', e.target.value)} step="0.01" min="0" />
                            </td>
                            <td className="cell-readonly">₹{amount.toFixed(2)}</td>
                            <td>
                              <input type="number" className="cell-input" value={item.discount} onChange={(e) => updateItem(idx, 'discount', e.target.value)} step="0.01" min="0" />
                            </td>
                            <td className="cell-readonly">₹{finalAmt.toFixed(2)}</td>
                            <td>
                              <input type="number" className="cell-input" value={item.tax} onChange={(e) => updateItem(idx, 'tax', e.target.value)} step="0.01" min="0" />
                            </td>
                            <td className="cell-readonly">₹{totalAmt.toFixed(2)}</td>
                            <td style={{ textAlign: 'left' }}>
                              <button type="button" className="btn-delete-row" onClick={() => deleteItem(idx)}>
                                <Trash2 style={{ width: '16px', height: '16px' }} />
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
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Paid Amount</div>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', width: '200px', height: '38px', background: '#F8FAFC' }}>
                      <span style={{ padding: '0 12px', color: 'var(--text-muted)', borderRight: '1px solid var(--border-color)' }}>₹</span>
                      <input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '0 12px', fontSize: '14px', width: '100%', outline: 'none' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Upload Document</div>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '150px', height: '38px', border: '1px dashed #CBD5E1', borderRadius: '6px', background: '#F8FAFC', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>
                      <Upload size={16} style={{ marginRight: '6px' }} /> Upload
                      <input type="file" style={{ display: 'none' }} />
                    </label>
                  </div>

                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Note</div>
                    <textarea style={textAreaStyle} value={piNote} onChange={(e) => setPiNote(e.target.value)}></textarea>
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
                      <tr><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>Tax Amount</td><td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', fontWeight: '500' }}>₹{taxAmount.toFixed(2)}</td></tr>
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

      <div className="sticky-action-bar-new" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxSizing: 'border-box' }}>
        <button onClick={() => navigate('/purchase-invoice')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => saveInvoice(true)} disabled={isSubmitting} style={{ height: '35px', padding: '0 16px', border: '1px solid #000B58', color: '#000B58', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            {isSubmitting ? 'Saving...' : 'Save & Add'}
          </button>
          <button onClick={() => saveInvoice(false)} disabled={isSubmitting} style={{ height: '35px', padding: '0 16px', border: 'none', color: 'white', borderRadius: '8px', background: '#000B58', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {showAiModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'white', padding: '16px', borderRadius: '16px', width: '480px', maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#4338CA', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Sparkles size={20} /> Generate with AI
              </h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>Choose how you want to provide the purchase invoice. AI will automatically extract all details and line items.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <input type="file" ref={fileInputRef} accept=".pdf" style={{ display: 'none' }} onChange={handleFileUpload} />
              <div onClick={triggerPdfUpload} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer' }}>
                <div style={{ width: '40px', height: '40px', background: '#EEF2FF', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338CA' }}><FileText size={20} /></div>
                <div><div style={{ fontWeight: '500', fontSize: '15px' }}>Upload PDF Invoice</div><div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Select a PDF file from your device</div></div>
              </div>

              <div onClick={() => alert("Camera capture is currently not fully hooked up in this React port, please use image upload.")} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer' }}>
                <div style={{ width: '40px', height: '40px', background: '#EEF2FF', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338CA' }}><Camera size={20} /></div>
                <div><div style={{ fontWeight: '500', fontSize: '15px' }}>Scan Purchase Bill</div><div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Use your camera to snap a photo</div></div>
              </div>

              <input type="file" ref={imageInputRef} accept="image/jpeg, image/png" style={{ display: 'none' }} onChange={handleFileUpload} />
              <div onClick={triggerImageUpload} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer' }}>
                <div style={{ width: '40px', height: '40px', background: '#EEF2FF', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338CA' }}><ImageIcon size={20} /></div>
                <div><div style={{ fontWeight: '500', fontSize: '15px' }}>Upload Image</div><div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Select a JPG or PNG from gallery</div></div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showScanner && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'white', padding: '16px', borderRadius: '12px', width: '500px', maxWidth: '90%' }}>
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

      {isAiLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255, 255, 255, 0.9)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
            <div style={{ position: 'relative', width: '72px', height: '96px', marginBottom: '24px' }}>
                <div style={{ width: '100%', height: '100%', background: 'white', border: '3px solid #CBD5E1', borderRadius: '8px', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ position: 'absolute', top: '20px', left: '12px', right: '30px', height: '4px', background: '#E2E8F0', borderRadius: '2px' }}></div>
                    <div style={{ position: 'absolute', top: '35px', left: '12px', right: '12px', height: '4px', background: '#E2E8F0', borderRadius: '2px' }}></div>
                    <div style={{ position: 'absolute', top: '50px', left: '12px', right: '20px', height: '4px', background: '#E2E8F0', borderRadius: '2px' }}></div>
                    <div style={{ position: 'absolute', top: '65px', left: '12px', right: '35px', height: '4px', background: '#E2E8F0', borderRadius: '2px' }}></div>
                    <div style={{ position: 'absolute', top: '80px', left: '12px', right: '12px', height: '4px', background: '#E2E8F0', borderRadius: '2px' }}></div>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: '#4338CA', boxShadow: '0 0 8px #4338CA, 0 4px 12px rgba(67, 56, 202, 0.4)', opacity: 0.9, animation: 'scanLaser 2s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}></div>
                </div>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)', margin: '0 0 8px 0' }}>Scanning Invoice...</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>Extracting items and calculating taxes</p>
            <style>
                {`@keyframes scanLaser { 
                    0% { top: 0%; opacity: 0; }
                    15% { opacity: 1; }
                    85% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }`}
            </style>
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
