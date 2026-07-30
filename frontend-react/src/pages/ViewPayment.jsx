import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Printer, Download, Search, AlertTriangle, XCircle, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const ViewPayment = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [currentPayment, setCurrentPayment] = useState(null);
    const [loading, setLoading] = useState(true);
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

    const [allPayments, setAllPayments] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [accountData, setAccountData] = useState({});
    const [vendors, setVendors] = useState([]);

    useEffect(() => {
        const accStr = localStorage.getItem('myAccountData');
        if (accStr) {
            try { setAccountData(JSON.parse(accStr)); } catch (e) {}
        }

        const fetchPayment = async () => {
            try {
                const [vRes, pmtRes] = await Promise.all([
                    fetch('http://localhost:3000/api/vendors').catch(() => ({ json: () => [] })),
                    fetch('http://localhost:3000/api/vendor-payments').catch(() => ({ json: () => [] }))
                ]);
                const vData = await vRes.json();
                const pmtData = await pmtRes.json();

                setVendors(vData || []);
                const reversedData = (pmtData || []).reverse();
                setAllPayments(reversedData);

                if (id) {
                    const found = reversedData.find(p => String(p.id) === String(id));
                    if (found) setCurrentPayment(found);
                    else if (reversedData.length > 0) setCurrentPayment(reversedData[0]);
                } else if (reversedData.length > 0) {
                    setCurrentPayment(reversedData[0]);
                }
            } catch (err) {
                console.error('Error fetching payment:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchPayment();
    }, [id]);

    const filteredPayments = allPayments.filter(p => {
        const q = searchQuery.toLowerCase().trim();
        return (p.pmtNo && String(p.pmtNo).toLowerCase().includes(q)) ||
               (p.vendorName && String(p.vendorName).toLowerCase().includes(q));
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
            const res = await fetch(`http://localhost:3000/api/vendor-payments/${currentPayment.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reason: cancelReason.trim() })
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Cancellation failed.', 'error');
                return;
            }
            showToast(`Payment ${currentPayment.pmtNo} cancelled successfully.`);
            setShowCancelModal(false);
            setCancelReason('');

            // Refresh from backend
            const refreshRes = await fetch('http://localhost:3000/api/vendor-payments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (refreshRes.ok) {
                const freshPayments = await refreshRes.json();
                const sorted = (freshPayments || []).reverse();
                setAllPayments(sorted);
                const updated = sorted.find(p => String(p.id) === String(currentPayment.id));
                if (updated) setCurrentPayment(updated);
            }
        } catch (err) {
            showToast('Unable to complete the operation. Please try again.', 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const handlePrint = () => {
        if (!currentPayment || !iframeRef.current) return;
        const printContent = generateHTML(currentPayment);

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Print Payment Voucher</title>
                    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                    <style>
                        body { margin: 0; padding: 10px; font-family: 'Manrope', sans-serif; background: white; display: flex; justify-content: center; }
                        @media print { 
                            @page { margin: 4mm auto; size: A5 landscape; } 
                            body { padding: 0; margin: 0; display: flex; justify-content: center; background: white; } 
                            .payment-outer-box { box-shadow: none !important; padding: 8px !important; width: 100% !important; max-width: 100% !important; }
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

    const getActualPaidAmount = (p) => {
        if (!p) return 0;
        const pmtAmt = parseFloat(p.paidAmount || p.amount) || 0;
        const discAmt = parseFloat(p.discount) || 0;
        const totalAllocated = p.invoices ? p.invoices.reduce((sum, inv) => sum + (parseFloat(inv.allocated || inv.paidAmount) || 0), 0) : pmtAmt + discAmt;
        
        let actualAmt = pmtAmt;
        if (pmtAmt + discAmt > totalAllocated && p.invoices && p.invoices.length > 0) {
            actualAmt = Math.max(0, totalAllocated - discAmt);
        }
        return actualAmt || pmtAmt || totalAllocated;
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
        return words + ' Rupees Only';
    };

    const generateHTML = (payment) => {
        if (!payment) return '';
        const accData = accountData || {};

        let addrParts = [];
        if (accData.address) addrParts.push(accData.address);
        if (accData.city) addrParts.push(accData.city);
        let addrLine1 = addrParts.length > 0 ? addrParts.join(', ') : '31/11, Pukkulam Road, Thiyagadurgam, Kallakurichi';
        
        let stateParts = [];
        if (accData.state) stateParts.push(accData.state);
        if (accData.country) stateParts.push(accData.country);
        let addrLine2 = stateParts.length > 0 ? (stateParts.join(', ') + (accData.pin ? ` - ${accData.pin}` : '')) : 'Tamil Nadu - 606 206';

        const borderCol = '#606060';

        const vendor = (vendors || []).find(v => String(v.id) === String(payment.vendorId) || v.vendorName === payment.vendorName);
        let vendorMobile = payment.vendorMobile || payment.contactNumber || (vendor && (vendor.contactNumber || vendor.phone || vendor.phoneNumber)) || '-';
        
        let baseAddr = payment.vendorAddress || (vendor && (vendor.address || vendor.billAddress)) || '';
        let city = payment.vendorCity || (vendor && (vendor.city || vendor.billCity)) || '';
        let state = payment.vendorState || (vendor && (vendor.state || vendor.billState)) || '';
        let pin = payment.vendorPinCode || payment.vendorPincode || payment.vendorPin || payment.billPinCode || payment.pin || (vendor && (vendor.billPinCode || vendor.billPin || vendor.billPincode || vendor.pinCode || vendor.pincode || vendor.pin || vendor.zipCode || vendor.zip)) || '';
        
        let line1 = baseAddr || '';
        let line2Parts = [city, state].filter(Boolean);
        let line2 = line2Parts.join(', ') + (line2Parts.length > 0 && pin ? ` - ${pin}` : (pin ? pin : ''));
        let vendorAddrHTML = `${line1}${line2 ? '<br>' + line2 : ''}`;

        let itemsHTML = '';
        let totalPaidInInvoices = 0;

        (payment.invoices || []).forEach(inv => {
            const invAmt = parseFloat(inv.amount || inv.totalAmount || inv.grandTotal) || 0;
            const paidAmt = parseFloat(inv.allocated || inv.paidAmount || inv.amountPaid) || 0;
            totalPaidInInvoices += paidAmt;

            itemsHTML += `
                <tr>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: left;">${formatDate(inv.date || payment.date)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: left;">${inv.invoiceNo || inv.piNo || '-'}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${invAmt.toFixed(2)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${paidAmt.toFixed(2)}</td>
                </tr>
            `;
        });

        const totalPaid = getActualPaidAmount(payment) || totalPaidInInvoices;
        const currentBalance = vendor && vendor.openingBalance ? Math.max(0, parseFloat(vendor.openingBalance) - totalPaid) : 60.00;

        const cancelledBanner = isCancelled(payment) ? `<div style="background:#FEF2F2;border:2px solid #EF4444;border-radius:6px;padding:8px 16px;margin-bottom:12px;color:#EF4444;font-weight:bold;font-size:12px;text-align:center;">⚠ CANCELLED — ${payment.cancellation_reason || ''}</div>` : '';
        return `
            ${cancelledBanner}
            <div class="payment-outer-box" style="width: 100%; max-width: 750px; margin: 0 auto; padding: 16px; background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box; font-family: 'Manrope', sans-serif; font-size: 11px; color: #000;">
                <div style="background-color: #fff; border: 1px solid ${borderCol}; border-radius: 6px; overflow: hidden;">
                    
                    <!-- Header Section -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid ${borderCol}; padding: 12px 16px;">
                        <div style="text-align: left;">
                            <div style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${accData.company || accData.companyName || 'SRI PARVATHI HARDWARES'}</div>
                            ${addrLine1 ? `<div style="font-size: 10px; color: #333; margin-top: 2px;">${addrLine1}</div>` : ''}
                            ${addrLine2 ? `<div style="font-size: 10px; color: #333;">${addrLine2}</div>` : ''}
                            ${accData.mobile || accData.phone ? `<div style="font-size: 10px; color: #333;">Ph No : <b>${accData.mobile || accData.phone}</b></div>` : ''}
                            ${accData.gstin ? `<div style="font-size: 10px; color: #333;">GSTIN No : <b>${accData.gstin}</b></div>` : ''}
                            ${accData.pan ? `<div style="font-size: 10px; color: #333;">PAN No : <b>${accData.pan}</b></div>` : ''}
                        </div>
                        <div style="font-size: 20px; font-weight: bold; letter-spacing: 1px; color: #000;">PAYMENT</div>
                    </div>

                    <!-- Vendor Details & Payment Metadata Box -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: 10px 16px; display: flex; justify-content: space-between; line-height: 1.6; font-size: 11px;">
                        <div style="text-align: left; flex: 1;">
                            <div style="display: flex;"><span style="font-weight: bold; width: 90px;">Vendor Name</span><span style="padding-right: 8px;">-</span><span style="font-weight: bold;">${payment.vendorName || '-'}</span></div>
                            <div style="display: flex;"><span style="font-weight: bold; width: 90px;">Mobile No.</span><span style="padding-right: 8px;">-</span><span>${vendorMobile}</span></div>
                            <div style="display: flex;"><span style="font-weight: bold; width: 90px;">Address</span><span style="padding-right: 8px;">-</span><span>${vendorAddrHTML || '-'}</span></div>
                        </div>
                        <div style="text-align: left; width: 170px; flex-shrink: 0;">
                            <div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: 80px; text-align: left;">PMT No.</span><span style="padding-right: 6px;">-</span><span style="width: 70px; text-align: right;">${payment.pmtNo || '-'}</span></div>
                            <div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: 80px; text-align: left;">Date</span><span style="padding-right: 6px;">-</span><span style="width: 70px; text-align: right;">${formatDate(payment.date)}</span></div>
                        </div>
                    </div>

                    <!-- Paid Bills Title & Table -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: 8px 16px 4px 16px; font-weight: bold; font-size: 12px; display: flex; align-items: center;">
                        <span style="border-left: 2px solid #000; padding-left: 6px;">Paid Bills</span>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; border-bottom: 1px solid ${borderCol}; font-size: 10.5px; text-align: left;">
                        <thead>
                            <tr style="background-color: #f8fafc; border-bottom: 1px solid ${borderCol};">
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 100px;">Date</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 120px;">PI No.</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">Purchase Amount</th>
                                <th style="padding: 6px 8px; text-align: right;">Amount Paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML || `<tr><td colspan="4" style="text-align: center; padding: 12px; border-bottom: 1px solid ${borderCol};">No invoices allocated</td></tr>`}
                        </tbody>
                    </table>

                    <!-- Amount In Words & Totals Box -->
                    <div style="padding: 10px 16px; display: flex; justify-content: space-between; align-items: flex-start; line-height: 1.6; font-size: 11px;">
                        <div style="text-align: left; flex: 1; padding-right: 16px;">
                            <div style="font-weight: bold;">Amount In Words</div>
                            <div style="margin-top: 2px;">${numberToWords(totalPaid)}</div>
                        </div>
                        <div style="width: 220px; text-align: right; flex-shrink: 0;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Paid Amount :</span>
                                <span style="font-weight: bold;">₹${totalPaid.toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                                <span>Current Balance :</span>
                                <span style="font-weight: bold;">₹${currentBalance.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;
    };

    if (loading) return <div style={{ padding: '24px' }}>Loading...</div>;
    if (!currentPayment) return <div style={{ padding: '24px' }}>Payment not found.</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
            <iframe ref={iframeRef} style={{ display: 'none' }} title="Print Frame" />
            
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                {/* Left Sidebar Menu */}
                <div style={{ width: '280px', minWidth: '240px', background: 'white', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <div style={{ height: '50px', alignItems: 'center', padding: '0px 16px 0 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '30px', flex: 1, overflow: 'hidden', alignItems: 'center', padding: '0 8px' }}>
                            <Search size={16} color="var(--text-muted)" style={{ marginRight: '6px' }} />
                            <input 
                                type="text" 
                                placeholder="Search PMT No / Vendor" 
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
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filteredPayments.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No records found</div>
                        ) : (
                            filteredPayments.map((p, idx) => {
                                const isActive = currentPayment && currentPayment.id === p.id;
                                const cancelled = isCancelled(p);
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => setCurrentPayment(p)} 
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
                                            <div style={{ fontWeight: '600', fontSize: '13px', color: isActive ? '#000B58' : '#1E293B' }}>{p.pmtNo}</div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>₹{getActualPaidAmount(p).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.vendorName || '-'}</div>
                                            {cancelled ? (
                                                <div style={{ color: '#EF4444', fontSize: '10px', fontWeight: 600 }}>CANCELLED</div>
                                            ) : (
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatDate(p.date)}</div>
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
                    <div style={{ height: '50px', background: 'white', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button onClick={() => navigate('/payment')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', background: 'white', cursor: 'pointer' }}>
                                <ChevronLeft size={16} />
                            </button>
                            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>
                                {currentPayment?.pmtNo} {currentPayment?.vendorName ? `- ${currentPayment.vendorName}` : ''}
                            </h2>
                            {currentPayment && statusBadge(currentPayment)}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {currentPayment && !isLegacy(currentPayment) && !isCancelled(currentPayment) && (
                                <button onClick={() => setShowCancelModal(true)} style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: '1px solid #FCA5A5', borderRadius: '6px', background: '#FEF2F2', color: '#EF4444', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                                    <XCircle size={14} /> Cancel
                                </button>
                            )}
                            {currentPayment && isLegacy(currentPayment) && (
                                <span style={{ fontSize: '12px', color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', padding: '0 10px', display: 'flex', alignItems: 'center' }}>Historical record — modification unavailable</span>
                            )}
                        </div>
                    </div>

                    {/* Cancelled record info panel */}
                    {currentPayment && isCancelled(currentPayment) && (
                        <div style={{ margin: '16px 24px 0', padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '13px', color: '#991B1B' }}>
                            <strong>Payment Cancelled</strong>
                            {currentPayment.cancellation_reason && <div style={{ marginTop: '4px' }}>Reason: {currentPayment.cancellation_reason}</div>}
                            {currentPayment.cancelled_at && <div style={{ marginTop: '2px', fontSize: '11px', color: '#B91C1C' }}>Cancelled on: {new Date(currentPayment.cancelled_at).toLocaleString()}</div>}
                            {currentPayment.cancelled_by && <div style={{ marginTop: '2px', fontSize: '11px', color: '#B91C1C' }}>Cancelled by: {currentPayment.cancelled_by}</div>}
                        </div>
                    )}

                    <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                        <div dangerouslySetInnerHTML={{ __html: generateHTML(currentPayment) }} style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'center' }} />
                    </div>
                </div>
            </div>

            <div className="sticky-action-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 24px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', zIndex: 10, flexShrink: 0 }}>
                <div className="footer-left">
                    <button onClick={() => navigate('/payment')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
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
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Cancel Payment</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>This action is permanent and cannot be undone.</p>
                            </div>
                        </div>
                        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px', fontSize: '13px', color: '#334155' }}>
                            <div><strong>Document:</strong> Vendor Payment</div>
                            <div><strong>Number:</strong> {currentPayment?.pmtNo}</div>
                            <div><strong>Amount:</strong> ₹{parseFloat(getActualPaidAmount(currentPayment)).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                        </div>
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>Cancellation Reason <span style={{ color: '#EF4444' }}>*</span></label>
                            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} placeholder="Describe the reason for cancellation..." style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}>Close</button>
                            <button onClick={handleCancelSubmit} disabled={isCancelling} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: isCancelling ? '#94A3B8' : '#EF4444', color: 'white', fontWeight: 500, cursor: isCancelling ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                                {isCancelling ? 'Cancelling…' : 'Cancel Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
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

export default ViewPayment;
