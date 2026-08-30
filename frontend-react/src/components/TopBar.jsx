import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, 
    Clock, 
    FileText, 
    Package, 
    Truck, 
    RotateCcw, 
    UserPlus, 
    Coins, 
    Layers, 
    Scale,
    ArrowRight,
    X,
    Receipt,
    Download
} from 'lucide-react';

const creationShortcuts = [
    {
        id: 'new-sale',
        title: 'New Sales Invoice (Billing)',
        subtitle: 'Create a new customer bill',
        category: 'Sales',
        path: '/sales/create',
        icon: FileText,
        badgeBg: '#EFF6FF',
        badgeColor: '#1E40AF',
        keywords: ['sale', 'bill', 'invoice', 'create sale', 'new bill', 'pos', 'billing']
    },
    {
        id: 'new-sales-return',
        title: 'New Sales Return',
        subtitle: 'Record customer product return',
        category: 'Sales',
        path: '/sales/return/create',
        icon: RotateCcw,
        badgeBg: '#EFF6FF',
        badgeColor: '#1E40AF',
        keywords: ['return', 'sales return', 'credit note', 'refund']
    },
    {
        id: 'record-amount-received',
        title: 'Record Amount Received',
        subtitle: 'Receive payment from customer',
        category: 'Sales',
        path: '/sales#amountReceived',
        icon: Coins,
        badgeBg: '#EFF6FF',
        badgeColor: '#1E40AF',
        keywords: ['payment', 'receive', 'amount received', 'customer payment', 'receipt', 'due payment']
    },
    {
        id: 'new-item',
        title: 'Add New Item / Product',
        subtitle: 'Add product with price, barcode & stock',
        category: 'Inventory',
        path: '/items/create',
        icon: Package,
        badgeBg: '#ECFDF5',
        badgeColor: '#065F46',
        keywords: ['item', 'product', 'create item', 'add item', 'stock', 'barcode', 'sku']
    },
    {
        id: 'add-category',
        title: 'Add Item Category',
        subtitle: 'Create product categories',
        category: 'Inventory',
        path: '/categories',
        icon: Layers,
        badgeBg: '#ECFDF5',
        badgeColor: '#065F46',
        keywords: ['category', 'group', 'classification']
    },
    {
        id: 'add-unit',
        title: 'Add Measurement Unit',
        subtitle: 'Create units (Pcs, Kg, Box, etc.)',
        category: 'Inventory',
        path: '/units',
        icon: Scale,
        badgeBg: '#ECFDF5',
        badgeColor: '#065F46',
        keywords: ['unit', 'uom', 'measurement', 'pcs', 'kg']
    },
    {
        id: 'new-purchase-invoice',
        title: 'New Purchase Invoice',
        subtitle: 'Inward vendor stock entry',
        category: 'Purchase',
        path: '/purchase-invoice/create',
        icon: Truck,
        badgeBg: '#F5F3FF',
        badgeColor: '#5B21B6',
        keywords: ['purchase', 'vendor bill', 'supplier bill', 'inward', 'pi']
    },
    {
        id: 'new-purchase-return',
        title: 'New Purchase Return',
        subtitle: 'Debit note / return to vendor',
        category: 'Purchase',
        path: '/purchase-return/create',
        icon: RotateCcw,
        badgeBg: '#F5F3FF',
        badgeColor: '#5B21B6',
        keywords: ['purchase return', 'vendor return', 'debit note', 'pret']
    },
    {
        id: 'add-vendor',
        title: 'Add New Vendor / Supplier',
        subtitle: 'Register supplier contact & GST',
        category: 'Vendors',
        path: '/vendors/create',
        icon: UserPlus,
        badgeBg: '#FFFBEB',
        badgeColor: '#92400E',
        keywords: ['vendor', 'supplier', 'add vendor', 'create vendor', 'dealer']
    },
    {
        id: 'new-voucher',
        title: 'Create Voucher (Expense / Receipt)',
        subtitle: 'Record store expenses or miscellaneous receipts',
        category: 'Vouchers',
        path: '/voucher/create',
        icon: Receipt,
        badgeBg: '#FFF7ED',
        badgeColor: '#C2410C',
        keywords: ['voucher', 'payment voucher', 'receipt voucher', 'expense', 'petty cash', 'rent', 'salary']
    }
];

const TopBar = () => {
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);

    const searchContainerRef = useRef(null);
    const inputRef = useRef(null);

    // Check if running in standalone mode (already installed)
    useEffect(() => {
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
            setIsInstalled(true);
        }

        const handleBeforeInstall = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
    }, []);

    const handleInstallApp = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setIsInstalled(true);
            setDeferredPrompt(null);
        }
    };

    // Live Clock Timer
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Global Shortcut (Ctrl + K or /) to focus Search Bar
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')) {
                e.preventDefault();
                inputRef.current?.focus();
                setIsOpen(true);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter shortcuts by search query
    const filteredShortcuts = creationShortcuts.filter(item => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase().trim();
        return (
            item.title.toLowerCase().includes(q) ||
            item.subtitle.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q) ||
            item.keywords.some(k => k.toLowerCase().includes(q))
        );
    });

    const handleSelectShortcut = (shortcut) => {
        setIsOpen(false);
        setSearchTerm('');
        inputRef.current?.blur();
        navigate(shortcut.path);
    };

    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % (filteredShortcuts.length || 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + filteredShortcuts.length) % (filteredShortcuts.length || 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredShortcuts.length > 0 && filteredShortcuts[selectedIndex]) {
                handleSelectShortcut(filteredShortcuts[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
        }
    };

    return (
        <header className="top-bar" style={{ height: '60px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', zIndex: 10, gap: '16px' }}>
            
            {/* Left: App Logo */}
            <div className="top-bar-left" style={{ display: 'flex', alignItems: 'center', minWidth: '180px' }}>
                <img src="/Images/Logo.png" alt="SPH Logo" className="app-logo" style={{ height: '36px', objectFit: 'contain', cursor: 'pointer' }} onClick={() => navigate('/')} />
            </div>

            {/* Center: Creation Page Shortcut Search Bar */}
            <div ref={searchContainerRef} style={{ flex: 1, maxWidth: '440px', position: 'relative' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                    <Search size={16} color={isOpen ? '#2563EB' : '#94A3B8'} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', transition: 'color 0.15s ease' }} />
                    <input 
                        ref={inputRef}
                        type="text"
                        className={`topbar-search-input ${isOpen ? 'is-active' : ''}`}
                        placeholder="Search creation pages... (Ctrl + K)"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsOpen(true);
                            setSelectedIndex(0);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                        style={{
                            padding: searchTerm ? '0 32px 0 38px' : '0 65px 0 38px'
                        }}
                    />
                    
                    {/* Clear Search or Shortcut Badge */}
                    {searchTerm ? (
                        <button 
                            onClick={() => { setSearchTerm(''); inputRef.current?.focus(); }}
                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#94A3B8' }}
                            title="Clear search"
                        >
                            <X size={14} />
                        </button>
                    ) : (
                        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                            <kbd style={{ fontSize: '11px', background: '#F1F5F9', color: '#64748B', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', fontWeight: '600' }}>Ctrl K</kbd>
                        </div>
                    )}
                </div>

                {/* Quick Actions Creation Dropdown */}
                {isOpen && (
                    <div className="topbar-shortcuts-dropdown">
                        <div style={{ padding: '6px 10px 4px 10px', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Jump to Create Action</span>
                            <span>{filteredShortcuts.length} Shortcuts</span>
                        </div>

                        {filteredShortcuts.length > 0 ? (
                            filteredShortcuts.map((item, idx) => {
                                const IconComponent = item.icon;
                                const isSelected = idx === selectedIndex;

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectShortcut(item)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 10px',
                                            borderRadius: '6px',
                                            border: isSelected ? '1px solid #DBEAFE' : '1px solid transparent',
                                            cursor: 'pointer',
                                            backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                                            boxShadow: isSelected ? '0 1px 3px rgba(0, 11, 88, 0.04)' : 'none',
                                            transition: 'all 0.1s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                            <div style={{
                                                width: '30px',
                                                height: '30px',
                                                borderRadius: '6px',
                                                backgroundColor: isSelected ? '#DBEAFE' : '#F1F5F9',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                <IconComponent size={15} color={isSelected ? '#000B58' : '#475569'} />
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '13px', fontWeight: '600', color: isSelected ? '#000B58' : '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>{item.title}</span>
                                                    <span style={{ fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px', backgroundColor: item.badgeBg, color: item.badgeColor }}>
                                                        {item.category}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '11.5px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.subtitle}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isSelected ? '#000B58' : '#94A3B8', fontSize: '12px', fontWeight: '500', flexShrink: 0, paddingLeft: '8px' }}>
                                            <span>Open</span>
                                            <ArrowRight size={13} />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                                No creation shortcuts found for "{searchTerm}"
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right: Date & Time + Profile Section */}
            <div className="top-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                
                {/* PWA Install Button */}
                {deferredPrompt && !isInstalled && (
                    <button
                        onClick={handleInstallApp}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            height: '38px',
                            padding: '0 14px',
                            borderRadius: '8px',
                            backgroundColor: '#000B58',
                            color: '#FFD54F',
                            border: 'none',
                            fontSize: '12.5px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0, 11, 88, 0.2)',
                            transition: 'all 0.15s ease',
                            userSelect: 'none'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                        title="Install SPH Billing Desktop / Mobile App"
                    >
                        <Download size={15} />
                        <span>Install App</span>
                    </button>
                )}

                {/* Modern Date & Time Badge */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    padding: '4px 12px 4px 5px', 
                    borderRadius: '8px', 
                    backgroundColor: '#F8FAFC', 
                    border: '1px solid #E2E8F0',
                    fontVariantNumeric: 'tabular-nums',
                    userSelect: 'none'
                }}>
                    <div style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '8px', 
                        backgroundColor: '#EFF6FF', 
                        border: '1px solid #DBEAFE',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Clock size={16} color="#1D4ED8" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: '1.2' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#000B58', letterSpacing: '0.2px' }}>
                            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>
                            {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                    </div>
                </div>

                {/* SPH Admin Profile Badge */}
                <div 
                    onClick={() => navigate('/settings')}
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        padding: '4px 12px 4px 5px', 
                        borderRadius: '8px', 
                        border: '1px solid #E2E8F0', 
                        backgroundColor: '#F8FAFC', 
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        userSelect: 'none'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = '#EFF6FF';
                        e.currentTarget.style.borderColor = '#BFDBFE';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '#F8FAFC';
                        e.currentTarget.style.borderColor = '#E2E8F0';
                    }}
                    title="Profile Settings"
                >
                    <div 
                        style={{ 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '8px', 
                            backgroundColor: '#000B58', 
                            color: '#FFD54F', 
                            fontWeight: '700', 
                            fontSize: '11.5px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            boxShadow: '0 1px 2px rgba(0, 11, 88, 0.15)',
                            letterSpacing: '0.5px',
                            flexShrink: 0
                        }}
                    >
                        SPH
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: '1.2' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#1E293B' }}>SPH Admin</span>
                        <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Administrator</span>
                    </div>
                </div>

            </div>
        </header>
    );
};

export default TopBar;
