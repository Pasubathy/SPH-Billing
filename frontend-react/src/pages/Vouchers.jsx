import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Plus, Download, Receipt } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import DateFilterPopover from '../components/DateFilterPopover';
import apiFetch from '../utils/api';

const Vouchers = () => {
    const [vouchers, setVouchers] = useState([]);
    
    // Filters
    const [searchVal, setSearchVal] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [dateFilter, setDateFilter] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const res = await apiFetch('/api/vouchers');
                if (res.ok) {
                    const data = await res.json();
                    setVouchers(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error('Error fetching vouchers:', err);
            }
        };
        loadData();
    }, []);

    const filteredVouchers = vouchers.filter(v => {
        if (typeFilter && (v.voucherType || '').toLowerCase() !== typeFilter.toLowerCase()) return false;
        
        if (searchVal) {
            const searchString = `${v.voucherNo || ''} ${v.partyName || ''} ${v.category || ''} ${v.narration || ''}`.toLowerCase();
            if (!searchString.includes(searchVal.toLowerCase())) return false;
        }

        if (dateFilter && dateFilter.start && dateFilter.end) {
            let vDate;
            if (v.date && v.date.includes('/')) {
                const parts = v.date.split('/');
                if (parts.length === 3) {
                    vDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                } else {
                    vDate = new Date(v.date).getTime();
                }
            } else {
                vDate = new Date(v.date).getTime();
            }
            
            const start = new Date(dateFilter.start.getFullYear(), dateFilter.start.getMonth(), dateFilter.start.getDate()).getTime();
            const end = new Date(dateFilter.end.getFullYear(), dateFilter.end.getMonth(), dateFilter.end.getDate(), 23, 59, 59, 999).getTime();
            
            if (isNaN(vDate) || vDate < start || vDate > end) return false;
        }
        
        return true;
    });

    let totalPayment = 0;
    let totalReceipt = 0;

    const voucherRows = filteredVouchers.map((v, idx) => {
        const amt = parseFloat(v.amount) || 0;
        const isPayment = (v.voucherType || 'Payment').toLowerCase() === 'payment';
        
        if (isPayment) {
            totalPayment += amt;
        } else {
            totalReceipt += amt;
        }

        return (
            <tr key={v.id || idx} style={{ height: '40px' }}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(v.date)}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <Link to={`/voucher/view/${v.id}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: '500' }}>
                        {v.voucherNo || '-'}
                    </Link>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{v.category || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{v.partyName || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{v.paymentMode || 'Cash'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>₹{amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px' }}>
                    {isPayment ? (
                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: 'white', textAlign: 'center', minWidth: '80px', boxSizing: 'border-box', backgroundColor: '#EF4444' }}>Payment</span>
                    ) : (
                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', color: 'white', textAlign: 'center', minWidth: '80px', boxSizing: 'border-box', backgroundColor: '#22C55E' }}>Receipt</span>
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
        setTypeFilter('');
        setDateFilter(null);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#F8FAFC' }}>
            
            {/* Score Cards (Exact Purchase Invoice Design) */}
            <div className="vendor-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', padding: '16px', margin: 0 }}>
                <div className="vendor-stat-card" style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <span className="vendor-stat-label" style={{ fontSize: '13px', fontWeight: '500', color: '#475569', alignSelf: 'flex-start' }}>Total Payment (Expenses)</span>
                    <span className="vendor-stat-value" style={{ fontSize: '20px', fontWeight: '700', color: '#000B58', alignSelf: 'flex-end' }}>
                        ₹{totalPayment.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}
                    </span>
                </div>
                <div className="vendor-stat-card" style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <span className="vendor-stat-label" style={{ fontSize: '13px', fontWeight: '500', color: '#475569', alignSelf: 'flex-start' }}>Total Receipt (Income)</span>
                    <span className="vendor-stat-value value-red" style={{ fontSize: '20px', fontWeight: '700', color: '#EF4444', alignSelf: 'flex-end' }}>
                        ₹{totalReceipt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}
                    </span>
                </div>
            </div>

            {/* Controls (Search, DateFilter, Export, Create) */}
            <div className="vendor-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 className="vendor-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginRight: '0' }}>Vouchers</h2>
                    
                    {/* Date Filter */}
                    <DateFilterPopover 
                        value={dateFilter}
                        onChange={setDateFilter}
                    />

                    {/* Type Filter */}
                    <CustomSelect
                      value={typeFilter}
                      onChange={setTypeFilter}
                      placeholder="Voucher Type"
                      options={[
                        { value: '', label: 'All Types' },
                        { value: 'Payment', label: 'Payment' },
                        { value: 'Receipt', label: 'Receipt' }
                      ]}
                      width="150px"
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
                    <Link to="/voucher/create" style={{ textDecoration: 'none', height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
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
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '130px' }}>Voucher No</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '220px' }}>Category</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '220px' }}>Party Name</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '140px' }}>Payment Mode</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '160px' }}>Amount</th>
                            <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '120px' }}>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        {voucherRows.length > 0 ? voucherRows : (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                    No vouchers available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Vouchers;
