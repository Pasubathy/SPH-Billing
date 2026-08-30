import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Scan, Search, X, List, LayoutGrid, ChevronDown, Plus, Package, Tag, Check, Download } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import CustomSelect from '../components/CustomSelect';

const Items = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    const [currentView, setCurrentView] = useState('grid');
    const [searchVal, setSearchVal] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Fetch from the backend API. Hardcoded localhost for dev purposes, 
                // in production you would use a relative path like '/api/categories'
                const [resCats, resUnits, resItems] = await Promise.all([
                    fetch('/api/categories').catch(() => ({ json: () => [] })),
                    fetch('/api/units').catch(() => ({ json: () => [] })),
                    fetch('/api/items').catch(() => ({ json: () => [] }))
                ]);
                
                const cats = await resCats.json();
                const un = await resUnits.json();
                const itms = await resItems.json();
                
                setCategories(cats || []);
                setUnits(un || []);
                setItems((itms || []).reverse());
            } catch (err) {
                console.error('Error loading initial data:', err);
            }
        };
        
        loadInitialData();
    }, []);

    const html5QrCodeRef = useRef(null);

    const startScanner = () => {
        setIsScannerOpen(true);
        setTimeout(async () => {
            try {
                const html5QrCode = new Html5Qrcode("qr-reader-react");
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
                            setSearchVal(decodedText.trim());
                            stopScanner();
                        }
                    );
                } else {
                    throw new Error("No cameras found in browser.");
                }
            } catch (err) {
                console.error("Camera access failed:", err);
                alert("Camera not found or access denied.");
                stopScanner();
            }
        }, 300);
    };

    const stopScanner = () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().then(() => {
                html5QrCodeRef.current.clear();
                setIsScannerOpen(false);
            }).catch(err => {
                console.error(err);
                setIsScannerOpen(false);
            });
        } else {
            setIsScannerOpen(false);
        }
    };

    const getShortUnitName = (unitName) => {
        if (!unitName) return 'Unit';
        const found = units.find(u => u.name === unitName || u.unitPrefix === unitName);
        return found ? (found.unitPrefix || found.name) : unitName;
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = !searchVal || 
            item.code.toLowerCase().includes(searchVal.toLowerCase()) || 
            item.name.toLowerCase().includes(searchVal.toLowerCase());
        const matchesCategory = !selectedCategory || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <>
            {/* Tabs & Actions */}
            <div className="page-tabs" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '16px', backgroundColor: '#F8F9FA', height: '45px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', height: '100%' }}>
                    <NavLink to="/items" className="tab active">Item List</NavLink>
                    <NavLink to="/categories" className="tab">Category</NavLink>
                    <NavLink to="/units" className="tab">Unit</NavLink>
                </div>
                <button 
                    className="btn" 
                    id="scanTagBtn" 
                    onClick={startScanner}
                    style={{ border: '1px solid #7C3AED', backgroundColor: '#EEF2FF', color: '#4338CA', borderRadius: '8px', padding: '4px 16px', height: '32px', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <Scan size={16} color="#4338CA" /> Scan Tag
                </button>
            </div>

            <div className="summary-card" style={{ margin: '0', padding: '16px', display: 'flex', flexDirection: 'column', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: '0', flex: 1, minHeight: '0' }}>
                {/* Page Header */}
                <div className="page-header" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
                    <div className="page-title-group" style={{ gap: '16px' }}>
                        <h1 className="page-title" style={{ marginRight: '8px' }}>Items List</h1>
                        
                        <CustomSelect
                            value={selectedCategory}
                            onChange={setSelectedCategory}
                            placeholder="Category"
                            icon={<Tag />}
                            options={[
                                { value: '', label: 'All Categories' },
                                ...categories.map((c, i) => ({
                                    value: c.name,
                                    label: c.name
                                }))
                            ]}
                            width="160px"
                            height="35px"
                        />
                        
                        <div className="search-box">
                            <input 
                                type="text" 
                                placeholder="Search" 
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                            />
                            <Search className="search-icon" size={16} />
                        </div>
                        
                        <button 
                            className="btn btn-outline" 
                            onClick={() => { setSearchVal(''); setSelectedCategory(''); }}
                            style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '35px' }} 
                            title="Clear Filter">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="header-actions">
                        <button 
                            className="btn btn-outline" 
                            onClick={() => setCurrentView(currentView === 'list' ? 'grid' : 'list')}
                            style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                            title="Toggle View">
                            {currentView === 'grid' ? <List size={18} /> : <LayoutGrid size={18} />}
                        </button>
                        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Export <ChevronDown size={16} />
                        </button>
                        <Link to="/items/create" className="btn btn-primary" style={{ backgroundColor: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'white' }}>
                            <Plus size={16} className="btn-icon" /> Create
                        </Link>
                    </div>
                </div>

                {/* Items Content Area */}
                {currentView === 'list' ? (
                    <div className="units-content-wrapper" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ height: '40px' }}>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '120px' }}>Code</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '250px' }}>Item Name</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>Category</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '100px' }}>Stock</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '100px' }}>Base Unit</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>Purchase Price</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '150px' }}>Selling Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.length > 0 ? filteredItems.map((item, index) => {
                                        const pPrice = parseFloat(item.purchasePrice !== undefined ? item.purchasePrice : item.purchaseAmount) || 0;
                                        const sPrice = parseFloat(item.sellingPrice !== undefined ? item.sellingPrice : item.sellingAmount) || 0;
                                        const shortUnit = getShortUnitName(item.unit);
                                        
                                        return (
                                            <tr 
                                                key={item.code || index} 
                                                onClick={() => navigate(`/items/view/${item.code}`)} 
                                                style={{ height: '40px', cursor: 'pointer' }} 
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} 
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{index + 1}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{item.code}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#2563EB', fontWeight: '500' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '26px', height: '26px', borderRadius: '4px', overflow: 'hidden', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #E2E8F0' }}>
                                                            {item.images && item.images.length > 0 ? 
                                                                <img src={item.images[0]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 
                                                                <Package size={14} color="#64748b" />
                                                            }
                                                        </div>
                                                        <span>{item.name}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{item.category || '-'}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{item.stock || 0}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{shortUnit || '-'}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>₹{pPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px' }}>₹{sPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '14px', borderBottom: '1px solid var(--border-color)' }}>
                                                No items found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="items-grid" style={{ display: 'grid', margin: 0, padding: 0, width: '100%' }}>
                        {filteredItems.map((item) => {
                            const pPrice = parseFloat(item.purchasePrice !== undefined ? item.purchasePrice : item.purchaseAmount) || 0;
                            const sPrice = parseFloat(item.sellingPrice !== undefined ? item.sellingPrice : item.sellingAmount) || 0;
                            const shortUnit = getShortUnitName(item.unit);
                            
                            let conversionHtml = null;
                            if (item.conversions && item.conversions.length > 0) {
                                const firstConv = item.conversions[0];
                                const cShortUnit = getShortUnitName(firstConv.unit);
                                conversionHtml = (
                                    <div className="item-card-price-col" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
                                        <span className="item-card-price-val">₹{parseFloat(firstConv.price).toFixed(2)}</span>
                                        <span className="item-card-price-unit">/ {cShortUnit}</span>
                                    </div>
                                );
                            }

                            return (
                                <div className="item-card" key={item.code}>
                                    <div className="item-card-top">
                                        <div className="item-card-image">
                                            {item.images && item.images.length > 0 ? 
                                                <img src={item.images[0]} alt={item.name} /> : 
                                                <Package size={20} color="#94A3B8" />
                                            }
                                        </div>
                                        <div className="item-card-details">
                                            <div className="item-card-header-row">
                                                <span className="item-card-code">{item.code}</span>
                                                <span className="item-card-purchase-price">Rs.{pPrice.toFixed(2)}/{shortUnit}</span>
                                            </div>
                                            <div className="item-card-name">
                                                <Link to={`/items/view/${item.code}`} style={{ textDecoration: 'none', color: '#000B58' }}>{item.name}</Link>
                                            </div>
                                            <div className="item-card-category">{item.category}</div>
                                        </div>
                                    </div>
                                    <div className="item-card-bottom">
                                        <div className="item-card-bottom-title">Selling Price</div>
                                        <div className="item-card-prices">
                                            <div className="item-card-price-col">
                                                <span className="item-card-price-val">₹{sPrice.toFixed(2)}</span>
                                                <span className="item-card-price-unit">/ {shortUnit}</span>
                                            </div>
                                            {conversionHtml}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* QR Scanner Modal */}
            {isScannerOpen && (
                <div style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: 'white', padding: '16px', borderRadius: '16px', width: '450px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                <Scan size={20} /> Scan Item Tag
                            </h3>
                            <button 
                                onClick={stopScanner}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '50%' }}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div id="qr-reader-react" style={{ width: '100%', minHeight: '300px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', background: '#f8fafc' }}></div>
                        
                        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                            Position the item tag QR code within the camera scanner frame.
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Items;
