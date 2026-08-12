import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Package, ShoppingCart, UserCheck, Users, ReceiptText, LogOut } from 'lucide-react';

const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    const isItemsActive = location.pathname.startsWith('/items') || location.pathname.startsWith('/categories') || location.pathname.startsWith('/units');
    const isVendorActive = location.pathname.startsWith('/vendor') || location.pathname.startsWith('/purchase') || location.pathname.startsWith('/payment');

    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const handleLogoutClick = () => {
        setShowLogoutModal(true);
    };

    const handleLogoutConfirm = async () => {
        try {
            const token = localStorage.getItem('sph_auth_token');
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
        } catch (e) {
            console.error('Logout request failed:', e);
        }
        localStorage.removeItem('sph_auth_token');
        navigate('/login', { replace: true });
    };

    return (
        <nav className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                <img src="/Icons/Home icon.svg" alt="Home" className="nav-icon" />
                <span>Home</span>
            </NavLink>
            <NavLink to="/items" className={() => `nav-item ${isItemsActive ? 'active' : ''}`}>
                <img src="/Icons/Items icon.svg" alt="Items" className="nav-icon" />
                <span>Items</span>
            </NavLink>
            <NavLink to="/sales/create" className={() => `nav-item ${location.pathname.startsWith('/sales') ? 'active' : ''}`}>
                <img src="/Icons/Sales icon.svg" alt="Sales" className="nav-icon" />
                <span>Sales</span>
            </NavLink>
            <NavLink to="/vendors" className={() => `nav-item ${isVendorActive ? 'active' : ''}`}>
                <img src="/Icons/Vendor Icon.svg" alt="Vendor" className="nav-icon" />
                <span>Vendor</span>
            </NavLink>
            <NavLink to="/voucher" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <img src="/Icons/Voucher icon.svg" alt="Voucher" className="nav-icon" />
                <span>Voucher</span>
            </NavLink>

            <div style={{ marginTop: 'auto' }}>
                <div 
                    className="nav-item" 
                    onClick={handleLogoutClick}
                    style={{ cursor: 'pointer', marginBottom: '20px' }}
                >
                    <LogOut size={24} color="#64748B" className="nav-icon" style={{ strokeWidth: '1.5px' }} />
                    <span>Logout</span>
                </div>
            </div>

            {showLogoutModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '16px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ background: '#FEE2E2', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <LogOut size={24} color="#EF4444" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1E293B' }}>Confirm Logout</h3>
                        </div>
                        <p style={{ margin: '0 0 24px 0', color: '#64748B', fontSize: '14px', lineHeight: '1.5' }}>
                            Are you sure you want to log out of the application? You will need to sign in again to access your account.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setShowLogoutModal(false)}
                                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleLogoutConfirm}
                                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#EF4444', color: 'white', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}
                            >
                                Log out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Sidebar;

