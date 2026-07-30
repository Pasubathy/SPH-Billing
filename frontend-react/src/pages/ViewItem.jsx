import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Search, X, Edit, Trash2, Printer, Eye, ChevronLeft, Package, ChevronRight } from 'lucide-react';

const lblStyle = { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '500', marginBottom: '4px' };
const valStyle = { fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' };

export default function ViewItem() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchVal, setSearchVal] = useState('');
  const [activeItem, setActiveItem] = useState(null);

  // Image Carousel state
  const [activeImageIndex, setActiveImageIndex] = useState(-1);

  // Modals state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTagPreview, setShowTagPreview] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printCopies, setPrintCopies] = useState(1);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [resItems, resUnits, resCats] = await Promise.all([
          fetch('http://localhost:3000/api/items').then(r => r.json()),
          fetch('http://localhost:3000/api/units').then(r => r.json()),
          fetch('http://localhost:3000/api/categories').then(r => r.json())
        ]);
        setItems(resItems || []);
        setUnits(resUnits || []);
        setCategories(resCats || []);

        // Find active item
        let currentItem = null;
        if (code) {
          currentItem = resItems.find(item => String(item.code) === String(code));
        }
        if (!currentItem && resItems && resItems.length > 0) {
          currentItem = resItems[0];
          navigate(`/items/view/${currentItem.code}`, { replace: true });
        }
        setActiveItem(currentItem);

        if (currentItem && currentItem.images && currentItem.images.length > 0) {
          setActiveImageIndex(0);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    loadData();
  }, [code, navigate]);

  const getShortUnitName = (unitName) => {
    if (!unitName) return 'Unit';
    const found = units.find(u => u.name === unitName || u.unitPrefix === unitName);
    return found ? (found.unitPrefix || found.name) : unitName;
  };

  const handleSidebarClick = (item) => {
    navigate(`/items/view/${item.code}`);
  };

  const handlePrevImage = () => {
    if (!activeItem || !activeItem.images || activeItem.images.length === 0) return;
    setActiveImageIndex(prev => (prev - 1 + activeItem.images.length) % activeItem.images.length);
  };

  const handleNextImage = () => {
    if (!activeItem || !activeItem.images || activeItem.images.length === 0) return;
    setActiveImageIndex(prev => (prev + 1) % activeItem.images.length);
  };

  const handleDeleteItem = async () => {
    if (!activeItem) return;
    const remainingItems = items.filter(item => String(item.code) !== String(activeItem.code));

    try {
      const res = await fetch('http://localhost:3000/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remainingItems)
      });
      const result = await res.json();
      if (result.success) {
        showToast('Item deleted successfully', 'success');
        setShowDeleteModal(false);
        setItems(remainingItems);

        // Redirect to first item or /items
        if (remainingItems.length > 0) {
          navigate(`/items/view/${remainingItems[0].code}`, { replace: true });
        } else {
          setActiveItem(null);
          navigate('/items');
        }
      } else {
        showToast('Failed to delete item', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to delete item', 'error');
    }
  };

  const handlePrintTag = () => {
    if (!activeItem) return;
    let tsData = {};
    try {
      const saved = localStorage.getItem('tagSettings');
      if (saved) tsData = JSON.parse(saved);
    } catch (e) { }

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

    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${activeItem.code}`;

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
                      ${showCode ? `<div class="code">${activeItem.code || ''}</div>` : ''}
                      ${showName ? `<div class="name">${activeItem.name || 'Unknown Item'}</div>` : ''}
                      ${showPrice ? `<div class="price">₹${parseFloat(activeItem.sellingPrice).toFixed(2)}/${getShortUnitName(activeItem.unit)}</div>` : ''}
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

  const filteredItems = items.filter(item => {
    const q = searchVal.toLowerCase().trim();
    return item.name.toLowerCase().includes(q) || String(item.code).toLowerCase().includes(q);
  });

  const getGstText = (item) => {
    if (!item.gstRate || item.gstRate === 'none') return '-';
    const isIgst = item.gstRate.startsWith('i');
    const rate = item.gstRate.replace('i', '');
    return `${isIgst ? 'IGST' : 'GST'} ${rate}%`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* Left Sidebar List */}
      <div style={{ width: '280px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', background: 'white', flexShrink: 0 }}>
        {/* Search */}
        <div style={{ height: '50px', alignItems: 'center', padding: '0px 16px 0 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '30px', flex: 1, overflow: 'hidden', alignItems: 'center', padding: '0 8px' }}>
            <Search size={16} color="var(--text-muted)" style={{ marginRight: '6px' }} />
            <input type="text" style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', height: '25px' }} placeholder="Search code/name" value={searchVal} onChange={e => setSearchVal(e.target.value)} />
          </div>
          {searchVal && (
            <button onClick={() => setSearchVal('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <X size={18} color="var(--text-muted)" />
            </button>
          )}
        </div>
        {/* List items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredItems.map(item => (
            <div key={item.code} onClick={() => handleSidebarClick(item)} style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: activeItem && String(activeItem.code) === String(item.code) ? '#EEF2FF' : 'transparent', borderLeft: activeItem && String(activeItem.code) === String(item.code) ? '4px solid #000B58' : '4px solid transparent' }}>
              <div style={{ fontWeight: '600', fontSize: '13px', color: activeItem && String(activeItem.code) === String(item.code) ? '#000B58' : '#1E293B', marginBottom: '2px' }}>{item.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.category || 'No Category'} • #{item.code}</div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No items found</div>
          )}
        </div>
      </div>

      {/* Right Main Details View */}
      {activeItem ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F8FAFC', overflowY: 'auto' }}>
          {/* Main Top Bar Actions */}
          <div style={{ height: '50px', background: 'white', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link to="/items" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)' }}>
                <ChevronLeft size={16} />
              </Link>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>{activeItem.name}</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => navigate(`/items/create?edit=${activeItem.code}`)} style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                <Edit size={14} /> Edit
              </button>
              <button onClick={() => setShowDeleteModal(true)} style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: '1px solid #FCA5A5', borderRadius: '6px', background: '#FEF2F2', color: '#EF4444', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>

          {/* Details Content Container */}
          <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>

            {/* Left Info Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Basic Details */}
              <div className="create-card" style={{ paddingBottom: '24px' }}>
                <div className="create-card-title">Basic Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                  <div>
                    <div style={lblStyle}>Item Code</div>
                    <div style={valStyle}>{activeItem.code}</div>
                  </div>
                  <div>
                    <div style={lblStyle}>Category</div>
                    <div style={valStyle}>{activeItem.category || '-'}</div>
                  </div>
                  <div>
                    <div style={lblStyle}>Item Name</div>
                    <div style={valStyle}>{activeItem.name}</div>
                  </div>
                  <div>
                    <div style={lblStyle}>HSN Code</div>
                    <div style={valStyle}>{activeItem.hsn || '-'}</div>
                  </div>
                  <div>
                    <div style={lblStyle}>GST Rate</div>
                    <div style={valStyle}>{getGstText(activeItem)}</div>
                  </div>
                </div>
              </div>

              {/* Purchase Details */}
              <div className="create-card" style={{ paddingBottom: '24px' }}>
                <div className="create-card-title">Purchase Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                  <div>
                    <div style={lblStyle}>Base Unit</div>
                    <div style={valStyle}>{getShortUnitName(activeItem.unit)}</div>
                  </div>
                  <div>
                    <div style={lblStyle}>Purchase Amount</div>
                    <div style={valStyle}>₹{parseFloat(activeItem.purchaseAmount || 0).toFixed(2)} ({activeItem.purchaseTaxType === 'with' ? 'With Tax' : 'Without Tax'})</div>
                  </div>
                  <div>
                    <div style={lblStyle}>Stock</div>
                    <div style={valStyle}>{activeItem.stock !== undefined ? activeItem.stock : '-'}</div>
                  </div>
                </div>
              </div>

              {/* Selling Price Details */}
              <div className="create-card" style={{ paddingBottom: '24px' }}>
                <div className="create-card-title">Selling Price Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                  <div>
                    <div style={lblStyle}>Margin</div>
                    <div style={valStyle}>{activeItem.marginType === 'percent' ? '%' : '₹'}{activeItem.sellingMargin || 0}</div>
                  </div>
                  <div>
                    <div style={lblStyle}>Selling Price</div>
                    <div style={valStyle}>₹{parseFloat(activeItem.sellingPrice || 0).toFixed(2)} ({activeItem.sellingTaxType === 'with' ? 'With Tax' : 'Without Tax'})</div>
                  </div>
                </div>

                {/* Conversions Sub-table */}
                {activeItem.conversions && activeItem.conversions.length > 0 && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', marginTop: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', background: '#F8FAFC', padding: '8px 16px', fontWeight: '600', fontSize: '11px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                      <div>Unit</div>
                      <div>Conversion Factor</div>
                      <div>Selling Amount</div>
                    </div>
                    {activeItem.conversions.map((conv, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', padding: '10px 16px', fontSize: '12px', borderBottom: i === activeItem.conversions.length - 1 ? 'none' : '1px solid var(--border-color)', background: 'white' }}>
                        <div style={{ fontWeight: '500' }}>{getShortUnitName(conv.unit)}</div>
                        <div style={{ color: 'var(--text-muted)' }}>1 {getShortUnitName(activeItem.unit)} = {conv.factor} {getShortUnitName(conv.unit)}</div>
                        <div style={{ fontWeight: '600' }}>₹{parseFloat(conv.price || 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Info Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Product Image Carousel */}
              <div className="create-card" style={{ paddingBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="create-card-title">Product Image</div>
                <div style={{ width: '100%', height: '200px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', position: 'relative', overflow: 'hidden' }}>
                  {activeItem.images && activeItem.images.length > 0 ? (
                    <>
                      <img src={activeItem.images[activeImageIndex]} alt={activeItem.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      {activeItem.images.length > 1 && (
                        <div style={{ position: 'absolute', bottom: '8px', left: '0', right: '0', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button onClick={handlePrevImage} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Prev</button>
                          <span style={{ background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{activeImageIndex + 1}/{activeItem.images.length}</span>
                          <button onClick={handleNextImage} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Next</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <Package size={36} />
                      <span style={{ fontSize: '12px' }}>No Image available</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tag sticker actions */}
              <div className="create-card" style={{ paddingBottom: '24px' }}>
                <div className="create-card-title">Tag Options</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button onClick={() => setShowTagPreview(true)} style={{ height: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px', border: '1px solid #000B58', borderRadius: '8px', background: '#F8FAFC', color: '#000B58', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>
                    <Eye size={16} /> Preview
                  </button>
                  <button onClick={() => setShowPrintModal(true)} style={{ height: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px', border: '1px solid #000B58', borderRadius: '8px', background: '#F8FAFC', color: '#000B58', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>
                    <Printer size={16} /> Print
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Select or add an item to view details
        </div>
      )}
      </div>

      {/* Sticky Bottom Bar - Full Width */}
      <div className="sticky-action-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 24px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', zIndex: 10, flexShrink: 0 }}>
        <div className="footer-left">
          <button onClick={() => navigate('/items')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
            <ChevronLeft size={16} /> Back
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '320px', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '17px' }}>Delete Item</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13px' }}>Are you sure you want to delete this item? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDeleteItem} style={{ background: '#EF4444', borderColor: '#EF4444', flex: 1 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Preview Modal */}
      {showTagPreview && activeItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '360px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>Tag Preview</h3>
              <button type="button" onClick={() => setShowTagPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '32px 24px', background: '#F1F5F9', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ background: 'white', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', boxSizing: 'border-box' }}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${activeItem.code}`} style={{ width: '50px', height: '50px', objectFit: 'contain' }} alt="QR" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px' }}>
                  <div style={{ fontWeight: '600' }}>{activeItem.code}</div>
                  <div style={{ fontWeight: '600' }}>{activeItem.name}</div>
                  <div style={{ fontWeight: '600' }}>₹{parseFloat(activeItem.sellingPrice).toFixed(2)}/{getShortUnitName(activeItem.unit)}</div>
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
