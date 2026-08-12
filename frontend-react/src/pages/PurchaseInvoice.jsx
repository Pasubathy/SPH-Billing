import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Search, X, ChevronDown, Plus, Building2, Download } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import DateFilterPopover from '../components/DateFilterPopover';

const PurchaseInvoice = () => {
    const [vendors, setVendors] = useState([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState([]);
    
    // Filters
    const [searchVal, setSearchVal] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');
    const [dateFilter, setDateFilter] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [vRes, piRes] = await Promise.all([
                    fetch('/api/vendors').catch(() => ({ json: () => [] })),
                    fetch('/api/purchase-invoices').catch(() => ({ json: () => [] }))
                ]);
                const vData = await vRes.json();
                const piData = await piRes.json();
                
                setVendors(vData || []);
                setPurchaseInvoices((piData || []).reverse()); // newest first
            } catch (err) {
                console.error('Error fetching data:', err);
            }
        };
        loadData();
    }, []);

    const filteredInvoices = purchaseInvoices.filter(pi => {
        if (vendorFilter && pi.vendorId !== vendorFilter) return false;
        
        if (searchVal) {
            const searchString = `${pi.piNo || ''} ${pi.vendorName || ''}`.toLowerCase();
            if (!searchString.includes(searchVal.toLowerCase())) return false;
        }

        if (dateFilter && dateFilter.start && dateFilter.end) {
            let piDate;
            if (pi.date && pi.date.includes('/')) {
                const parts = pi.date.split('/');
                if (parts.length === 3) {
                    piDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                } else {
                    piDate = new Date(pi.date).getTime();
                }
            } else {
                piDate = new Date(pi.date).getTime();
            }
            
            const start = new Date(dateFilter.start.getFullYear(), dateFilter.start.getMonth(), dateFilter.start.getDate()).getTime();
            const end = new Date(dateFilter.end.getFullYear(), dateFilter.end.getMonth(), dateFilter.end.getDate(), 23, 59, 59, 999).getTime();
            
            if (isNaN(piDate) || piDate < start || piDate > end) return false;
        }
        
        return true;
    });

    let totalPurchase = 0;
    let totalPending = 0;

    const invoiceRows = filteredInvoices.map((pi, idx) => {
        const amt = parseFloat(pi.amount) || 0;
        const pend = parseFloat(pi.pendingToPay) || 0;
        
        totalPurchase += amt;
        totalPending += pend;

        const isPaid = pend === 0;

        return (
            <tr key={pi.id || idx} style={{ height: '40px' }}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(pi.date)}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <Link to={`/purchase-invoice/view/${pi.id}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: '500' }}>
                        {pi.piNo || '-'}
                    </Link>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{pi.vendorName || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>₹{amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#EF4444', fontWeight: '600' }}>₹{pend.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(pi.dueDate)}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px' }}>
                    {isPaid ? (
                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: 'white', textAlign: 'center', minWidth: '80px', boxSizing: 'border-box', backgroundColor: '#22C55E' }}>Paid</span>
                    ) : (
                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: 'white', textAlign: 'center', minWidth: '80px', boxSizing: 'border-box', backgroundColor: '#EF4444' }}>Pending</span>
                    )}
                </td>
            </tr>
        );
    });

    function formatDate(dateString) {
        if (!dateString) return '-';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    const clearFilters = () => {
        setSearchVal('');
        setVendorFilter('');
        setDateFilter(null);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#F8FAFC' }}>
            {/* Tabs */}
            <div className="page-tabs" style={{ padding: '0 16px 0 0', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                <NavLink to="/vendors" className="tab">Vendor</NavLink>
                <NavLink to="/purchase-invoice" className="tab active">Purchase Invoice</NavLink>
                <NavLink to="/purchase-return" className="tab">Purchase Return</NavLink>
                <NavLink to="/payment" className="tab">Payment</NavLink>
            </div>

            {/* Score Cards */}
            <div className="vendor-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', padding: '16px', margin: 0 }}>
                <div className="vendor-stat-card" style={{ background: 'white', border: '1.5px solid #000B58', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <span className="vendor-stat-label" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Purchase Amount</span>
                    <span className="vendor-stat-value" style={{ fontSize: '20px', fontWeight: '700', color: '#000B58', alignSelf: 'flex-end' }}>
                        ₹{totalPurchase.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}
                    </span>
                </div>
                <div className="vendor-stat-card" style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <span className="vendor-stat-label" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Pending to Pay</span>
                    <span className="vendor-stat-value value-red" style={{ fontSize: '20px', fontWeight: '700', color: '#EF4444', alignSelf: 'flex-end' }}>
                        ₹{totalPending.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}
                    </span>
                </div>
            </div>

            {/* Controls (Search, Export, Create) */}
            <div className="vendor-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 className="vendor-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginRight: '0' }}>Purchase Invoice</h2>
                    
                    {/* Date Filter */}
                    <DateFilterPopover 
                        value={dateFilter}
                        onChange={setDateFilter}
                    />

                    {/* Vendor Filter */}
                    <CustomSelect
                      value={vendorFilter}
                      onChange={setVendorFilter}
                      placeholder="Vendor Name"
                      icon={<Building2 />}
                      options={[
                        { value: '', label: 'All Vendors' },
                        ...vendors.map(v => ({ value: v.id, label: v.vendorName }))
                      ]}
                      width="160px"
                      height="38px"
                    />

                    {/* Search Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', height: '38px', width: '220px', padding: '0 12px', boxSizing: 'border-box' }}>
                        <input 
                            type="text" 
                            placeholder="Search" 
                            value={searchVal}
                            onChange={(e) => setSearchVal(e.target.value)}
                            style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: '13px', width: '100%' }} 
                        />
                        <Search style={{ width: '14px', height: '14px', color: 'var(--text-muted)', marginLeft: '8px' }} />
                    </div>

                    {/* Clear Button */}
                    <button 
                        onClick={clearFilters}
                        style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', width: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '0', boxSizing: 'border-box' }}>
                        <X style={{ width: '16px', height: '16px' }} />
                    </button>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Export Dropdown */}
                    <CustomSelect
                      value=""
                      onChange={() => {}}
                      placeholder="Export"
                      icon={<Download />}
                      options={[
                        { value: 'csv', label: 'Export CSV' },
                        { value: 'pdf', label: 'Export PDF' },
                      ]}
                      width="120px"
                      height="38px"
                    />

                    {/* Create Button */}
                    <Link to="/purchase-invoice/create" style={{ textDecoration: 'none', height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
                        <Plus style={{ width: '16px', height: '16px' }} />
                        <span>Create</span>
                    </Link>
                </div>
            </div>

            {/* Table */}
            <div className="vendor-table-container" style={{ margin: '0 16px 16px 16px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', overflowY: 'auto', flex: 1 }}>
                <table className="vendor-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ height: '40px' }}>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '120px' }}>Date</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '120px' }}>PI No</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '250px' }}>Vendor Name</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '180px' }}>Invoice Amount</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>Pending</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '120px' }}>Due Date</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '120px' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoiceRows.length > 0 ? invoiceRows : (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                    No purchase invoices available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PurchaseInvoice;
