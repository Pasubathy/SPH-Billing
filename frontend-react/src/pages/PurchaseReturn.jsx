import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Search, X, Plus, Building2, Download } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import DateFilterPopover from '../components/DateFilterPopover';

const PurchaseReturn = () => {
    const navigate = useNavigate();
    const [vendors, setVendors] = useState([]);
    const [purchaseReturns, setPurchaseReturns] = useState([]);
    
    // Filters
    const [searchVal, setSearchVal] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');
    const [dateFilter, setDateFilter] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [vRes, prRes] = await Promise.all([
                    fetch('/api/vendors').catch(() => ({ json: () => [] })),
                    fetch('/api/purchase-returns').catch(() => ({ json: () => [] }))
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
        if (vendorFilter && String(pr.vendorId) !== String(vendorFilter)) return false;
        
        if (searchVal) {
            const searchString = `${pr.returnNo || ''} ${pr.invoiceNo || ''} ${pr.vendorName || ''}`.toLowerCase();
            if (!searchString.includes(searchVal.toLowerCase())) return false;
        }

        if (dateFilter && dateFilter.start && dateFilter.end) {
            let prDate;
            if (pr.date && pr.date.includes('/')) {
                const parts = pr.date.split('/');
                if (parts.length === 3) {
                    prDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                } else {
                    prDate = new Date(pr.date).getTime();
                }
            } else {
                prDate = new Date(pr.date).getTime();
            }
            
            const start = new Date(dateFilter.start.getFullYear(), dateFilter.start.getMonth(), dateFilter.start.getDate()).getTime();
            const end = new Date(dateFilter.end.getFullYear(), dateFilter.end.getMonth(), dateFilter.end.getDate(), 23, 59, 59, 999).getTime();
            
            if (isNaN(prDate) || prDate < start || prDate > end) return false;
        }
        
        return true;
    });

    const returnRows = filteredReturns.map((pr, idx) => {
        const amt = parseFloat(pr.grandTotal || pr.totalAmount || pr.amount) || 0;

        return (
            <tr 
                key={pr.id || idx} 
                onClick={() => navigate(`/purchase-return/view/${pr.id}`)}
                style={{ height: '40px', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(pr.date)}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <Link to={`/purchase-return/view/${pr.id}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: '500' }}>
                        {pr.returnNo || '-'}
                    </Link>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{pr.invoiceNo || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{pr.vendorName || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px' }}>₹{amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
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
                <NavLink to="/purchase-invoice" className="tab">Purchase Invoice</NavLink>
                <NavLink to="/purchase-return" className="tab active">Purchase Return</NavLink>
                <NavLink to="/payment" className="tab">Payment</NavLink>
            </div>

            {/* Controls (Search, Export, Create) */}
            <div className="vendor-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', margin: '16px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 className="vendor-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginRight: '0' }}>Purchase Return</h2>
                    
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
                    <Link to="/purchase-return/create" style={{ textDecoration: 'none', height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
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
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '140px' }}>PR No</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '140px' }}>PI No</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Vendor Name</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '180px' }}>Total Amount</th>
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

