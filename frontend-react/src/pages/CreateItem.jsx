import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, Plus, Trash2, Camera, Upload, Eye, Printer, X, Image as ImageIcon } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

const inputStyle = { height: '38px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function CreateItem() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editCodeParam = searchParams.get('edit');

  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [allItems, setAllItems] = useState([]);

  // Form States
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [hsn, setHsn] = useState('');
  const [gstRate, setGstRate] = useState('none');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseTaxType, setPurchaseTaxType] = useState('without');
  const [unit, setUnit] = useState('');
  const [stock, setStock] = useState('');
  const [sellingMargin, setSellingMargin] = useState('');
  const [marginType, setMarginType] = useState('rupee');
  const [sellingPrice, setSellingPrice] = useState('');
  const [sellingTaxType, setSellingTaxType] = useState('without');
  const [images, setImages] = useState([]);
  const [conversions, setConversions] = useState([]);

  // UI States
  const [activeImageIndex, setActiveImageIndex] = useState(-1);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showTagPreview, setShowTagPreview] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printCopies, setPrintCopies] = useState(1);
  const [toast, setToast] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load Categories, Units & Items on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resCats, resUnits, resItems] = await Promise.all([
          fetch('http://localhost:3000/api/categories').then(r => r.json()),
          fetch('http://localhost:3000/api/units').then(r => r.json()),
          fetch('http://localhost:3000/api/items').then(r => r.json())
        ]);
        setCategories(resCats || []);
        setUnits(resUnits || []);
        setAllItems(resItems || []);

        if (editCodeParam) {
          const item = resItems.find(i => String(i.code) === String(editCodeParam));
          if (item) {
            setCode(item.code || '');
            setName(item.name || '');
            setCategory(item.category || '');
            setHsn(item.hsn || '');
            setGstRate(item.gstRate || 'none');
            setPurchaseAmount(item.purchaseAmount !== undefined ? item.purchaseAmount : '');
            setPurchaseTaxType(item.purchaseTaxType || 'without');
            setUnit(item.unit || '');
            setStock(item.stock !== undefined ? item.stock : '');
            setSellingMargin(item.sellingMargin !== undefined ? item.sellingMargin : '');
            setMarginType(item.marginType || 'rupee');
            setSellingPrice(item.sellingPrice !== undefined ? item.sellingPrice : '');
            setSellingTaxType(item.sellingTaxType || 'without');
            setImages(item.images || []);
            setConversions(item.conversions || []);
            if (item.images && item.images.length > 0) {
              setActiveImageIndex(0);
            }
          }
        }
      } catch (err) {
        console.error('Error loading data:', err);
      }
    };
    fetchData();
  }, [editCodeParam]);

  // Generate Unique Code
  const handleGenerateCode = () => {
    let uniqueCode = "";
    let attempts = 0;
    while (attempts < 1000) {
      const randNum = Math.floor(Math.random() * 90000) + 10000;
      uniqueCode = String(randNum);
      const exists = allItems.some(item => String(item.code) === uniqueCode);
      if (!exists) {
        setCode(uniqueCode);
        showToast('Unique code generated successfully', 'success');
        break;
      }
      attempts++;
    }
  };

  // Bidirectional calculations
  const calculateSellingPrice = (pAmount, margin, type) => {
    const p = parseFloat(pAmount) || 0;
    const m = parseFloat(margin) || 0;
    let s = 0;
    if (type === 'rupee') {
      s = p + m;
    } else {
      s = p * (1 + m / 100);
    }
    const val = s > 0 ? parseFloat(s.toFixed(2)) : '';
    setSellingPrice(val);
    updateConversionsPrice(val, conversions);
  };

  const calculateMargin = (pAmount, sPrice, type) => {
    const p = parseFloat(pAmount) || 0;
    const s = parseFloat(sPrice) || 0;
    let m = 0;
    if (type === 'rupee') {
      m = s - p;
    } else {
      m = p > 0 ? ((s - p) / p) * 100 : 0;
    }
    setSellingMargin(m !== 0 ? parseFloat(m.toFixed(2)) : '');
    updateConversionsPrice(s, conversions);
  };

  const updateConversionsPrice = (baseSellPrice, currentConversions) => {
    const s = parseFloat(baseSellPrice) || 0;
    const updated = currentConversions.map(c => {
      const factor = parseFloat(c.factor) || 0;
      if (factor > 0) {
        return { ...c, price: parseFloat((s / factor).toFixed(2)) };
      }
      return c;
    });
    setConversions(updated);
  };

  const handlePurchaseAmountChange = (val) => {
    setPurchaseAmount(val);
    calculateSellingPrice(val, sellingMargin, marginType);
  };

  const handleMarginChange = (val) => {
    setSellingMargin(val);
    calculateSellingPrice(purchaseAmount, val, marginType);
  };

  const handleMarginTypeChange = (val) => {
    setMarginType(val);
    calculateSellingPrice(purchaseAmount, sellingMargin, val);
  };

  const handleSellingPriceChange = (val) => {
    setSellingPrice(val);
    calculateMargin(purchaseAmount, val, marginType);
  };

  // Conversions operations
  const handleAddConversionRow = () => {
    setConversions([...conversions, { unit: '', factor: '', price: '' }]);
  };

  const handleRemoveConversionRow = (idx) => {
    const updated = [...conversions];
    updated.splice(idx, 1);
    setConversions(updated);
  };

  const handleConversionChange = (idx, field, value) => {
    const updated = [...conversions];
    updated[idx][field] = value;

    if (field === 'factor') {
      const baseSell = parseFloat(sellingPrice) || 0;
      const factor = parseFloat(value) || 0;
      if (factor > 0) {
        updated[idx].price = parseFloat((baseSell / factor).toFixed(2));
      } else {
        updated[idx].price = '';
      }
    }
    setConversions(updated);
  };

  // Webcam actions
  const openCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 480, height: 480 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error(err);
      showToast('Unable to access camera', 'error');
      setIsCameraOpen(false);
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const size = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 480, 480);
    const dataUrl = canvas.toDataURL('image/jpeg');

    const newImgs = [...images, dataUrl];
    setImages(newImgs);
    setActiveImageIndex(newImgs.length - 1);
    closeCamera();
    showToast('Photo captured successfully', 'success');
  };

  // Image Upload
  const handleImageUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setImages(prev => {
          const next = [...prev, evt.target.result];
          setActiveImageIndex(next.length - 1);
          return next;
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDeleteImage = () => {
    if (images.length === 0) return;
    const updated = [...images];
    updated.splice(activeImageIndex, 1);
    setImages(updated);
    if (updated.length === 0) {
      setActiveImageIndex(-1);
    } else {
      setActiveImageIndex(Math.max(0, activeImageIndex - 1));
    }
    showToast('Photo deleted successfully', 'success');
  };

  // Submit operations
  const validateForm = () => {
    if (!code) { showToast('Please enter or generate an Item Code', 'error'); return false; }
    if (!name) { showToast('Please enter Item Name', 'error'); return false; }
    if (!category) { showToast('Please select Item Category', 'error'); return false; }
    if (!unit) { showToast('Please select Base Unit', 'error'); return false; }
    if (sellingPrice === '' || parseFloat(sellingPrice) < 0) { showToast('Please enter a valid Selling Price', 'error'); return false; }

    // Check duplicate code
    if (!editCodeParam || String(editCodeParam) !== String(code)) {
      if (allItems.some(item => String(item.code) === String(code))) {
        showToast('An item with this Code already exists. Please use a unique code.', 'error');
        return false;
      }
    }

    // Validate conversions
    for (let c of conversions) {
      if (!c.unit || !c.factor || parseFloat(c.factor) <= 0) {
        showToast('Please enter both Unit and a valid Conversion Factor for all rows', 'error');
        return false;
      }
    }
    return true;
  };

  const handleSave = async (redirectAfter = true) => {
    if (!validateForm()) return;

    const newItem = {
      code,
      name,
      category,
      hsn: hsn.trim(),
      gstRate,
      purchaseAmount: parseFloat(purchaseAmount) || 0,
      purchaseTaxType,
      unit,
      stock: parseFloat(stock) || 0,
      sellingMargin: parseFloat(sellingMargin) || 0,
      marginType,
      sellingPrice: parseFloat(sellingPrice) || 0,
      sellingTaxType,
      images,
      conversions: conversions.map(c => ({
        unit: c.unit,
        factor: parseFloat(c.factor) || 0,
        price: parseFloat(c.price) || 0
      }))
    };

    let updatedItems;
    if (editCodeParam) {
      updatedItems = allItems.map(item => String(item.code) === String(editCodeParam) ? newItem : item);
    } else {
      updatedItems = [...allItems, newItem];
    }

    try {
      const res = await fetch('http://localhost:3000/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItems)
      });
      const result = await res.json();
      if (result.success) {
        showToast(editCodeParam ? 'Item updated successfully!' : 'Item created successfully!', 'success');
        if (redirectAfter) {
          setTimeout(() => {
            navigate(editCodeParam ? `/items/view/${code}` : '/items');
          }, 1000);
        } else {
          // Reset form for save & add
          setCode('');
          setName('');
          setCategory('');
          setHsn('');
          setGstRate('none');
          setPurchaseAmount('');
          setPurchaseTaxType('without');
          setUnit('');
          setStock('');
          setSellingMargin('');
          setMarginType('rupee');
          setSellingPrice('');
          setSellingTaxType('without');
          setImages([]);
          setConversions([]);
          setActiveImageIndex(-1);
          // Refetch items list to avoid code collision
          const resItms = await fetch('http://localhost:3000/api/items').then(r => r.json());
          setAllItems(resItms || []);
        }
      } else {
        showToast('Failed to save item', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to save item', 'error');
    }
  };

  // Print Tag execute
  const handlePrintTag = () => {
    let tsData = {};
    try {
      const saved = localStorage.getItem('tagSettings');
      if (saved) tsData = JSON.parse(saved);
    } catch(e) {}

    const width = tsData.tsWidth || 50;
    const height = tsData.tsHeight || 25;
    const mt = tsData.tsMarginTop || 0;
    const mb = tsData.tsMarginBottom || 0;
    const ml = tsData.tsMarginLeft || 0;
    const mr = tsData.tsMarginRight || 0;

    const showCode = tsData.tsOptCode !== false;
    const showName = tsData.tsOptName !== false;
    const showPrice = tsData.tsOptPrice !== false;
    const showQR = tsData.tsOptQR !== false;

    const sizeCode = tsData.tsSizeCode || 12;
    const sizeName = tsData.tsSizeName || 14;
    const sizePrice = tsData.tsSizePrice || 16;
    const sizeQR = tsData.tsSizeQR || 35;
    
    const alignText = (tsData.tsAlign || 'left').toLowerCase();
    const jContent = alignText === 'center' ? 'center' : (alignText === 'left' ? 'flex-start' : 'flex-end');
    const qrImgWidthMm = width * (sizeQR / 100);

    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${code}`;

    let tagsHtml = '';
    for (let i = 0; i < printCopies; i++) {
      tagsHtml += `
      <div class="tag">
          <div class="tag-content">
              <div class="tag-inner-group" style="justify-content: ${jContent};">
                  <div class="qr-col" style="display: ${showQR ? 'flex' : 'none'}; width: ${showQR ? qrImgWidthMm + 'mm' : '0mm'}; height: ${showQR ? qrImgWidthMm + 'mm' : '0mm'};">
                      <img src="${qrDataUrl}" alt="QR">
                  </div>
                  <div class="text-col" style="width: auto; align-items: ${alignText === 'center' ? 'center' : (alignText === 'left' ? 'flex-start' : 'flex-end')}; text-align: ${alignText};">
                      ${showCode ? `<div class="code">${code || ''}</div>` : ''}
                      ${showName ? `<div class="name">${name || 'Unknown Item'}</div>` : ''}
                      ${showPrice ? `<div class="price">₹${parseFloat(sellingPrice).toFixed(2)}/${unit || 'Unit'}</div>` : ''}
                  </div>
              </div>
          </div>
      </div>`;
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Print Item Tag</title>
<style>
@media print { 
    @page { 
        margin: 0; 
        size: ${width}mm ${height}mm;
    } 
    body { margin: 0; padding: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .tag { margin: 0 !important; page-break-after: always; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
body { 
    font-family: 'Manrope', sans-serif;
    margin: 0;
    padding: 0;
    background: #fff;
}
.tag { 
    width: ${width}mm; 
    height: ${height}mm; 
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: white;
    margin: 0 auto;
    overflow: hidden;
}
.tag-content {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding-top: ${mt}mm;
    padding-bottom: ${mb}mm;
    padding-left: ${ml}mm;
    padding-right: ${mr}mm;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: ${jContent};
}
.tag-inner-group {
    display: flex;
    gap: 10px;
    max-width: 100%;
    align-items: center;
}
.qr-col { 
    display: flex; 
    align-items: center; 
    justify-content: center;
    flex-shrink: 0;
}
.qr-col img { 
    width: 100%; 
    height: 100%; 
    object-fit: contain; 
}
.text-col { 
    display: flex; 
    flex-direction: column; 
    justify-content: center; 
    gap: 2px; 
    flex: 0 1 auto;
    min-width: 0;
}
.name, .code, .price { 
    line-height: 1.2; 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    color: #000; 
    font-weight: 600; 
}
.name { font-size: ${sizeName}px; }
.code { font-size: ${sizeCode}px; }
.price { font-size: ${sizePrice}px; }
</style>
</head>
<body>
    ${tagsHtml}
    <script>
        window.onload = function() { 
            setTimeout(function() { 
                window.print(); 
                setTimeout(function() { window.close(); }, 500);
            }, 500); 
        }
    </script>
</body>
</html>`;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setShowPrintModal(false);
  };

  const getShortUnitName = (uName) => {
    if (!uName) return 'Unit';
    const found = units.find(u => u.name === uName || u.unitPrefix === uName);
    return found ? (found.unitPrefix || found.name) : uName;
  };

  const isFormValidForTag = code && name && category && unit && sellingPrice !== '' && parseFloat(sellingPrice) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header" style={{ height: '45px', padding: '0 24px', display: 'flex', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-main)' }}>
          {editCodeParam ? 'Edit Item' : 'Create Item'}
        </h1>
      </div>

      {/* Grid Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', background: '#F8FAFC' }}>
        
        {/* Left Form Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Basic Details */}
          <div className="create-card">
            <div className="create-card-title">Basic Details</div>
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Code <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" style={{ ...inputStyle, flex: 1, backgroundColor: '#F8F9FA', cursor: 'not-allowed' }} value={code} readOnly placeholder="Enter Item Code" />
                  {!editCodeParam && (
                    <button type="button" onClick={handleGenerateCode} style={{ background: '#000B58', color: 'white', border: 'none', borderRadius: '6px', padding: '0 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', height: '38px' }}>Generate</button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Category <span style={{ color: '#EF4444' }}>*</span></label>
                <CustomSelect
                  value={category}
                  onChange={setCategory}
                  placeholder="Select Category"
                  options={categories.map(c => ({ value: c.name, label: c.name }))}
                />
              </div>
            </div>
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Item Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input type="text" style={inputStyle} placeholder="Enter Item Name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>HSN Code</label>
                <input type="text" style={inputStyle} placeholder="Enter HSN Code" value={hsn} onChange={e => setHsn(e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
            </div>
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', width: '50%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>GST Rate</label>
                <CustomSelect
                  value={gstRate}
                  onChange={setGstRate}
                  placeholder="Select GST Rate"
                  options={[
                    { value: 'none', label: 'None' },
                    { value: '5', label: 'GST 5%' },
                    { value: '12', label: 'GST 12%' },
                    { value: '18', label: 'GST 18%' },
                    { value: '28', label: 'GST 28%' },
                    { value: 'i5', label: 'IGST 5%' },
                    { value: 'i12', label: 'IGST 12%' },
                    { value: 'i18', label: 'IGST 18%' },
                    { value: 'i28', label: 'IGST 28%' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Purchase Details */}
          <div className="create-card">
            <div className="create-card-title">Purchase Details</div>
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Purchase/Base Unit <span style={{ color: '#EF4444' }}>*</span></label>
                <CustomSelect
                  value={unit}
                  onChange={setUnit}
                  placeholder="Select Unit"
                  options={units.map(u => ({ value: u.unitPrefix || u.name, label: `${u.name} (${u.unitPrefix || u.name})` }))}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Purchase Amount <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative' }}>
                  <span style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRight: '1px solid var(--border-color)', padding: '0 12px', fontSize: '13px', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }}>₹</span>
                  <input type="number" style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', background: 'transparent' }} placeholder="0.00" value={purchaseAmount} onChange={e => handlePurchaseAmountChange(e.target.value)} />
                  <CustomSelect
                    inline
                    value={purchaseTaxType}
                    onChange={setPurchaseTaxType}
                    options={[
                      { value: 'without', label: 'without tax' },
                      { value: 'with', label: 'with tax' },
                    ]}
                  />
                </div>
              </div>
            </div>
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', width: '50%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Stock</label>
                <input type="number" style={inputStyle} placeholder="Enter stock count" value={stock} onChange={e => setStock(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Selling Price Details */}
          <div className="create-card">
            <div className="create-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Selling Price</span>
              <button type="button" onClick={handleAddConversionRow} style={{ border: '1px solid var(--border-color)', background: 'white', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', height: '28px' }}>
                <Plus size={13} /> Add Row
              </button>
            </div>
            <div className="form-row-two" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Margin</label>
                <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative' }}>
                  <input type="number" style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', background: 'transparent', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }} placeholder="0" value={sellingMargin} onChange={e => handleMarginChange(e.target.value)} />
                  <CustomSelect
                    inline
                    value={marginType}
                    onChange={handleMarginTypeChange}
                    options={[
                      { value: 'rupee', label: '₹' },
                      { value: 'percent', label: '%' },
                    ]}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Selling Amount <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', position: 'relative' }}>
                  <span style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRight: '1px solid var(--border-color)', padding: '0 8px', fontSize: '12px', whiteSpace: 'nowrap', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px' }}>
                    1 {getShortUnitName(unit)} =
                  </span>
                  <input type="number" style={{ border: 'none', outline: 'none', padding: '0 12px', flex: 1, fontSize: '13px', background: 'transparent' }} placeholder="0.00" value={sellingPrice} onChange={e => handleSellingPriceChange(e.target.value)} />
                  <CustomSelect
                    inline
                    value={sellingTaxType}
                    onChange={setSellingTaxType}
                    options={[
                      { value: 'without', label: 'without tax' },
                      { value: 'with', label: 'with tax' },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Conversions Sub-table */}
            {conversions.length > 0 && (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', marginTop: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 50px', background: '#F8FAFC', padding: '8px 12px', fontWeight: '600', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <div>Unit</div>
                  <div>Conversion</div>
                  <div>Selling Amount</div>
                  <div />
                </div>
                <div>
                  {conversions.map((conv, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 50px', padding: '8px 12px', alignItems: 'center', borderBottom: idx === conversions.length - 1 ? 'none' : '1px solid var(--border-color)', background: 'white' }}>
                      <div style={{ paddingRight: '8px' }}>
                        <CustomSelect
                          value={conv.unit}
                          onChange={val => handleConversionChange(idx, 'unit', val)}
                          placeholder="Select Unit"
                          options={units.map(u => ({ value: u.unitPrefix || u.name, label: `${u.name} (${u.unitPrefix || u.name})` }))}
                          height="34px"
                        />
                      </div>
                      <div style={{ paddingRight: '8px' }}>
                        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '34px', overflow: 'hidden', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 6px', background: '#F1F5F9', height: '100%', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border-color)' }}>
                            1 {getShortUnitName(unit)} =
                          </span>
                          <input type="number" style={{ border: 'none', outline: 'none', flex: 1, padding: '0 8px', fontSize: '12px', width: '40px' }} value={conv.factor} onChange={e => handleConversionChange(idx, 'factor', e.target.value)} placeholder="1.0" />
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 6px', background: '#F1F5F9', height: '100%', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--border-color)' }}>
                            {getShortUnitName(conv.unit) || 'Unit'}
                          </span>
                        </div>
                      </div>
                      <div style={{ paddingRight: '8px' }}>
                        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '34px', overflow: 'hidden', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', padding: '0 6px' }}>₹</span>
                          <input type="number" style={{ border: 'none', outline: 'none', flex: 1, padding: '0 8px', fontSize: '12px' }} value={conv.price} onChange={e => handleConversionChange(idx, 'price', e.target.value)} placeholder="0.00" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button type="button" onClick={() => handleRemoveConversionRow(idx)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Product Image */}
          <div className="create-card">
            <div className="create-card-title">Product Image</div>
            <div style={{ width: '100%', height: '200px', border: '1px dashed var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', position: 'relative', overflow: 'hidden', marginBottom: '12px' }}>
              {images.length > 0 ? (
                <>
                  <img src={images[activeImageIndex]} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  <button type="button" onClick={handleDeleteImage} style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(239, 68, 68, 0.9)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                    <Trash2 size={14} />
                  </button>
                  {images.length > 1 && (
                    <div style={{ position: 'absolute', bottom: '8px', left: '0', right: '0', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <button type="button" onClick={() => setActiveImageIndex(prev => (prev - 1 + images.length) % images.length)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Prev</button>
                      <span style={{ background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{activeImageIndex + 1}/{images.length}</span>
                      <button type="button" onClick={() => setActiveImageIndex(prev => (prev + 1) % images.length)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Next</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <ImageIcon size={40} color="var(--text-muted)" />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Upload or capture image</span>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{ flex: 1, height: '36px', border: '1px solid var(--border-color)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', background: 'white' }}>
                <Upload size={16} /> Upload
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
              </label>
              <button type="button" onClick={openCamera} style={{ flex: 1, height: '36px', border: '1px solid var(--border-color)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', background: 'white' }}>
                <Camera size={16} /> Camera
              </button>
            </div>
          </div>

          {/* Tag Panel */}
          <div className="create-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ background: '#F8FAFC', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: '600', fontSize: '13px' }}>
              Tag
            </div>
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button type="button" disabled={!isFormValidForTag} onClick={() => setShowTagPreview(true)} style={{ height: '64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '6px', border: '1px solid #000B58', borderRadius: '8px', background: '#F8FAFC', color: '#000B58', fontSize: '13px', fontWeight: '500', cursor: isFormValidForTag ? 'pointer' : 'not-allowed', opacity: isFormValidForTag ? 1 : 0.5 }}>
                <Eye size={18} /> Preview
              </button>
              <button type="button" disabled={!isFormValidForTag} onClick={() => setShowPrintModal(true)} style={{ height: '64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '6px', border: '1px solid #000B58', borderRadius: '8px', background: '#F8FAFC', color: '#000B58', fontSize: '13px', fontWeight: '500', cursor: isFormValidForTag ? 'pointer' : 'not-allowed', opacity: isFormValidForTag ? 1 : 0.5 }}>
                <Printer size={18} /> Print
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Sticky Bottom Actions Bar */}
      <div className="sticky-action-bar-new" style={{ height: '60px', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <button onClick={() => navigate('/items')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!editCodeParam && (
            <button onClick={() => handleSave(false)} style={{ height: '35px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
              Save & Add
            </button>
          )}
          <button onClick={() => handleSave(true)} style={{ height: '35px', padding: '0 32px', border: 'none', borderRadius: '8px', background: '#000B58', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
            Save
          </button>
        </div>
      </div>

      {/* Camera Live Modal */}
      {isCameraOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '90%', maxWidth: '400px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>Capture Photo</h3>
              <button type="button" onClick={closeCamera} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ background: '#000', width: '100%', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ padding: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={closeCamera}>Cancel</button>
              <button className="btn btn-primary" onClick={capturePhoto} style={{ backgroundColor: '#000B58' }}>Capture</button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Preview Modal */}
      {showTagPreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '360px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>Tag Preview</h3>
              <button type="button" onClick={() => setShowTagPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '32px 24px', background: '#F1F5F9', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ background: 'white', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', boxSizing: 'border-box' }}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${code}`} style={{ width: '50px', height: '50px', objectFit: 'contain' }} alt="QR" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px' }}>
                  <div style={{ fontWeight: '600' }}>{code}</div>
                  <div style={{ fontWeight: '600' }}>{name}</div>
                  <div style={{ fontWeight: '600' }}>₹{parseFloat(sellingPrice).toFixed(2)}/{unit}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Copies Modal */}
      {showPrintModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '260px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#000B58' }}>Print Tag</h3>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '6px' }}>Number of copies</label>
            <input type="number" value={printCopies} onChange={e => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))} min="1" style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid #E2E8F0', borderRadius: '6px', boxSizing: 'border-box', marginBottom: '16px', fontSize: '13px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPrintModal(false)} style={{ padding: '6px 12px', border: '1px solid #000B58', borderRadius: '6px', background: 'white', color: '#000B58', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Cancel</button>
              <button onClick={handlePrintTag} style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', background: '#000B58', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Print</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
