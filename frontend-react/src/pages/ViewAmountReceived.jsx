import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Printer, Download, Edit3, Search, AlertTriangle, XCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ViewAmountReceived = ({ initialAR, allAR: propAllAR, customers, onBack, onRefresh }) => {
    const [currentAR, setCurrentAR] = useState(initialAR || (propAllAR && propAllAR.length > 0 ? propAllAR[0] : null));
    const [allAR, setAllAR] = useState(propAllAR || []);
    const [searchQuery, setSearchQuery] = useState('');
    const [accountData, setAccountData] = useState({});
    const [allCustomers, setAllCustomers] = useState(customers || []);
    const navigate = useNavigate();
    const iframeRef = useRef(null);

    // Cancellation state
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    const [toast, setToast] = useState(null);
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        setAllAR(propAllAR || []);
    }, [propAllAR]);

    useEffect(() => {
        if (!currentAR && propAllAR && propAllAR.length > 0) {
            setCurrentAR(propAllAR[0]);
        }
    }, [propAllAR]);

    useEffect(() => {
        if (!customers || customers.length === 0) {
            fetch('/api/customers')
                .then(r => r.json())
                .then(data => setAllCustomers(data))
                .catch(() => {});
        } else {
            setAllCustomers(customers);
        }
    }, [customers]);

    useEffect(() => {
        const accStr = localStorage.getItem('myAccountData');
        if (accStr) {
            try { setAccountData(JSON.parse(accStr)); } catch (e) {}
        }
    }, []);

    const filteredARs = [...allAR].filter(ar => {
        const q = searchQuery.toLowerCase().trim();
        return (ar.arNo && String(ar.arNo).toLowerCase().includes(q)) ||
               (ar.customerName && String(ar.customerName).toLowerCase().includes(q));
    });

    const isLegacy = (doc) => !doc || !doc.id;
    const isCancelled = (doc) => doc && doc.status === 'CANCELLED';

    const handleCancelSubmit = async () => {
        if (!cancelReason.trim()) {
            showToast('Cancellation reason is required.', 'error');
            return;
        }
        if (isCancelling) return;
        setIsCancelling(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`/api/receipts/${currentAR.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reason: cancelReason.trim() })
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Cancellation failed.', 'error');
                return;
            }
            showToast(`Receipt ${currentAR.arNo} cancelled successfully.`);
            setShowCancelModal(false);
            setCancelReason('');

            // Refresh from backend
            const refreshRes = await fetch('/api/payments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (refreshRes.ok) {
                const freshARs = await refreshRes.json();
                const sorted = (freshARs || []).reverse();
                setAllAR(sorted);
                const updated = sorted.find(ar => String(ar.id) === String(currentAR.id));
                if (updated) setCurrentAR(updated);
            }
            if (onRefresh) onRefresh();
        } catch (err) {
            showToast('Unable to complete the operation. Please try again.', 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        if (typeof dateString === 'string' && dateString.includes('/')) return dateString;
        try {
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return String(dateString);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        } catch (e) {
            return String(dateString);
        }
    };

    const numberToWords = (num) => {
        if (!num || isNaN(num)) return 'Zero Rupees Only';
        const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        
        const numString = Math.floor(num).toString();
        if (num === 0) return 'Zero Rupees Only';
        
        const parts = numString.split('.');
        const integerPart = parseInt(parts[0], 10);
        
        const translate = (n) => {
            if (n < 20) return a[n];
            if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
            if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + translate(n % 100) : '');
            if (n < 100000) return translate(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + translate(n % 1000) : '');
            if (n < 10000000) return translate(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + translate(n % 100000) : '');
            return translate(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + translate(n % 10000000) : '');
        };
        
        let words = translate(integerPart);
        return words + ' Only';
    };

    const generateHTML = (ar) => {
        if (!ar) return '';
        const accData = accountData;

        let addrParts = [];
        if (accData.address) addrParts.push(accData.address);
        if (accData.city) addrParts.push(accData.city);
        let addrLine1 = addrParts.join(', ');
        
        let stateParts = [];
        if (accData.state) stateParts.push(accData.state);
        if (accData.country) stateParts.push(accData.country);
        let addrLine2 = stateParts.join(', ') + (accData.pin ? ` - ${accData.pin}` : '');

        const liveCustomer = (allCustomers || []).find(c => 
            (ar.customerId && String(c.id) === String(ar.customerId)) || 
            (c.name && ar.customerName && c.name.toLowerCase() === ar.customerName.toLowerCase()) ||
            (c.customerName && ar.customerName && c.customerName.toLowerCase() === ar.customerName.toLowerCase())
        );

        let baseAddr = ar.address || (liveCustomer && (liveCustomer.address || liveCustomer.billingAddress)) || '';
        let city = ar.city || (liveCustomer && liveCustomer.city ? liveCustomer.city : '');
        let state = ar.state || (liveCustomer && liveCustomer.state ? liveCustomer.state : '');
        let pin = ar.pin || ar.pincode || (liveCustomer && (liveCustomer.pin || liveCustomer.pincode) ? (liveCustomer.pin || liveCustomer.pincode) : '');

        let custAddrLine1 = baseAddr || '';
        let cityState = [city, state].filter(Boolean).join(', ');
        let custAddrLine2 = cityState + (cityState && pin ? ' - ' : '') + pin;

        let finalCustAddr = custAddrLine1;
        if (custAddrLine2 && custAddrLine2 !== custAddrLine1) {
            finalCustAddr += (finalCustAddr ? ' <br /> ' : '') + custAddrLine2;
        }

        let displayAddress = finalCustAddr || '-';
        let displayMobile = ar.mobile || (liveCustomer && (liveCustomer.mobile || liveCustomer.phone)) || '-';

        const borderCol = '#606060';
        const currentBalance = parseFloat(ar.pending || 0);
        const totalPaid = parseFloat(ar.amount || 0);

        let invoicesHTML = '';
        if (ar.invoices && ar.invoices.length > 0) {
            invoicesHTML = ar.invoices.map(inv => `
                <tr>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 12px; white-space: nowrap;">${inv.date || '-'}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 12px; white-space: nowrap;">${inv.invoiceNo || '-'}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 12px; text-align: right; white-space: nowrap;">₹${parseFloat(inv.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; padding: 6px 12px; text-align: right; white-space: nowrap;">₹${parseFloat(inv.allocated || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
            `).join('');
        } else {
            invoicesHTML = `
                <tr>
                    <td colspan="4" style="border-bottom: 1px solid ${borderCol}; padding: 16px; text-align: center; color: #64748b; font-style: italic;">No specific bills allocated (Advance Payment)</td>
                </tr>
            `;
        }

        const cancelledBanner = isCancelled(ar) ? `<div style="background:#FEF2F2;border:2px solid #EF4444;border-radius:6px;padding:8px 16px;margin-bottom:12px;color:#EF4444;font-weight:bold;font-size:12px;text-align:center;">⚠ CANCELLED — ${ar.cancellation_reason || ''}</div>` : '';
        return `
            <style>
                .receipt-outer-box th, .receipt-outer-box td {
                    font-size: inherit !important;
                }
            </style>
            ${cancelledBanner}
            <div class="receipt-outer-box" style="width: 100%; max-width: 700px; margin: 0 auto; padding: 16px; background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box; font-family: 'Manrope', sans-serif; font-size: 11px; color: #000;">
                <div style="background-color: #fff; border: 1px solid ${borderCol}; border-radius: 6px; overflow: hidden;">
                    
                    <!-- Header Section -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid ${borderCol}; padding: 12px 16px;">
                        <div style="text-align: left;">
                            <div style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${accData.company || 'SRI PARVATHI HARDWARES'}</div>
                            ${addrLine1 ? `<div style="font-size: 10px; color: #333; margin-top: 2px;">${addrLine1}</div>` : ''}
                            ${addrLine2 ? `<div style="font-size: 10px; color: #333;">${addrLine2}</div>` : ''}
                            ${accData.mobile ? `<div style="font-size: 10px; color: #333;">Ph No : <b>${accData.mobile}</b></div>` : ''}
                            ${accData.gstin ? `<div style="font-size: 10px; color: #333;">GSTIN No : <b>${accData.gstin}</b></div>` : ''}
                            ${accData.pan ? `<div style="font-size: 10px; color: #333;">PAN No : <b>${accData.pan}</b></div>` : ''}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; letter-spacing: 1px; color: #000;">RECEIPT</div>
                    </div>

                    <!-- Customer & AR Info Box -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: 10px 16px; display: flex; justify-content: space-between; line-height: 1.6; font-size: 11px;">
                        <div style="text-align: left; flex: 1;">
                            <div style="display: flex;"><span style="font-weight: bold; width: 105px;">Customer Name</span><span style="padding-right: 6px;">-</span><span>${ar.customerName || '-'}</span></div>
                            <div style="display: flex;"><span style="font-weight: bold; width: 105px;">Mobile No.</span><span style="padding-right: 6px;">-</span><span>${displayMobile}</span></div>
                            <div style="display: flex;"><span style="font-weight: bold; width: 105px; flex-shrink: 0;">Address</span><span style="padding-right: 6px; flex-shrink: 0;">-</span><span style="flex: 1;">${displayAddress}</span></div>
                        </div>
                        <div style="text-align: left; width: 160px; flex-shrink: 0;">
                            <div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: 55px; text-align: left;">AR No.</span><span style="padding-right: 6px;">-</span><span style="width: 75px; text-align: right; font-weight: bold;">${ar.arNo || ''}</span></div>
                            <div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: 55px; text-align: left;">Date</span><span style="padding-right: 6px;">-</span><span style="width: 75px; text-align: right;">${formatDate(ar.date)}</span></div>
                        </div>
                    </div>

                    <!-- Paid Bills Subheader -->
                    <div style="padding: 8px 16px 4px 16px; font-weight: bold; font-size: 11px; display: flex; align-items: center; gap: 6px;">
                        <div style="width: 3px; height: 12px; background: #000;"></div>
                        <span>Paid Bills</span>
                    </div>

                    <!-- Paid Bills Table -->
                    <table style="width: 100%; border-collapse: collapse; border-bottom: 1px solid ${borderCol}; font-size: 10.5px; text-align: left;">
                        <thead>
                            <tr style="background-color: #f8fafc; border-top: 1px solid ${borderCol}; border-bottom: 1px solid ${borderCol};">
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 12px; width: 100px; white-space: nowrap;">Date</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 12px; width: 120px; white-space: nowrap;">INV No.</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 12px; text-align: right; white-space: nowrap;">Invoice Amount</th>
                                <th style="padding: 6px 12px; text-align: right; white-space: nowrap;">Amount Paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoicesHTML}
                        </tbody>
                    </table>

                    <!-- Summary / Footer Section -->
                    <div style="padding: 10px 16px; display: flex; justify-content: space-between; align-items: flex-start; line-height: 1.6; font-size: 11px;">
                        <div style="text-align: left; flex: 1; padding-right: 16px;">
                            <div style="font-weight: bold;">Amount In Words</div>
                            <div style="margin-top: 2px;">${numberToWords(totalPaid)}</div>
                        </div>
                        <div style="width: 220px; text-align: left; border-left: 1px solid ${borderCol}; padding-left: 16px; flex-shrink: 0;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Paid Amount :</span>
                                <span style="font-weight: bold;">₹${totalPaid.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                                <span>Current Balance :</span>
                                <span style="font-weight: bold;">₹${currentBalance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;
    };

    const handlePrint = () => {
        if (!currentAR || !iframeRef.current) return;
        const printContent = generateHTML(currentAR);

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Print Receipt</title>
                    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                    <style>
                        body { margin: 0; padding: 10px; font-family: 'Manrope', sans-serif; background: white; display: flex; justify-content: center; }
                        @media print { 
                            @page { margin: 4mm; size: auto; } 
                            body { padding: 0; margin: 0; display: flex; justify-content: center; background: white; } 
                            .receipt-outer-box { box-shadow: none !important; padding: 12px !important; width: 100% !important; max-width: 100% !important; }
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
            <iframe ref={iframeRef} style={{ display: 'none' }} title="Print Frame" />
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                {/* Left Sidebar Menu */}
                <div style={{ width: '280px', minWidth: '240px', background: 'white', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    {/* Search */}
                    <div style={{ height: '50px', alignItems: 'center', padding: '0px 16px 0 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '30px', flex: 1, overflow: 'hidden', alignItems: 'center', padding: '0 8px' }}>
                            <Search size={16} color="var(--text-muted)" style={{ marginRight: '6px' }} />
                            <input 
                                type="text" 
                                placeholder="Search AR No / Name" 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', height: '25px' }}
                            />
                        </div>
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '16px', fontWeight: 'bold' }}>×</span>
                            </button>
                        )}
                    </div>
                    {/* List Items */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filteredARs.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No records found</div>
                        ) : (
                            filteredARs.map((ar, idx) => {
                                const isActive = currentAR && currentAR.arNo === ar.arNo;
                                const cancelled = isCancelled(ar);
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => setCurrentAR(ar)} 
                                        style={{ 
                                            padding: '12px 16px', 
                                            borderBottom: '1px solid #F1F5F9', 
                                            cursor: 'pointer', 
                                            background: isActive ? '#EEF2FF' : 'transparent', 
                                            borderLeft: isActive ? '4px solid #000B58' : '4px solid transparent',
                                            opacity: cancelled ? 0.7 : 1
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                                            <div style={{ fontWeight: '600', fontSize: '13px', color: isActive ? '#000B58' : '#1E293B' }}>{ar.arNo}</div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>₹{parseFloat(ar.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ar.customerName || '-'}</div>
                                            {cancelled ? (
                                                <div style={{ color: '#EF4444', fontSize: '10px', fontWeight: 600 }}>CANCELLED</div>
                                            ) : (
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatDate(ar.date)}</div>
                                            )}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', background: 'white', cursor: 'pointer' }}>
                                <ChevronLeft size={16} />
                            </button>
                            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>
                                {currentAR?.arNo}
                            </h2>
                            {currentAR && statusBadge(currentAR)}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {currentAR && !isLegacy(currentAR) && !isCancelled(currentAR) && (
                                <button onClick={() => setShowCancelModal(true)} style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: '1px solid #FCA5A5', borderRadius: '6px', background: '#FEF2F2', color: '#EF4444', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                                    <XCircle size={14} /> Cancel
                                </button>
                            )}
                            {currentAR && isLegacy(currentAR) && (
                                <span style={{ fontSize: '12px', color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', padding: '0 10px', display: 'flex', alignItems: 'center' }}>Historical record — modification unavailable</span>
                            )}
                        </div>
                    </div>

                    {/* Cancelled record info panel */}
                    {currentAR && isCancelled(currentAR) && (
                        <div style={{ margin: '16px 24px 0', padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '13px', color: '#991B1B' }}>
                            <strong>Receipt Cancelled</strong>
                            {currentAR.cancellation_reason && <div style={{ marginTop: '4px' }}>Reason: {currentAR.cancellation_reason}</div>}
                            {currentAR.cancelled_at && <div style={{ marginTop: '2px', fontSize: '11px', color: '#B91C1C' }}>Cancelled on: {new Date(currentAR.cancelled_at).toLocaleString()}</div>}
                            {currentAR.cancelled_by && <div style={{ marginTop: '2px', fontSize: '11px', color: '#B91C1C' }}>Cancelled by: {currentAR.cancelled_by}</div>}
                        </div>
                    )}

                    {/* Preview Area */}
                    <div style={{ padding: '16px', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                        <div 
                            dangerouslySetInnerHTML={{ __html: generateHTML(currentAR) }} 
                            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
                        />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="sticky-action-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', zIndex: 10, flexShrink: 0 }}>
                <div className="footer-left">
                    <button onClick={onBack} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                        <ChevronLeft size={16} /> Back
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid #000B58', borderRadius: '8px', background: 'white', color: '#000B58', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                        <Download size={16} /> Export
                    </button>
                    <button onClick={handlePrint} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: 'none', borderRadius: '8px', background: '#000B58', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                        <Printer size={16} /> Print
                    </button>
                </div>
            </div>

            {/* Cancellation Modal */}
            {showCancelModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', borderRadius: '12px', width: '480px', padding: '28px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                            <div style={{ background: '#FEE2E2', padding: '10px', borderRadius: '50%' }}><AlertTriangle size={22} color="#EF4444" /></div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Cancel Receipt</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>This action is permanent and cannot be undone.</p>
                            </div>
                        </div>
                        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px', fontSize: '13px', color: '#334155' }}>
                            <div><strong>Document:</strong> Customer Receipt</div>
                            <div><strong>Number:</strong> {currentAR?.arNo}</div>
                            <div><strong>Amount:</strong> ₹{parseFloat(currentAR?.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                        </div>
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>Cancellation Reason <span style={{ color: '#EF4444' }}>*</span></label>
                            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} placeholder="Describe the reason for cancellation..." style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}>Close</button>
                            <button onClick={handleCancelSubmit} disabled={isCancelling} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: isCancelling ? '#94A3B8' : '#EF4444', color: 'white', fontWeight: 500, cursor: isCancelling ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                                {isCancelling ? 'Cancelling…' : 'Cancel Receipt'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, background: toast.type === 'success' ? '#22C55E' : '#EF4444', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
};

// statusBadge helper
const statusBadge = (doc) => {
    if (!doc) return null;
    const isCancelled = (d) => d && d.status === 'CANCELLED';
    const isLegacy = (d) => !d || !d.id;
    if (isCancelled(doc)) return <span style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>CANCELLED</span>;
    if (isLegacy(doc)) return <span style={{ background: '#FFF7ED', color: '#F97316', border: '1px solid #FED7AA', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>LEGACY</span>;
    return <span style={{ background: '#F0FDF4', color: '#22C55E', border: '1px solid #86EFAC', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>ACTIVE</span>;
};

export default ViewAmountReceived;
