import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Package, ShoppingCart, UserCheck, Users, ReceiptText } from 'lucide-react';

const Sidebar = () => {
    const location = useLocation();
    const isItemsActive = location.pathname.startsWith('/items') || location.pathname.startsWith('/categories') || location.pathname.startsWith('/units');
    const isVendorActive = location.pathname.startsWith('/vendor') || location.pathname.startsWith('/purchase') || location.pathname.startsWith('/payment');

    return (
        <nav className="sidebar">
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
        </nav>
    );
};

export default Sidebar;

