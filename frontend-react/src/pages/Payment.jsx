import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Search, X, ChevronDown, Plus, Download } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

const Payment = () => {
    const [payments, setPayments] = useState([]);
    const [vendors, setVendors] = useState([]);
    
    // Filters
    const [searchVal, setSearchVal] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                const [pRes, vRes] = await Promise.all([
                    fetch('http://localhost:3000/api/vendor-payments').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/vendors').catch(() => ({ json: () => [] }))
                ]);
                const pData = await pRes.json();
                const vData = await vRes.json();
                
                setPayments((pData || []).reverse());
                setVendors(vData || []);
            } catch (err) {
                console.error('Error fetching data:', err);
            }
        };
        loadData();
    }, []);

    const filteredPayments = payments.filter(p => {
        if (searchVal) {
            const searchString = `${p.pmtNo || ''} ${p.vendorName || ''}`.toLowerCase();
            if (!searchString.includes(searchVal.toLowerCase())) return false;
        }
        return true;
    });

    let totalPaid = 0;
    const paymentRows = filteredPayments.map((p, idx) => {
        const pmtAmt = parseFloat(p.paidAmount) || 0;
        const discAmt = parseFloat(p.discount) || 0;
        const totalAllocated = p.invoices ? p.invoices.reduce((sum, inv) => sum + (parseFloat(inv.allocated) || 0), 0) : pmtAmt + discAmt;
        
        let actualAmt = pmtAmt;
        if (pmtAmt + discAmt > totalAllocated && p.invoices && p.invoices.length > 0) {
            actualAmt = Math.max(0, totalAllocated - discAmt);
        }
        
        totalPaid += actualAmt;

        return (
            <tr key={p.id || idx} style={{ height: '40px' }}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(p.date)}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <Link to={`/payment/view/${p.id}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: '500' }}>
                        {p.pmtNo || '-'}
                    </Link>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{p.vendorName || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>₹{actualAmt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px' }}>
                    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: 'white', textAlign: 'center', minWidth: '80px', boxSizing: 'border-box', backgroundColor: '#22C55E' }}>Paid</span>
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#F8FAFC' }}>
            {/* Tabs */}
            <div className="page-tabs" style={{ padding: '0 24px 0 0', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                <NavLink to="/vendors" className="tab">Vendor</NavLink>
                <NavLink to="/purchase-invoice" className="tab">Purchase Invoice</NavLink>
                <NavLink to="/purchase-return" className="tab">Purchase Return</NavLink>
                <NavLink to="/payment" className="tab active">Payment</NavLink>
            </div>



            {/* Controls */}
            <div className="vendor-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 0 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 className="vendor-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginRight: '0' }}>Payment</h2>
                    
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

                    <button 
                        onClick={() => setSearchVal('')}
                        style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '6px', height: '38px', width: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '0', boxSizing: 'border-box' }}>
                        <X style={{ width: '16px', height: '16px' }} />
                    </button>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

                    <Link to="/payment/create" style={{ textDecoration: 'none', height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
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
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>Date</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>PMT No</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '300px' }}>Vendor Name</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Paid Amount</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '150px' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paymentRows.length > 0 ? paymentRows : (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                    No payments available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Payment;
