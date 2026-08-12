import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Search, X, ChevronDown, Plus, Download } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

const Vendors = () => {
    const [vendors, setVendors] = useState([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState([]);
    const [purchaseReturns, setPurchaseReturns] = useState([]);
    const [searchVal, setSearchVal] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                const [vRes, piRes, prRes] = await Promise.all([
                    fetch('/api/vendors').catch(() => ({ json: () => [] })),
                    fetch('/api/purchase-invoices').catch(() => ({ json: () => [] })),
                    fetch('/api/purchase-returns').catch(() => ({ json: () => [] }))
                ]);
                const vData = await vRes.json();
                const piData = await piRes.json();
                const prData = await prRes.json();
                
                setVendors(vData || []);
                setPurchaseInvoices(piData || []);
                setPurchaseReturns(prData || []);
            } catch (err) {
                console.error('Error fetching vendors:', err);
            }
        };
        loadData();
    }, []);

    const filteredVendors = vendors.filter(v => 
        !searchVal || 
        v.vendorName?.toLowerCase().includes(searchVal.toLowerCase()) ||
        v.contactPerson?.toLowerCase().includes(searchVal.toLowerCase())
    );

    let totalVendorPending = 0;
    let totalVendorPurchase = 0;

    const vendorRows = filteredVendors.map((v, idx) => {
        const vendorInvoices = purchaseInvoices.filter(pi => String(pi.vendorId) === String(v.id));
        const vendorReturns = purchaseReturns.filter(pr => String(pr.vendorId) === String(v.id));
        
        let vendorPurchaseAmt = 0;
        let vendorPendingToPay = 0;
        let creditBalance = 0;

        vendorInvoices.forEach(pi => {
            vendorPurchaseAmt += parseFloat(pi.amount) || 0;
            vendorPendingToPay += parseFloat(pi.pendingToPay) || 0;
        });

        vendorReturns.forEach(pr => {
            creditBalance += parseFloat(pr.storeCredit) || 0;
        });

        if (v.balanceType === 'To Pay') {
            vendorPendingToPay += parseFloat(v.openingBalance) || 0;
        }

        totalVendorPending += vendorPendingToPay;
        totalVendorPurchase += vendorPurchaseAmt;

        return (
            <tr key={v.id} style={{ height: '40px' }}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}><Link to={`/vendors/view/${v.id}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: '500' }}>{v.vendorName}</Link></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{v.contactPerson || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{v.contactNumber || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>₹{vendorPurchaseAmt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: vendorPendingToPay > 0 ? '#EF4444' : 'var(--text-main)', fontWeight: vendorPendingToPay > 0 ? '600' : '400' }}>₹{Math.max(0, vendorPendingToPay).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px', color: creditBalance > 0 ? '#22C55E' : 'var(--text-main)', fontWeight: creditBalance > 0 ? '600' : '400' }}>₹{creditBalance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
            </tr>
        );
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#F8FAFC' }}>
            {/* Tabs */}
            <div className="page-tabs" style={{ padding: '0 16px 0 0', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                <NavLink to="/vendors" className="tab active">Vendor</NavLink>
                <NavLink to="/purchase-invoice" className="tab">Purchase Invoice</NavLink>
                <NavLink to="/purchase-return" className="tab">Purchase Return</NavLink>
                <NavLink to="/payment" className="tab">Payment</NavLink>
            </div>

            {/* Score Cards */}
            <div className="vendor-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', padding: '16px', margin: 0 }}>
                <div className="vendor-stat-card" style={{ background: 'white', border: '1.5px solid #000B58', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <span className="vendor-stat-label" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Total Vendor</span>
                    <span className="vendor-stat-value" style={{ fontSize: '20px', fontWeight: '700', color: '#000B58', alignSelf: 'flex-end' }}>{vendors.length}</span>
                </div>
                <div className="vendor-stat-card" style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <span className="vendor-stat-label" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Purchase Amount</span>
                    <span className="vendor-stat-value" style={{ fontSize: '20px', fontWeight: '700', color: '#22C55E', alignSelf: 'flex-end' }}>₹{totalVendorPurchase.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>
                </div>
                <div className="vendor-stat-card" style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <span className="vendor-stat-label" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Pending to Pay</span>
                    <span className="vendor-stat-value value-red" style={{ fontSize: '20px', fontWeight: '700', color: '#EF4444', alignSelf: 'flex-end' }}>₹{totalVendorPending.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</span>
                </div>
            </div>

            {/* Controls (Search, Export, Create) */}
            <div className="vendor-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <h2 className="vendor-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginRight: '24px' }}>Vendor</h2>
                    
                    {/* Search Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', height: '38px', width: '260px', padding: '0 12px', boxSizing: 'border-box', marginRight: '8px' }}>
                        <input 
                            type="text" 
                            placeholder="Search" 
                            value={searchVal}
                            onChange={(e) => setSearchVal(e.target.value)}
                            style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: '14px', width: '100%' }} 
                        />
                        <Search style={{ width: '16px', height: '16px', color: 'var(--text-muted)', marginLeft: '8px' }} />
                    </div>

                    {/* Clear Button */}
                    <button 
                        onClick={() => setSearchVal('')}
                        style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', width: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '0', boxSizing: 'border-box' }}>
                        <X style={{ width: '18px', height: '18px' }} />
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
                    <Link to="/vendors/create" style={{ textDecoration: 'none', height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
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
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '80px' }}>S. No.</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '250px' }}>Vendor Name</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Contact Person</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Contact Number</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Purchase Amount</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Pending to Pay</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '200px' }}>Credit Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vendorRows.length > 0 ? vendorRows : (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                    No vendors available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Vendors;
