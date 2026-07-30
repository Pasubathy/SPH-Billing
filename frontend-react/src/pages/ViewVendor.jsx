import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Edit3, Trash2, Search, Printer } from 'lucide-react';
import DateFilterPopover from '../components/DateFilterPopover';

const ViewVendor = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [allVendors, setAllVendors] = useState([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState([]);
    const [vendorPayments, setVendorPayments] = useState([]);
    const [purchaseReturns, setPurchaseReturns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchVal, setSearchVal] = useState('');
    const [activeTab, setActiveTab] = useState('details');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [accountData, setAccountData] = useState({});
    const [statementDateFilter, setStatementDateFilter] = useState(null);
    const iframeRef = useRef(null);

    useEffect(() => {
        const accStr = localStorage.getItem('myAccountData');
        if (accStr) { try { setAccountData(JSON.parse(accStr)); } catch (e) {} }
    }, []);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [vRes, piRes, pmtRes, prRes] = await Promise.all([
                    fetch('http://localhost:3000/api/vendors').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/purchase-invoices').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/vendor-payments').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/purchase-returns').catch(() => ({ json: () => [] })),
                ]);
                setAllVendors(await vRes.json() || []);
                setPurchaseInvoices(await piRes.json() || []);
                setVendorPayments(await pmtRes.json() || []);
                setPurchaseReturns(await prRes.json() || []);
            } catch (err) {
                console.error('Error fetching vendor data:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id]);

    const vendor = allVendors.find(v => String(v.id) === String(id)) || null;

    const filteredVendors = allVendors.filter(v =>
        !searchVal || (v.vendorName && v.vendorName.toLowerCase().includes(searchVal.toLowerCase()))
    );

    // Parse any date format to a valid Date object
    const parseRawDate = (dateStr) => {
        if (!dateStr) return new Date();
        const str = String(dateStr).trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
            const [day, month, year] = str.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
            const [day, month, year] = str.split('-');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? new Date() : d;
    };

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

    // Actual payment amount = min(paidAmount, totalAllocated - discount)
    // Handles overpaid cases where change/refund is given back to vendor
    const calcActualPmt = (p) => {
        const pmtAmt = parseFloat(p.paidAmount) || 0;
        const discAmt = parseFloat(p.discount) || 0;
        const totalAllocated = p.invoices
            ? p.invoices.reduce((sum, inv) => sum + (parseFloat(inv.allocated) || 0), 0)
            : pmtAmt + discAmt;
        if (pmtAmt + discAmt > totalAllocated && p.invoices && p.invoices.length > 0) {
            return Math.max(0, totalAllocated - discAmt);
        }
        return pmtAmt;
    };

    // Vendor-specific data
    const vendorInvoices = purchaseInvoices.filter(pi =>
        vendor && (String(pi.vendorId) === String(vendor.id) || pi.vendorName === vendor.vendorName)
    );
    const vendorPmts = vendorPayments.filter(p =>
        vendor && (String(p.vendorId) === String(vendor.id) || p.vendorName === vendor.vendorName)
    );
    const vendorReturns = purchaseReturns.filter(pr =>
        vendor && (String(pr.vendorId) === String(vendor.id) || pr.vendorName === vendor.vendorName)
    );

    const totalPurchased = vendorInvoices.reduce((s, pi) => s + (parseFloat(pi.amount) || 0), 0);
    const totalPaid = vendorPmts.reduce((s, p) => s + calcActualPmt(p), 0);
    const totalReturned = vendorReturns.reduce((s, pr) => s + (parseFloat(pr.grandTotal || pr.totalAmount) || 0), 0);
    const pendingToPay = Math.max(0, totalPurchased - totalPaid - totalReturned);

    // All transactions combined
    const allTransactions = [
        ...vendorInvoices.map(pi => {
            const amt = parseFloat(pi.amount) || 0;
            const due = parseFloat(pi.pendingToPay) || 0;
            return {
                id: pi.id || pi.piNo,
                date: pi.date,
                type: 'Purchase Invoice',
                transactionNo: pi.piNo || '-',
                amount: amt,
                dueAmount: due,
                isDebit: true,
                status: due === 0 ? 'Paid' : 'Pending',
                rawDate: parseRawDate(pi.date),
            };
        }),
        ...vendorPmts.map(p => {
            const amt = calcActualPmt(p);
            return {
                id: p.id || p.pmtNo,
                date: p.date,
                type: 'Payment Made',
                transactionNo: p.pmtNo || '-',
                amount: amt,
                dueAmount: 0,
                isDebit: false,
                status: 'Completed',
                rawDate: parseRawDate(p.date),
            };
        }),
        ...vendorReturns.map(pr => {
            const amt = parseFloat(pr.grandTotal || pr.totalAmount) || 0;
            const refundAmt = parseFloat(pr.refundAmount) || 0;
            const storeCred = parseFloat(pr.storeCredit) || 0;
            let status = 'Credited';
            if (pr.refundMode === 'Adjust against Invoice' || pr.isAdjusted) status = 'Adjusted';
            else if (refundAmt > 0 && storeCred === 0) status = 'Returned';
            else if (storeCred > 0 || pr.refundMode === 'Store Credit' || refundAmt === 0) status = 'Credited';
            return {
                id: pr.id || pr.returnNo,
                date: pr.date,
                type: 'Purchase Return',
                transactionNo: pr.returnNo || '-',
                amount: amt,
                dueAmount: 0,
                isDebit: false,
                status,
                rawDate: parseRawDate(pr.date),
            };
        }),
    ].sort((a, b) => b.rawDate - a.rawDate);

    // Statement date bounds
    const stmtStartDate = statementDateFilter ? statementDateFilter.start : new Date(2000, 0, 1);
    const stmtEndDate = statementDateFilter ? statementDateFilter.end : new Date(new Date().getFullYear() + 5, 11, 31, 23, 59, 59);

    const chronoTx = [...allTransactions].sort((a, b) => a.rawDate - b.rawDate);
    let openingBalance = parseFloat(vendor?.openingBalance || 0);
    const openingTx = chronoTx.filter(tx => tx.rawDate < stmtStartDate);
    openingTx.forEach(tx => {
        if (tx.isDebit) openingBalance += tx.amount;
        else openingBalance -= tx.amount;
    });

    const periodTx = chronoTx.filter(tx => tx.rawDate >= stmtStartDate && tx.rawDate <= stmtEndDate);
    const periodInvoiced = periodTx.filter(t => t.isDebit).reduce((s, t) => s + t.amount, 0);
    const periodPaid = periodTx.filter(t => !t.isDebit).reduce((s, t) => s + t.amount, 0);
    const closingBalance = openingBalance + periodInvoiced - periodPaid;

    let runningBal = openingBalance;
    const ledgerRows = periodTx.map(tx => {
        if (tx.isDebit) runningBal += tx.amount;
        else runningBal -= tx.amount;
        return { ...tx, runningBalance: runningBal };
    });

    // Print Statement
    const handlePrintStatement = () => {
        const accData = accountData || {};
        const borderCol = '#606060';
        let addrParts = [];
        if (accData.address) addrParts.push(accData.address);
        if (accData.city) addrParts.push(accData.city);
        let addrLine1 = addrParts.length > 0 ? addrParts.join(', ') : '';
        let stateParts = [];
        if (accData.state) stateParts.push(accData.state);
        if (accData.country) stateParts.push(accData.country);
        let addrLine2 = stateParts.length > 0 ? (stateParts.join(', ') + (accData.pin ? ` - ${accData.pin}` : '')) : '';

        let rowsHTML = `
            <tr>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;">${formatDate(stmtStartDate)}</td>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;font-weight:bold;">Opening Balance</td>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;">-</td>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;text-align:right;">-</td>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;text-align:right;">-</td>
                <td style="border-bottom:1px solid ${borderCol};padding:6px 8px;text-align:right;font-weight:bold;">₹${openingBalance.toFixed(2)}</td>
            </tr>`;
        ledgerRows.forEach(tx => {
            rowsHTML += `
                <tr>
                    <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;">${formatDate(tx.date)}</td>
                    <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;">${tx.type}</td>
                    <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;">${tx.transactionNo}</td>
                    <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;text-align:right;">${tx.isDebit ? '₹' + tx.amount.toFixed(2) : '-'}</td>
                    <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:6px 8px;text-align:right;">${!tx.isDebit ? '₹' + tx.amount.toFixed(2) : '-'}</td>
                    <td style="border-bottom:1px solid ${borderCol};padding:6px 8px;text-align:right;font-weight:600;">₹${tx.runningBalance.toFixed(2)}</td>
                </tr>`;
        });

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vendor Statement</title>
        <style>*{font-family:'Manrope',sans-serif;box-sizing:border-box;}body{margin:0;padding:24px;font-size:13px;color:#1E293B;}</style></head>
        <body>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${borderCol};padding-bottom:16px;margin-bottom:16px;">
                <div><div style="font-size:20px;font-weight:800;color:#000B58;">${accData.company || 'Your Company'}</div>
                <div style="margin-top:4px;font-size:12px;color:#475569;">${addrLine1}</div>
                <div style="font-size:12px;color:#475569;">${addrLine2}</div>
                ${accData.gstin ? `<div style="font-size:12px;color:#475569;">GSTIN: ${accData.gstin}</div>` : ''}</div>
                <div style="text-align:right;"><div style="font-size:18px;font-weight:700;">Vendor Statement</div>
                <div style="margin-top:4px;font-size:12px;color:#475569;">Vendor: <strong>${vendor?.vendorName || ''}</strong></div>
                <div style="font-size:12px;color:#475569;">Period: ${formatDate(stmtStartDate)} – ${formatDate(stmtEndDate)}</div></div>
            </div>
            <table style="width:100%;border-collapse:collapse;border:1px solid ${borderCol};">
                <thead>
                    <tr style="background:#F1F5F9;">
                        <th style="padding:8px;border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};text-align:left;">Date</th>
                        <th style="padding:8px;border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};text-align:left;">Transaction</th>
                        <th style="padding:8px;border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};text-align:left;">Trans. No.</th>
                        <th style="padding:8px;border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};text-align:right;">Invoiced (Dr)</th>
                        <th style="padding:8px;border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};text-align:right;">Paid (Cr)</th>
                        <th style="padding:8px;border-bottom:1px solid ${borderCol};text-align:right;">Balance</th>
                    </tr>
                </thead>
                <tbody>${rowsHTML}</tbody>
                <tfoot>
                    <tr style="background:#F8FAFC;font-weight:700;">
                        <td colspan="3" style="padding:8px;border-top:2px solid ${borderCol};border-right:1px solid ${borderCol};">Totals</td>
                        <td style="padding:8px;border-top:2px solid ${borderCol};border-right:1px solid ${borderCol};text-align:right;">₹${periodInvoiced.toFixed(2)}</td>
                        <td style="padding:8px;border-top:2px solid ${borderCol};border-right:1px solid ${borderCol};text-align:right;">₹${periodPaid.toFixed(2)}</td>
                        <td style="padding:8px;border-top:2px solid ${borderCol};text-align:right;">₹${closingBalance.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </body></html>`;
        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
    };

    const handleDelete = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/vendors');
            let dbVendors = await res.json();
            dbVendors = dbVendors.filter(v => String(v.id) !== String(vendor.id));
            await fetch('http://localhost:3000/api/vendors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dbVendors),
            });
            setShowDeleteModal(false);
            navigate('/vendors');
        } catch (err) {
            console.error('Error deleting vendor:', err);
        }
    };

    if (loading) return <div style={{ padding: '24px', fontFamily: 'Manrope, sans-serif' }}>Loading...</div>;
    if (!vendor) return <div style={{ padding: '24px', fontFamily: 'Manrope, sans-serif' }}>Vendor not found.</div>;

    const tabs = [
        { id: 'details', label: 'Vendor Details' },
        { id: 'transactions', label: 'Transaction List' },
        { id: 'statements', label: 'Statements' },
    ];

    const statusStyle = (status) => {
        const map = {
            'Paid':      { bg: '#DCFCE7', color: '#15803D' },
            'Pending':   { bg: '#FEE2E2', color: '#B91C1C' },
            'Completed': { bg: '#DBEAFE', color: '#1D4ED8' },
            'Credited':  { bg: '#EDE9FE', color: '#6D28D9' },
            'Returned':  { bg: '#DBEAFE', color: '#1D4ED8' },
            'Adjusted':  { bg: '#FEF9C3', color: '#854D0E' },
        };
        return map[status] || { bg: '#F1F5F9', color: '#475569' };
    };

    const Field = ({ label, value, accent }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '500' }}>{label}</span>
            <span style={{ fontSize: '14px', color: accent ? '#1D4ED8' : '#0F172A', fontWeight: accent ? '700' : '500' }}>{value || '-'}</span>
        </div>
    );

    const CardTitle = ({ title }) => (
        <div style={{ padding: '12px 16px', fontWeight: '600', fontSize: '13px', color: '#0F172A', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
            {title}
        </div>
    );

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#F8FAFC', fontFamily: 'Manrope, sans-serif' }}>

            {/* ── Left Sidebar ── */}
            <div style={{ width: '280px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', background: 'white', flexShrink: 0 }}>
                {/* Search header */}
                <div style={{ height: '50px', display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '34px', overflow: 'hidden', alignItems: 'center', padding: '0 8px', background: '#F8FAFC', flex: 1 }}>
                        <Search size={14} color="var(--text-muted)" style={{ marginRight: '6px', flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder="Search vendor..."
                            value={searchVal}
                            onChange={e => setSearchVal(e.target.value)}
                            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', background: 'transparent', fontFamily: 'inherit' }}
                        />
                    </div>
                </div>

                {/* Vendor list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredVendors.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No vendors found</div>
                    ) : (
                        filteredVendors.map(v => {
                            const isSelected = String(v.id) === String(vendor.id);
                            const vInvoices = purchaseInvoices.filter(pi => String(pi.vendorId) === String(v.id) || pi.vendorName === v.vendorName);
                            const vPmts = vendorPayments.filter(p => String(p.vendorId) === String(v.id) || p.vendorName === v.vendorName);
                            const vReturns = purchaseReturns.filter(pr => String(pr.vendorId) === String(v.id) || pr.vendorName === v.vendorName);
                            const vTotal = vInvoices.reduce((s, pi) => s + (parseFloat(pi.amount) || 0), 0);
                            const vPaid = vPmts.reduce((s, p) => s + calcActualPmt(p), 0);
                            const vRet = vReturns.reduce((s, pr) => s + (parseFloat(pr.grandTotal || pr.totalAmount) || 0), 0);
                            const vPending = Math.max(0, vTotal - vPaid - vRet);
                            return (
                                <div
                                    key={v.id}
                                    onClick={() => navigate(`/vendors/view/${v.id}`)}
                                    style={{
                                        padding: '10px 12px',
                                        borderBottom: '1px solid #F1F5F9',
                                        cursor: 'pointer',
                                        background: isSelected ? '#EEF2FF' : 'transparent',
                                        borderLeft: isSelected ? '4px solid #000B58' : '4px solid transparent',
                                    }}
                                >
                                    <div style={{ fontWeight: '600', fontSize: '13px', color: isSelected ? '#000B58' : '#1E293B', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.vendorName}</div>
                                    <div style={{ fontSize: '12px', color: vPending > 0 ? '#EF4444' : '#22C55E', fontWeight: '600' }}>
                                        ₹{vPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Right Panel ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8FAFC' }}>

                {/* Header */}
                <div style={{ height: '60px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => navigate('/vendors')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#000B58' }}>
                            <ChevronLeft size={24} />
                        </button>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0F172A' }}>{vendor.vendorName}</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => navigate('/vendors/create', { state: { editVendor: vendor } })} style={{ height: '34px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'white', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: 'var(--text-main)', fontFamily: 'inherit' }}>
                            <Edit3 size={14} /> Edit
                        </button>
                        <button onClick={() => setShowDeleteModal(true)} style={{ height: '34px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', border: '1px solid #FCA5A5', borderRadius: '6px', background: '#FEF2F2', color: '#EF4444', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <Trash2 size={14} /> Delete
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #E2E8F0', background: 'white', padding: '0 24px', flexShrink: 0 }}>
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            style={{ padding: '14px 0', marginRight: '28px', background: 'none', border: 'none', borderBottom: activeTab === t.id ? '2px solid #000B58' : '2px solid transparent', color: activeTab === t.id ? '#000B58' : '#64748B', fontWeight: activeTab === t.id ? '700' : '500', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* ── TAB 1: Vendor Details ── */}
                    {activeTab === 'details' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                {[
                                    { label: 'Total Purchased', value: `₹${totalPurchased.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: '#1D4ED8', bg: '#EFF6FF' },
                                    { label: 'Total Paid', value: `₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: '#15803D', bg: '#F0FDF4' },
                                    { label: 'Pending to Pay', value: `₹${pendingToPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: pendingToPay > 0 ? '#B91C1C' : '#15803D', bg: pendingToPay > 0 ? '#FEF2F2' : '#F0FDF4' },
                                ].map((c, i) => (
                                    <div key={i} style={{ background: c.bg, borderRadius: '10px', padding: '16px 20px', border: `1px solid ${c.bg === '#EFF6FF' ? '#BFDBFE' : c.bg === '#F0FDF4' ? '#BBF7D0' : '#FECACA'}` }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748B', marginBottom: '6px' }}>{c.label}</div>
                                        <div style={{ fontSize: '20px', fontWeight: '800', color: c.color }}>{c.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Basic Details Card */}
                            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                <CardTitle title="Basic Details" />
                                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                                    <Field label="Company Name" value={vendor.vendorName} />
                                    <Field label="Contact Person" value={vendor.contactPerson} />
                                    <Field label="Contact Number" value={vendor.contactNumber} />
                                    <Field label="Email ID" value={vendor.email} />
                                    <Field label="Payment Terms" value={vendor.paymentTerms} />
                                    <Field label="Opening Balance" value={`₹${parseFloat(vendor.openingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />
                                </div>
                            </div>

                            {/* Address Details Card */}
                            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                <CardTitle title="Address Details" />
                                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', marginBottom: '8px' }}>Billing Address</div>
                                        <div style={{ fontSize: '14px', color: '#0F172A', lineHeight: 1.6 }}>
                                            {vendor.billAddress || '-'}<br />
                                            {[vendor.billCity, vendor.billState].filter(Boolean).join(', ') || '-'}<br />
                                            {vendor.billPinCode && <span style={{ color: '#1D4ED8', fontWeight: '700' }}>{vendor.billPinCode}</span>}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', marginBottom: '8px' }}>Shipping Address</div>
                                        <div style={{ fontSize: '14px', color: '#0F172A', lineHeight: 1.6 }}>
                                            {vendor.shipAddress || '-'}<br />
                                            {[vendor.shipCity, vendor.shipState].filter(Boolean).join(', ') || '-'}<br />
                                            {vendor.shipPinCode && <span style={{ color: '#1D4ED8', fontWeight: '700' }}>{vendor.shipPinCode}</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* GST & PAN Card */}
                            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                <CardTitle title="GST & PAN Details" />
                                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <Field label="GSTIN No" value={vendor.gstin} accent />
                                    <Field label="PAN Number" value={vendor.panNumber} />
                                </div>
                            </div>

                        </div>
                    )}

                    {/* ── TAB 2: Transaction List ── */}
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
                                            const st = statusStyle(t.status);
                                            return (
                                                <tr key={t.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ padding: '10px 14px', color: '#64748B' }}>{idx + 1}</td>
                                                    <td style={{ padding: '10px 14px' }}>{formatDate(t.date)}</td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', background: t.isDebit ? '#FEF9C3' : '#F0FDF4', color: t.isDebit ? '#854D0E' : '#15803D' }}>
                                                            {t.type}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', fontWeight: '600', color: '#000B58' }}>{t.transactionNo}</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600' }}>₹{t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', color: t.dueAmount > 0 ? '#B91C1C' : '#64748B', fontWeight: t.dueAmount > 0 ? '700' : '400' }}>
                                                        {t.dueAmount > 0 ? `₹${t.dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', background: st.bg, color: st.color }}>
                                                            {t.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>No transactions recorded for this vendor</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── TAB 3: Statements ── */}
                    {activeTab === 'statements' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Controls Bar */}
                            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <DateFilterPopover value={statementDateFilter} onChange={setStatementDateFilter} />
                                </div>
                                <button onClick={handlePrintStatement} style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: 'none', borderRadius: '6px', background: '#000B58', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Printer size={15} /> Print Statement
                                </button>
                            </div>

                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                                {[
                                    { label: 'Opening Balance', value: openingBalance, color: '#475569', bg: '#F8FAFC', border: '#E2E8F0' },
                                    { label: 'Invoiced Amount (+)', value: periodInvoiced, color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
                                    { label: 'Paid & Credits (−)', value: periodPaid, color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
                                    { label: 'Balance Due (=)', value: closingBalance, color: closingBalance > 0 ? '#B91C1C' : '#15803D', bg: closingBalance > 0 ? '#FEF2F2' : '#F0FDF4', border: closingBalance > 0 ? '#FECACA' : '#BBF7D0' },
                                ].map((c, i) => (
                                    <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '10px', padding: '16px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748B', marginBottom: '6px' }}>{c.label}</div>
                                        <div style={{ fontSize: '18px', fontWeight: '800', color: c.color }}>₹{c.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Ledger Table */}
                            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #606060' }}>
                                            {['Date', 'Transaction', 'Trans. No.', 'Invoiced (Dr)', 'Paid (Cr)', 'Running Balance'].map((h, i) => (
                                                <th key={h} style={{ padding: '10px 12px', textAlign: i >= 3 ? 'right' : 'left', fontWeight: '700', color: '#0F172A', fontSize: '12px', borderRight: i < 5 ? '1px solid #E2E8F0' : 'none' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Opening Balance row */}
                                        <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#FAFAFA' }}>
                                            <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B' }}>{formatDate(stmtStartDate)}</td>
                                            <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', fontWeight: '600', color: '#0F172A' }}>Opening Balance</td>
                                            <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', color: '#64748B' }}>—</td>
                                            <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', textAlign: 'right', color: '#64748B' }}>—</td>
                                            <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', textAlign: 'right', color: '#64748B' }}>—</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '700', color: openingBalance > 0 ? '#B91C1C' : '#0F172A' }}>₹{openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        {ledgerRows.length > 0 ? ledgerRows.map((tx, idx) => (
                                            <tr key={tx.id || idx} style={{ borderBottom: '1px solid #E2E8F0' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B' }}>{formatDate(tx.date)}</td>
                                                <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', fontWeight: '500', color: '#0F172A' }}>{tx.type}</td>
                                                <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', color: '#000B58', fontWeight: '600' }}>{tx.transactionNo}</td>
                                                <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', textAlign: 'right', color: tx.isDebit ? '#1D4ED8' : '#94A3B8' }}>{tx.isDebit ? `₹${tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</td>
                                                <td style={{ padding: '9px 12px', borderRight: '1px solid #E2E8F0', textAlign: 'right', color: !tx.isDebit ? '#15803D' : '#94A3B8' }}>{!tx.isDebit ? `₹${tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</td>
                                                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '700', color: tx.runningBalance > 0 ? '#B91C1C' : '#15803D' }}>₹{tx.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No transactions in this period</td></tr>
                                        )}
                                        {/* Totals */}
                                        <tr style={{ background: '#F1F5F9', borderTop: '2px solid #E2E8F0', fontWeight: '700' }}>
                                            <td colSpan="3" style={{ padding: '10px 12px', borderRight: '1px solid #E2E8F0', color: '#0F172A' }}>Totals</td>
                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #E2E8F0', textAlign: 'right', color: '#1D4ED8' }}>₹{periodInvoiced.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #E2E8F0', textAlign: 'right', color: '#15803D' }}>₹{periodPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', color: closingBalance > 0 ? '#B91C1C' : '#15803D' }}>₹{closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                        </div>
                    )}

                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', borderRadius: '12px', width: '400px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', fontFamily: 'Manrope, sans-serif' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ background: '#FEE2E2', padding: '10px', borderRadius: '50%' }}>
                                <Trash2 style={{ width: '22px', height: '22px', color: '#EF4444' }} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0F172A' }}>Delete Vendor</h3>
                        </div>
                        <p style={{ margin: '0 0 24px 0', color: '#64748B', fontSize: '14px', lineHeight: 1.6 }}>
                            Are you sure you want to delete <strong style={{ color: '#0F172A' }}>{vendor.vendorName}</strong>? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setShowDeleteModal(false)} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#EF4444', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ViewVendor;
