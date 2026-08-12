import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Edit3, Trash2, Search, Printer } from 'lucide-react';
import DateFilterPopover from '../components/DateFilterPopover';

const ViewCustomer = ({ 
    customers = [], 
    salesInvoices = [], 
    payments = [], 
    salesReturns = [],
    initialCustomer = null,
    onEditCustomer,
    onDeleteCustomer,
    onBack
}) => {
    const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomer ? (initialCustomer.id || initialCustomer.customerId) : (customers[0]?.id || 'walk-in'));
    const [searchVal, setSearchVal] = useState('');
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'transactions' | 'statements'
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const [accountData, setAccountData] = useState({});
    const iframeRef = useRef(null);

    // Statement Date Filter (same API as DateFilterPopover)
    const [statementDateFilter, setStatementDateFilter] = useState(null);

    useEffect(() => {
        const accStr = localStorage.getItem('myAccountData');
        if (accStr) {
            try { setAccountData(JSON.parse(accStr)); } catch (e) {}
        }
    }, []);

    const filteredCustomers = (customers || []).filter(c => {
        const name = c.customerName || c.name || '';
        const mobile = c.mobile || c.contactNumber || '';
        const q = searchVal.toLowerCase();
        return !searchVal || name.toLowerCase().includes(q) || mobile.includes(q);
    });

    const currentCustomer = (customers || []).find(c => String(c.id || c.customerId) === String(selectedCustomerId)) || customers[0] || {};

    // Compute Customer Stats & Balance
    const custInvoices = (salesInvoices || []).filter(si => String(si.customerId) === String(currentCustomer.id) || si.customerName === currentCustomer.customerName || si.customerName === currentCustomer.name);
    const custPayments = (payments || []).filter(p => String(p.customerId) === String(currentCustomer.id) || p.customerName === currentCustomer.customerName || p.customerName === currentCustomer.name);
    const custReturns = (salesReturns || []).filter(sr => String(sr.customerId) === String(currentCustomer.id) || sr.customerName === currentCustomer.customerName || sr.customerName === currentCustomer.name);

    const totalInvoiced = custInvoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount || inv.grandTotal) || 0), 0);
    const totalPaid = custPayments.reduce((sum, p) => sum + (parseFloat(p.receivedAmount || p.amount || p.paidAmount) || 0), 0);
    const totalReturned = custReturns.reduce((sum, r) => sum + (parseFloat(r.grandTotal || r.totalAmount) || 0), 0);
    const pendingBalance = Math.max(0, totalInvoiced - totalPaid - totalReturned);

    // Helper: parse any date string into a valid Date object
    const parseRawDate = (dateStr) => {
        if (!dateStr) return new Date();
        const str = String(dateStr).trim();
        // DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
            const [day, month, year] = str.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        // DD-MM-YYYY
        if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
            const [day, month, year] = str.split('-');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        // YYYY-MM-DD or ISO
        const d = new Date(str);
        return isNaN(d.getTime()) ? new Date() : d;
    };

    // Combine transactions for Transaction List Tab
    const allTransactions = [
        ...custInvoices.map(inv => {
            const amt = parseFloat(inv.totalAmount || inv.grandTotal) || 0;
            const due = parseFloat(inv.pendingToReceive) || 0;
            return {
                id: inv.id || inv.invoiceNumber,
                date: inv.date,
                type: 'Sales Invoice',
                transactionNo: inv.invoiceNumber || inv.invoiceNo || '-',
                amount: amt,
                dueAmount: due,
                isDebit: true,
                status: due === 0 ? 'Paid' : 'Pending',
                rawDate: parseRawDate(inv.date)
            };
        }),
        ...custPayments.map(p => {
            const amt = parseFloat(p.receivedAmount || p.amount || p.paidAmount) || 0;
            return {
                id: p.id || p.arNo,
                date: p.date,
                type: 'Amount Received',
                transactionNo: p.arNo || p.receiptNo || '-',
                amount: amt,
                dueAmount: 0,
                isDebit: false,
                status: 'Completed',
                rawDate: parseRawDate(p.date)
            };
        }),
        ...custReturns.map(r => {
            const amt = parseFloat(r.grandTotal || r.totalAmount) || 0;
            const refundAmt = parseFloat(r.refundAmount) || 0;
            const storeCred = parseFloat(r.storeCredit) || 0;
            
            let status = 'Credited';
            if (r.refundMode === 'Adjust against Invoice' || r.isAdjusted || r.status === 'Adjusted') {
                status = 'Adjusted';
            } else if (refundAmt > 0 && storeCred === 0) {
                status = 'Returned';
            } else if (storeCred > 0 || r.refundMode === 'Store Credit' || r.isCredited || refundAmt === 0) {
                status = 'Credited';
            }

            return {
                id: r.id || r.returnNo,
                date: r.date,
                type: 'Sales Return',
                transactionNo: r.returnNo || '-',
                amount: amt,
                dueAmount: 0,
                isDebit: false,
                status: status,
                rawDate: parseRawDate(r.date)
            };
        })
    ].sort((a, b) => b.rawDate - a.rawDate);

    // Calculate Date Range from DateFilterPopover value
    const stmtStartDate = statementDateFilter ? statementDateFilter.start : new Date(2000, 0, 1);
    const stmtEndDate = statementDateFilter ? statementDateFilter.end : new Date(new Date().getFullYear() + 5, 11, 31, 23, 59, 59);

    // Chronologically Sorted Ledger Array (Ascending for Running Balance)
    const chronoTx = [...allTransactions].sort((a, b) => a.rawDate - b.rawDate);

    let openingBalance = parseFloat(currentCustomer.openingBalance || 0);
    let periodInvoiced = 0;
    let periodReceived = 0;
    let periodReturned = 0;

    // Separate items before start date vs within period
    const periodTransactions = [];

    chronoTx.forEach(tx => {
        if (tx.rawDate < stmtStartDate) {
            if (tx.isDebit) openingBalance += tx.amount;
            else openingBalance -= tx.amount;
        } else if (tx.rawDate <= stmtEndDate) {
            if (tx.type === 'Sales Invoice') periodInvoiced += tx.amount;
            else if (tx.type === 'Amount Received') periodReceived += tx.amount;
            else if (tx.type === 'Sales Return') periodReturned += tx.amount;

            periodTransactions.push(tx);
        }
    });

    let runningBal = openingBalance;
    const ledgerRows = periodTransactions.map(tx => {
        if (tx.isDebit) {
            runningBal += tx.amount;
        } else {
            runningBal -= tx.amount;
        }
        return {
            ...tx,
            runningBalance: runningBal
        };
    });

    const closingBalance = openingBalance + periodInvoiced - periodReceived - periodReturned;

    const formatDate = (d) => {
        if (!d) return '-';
        const str = String(d);
        if (str.includes('/')) return str;
        if (str.includes('-')) {
            const parts = str.split('T')[0].split('-');
            if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return str;
        }
        const dt = new Date(str);
        return isNaN(dt) ? str : dt.toLocaleDateString('en-GB');
    };

    // Zoho-style Statement Printable HTML Generator
    const generateStatementHTML = () => {
        const accData = accountData || {};
        const borderCol = '#606060';

        let addrParts = [];
        if (accData.address) addrParts.push(accData.address);
        if (accData.city) addrParts.push(accData.city);
        let addrLine1 = addrParts.length > 0 ? addrParts.join(', ') : '31/11, Pukkulam Road, Thiyagadurgam, Kallakurichi';
        
        let stateParts = [];
        if (accData.state) stateParts.push(accData.state);
        if (accData.country) stateParts.push(accData.country);
        let addrLine2 = stateParts.length > 0 ? (stateParts.join(', ') + (accData.pin ? ` - ${accData.pin}` : '')) : 'Tamil Nadu - 606 206';

        let rowsHTML = `
            <tr>
                <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px;">${formatDate(stmtStartDate)}</td>
                <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; font-weight: bold;">Opening Balance</td>
                <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px;">-</td>
                <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">-</td>
                <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">-</td>
                <td style="border-bottom: 1px solid ${borderCol}; padding: 6px 8px; text-align: right; font-weight: bold;">₹${openingBalance.toFixed(2)}</td>
            </tr>
        `;

        ledgerRows.forEach(tx => {
            rowsHTML += `
                <tr>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px;">${formatDate(tx.date)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px;">${tx.type}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px;">${tx.transactionNo}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">${tx.isDebit ? `₹${tx.amount.toFixed(2)}` : '-'}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">${!tx.isDebit ? `₹${tx.amount.toFixed(2)}` : '-'}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; padding: 6px 8px; text-align: right; font-weight: bold;">₹${tx.runningBalance.toFixed(2)}</td>
                </tr>
            `;
        });

        return `
            <div class="statement-outer-box" style="width: 100%; max-width: 800px; margin: 0 auto; padding: 16px; background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box; font-family: 'Manrope', sans-serif; font-size: 11px; color: #000;">
                <div style="background-color: #fff; border: 1px solid ${borderCol}; border-radius: 6px; overflow: hidden;">
                    
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid ${borderCol}; padding: 12px 16px;">
                        <div>
                            <div style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${accData.company || accData.companyName || 'SRI PARVATHI HARDWARES'}</div>
                            <div style="font-size: 10px; color: #333; margin-top: 2px;">${addrLine1}</div>
                            <div style="font-size: 10px; color: #333;">${addrLine2}</div>
                            ${accData.mobile || accData.phone ? `<div style="font-size: 10px; color: #333;">Ph No : <b>${accData.mobile || accData.phone}</b></div>` : ''}
                            ${accData.gstin ? `<div style="font-size: 10px; color: #333;">GSTIN No : <b>${accData.gstin}</b></div>` : ''}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; letter-spacing: 1px; color: #000;">STATEMENT OF ACCOUNT</div>
                    </div>

                    <!-- Customer & Statement Info -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: 12px 16px; display: flex; justify-content: space-between; line-height: 1.5;">
                        <div>
                            <div style="font-size: 10px; color: #666;">To:</div>
                            <div style="font-size: 13px; font-weight: bold; margin-bottom: 2px;">${currentCustomer.customerName || currentCustomer.name || 'Walk In Customer'}</div>
                            <div>${currentCustomer.address || currentCustomer.billAddress || '-'}</div>
                            <div>Ph No: <b>${currentCustomer.mobile || currentCustomer.contactNumber || '-'}</b></div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 10px; color: #666;">Statement Period</div>
                            <div style="font-size: 12px; font-weight: bold;">${formatDate(stmtStartDate)} &nbsp; to &nbsp; ${formatDate(stmtEndDate)}</div>
                        </div>
                    </div>

                    <!-- Summary Box (Zoho Style) -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: 12px 16px; background: #fafafa; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; text-align: center;">
                        <div>
                            <div style="font-size: 10px; color: #666;">Opening Balance</div>
                            <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">₹${openingBalance.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style="font-size: 10px; color: #666;">Invoiced Amount</div>
                            <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">₹${periodInvoiced.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style="font-size: 10px; color: #666;">Received & Credits</div>
                            <div style="font-size: 13px; font-weight: bold; color: #16A34A; margin-top: 2px;">₹${(periodReceived + periodReturned).toFixed(2)}</div>
                        </div>
                        <div>
                            <div style="font-size: 10px; color: #666;">Balance Due</div>
                            <div style="font-size: 13px; font-weight: bold; color: ${closingBalance > 0 ? '#DC2626' : '#000'}; margin-top: 2px;">₹${closingBalance.toFixed(2)}</div>
                        </div>
                    </div>

                    <!-- Ledger Table -->
                    <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
                        <thead>
                            <tr style="background-color: #f8fafc; border-bottom: 1px solid ${borderCol}; font-weight: bold;">
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 90px;">Date</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px;">Transactions</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 110px;">Transaction No.</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 110px; text-align: right;">Invoiced (Dr)</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 110px; text-align: right;">Credit (Cr)</th>
                                <th style="padding: 6px 8px; width: 110px; text-align: right;">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHTML}
                            <tr style="background-color: #f8fafc; font-weight: bold; border-top: 1px solid ${borderCol};">
                                <td colspan="3" style="border-right: 1px solid ${borderCol}; padding: 6px 8px;">Totals</td>
                                <td style="border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${periodInvoiced.toFixed(2)}</td>
                                <td style="border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${(periodReceived + periodReturned).toFixed(2)}</td>
                                <td style="padding: 6px 8px; text-align: right;">₹${closingBalance.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                </div>
            </div>
        `;
    };

    const handlePrintStatement = () => {
        if (!iframeRef.current) return;
        const printContent = generateStatementHTML();

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Print Statement of Account</title>
                    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                    <style>
                        body { margin: 0; padding: 10px; font-family: 'Manrope', sans-serif; background: white; display: flex; justify-content: center; }
                        @media print { 
                            @page { margin: 4mm auto; size: A4 portrait; } 
                            body { padding: 0; margin: 0; display: flex; justify-content: center; background: white; } 
                            .statement-outer-box { box-shadow: none !important; padding: 12px !important; width: 100% !important; max-width: 100% !important; }
                        }
                    </style>
                </head>
                <body>
                    ${printContent}
                    <script>
                        window.onload = function() { setTimeout(function() { window.print(); }, 500); }
                    </script>
                </body>
            </html>
        `;
        
        const doc = iframeRef.current.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', fontFamily: "'Manrope', sans-serif" }}>
            <iframe ref={iframeRef} style={{ display: 'none' }} title="Print Statement Frame" />
            
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                
                {/* Left Sidebar - Customer List */}
                <div style={{ width: '280px', minWidth: '240px', background: 'white', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    {/* Search Bar Container */}
                    <div style={{ height: '50px', alignItems: 'center', padding: '0px 16px 0 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '30px', flex: 1, overflow: 'hidden', alignItems: 'center', padding: '0 8px' }}>
                            <Search size={16} color="var(--text-muted)" style={{ marginRight: '6px' }} />
                            <input 
                                type="text" 
                                placeholder="Search Customer" 
                                value={searchVal}
                                onChange={e => setSearchVal(e.target.value)}
                                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', height: '25px', fontFamily: 'inherit' }}
                            />
                        </div>
                    </div>

                    {/* Customer List */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filteredCustomers.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No customers found</div>
                        ) : (
                            filteredCustomers.map(c => {
                                const cId = c.id || c.customerId;
                                const isSelected = String(cId) === String(selectedCustomerId);
                                const cName = c.customerName || c.name || 'Walk In Customer';
                                
                                // Customer balance calculation
                                const cInvs = (salesInvoices || []).filter(si => String(si.customerId) === String(cId) || si.customerName === cName);
                                const cPmts = (payments || []).filter(p => String(p.customerId) === String(cId) || p.customerName === cName);
                                const cRets = (salesReturns || []).filter(sr => String(sr.customerId) === String(cId) || sr.customerName === cName);
                                
                                const invTotal = cInvs.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount || inv.grandTotal) || 0), 0);
                                const pmtTotal = cPmts.reduce((sum, p) => sum + (parseFloat(p.receivedAmount || p.amount || p.paidAmount) || 0), 0);
                                const retTotal = cRets.reduce((sum, r) => sum + (parseFloat(r.grandTotal || r.totalAmount) || 0), 0);
                                const cBal = Math.max(0, invTotal - pmtTotal - retTotal);

                                return (
                                    <div 
                                        key={cId}
                                        onClick={() => setSelectedCustomerId(cId)}
                                        style={{ 
                                            padding: '12px 16px', 
                                            borderBottom: '1px solid #F1F5F9', 
                                            cursor: 'pointer', 
                                            background: isSelected ? '#EEF2FF' : 'transparent', 
                                            borderLeft: isSelected ? '4px solid #000B58' : '4px solid transparent' 
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                                            <div style={{ fontWeight: '600', fontSize: '13px', color: isSelected ? '#000B58' : '#1E293B' }}>{cName}</div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: cBal > 0 ? '#EF4444' : '#1E293B' }}>₹{cBal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.mobile || c.contactNumber || '-'}</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Preview */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F8FAFC', overflowY: 'auto' }}>
                    
                    {/* Header Actions */}
                    <div style={{ height: '50px', background: 'white', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', background: 'white', cursor: 'pointer' }}>
                                <ChevronLeft size={16} />
                            </button>
                            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>
                                {currentCustomer.customerName || currentCustomer.name || 'Walk In Customer'}
                            </h2>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => onEditCustomer && onEditCustomer(currentCustomer)} style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: 'var(--text-main)' }}>
                                <Edit3 size={14} /> Edit
                            </button>
                            <button onClick={() => setShowDeleteModal(true)} style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: '1px solid #FCA5A5', borderRadius: '6px', background: '#FEF2F2', color: '#EF4444', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
                    </div>

                    {/* View Body Container */}
                    <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
                        
                        {/* Navigation Tabs */}
                        <div style={{ display: 'flex', gap: '28px', borderBottom: '1px solid #E2E8F0', marginBottom: '24px' }}>
                            <div 
                                onClick={() => setActiveTab('details')}
                                style={{ 
                                    paddingBottom: '10px', 
                                    fontSize: '14px', 
                                    fontWeight: activeTab === 'details' ? '700' : '500', 
                                    color: activeTab === 'details' ? '#000B58' : '#64748B', 
                                    borderBottom: activeTab === 'details' ? '2px solid #000B58' : '2px solid transparent', 
                                    cursor: 'pointer' 
                                }}
                            >
                                Customer Details
                            </div>
                            <div 
                                onClick={() => setActiveTab('transactions')}
                                style={{ 
                                    paddingBottom: '10px', 
                                    fontSize: '14px', 
                                    fontWeight: activeTab === 'transactions' ? '700' : '500', 
                                    color: activeTab === 'transactions' ? '#000B58' : '#64748B', 
                                    borderBottom: activeTab === 'transactions' ? '2px solid #000B58' : '2px solid transparent', 
                                    cursor: 'pointer' 
                                }}
                            >
                                Transaction List
                            </div>
                            <div 
                                onClick={() => setActiveTab('statements')}
                                style={{ 
                                    paddingBottom: '10px', 
                                    fontSize: '14px', 
                                    fontWeight: activeTab === 'statements' ? '700' : '500', 
                                    color: activeTab === 'statements' ? '#000B58' : '#64748B', 
                                    borderBottom: activeTab === 'statements' ? '2px solid #000B58' : '2px solid transparent', 
                                    cursor: 'pointer' 
                                }}
                            >
                                Statements
                            </div>
                        </div>

                        {/* TAB 1: Customer Details */}
                        {activeTab === 'details' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                
                                {/* Card 1: Customer Details */}
                                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ background: '#F8FAFC', padding: '12px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: '700', fontSize: '13.5px', color: '#0F172A' }}>
                                        Customer Details
                                    </div>
                                    <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '13px' }}>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>Customer Name</div>
                                            <div style={{ color: '#0F172A', fontWeight: '700' }}>{currentCustomer.customerName || currentCustomer.name || 'Walk In Customer'}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>Mobile Number</div>
                                            <div style={{ color: '#0F172A', fontWeight: '700' }}>{currentCustomer.mobile || currentCustomer.contactNumber || 'Udhaya Hardwares'}</div>
                                        </div>
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>Address</div>
                                            <div style={{ color: '#0F172A', fontWeight: '600' }}>{currentCustomer.address || currentCustomer.billAddress || '1st Cross Street, Anna Salai'}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>Country</div>
                                            <div style={{ color: '#0F172A', fontWeight: '600' }}>{currentCustomer.country || currentCustomer.billCountry || 'India'}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>State</div>
                                            <div style={{ color: '#2563EB', fontWeight: '600' }}>{currentCustomer.state || currentCustomer.billState || 'Tamil Nadu'}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>City</div>
                                            <div style={{ color: '#0F172A', fontWeight: '600' }}>{currentCustomer.city || currentCustomer.billCity || 'Kallakurichi'}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>PIN Code</div>
                                            <div style={{ color: '#2563EB', fontWeight: '600' }}>{currentCustomer.pinCode || currentCustomer.billPinCode || currentCustomer.pin || currentCustomer.pincode || '606206'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: GST & PAN Details */}
                                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ background: '#F8FAFC', padding: '12px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: '700', fontSize: '13.5px', color: '#0F172A' }}>
                                        GST & PAN Details
                                    </div>
                                    <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '13px' }}>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>GSTIN No</div>
                                            <div style={{ color: '#0F172A', fontWeight: '700' }}>{currentCustomer.gstin || currentCustomer.gst || '29AAACC1206D2ZB'}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748B', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>PAN Number</div>
                                            <div style={{ color: '#0F172A', fontWeight: '700' }}>{currentCustomer.panNumber || currentCustomer.pan || '-'}</div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* TAB 2: Transaction List */}
                        {activeTab === 'transactions' && (
                            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                                            <th style={{ padding: '10px 14px', fontWeight: '600' }}>S No</th>
                                            <th style={{ padding: '10px 14px', fontWeight: '600' }}>Date</th>
                                            <th style={{ padding: '10px 14px', fontWeight: '600' }}>Type</th>
                                            <th style={{ padding: '10px 14px', fontWeight: '600' }}>Transaction No.</th>
                                            <th style={{ padding: '10px 14px', fontWeight: '600', textAlign: 'right' }}>Amount</th>
                                            <th style={{ padding: '10px 14px', fontWeight: '600', textAlign: 'right' }}>Due Amount</th>
                                            <th style={{ padding: '10px 14px', fontWeight: '600', textAlign: 'center' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allTransactions.length > 0 ? (
                                            allTransactions.map((t, idx) => {
                                                let statusBg = '#F1F5F9';
                                                let statusColor = '#475569';
                                                
                                                if (t.status === 'Paid') {
                                                    statusBg = '#DCFCE7';
                                                    statusColor = '#15803D';
                                                } else if (t.status === 'Pending') {
                                                    statusBg = '#FEE2E2';
                                                    statusColor = '#B91C1C';
                                                } else if (t.status === 'Completed') {
                                                    statusBg = '#DBEAFE';
                                                    statusColor = '#1D4ED8';
                                                } else if (t.status === 'Credited') {
                                                    statusBg = '#CCFBF1';
                                                    statusColor = '#0F766E';
                                                } else if (t.status === 'Returned') {
                                                    statusBg = '#F3E8FF';
                                                    statusColor = '#6B21A8';
                                                } else if (t.status === 'Adjusted') {
                                                    statusBg = '#FEF3C7';
                                                    statusColor = '#B45309';
                                                }

                                                return (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                        <td style={{ padding: '10px 14px' }}>{idx + 1}</td>
                                                        <td style={{ padding: '10px 14px' }}>{formatDate(t.date)}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: '600' }}>{t.type}</td>
                                                        <td style={{ padding: '10px 14px', color: '#2563EB', fontWeight: '500' }}>{t.transactionNo}</td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600' }}>₹{t.amount.toFixed(2)}</td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', color: t.dueAmount > 0 ? '#EF4444' : '#0F172A' }}>₹{t.dueAmount.toFixed(2)}</td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            <span style={{ 
                                                                padding: '4px 10px', 
                                                                borderRadius: '4px', 
                                                                fontSize: '11px', 
                                                                fontWeight: '600',
                                                                background: statusBg,
                                                                color: statusColor
                                                            }}>
                                                                {t.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan="7" style={{ padding: '16px', textAlign: 'center', color: '#64748B' }}>No transactions recorded for this customer</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* TAB 3: Statements (Zoho Books Style) */}
                        {activeTab === 'statements' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                
                                {/* Period & Print Controls Bar */}
                                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <DateFilterPopover 
                                            value={statementDateFilter}
                                            onChange={setStatementDateFilter}
                                        />
                                    </div>
                                    <button onClick={handlePrintStatement} style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: 'none', borderRadius: '6px', background: '#000B58', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                        <Printer size={15} /> Print Statement
                                    </button>
                                </div>

                                {/* Statement Printable Frame */}
                                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                                    
                                    {/* Statement Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #606060', paddingBottom: '16px', marginBottom: '20px' }}>
                                        <div>
                                            <div style={{ fontSize: '16px', fontWeight: '700', textTransform: uppercase => uppercase, color: '#0F172A' }}>
                                                {accountData.company || accountData.companyName || 'SRI PARVATHI HARDWARES'}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                                                {[accountData.address, accountData.city].filter(Boolean).join(', ') || '31/11, Pukkulam Road, Thiyagadurgam, Kallakurichi'}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#475569' }}>
                                                {[accountData.state, accountData.country].filter(Boolean).join(', ') || 'Tamil Nadu'} {accountData.pin ? `- ${accountData.pin}` : '- 606 206'}
                                            </div>
                                            {accountData.mobile && <div style={{ fontSize: '12px', color: '#475569' }}>Ph No : <b>{accountData.mobile}</b></div>}
                                            {accountData.gstin && <div style={{ fontSize: '12px', color: '#475569' }}>GSTIN No : <b>{accountData.gstin}</b></div>}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '0.5px', color: '#000B58' }}>STATEMENT OF ACCOUNT</div>
                                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>Statement Period</div>
                                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                                                {formatDate(stmtStartDate)} &nbsp;to&nbsp; {formatDate(stmtEndDate)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Customer Details Box */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #606060', paddingBottom: '16px', marginBottom: '20px', fontSize: '13px' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600', marginBottom: '2px' }}>To:</div>
                                            <div style={{ fontWeight: '700', fontSize: '14px', color: '#0F172A' }}>{currentCustomer.customerName || currentCustomer.name || 'Walk In Customer'}</div>
                                            <div style={{ color: '#475569', marginTop: '2px' }}>{currentCustomer.address || currentCustomer.billAddress || '-'}</div>
                                            <div style={{ color: '#475569' }}>Ph No: <b>{currentCustomer.mobile || currentCustomer.contactNumber || '-'}</b></div>
                                        </div>
                                    </div>

                                    {/* Account Summary Cards (Zoho Books Style) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                                        <div style={{ background: '#F8FAFC', border: '1px solid #606060', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Opening Balance</div>
                                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginTop: '4px' }}>₹{openingBalance.toFixed(2)}</div>
                                        </div>
                                        <div style={{ background: '#F8FAFC', border: '1px solid #606060', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Invoiced Amount (+)</div>
                                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginTop: '4px' }}>₹{periodInvoiced.toFixed(2)}</div>
                                        </div>
                                        <div style={{ background: '#F8FAFC', border: '1px solid #606060', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Received & Credits (-)</div>
                                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#16A34A', marginTop: '4px' }}>₹{(periodReceived + periodReturned).toFixed(2)}</div>
                                        </div>
                                        <div style={{ background: '#F8FAFC', border: '1px solid #606060', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Balance Due (=)</div>
                                            <div style={{ fontSize: '16px', fontWeight: '800', color: closingBalance > 0 ? '#DC2626' : '#16A34A', marginTop: '4px' }}>₹{closingBalance.toFixed(2)}</div>
                                        </div>
                                    </div>

                                    {/* Detailed Chronological Ledger Table */}
                                    <div style={{ border: '1px solid #606060', borderRadius: '6px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #606060' }}>
                                                    <th style={{ padding: '10px 12px', borderRight: '1px solid #606060', fontWeight: '700', color: '#0F172A', width: '90px' }}>Date</th>
                                                    <th style={{ padding: '10px 12px', borderRight: '1px solid #606060', fontWeight: '700', color: '#0F172A' }}>Transactions / Description</th>
                                                    <th style={{ padding: '10px 12px', borderRight: '1px solid #606060', fontWeight: '700', color: '#0F172A', width: '130px' }}>Transaction No.</th>
                                                    <th style={{ padding: '10px 12px', borderRight: '1px solid #606060', fontWeight: '700', color: '#0F172A', textAlign: 'right', width: '110px' }}>Invoiced (Dr)</th>
                                                    <th style={{ padding: '10px 12px', borderRight: '1px solid #606060', fontWeight: '700', color: '#0F172A', textAlign: 'right', width: '110px' }}>Credit (Cr)</th>
                                                    <th style={{ padding: '10px 12px', fontWeight: '700', color: '#0F172A', textAlign: 'right', width: '120px' }}>Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* Opening Balance Row */}
                                                <tr style={{ borderBottom: '1px solid #606060', background: '#FAFAFA' }}>
                                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #606060' }}>{formatDate(stmtStartDate)}</td>
                                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', fontWeight: '700' }}>Opening Balance</td>
                                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #606060' }}>-</td>
                                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', textAlign: 'right' }}>-</td>
                                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', textAlign: 'right' }}>-</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700' }}>₹{openingBalance.toFixed(2)}</td>
                                                </tr>

                                                {/* Ledger Rows */}
                                                {ledgerRows.length > 0 ? (
                                                    ledgerRows.map((tx, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #606060' }}>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #606060' }}>{formatDate(tx.date)}</td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', fontWeight: '600' }}>{tx.type}</td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', color: '#2563EB' }}>{tx.transactionNo}</td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', textAlign: 'right', fontWeight: '600' }}>{tx.isDebit ? `₹${tx.amount.toFixed(2)}` : '-'}</td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', textAlign: 'right', fontWeight: '600', color: '#16A34A' }}>{!tx.isDebit ? `₹${tx.amount.toFixed(2)}` : '-'}</td>
                                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700' }}>₹{tx.runningBalance.toFixed(2)}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontStyle: 'italic' }}>No transactions recorded in this statement period</td>
                                                    </tr>
                                                )}

                                                {/* Summary Totals Row */}
                                                <tr style={{ background: '#F8FAFC', fontWeight: '700', borderTop: '2px solid #606060' }}>
                                                    <td colSpan="3" style={{ padding: '10px 12px', borderRight: '1px solid #606060' }}>Totals & Net Closing Balance</td>
                                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', textAlign: 'right' }}>₹{periodInvoiced.toFixed(2)}</td>
                                                    <td style={{ padding: '10px 12px', borderRight: '1px solid #606060', textAlign: 'right', color: '#16A34A' }}>₹{(periodReceived + periodReturned).toFixed(2)}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: closingBalance > 0 ? '#DC2626' : '#16A34A' }}>₹{closingBalance.toFixed(2)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                </div>

                            </div>
                        )}

                    </div>

                </div>
            </div>

            {/* Sticky Action Bar */}
            <div className="sticky-action-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', zIndex: 10, flexShrink: 0 }}>
                <div className="footer-left">
                    <button onClick={onBack} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                        <ChevronLeft size={16} /> Back
                    </button>
                </div>
            </div>

            {/* Delete Modal */}
            {showDeleteModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', borderRadius: '12px', width: '400px', padding: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#EF4444' }}>
                            <div style={{ background: '#FEE2E2', padding: '8px', borderRadius: '50%' }}>
                                <Trash2 style={{ width: '24px', height: '24px' }} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Delete Customer</h3>
                        </div>
                        <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '14px', lineHeight: 1.5 }}>
                            Are you sure you want to delete customer <strong style={{ color: '#0f172a' }}>{currentCustomer.customerName || currentCustomer.name}</strong>?
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setShowDeleteModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}>
                                Cancel
                            </button>
                            <button onClick={() => { onDeleteCustomer && onDeleteCustomer(currentCustomer); setShowDeleteModal(false); }} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#EF4444', color: 'white', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViewCustomer;
