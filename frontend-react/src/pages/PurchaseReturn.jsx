import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Search, X, ChevronDown, Plus, Building2, Download } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

const PurchaseReturn = () => {
    const [vendors, setVendors] = useState([]);
    const [purchaseReturns, setPurchaseReturns] = useState([]);
    
    // Filters
    const [searchVal, setSearchVal] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                const [vRes, prRes] = await Promise.all([
                    fetch('http://localhost:3000/api/vendors').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/purchase-returns').catch(() => ({ json: () => [] }))
                ]);
                const vData = await vRes.json();
                const prData = await prRes.json();
                
                setVendors(vData || []);
                setPurchaseReturns((prData || []).reverse()); // newest first
            } catch (err) {
                console.error('Error fetching data:', err);
            }
        };
        loadData();
    }, []);

    const filteredReturns = purchaseReturns.filter(pr => {
        if (vendorFilter && pr.vendorId !== vendorFilter) return false;
        
        if (searchVal) {
            const searchString = `${pr.returnNo || ''} ${pr.invoiceNo || ''} ${pr.vendorName || ''}`.toLowerCase();
            if (!searchString.includes(searchVal.toLowerCase())) return false;
        }
        
        return true;
    });

    const returnRows = filteredReturns.map((pr, idx) => {
        const amt = parseFloat(pr.grandTotal) || 0;

        return (
            <tr key={pr.id || idx} style={{ height: '50px' }}>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#1E293B', fontWeight: '500' }}>{idx + 1}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#1E293B', fontWeight: '500' }}>{formatDate(pr.date)}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <Link to={`/purchase-return/view/${pr.id}`} style={{ color: '#000B58', textDecoration: 'none', fontWeight: '600' }}>
                        {pr.returnNo || '-'}
                    </Link>
                </td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#1E293B', fontWeight: '600' }}>{pr.invoiceNo || '-'}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#1E293B', fontWeight: '500' }}>{pr.vendorName || '-'}</td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px', color: '#1E293B', fontWeight: '600' }}>₹{amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
            </tr>
        );
    });

    function formatDate(dateString) {
        if (!dateString) return '-';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '/'); // 12/05/26 format
    }

    const clearFilters = () => {
        setSearchVal('');
        setVendorFilter('');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#F8FAFC' }}>
            {/* Tabs */}
            <div className="page-tabs" style={{ padding: '0 24px 0 0', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                <NavLink to="/vendors" className="tab">Vendor</NavLink>
                <NavLink to="/purchase-invoice" className="tab">Purchase Invoice</NavLink>
                <NavLink to="/purchase-return" className="tab active">Purchase Return</NavLink>
                <NavLink to="/payment" className="tab">Payment</NavLink>
            </div>

            {/* Controls (Search, Export, Create) */}
            <div className="vendor-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 className="vendor-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginRight: '16px' }}>Purchase Return</h2>
                    
                    {/* Date Filter Button */}
                    <button className="date-filter-btn" style={{ backgroundColor: 'white', fontSize: '13px', borderRadius: '6px', height: '36px', border: '1px solid var(--border-color)', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer', minWidth: '100px', fontFamily: 'inherit', color: '#64748B' }}>
                        <span className="date-filter-text">Date</span>
                        <ChevronDown style={{ width: '14px', height: '14px' }} />
                    </button>

                    {/* Vendor Filter */}
                    <CustomSelect
                      value={vendorFilter}
                      onChange={setVendorFilter}
                      placeholder="Vendor Name"
                      options={[
                        { value: '', label: 'All Vendors' },
                        ...vendors.map(v => ({ value: v.id, label: v.vendorName }))
                      ]}
                      width="160px"
                      height="36px"
                    />

                    {/* Search Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', height: '36px', width: '220px', padding: '0 12px', boxSizing: 'border-box' }}>
                        <input 
                            type="text" 
                            placeholder="Search" 
                            value={searchVal}
                            onChange={(e) => setSearchVal(e.target.value)}
                            style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: '13px', width: '100%' }} 
                        />
                        <Search style={{ width: '14px', height: '14px', color: '#94A3B8', marginLeft: '8px' }} />
                    </div>

                    {/* Clear Button */}
                    <button 
                        onClick={clearFilters}
                        style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '6px', height: '36px', width: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', padding: '0', boxSizing: 'border-box' }}>
                        <X style={{ width: '16px', height: '16px' }} />
                    </button>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Export Dropdown */}
                    <CustomSelect
                      value=""
                      onChange={() => {}}
                      placeholder="Export"
                      options={[
                        { value: 'csv', label: 'Export CSV' },
                        { value: 'pdf', label: 'Export PDF' },
                      ]}
                      width="110px"
                      height="36px"
                    />

                    {/* Create Button */}
                    <Link to="/purchase-return/create" style={{ textDecoration: 'none', height: '36px', padding: '0 16px', border: 'none', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
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
                            <th style={{ backgroundColor: '#E2E8F0', padding: '10px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#475569', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                            <th style={{ backgroundColor: '#E2E8F0', padding: '10px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#475569', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '120px' }}>Date</th>
                            <th style={{ backgroundColor: '#E2E8F0', padding: '10px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#475569', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>PR No</th>
                            <th style={{ backgroundColor: '#E2E8F0', padding: '10px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#475569', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>PI No</th>
                            <th style={{ backgroundColor: '#E2E8F0', padding: '10px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#475569', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Vendor Name</th>
                            <th style={{ backgroundColor: '#E2E8F0', padding: '10px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#475569', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '150px' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {returnRows.length > 0 ? returnRows : (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                    No purchase returns available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PurchaseReturn;

