import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Search, X, ChevronDown, Plus, Download, Users } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import CustomerModal from '../components/CustomerModal';
import CreateAmountReceived from '../components/CreateAmountReceived';
import ViewSalesInvoice from './ViewSalesInvoice';
import ViewSalesReturnsInvoice from './ViewSalesReturn';
import ViewAmountReceived from './ViewAmountReceived';
import ViewCustomer from './ViewCustomer';
import DateFilterPopover from '../components/DateFilterPopover';
import '../assets/css/sales.css';

const Sales = () => {
    const [customers, setCustomers] = useState([]);
    const [salesInvoices, setSalesInvoices] = useState([]);
    const [amountReceivedHistory, setAmountReceivedHistory] = useState([]);
    const [salesReturns, setSalesReturns] = useState([]);
    const [activeTab, setActiveTab] = useState(window.location.hash.replace('#', '') || 'salesList');
    
    // UI states
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [isCreatingAR, setIsCreatingAR] = useState(false);
    const [viewSale, setViewSale] = useState(null);
    const [viewReturn, setViewReturn] = useState(null);
    const [viewAR, setViewAR] = useState(null);
    const [editAR, setEditAR] = useState(null);
    const [viewCustomer, setViewCustomer] = useState(null);

    // Filters
    const [searchVal, setSearchVal] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [dateFilter, setDateFilter] = useState(null);
    const [statusFilter, setStatusFilter] = useState('All');

    useEffect(() => {
        const loadData = async () => {
            try {
                const [cRes, siRes, arRes, srRes] = await Promise.all([
                    fetch('http://localhost:3000/api/customers').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/sales').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/payments').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/sales-returns').catch(() => ({ json: () => [] }))
                ]);
                const cData = await cRes.json();
                const siData = await siRes.json();
                const arData = await arRes.json();
                const srData = await srRes.json();
                
                let cList = cData || [];
                if (!cList.find(c => c.id === 'walk-in' || c.name === 'Walk In Customer')) {
                    cList = [{ id: 'walk-in', name: 'Walk In Customer', mobile: '9944093468' }, ...cList];
                }
                
                setCustomers(cList);
                setSalesInvoices((siData || []).reverse());
                setAmountReceivedHistory((arData || []).reverse());
                setSalesReturns((srData || []).reverse());
            } catch (err) {
                console.error('Error fetching data:', err);
            }
        };
        loadData();

        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '');
            if (hash && ['salesList', 'customer', 'amountReceived', 'salesReturn'].includes(hash)) {
                setActiveTab(hash);
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    // Filter Sales List
    const filteredInvoices = salesInvoices.filter(si => {
        if (customerFilter && String(si.customerId) !== String(customerFilter) && si.customerName !== customerFilter) return false;
        
        if (searchVal) {
            const searchLower = searchVal.toLowerCase();
            const invMatch = (si.invoiceNumber || si.invoiceNo || '').toLowerCase().includes(searchLower);
            const custMatch = (si.customerName || '').toLowerCase().includes(searchLower);
            if (!invMatch && !custMatch) return false;
        }

        if (dateFilter && dateFilter.start && dateFilter.end) {
            let siDate;
            if (si.date && si.date.includes('/')) {
                const parts = si.date.split('/');
                if (parts.length === 3) {
                    siDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                } else {
                    siDate = new Date(si.date).getTime();
                }
            } else {
                siDate = new Date(si.date).getTime();
            }
            
            const start = new Date(dateFilter.start.getFullYear(), dateFilter.start.getMonth(), dateFilter.start.getDate()).getTime();
            const end = new Date(dateFilter.end.getFullYear(), dateFilter.end.getMonth(), dateFilter.end.getDate(), 23, 59, 59, 999).getTime();
            
            if (isNaN(siDate) || siDate < start || siDate > end) return false;
        }
        
        if (statusFilter && statusFilter !== 'All') {
            const amt = parseFloat(si.totalAmount || si.grandTotal) || 0;
            const rec = parseFloat(si.paidAmount || si.receivedAmount) || 0;
            const pend = Math.max(0, amt - rec);
            if (statusFilter === 'Pending' && pend === 0) return false;
            if (statusFilter === 'Paid' && pend > 0) return false;
        }
        
        return true;
    });

    let totalAmount = 0;
    let totalPending = 0;

    const invoiceRows = filteredInvoices.map((si, idx) => {
        const amt = parseFloat(si.totalAmount || si.grandTotal) || 0;
        const rec = parseFloat(si.paidAmount || si.receivedAmount) || 0;
        const pend = Math.max(0, amt - rec);
        
        totalAmount += amt;
        totalPending += pend;

        const isPaid = pend === 0;

        return (
            <tr 
                key={si.id || idx} 
                onClick={() => setViewSale(si)}
                style={{ height: '40px', cursor: 'pointer', transition: 'background-color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(si.date)}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <span style={{ color: '#2563EB', fontWeight: '500' }}>
                        {si.invoiceNumber || si.invoiceNo || '-'}
                    </span>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{si.customerName || '-'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>₹{amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: pend > 0 ? '#EF4444' : 'var(--text-main)', fontWeight: pend > 0 ? '600' : '400' }}>₹{pend.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
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
        setCustomerFilter('');
        setDateFilter(null);
        setStatusFilter('All');
    };

    // Calculate Customer Tab Data
    const customerListWithStats = customers.map(c => {
        const cName = (c.name || c.customerName || '').toLowerCase();
        let totalPurchase = 0;
        let totalPending = 0;
        
        salesInvoices.forEach(si => {
            if ((si.customerName || '').toLowerCase() === cName) {
                const amt = parseFloat(si.totalAmount || si.grandTotal) || 0;
                const rec = parseFloat(si.paidAmount || si.receivedAmount) || 0;
                totalPurchase += amt;
                totalPending += Math.max(0, amt - rec);
            }
        });
        
        let storeCredit = 0;
        salesReturns.forEach(sr => {
            if ((sr.customerName || '').toLowerCase() === cName) {
                storeCredit += parseFloat(sr.storeCredit || 0);
            }
        });
        
        return { ...c, totalPurchase, totalPending, storeCredit };
    });

    const filteredCustomers = customerListWithStats.filter(c => {
        if (!searchVal) return true;
        return (c.name || c.customerName || '').toLowerCase().includes(searchVal.toLowerCase()) || 
               (c.mobile || '').includes(searchVal);
    });

    let globalAmountToReceive = 0;
    customerListWithStats.forEach(c => globalAmountToReceive += c.totalPending);

    // Calculate Amount Received Tab Data
    
    const filteredSalesReturns = salesReturns.filter(sr => {
        if (customerFilter && String(sr.customerId) !== String(customerFilter) && sr.customerName !== customerFilter) return false;
        
        if (searchVal) {
            const searchLower = searchVal.toLowerCase();
            const retMatch = (sr.returnNo || '').toLowerCase().includes(searchLower);
            const invMatch = (sr.invoiceNo || '').toLowerCase().includes(searchLower);
            const custMatch = (sr.customerName || '').toLowerCase().includes(searchLower);
            if (!retMatch && !invMatch && !custMatch) return false;
        }

        if (dateFilter && dateFilter.start && dateFilter.end) {
            let srDate;
            if (sr.date && sr.date.includes('/')) {
                const parts = sr.date.split('/');
                if (parts.length === 3) {
                    srDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                } else {
                    srDate = new Date(sr.date).getTime();
                }
            } else {
                srDate = new Date(sr.date).getTime();
            }
            
            const start = new Date(dateFilter.start.getFullYear(), dateFilter.start.getMonth(), dateFilter.start.getDate()).getTime();
            const end = new Date(dateFilter.end.getFullYear(), dateFilter.end.getMonth(), dateFilter.end.getDate(), 23, 59, 59, 999).getTime();
            
            if (isNaN(srDate) || srDate < start || srDate > end) return false;
        }

        return true;
    });

    const filteredAR = amountReceivedHistory.filter(ar => {
        if (searchVal) {
            const searchString = `${ar.arNo || ''} ${ar.customerName || ''}`.toLowerCase();
            if (!searchString.includes(searchVal.toLowerCase())) return false;
        }

        if (dateFilter && dateFilter.start && dateFilter.end) {
            let arDate;
            if (ar.date && ar.date.includes('/')) {
                const parts = ar.date.split('/');
                if (parts.length === 3) {
                    arDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                } else {
                    arDate = new Date(ar.date).getTime();
                }
            } else {
                arDate = new Date(ar.date).getTime();
            }
            
            const start = new Date(dateFilter.start.getFullYear(), dateFilter.start.getMonth(), dateFilter.start.getDate()).getTime();
            const end = new Date(dateFilter.end.getFullYear(), dateFilter.end.getMonth(), dateFilter.end.getDate(), 23, 59, 59, 999).getTime();
            
            if (isNaN(arDate) || arDate < start || arDate > end) return false;
        }

        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#F8FAFC', fontFamily: 'Manrope, sans-serif' }}>
            {/* Tabs */}
            {!(activeTab === 'salesList' && viewSale) && !(activeTab === 'amountReceived' && (isCreatingAR || viewAR)) && !(activeTab === 'salesReturn' && viewReturn) && !(activeTab === 'customer' && viewCustomer) && (
            <div className="page-tabs" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '16px', backgroundColor: '#F8F9FA', height: '45px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', height: '100%' }}>
                    <Link 
                        to="/sales/create"
                        className="tab"
                        style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
                        Billing
                    </Link>
                    <div 
                        onClick={() => { setActiveTab('salesList'); window.location.hash = 'salesList'; }}
                        className={`tab ${activeTab === 'salesList' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        Sales List
                    </div>
                    <div 
                        onClick={() => { setActiveTab('customer'); window.location.hash = 'customer'; }}
                        className={`tab ${activeTab === 'customer' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        Customer
                    </div>
                    <div 
                        onClick={() => { setActiveTab('amountReceived'); window.location.hash = 'amountReceived'; }}
                        className={`tab ${activeTab === 'amountReceived' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        Amount Received
                    </div>
                    <div 
                        onClick={() => { setActiveTab('salesReturn'); window.location.hash = 'salesReturn'; }}
                        className={`tab ${activeTab === 'salesReturn' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        Sales Return
                    </div>
                </div>
            </div>
            )}

            {activeTab === 'salesList' && (
                viewSale ? (
                    <ViewSalesInvoice 
                        initialSale={viewSale} 
                        allSales={salesInvoices} 
                        customers={customers}
                        onBack={() => setViewSale(null)} 
                    />
                ) : (
                <>
                    {/* Score Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', padding: '16px', margin: 0 }}>
                        <div style={{ background: 'white', border: '1.5px solid #000B58', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Total Amount</span>
                            <span style={{ fontSize: '20px', fontWeight: '700', color: '#000B58', alignSelf: 'flex-end' }}>
                                ₹{totalAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}
                            </span>
                        </div>
                        <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Amount to Receive</span>
                            <span style={{ fontSize: '20px', fontWeight: '700', color: '#EF4444', alignSelf: 'flex-end' }}>
                                ₹{totalPending.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}
                            </span>
                        </div>
                    </div>

                    {/* Controls (Search, Export, Create) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: '0' }}>Sales List</h2>
                            
                            <DateFilterPopover 
                                value={dateFilter}
                                onChange={setDateFilter}
                            />
                            
                            <div style={{ width: '130px' }}>
                                <CustomSelect 
                                    options={[{value: 'All', label: 'All Status'}, {value: 'Pending', label: 'Pending'}, {value: 'Paid', label: 'Completed'}]}
                                    value={statusFilter}
                                    onChange={(val) => setStatusFilter(val)}
                                    placeholder="All Status"
                                />
                            </div>
                            
                            <CustomSelect
                                value={customerFilter}
                                onChange={setCustomerFilter}
                                placeholder="Customer Name"
                                icon={<Users />}
                                options={[
                                    { value: '', label: 'All Customers' },
                                    ...customers.map(c => ({ value: c.id, label: c.customerName || c.name }))
                                ]}
                                width="180px"
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
                            <Link to="/sales/create" style={{ textDecoration: 'none', height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
                                <Plus style={{ width: '16px', height: '16px' }} />
                                <span>Create</span>
                            </Link>
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ margin: '0 16px 16px 16px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', overflowY: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ height: '40px' }}>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '120px' }}>Date</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '120px' }}>INV No</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '250px' }}>Customer Name</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '180px' }}>Invoice Amount</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>Pending</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '120px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoiceRows.length > 0 ? invoiceRows : (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '14px' }}>
                                            No sales invoices found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
                )
            )}


            {activeTab === 'salesReturn' && (
                viewReturn ? (
                    <ViewSalesReturnsInvoice initialSale={viewReturn} allSales={salesReturns} customers={customers} onBack={() => setViewReturn(null)} />
                ) : (
                <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', marginBottom: '0px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: '0', marginRight: '8px' }}>Sales Return</h2>
                        
                        <DateFilterPopover 
                            value={dateFilter}
                            onChange={setDateFilter}
                        />
                        
                        <CustomSelect
                            value={customerFilter}
                            onChange={setCustomerFilter}
                            placeholder="Customer Name"
                            icon={<Users />}
                            options={[
                                { value: '', label: 'All Customers' },
                                ...customers.map(c => ({ value: c.id, label: c.customerName || c.name }))
                            ]}
                            width="180px"
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
                        <Link to="/sales/return/create" style={{ textDecoration: 'none', height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
                            <Plus style={{ width: '16px', height: '16px' }} />
                            <span>Create</span>
                        </Link>
                    </div>
                </div>
                <div className="table-container" style={{ flex: 1, overflow: 'auto', backgroundColor: 'white', borderRadius: '8px', border: '1px solid var(--border-color)', margin: '0 16px 16px 16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ height: '40px' }}>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Date</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Return No</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Orig. Inv</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>Customer Name</th>
                                <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none' }}>Total Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSalesReturns.map((sr, idx) => (
                                <tr key={sr.id || idx} onClick={() => setViewReturn(sr)} style={{ height: '40px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                                    <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(sr.date)}</td>
                                    <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#2563EB', fontWeight: '500' }}>{sr.returnNo || '-'}</td>
                                    <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{sr.invoiceNo || '-'}</td>
                                    <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{sr.customerName || '-'}</td>
                                    <td style={{ padding: '10px 12px', borderRight: 'none', fontSize: '13px' }}>₹{(parseFloat(sr.grandTotal)||0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                </tr>
                            ))}
                            {filteredSalesReturns.length === 0 && (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>No sales returns found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                </>
                )
            )}

            {activeTab === 'customer' && (
                viewCustomer ? (
                    <ViewCustomer 
                        customers={customers}
                        salesInvoices={salesInvoices}
                        payments={amountReceivedHistory}
                        salesReturns={salesReturns}
                        initialCustomer={viewCustomer}
                        onEditCustomer={(cust) => {
                            setShowCustomerModal(true);
                        }}
                        onDeleteCustomer={async (cust) => {
                            try {
                                const res = await fetch('http://localhost:3000/api/customers');
                                let dbCusts = await res.json();
                                dbCusts = dbCusts.filter(c => String(c.id) !== String(cust.id));
                                await fetch('http://localhost:3000/api/customers', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(dbCusts)
                                });
                                setCustomers(dbCusts);
                                setViewCustomer(null);
                            } catch (err) {
                                console.error('Error deleting customer:', err);
                            }
                        }}
                        onBack={() => setViewCustomer(null)}
                    />
                ) : (
                    <>
                        {/* Stat Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', padding: '16px', margin: 0 }}>
                            <div style={{ background: 'white', border: '1.5px solid #000B58', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Total Customers</span>
                                <span style={{ fontSize: '20px', fontWeight: '700', color: '#000B58', alignSelf: 'flex-end' }}>
                                    {customers.length}
                                </span>
                            </div>
                            <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>Amount To Receive</span>
                                <span style={{ fontSize: '20px', fontWeight: '700', color: '#10B981', alignSelf: 'flex-end' }}>
                                    ₹{globalAmountToReceive.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                </span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: '0' }}>Customer List</h2>
                                
                                {/* Date Filter */}
                                <DateFilterPopover 
                                    value={dateFilter}
                                    onChange={setDateFilter}
                                />
                                
                                {/* Search Bar */}
                                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', height: '38px', width: '240px', padding: '0 12px', boxSizing: 'border-box' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Search by Name or Mobile" 
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
                                <button 
                                    onClick={() => setShowCustomerModal(true)}
                                    style={{ height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
                                    <Plus style={{ width: '16px', height: '16px' }} />
                                    <span>Create</span>
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div style={{ margin: '0 16px 16px 16px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ height: '40px' }}>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '250px' }}>Customer Name</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Mobile Number</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Total Amount</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '200px' }}>Total Pending</th>
                                        <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '200px' }}>Credit Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCustomers.length > 0 ? filteredCustomers.map((c, idx) => (
                                        <tr 
                                            key={c.id || idx} 
                                            onClick={() => setViewCustomer(c)} 
                                            style={{ height: '40px', cursor: 'pointer' }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#2563EB', fontWeight: '500' }}>{c.customerName || c.name || '-'}</td>
                                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{c.mobile || '-'}</td>
                                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>₹{c.totalPurchase.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: c.totalPending > 0 ? '#EF4444' : 'var(--text-main)', fontWeight: c.totalPending > 0 ? '600' : '400' }}>₹{(c.totalPending || 0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px', color: c.storeCredit > 0 ? '#22C55E' : 'var(--text-main)', fontWeight: c.storeCredit > 0 ? '600' : '400' }}>₹{(c.storeCredit || 0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '14px' }}>
                                                No customers found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )
            )}
            

            {activeTab === 'amountReceived' && (
                isCreatingAR ? (
                    <div style={{ padding: '16px', display: 'flex', flex: 1, overflowY: 'auto' }}>
                        <CreateAmountReceived 
                            customers={customers} 
                            salesInvoices={salesInvoices}
                            editAR={editAR}
                            onBack={() => { setIsCreatingAR(false); setEditAR(null); }} 
                        />
                    </div>
                ) : viewAR ? (
                    <ViewAmountReceived
                        initialAR={viewAR}
                        allAR={amountReceivedHistory}
                        customers={customers}
                        onBack={() => setViewAR(null)}
                        onEdit={() => {
                            setEditAR(viewAR);
                            setIsCreatingAR(true);
                            setViewAR(null);
                        }}
                    />
                ) : (
                    <>
                        {/* Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', marginBottom: '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: '0' }}>Amount Received</h2>
                            
                            {/* Date Filter */}
                            <DateFilterPopover 
                                value={dateFilter}
                                onChange={setDateFilter}
                            />
                            
                            {/* Search Bar */}
                            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', height: '38px', width: '240px', padding: '0 12px', boxSizing: 'border-box' }}>
                                <input 
                                    type="text" 
                                    placeholder="Search by AR No or Customer" 
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
                            <button 
                                onClick={() => { setEditAR(null); setIsCreatingAR(true); }}
                                style={{ height: '38px', padding: '0 20px', border: 'none', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#000B58', cursor: 'pointer', color: 'white', fontWeight: '600', boxSizing: 'border-box', fontFamily: 'inherit' }}>
                                <Plus style={{ width: '16px', height: '16px' }} />
                                <span>Create</span>
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ margin: '0 16px 16px 16px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', overflowY: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ height: '40px' }}>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '70px' }}>S. No.</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>Date</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '150px' }}>AR No</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '250px' }}>Customer Name</th>
                                    <th style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', borderRight: 'none', width: '200px' }}>Received Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAR.length > 0 ? filteredAR.map((ar, idx) => (
                                    <tr 
                                        key={ar.id || idx} 
                                        onClick={() => setViewAR(ar)}
                                        style={{ height: '40px', cursor: 'pointer', transition: 'background-color 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{idx + 1}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{formatDate(ar.date)}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px', color: '#2563EB', fontWeight: '500' }}>{ar.arNo || '-'}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '13px' }}>{ar.customerName || '-'}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', borderRight: 'none', fontSize: '13px' }}>₹{(parseFloat(ar.amount)||0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                            No amount received history found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
                )
            )}

            {showCustomerModal && (
                <CustomerModal 
                    onClose={() => setShowCustomerModal(false)}
                    onSelect={(cust) => {
                        // Option to refresh customer list or select
                        setShowCustomerModal(false);
                    }}
                />
            )}
        </div>
    );
};

export default Sales;
