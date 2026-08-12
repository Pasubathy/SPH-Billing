import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ArrowLeft, Search, Printer, Download, Edit3, X, AlertTriangle, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const ViewPurchaseReturnsInvoice = () => {
    const { id } = useParams();
    const [allSales, setAllSales] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [currentSale, setCurrentSale] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [accountData, setAccountData] = useState({});
    const [invoiceSettings, setInvoiceSettings] = useState({});
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
        const accStr = localStorage.getItem('myAccountData');
        if (accStr) {
            try { setAccountData(JSON.parse(accStr)); } catch (e) {}
        }
        
        const invStr = localStorage.getItem('invoiceSettings');
        if (invStr) {
            try { 
                setInvoiceSettings(JSON.parse(invStr)); 
            } catch (e) {}
        } else {
            setInvoiceSettings({
                invWidth: '3inch', invOptPhone: true, invOptGSTIN: false, invOptPAN: false, invOptLogo: false,
                invOptHSN: false, invOptTaxPct: false, invOptTaxAmt: false, invOptTotalAmt: false,
                invOptTaxBreakup: true, invOptTotalBreakup: true, invOptRound: true,
                invOptPaidAmt: true, invOptPendingAmt: true, note: 'This is a computer-generated invoice.'
            });
        }
    }, []);

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
                
                const sortedPRs = (prData || []).reverse();
                setAllSales(sortedPRs);
                
                if (id) {
                    const foundPR = sortedPRs.find(p => String(p.id) === String(id));
                    if (foundPR) setCurrentSale(foundPR);
                    else if (sortedPRs.length > 0) setCurrentSale(sortedPRs[0]);
                } else if (sortedPRs.length > 0) {
                    setCurrentSale(sortedPRs[0]);
                }
            } catch (err) {
                console.error('Error fetching data:', err);
            }
        };
        loadData();
    }, [id]);

    const filteredSales = [...allSales].filter(s => {
        const q = searchQuery.toLowerCase().trim();
        return (s.returnNo && s.returnNo.toLowerCase().includes(q)) ||
               (s.vendorName && s.vendorName.toLowerCase().includes(q));
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
            const res = await fetch(`/api/purchase-returns/${currentSale.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reason: cancelReason.trim() })
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Cancellation failed.', 'error');
                return;
            }
            showToast(`Purchase Return ${currentSale.returnNo} cancelled successfully.`);
            setShowCancelModal(false);
            setCancelReason('');

            // Refresh from backend
            const refreshRes = await fetch('/api/purchase-returns', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (refreshRes.ok) {
                const freshReturns = await refreshRes.json();
                const sorted = (freshReturns || []).reverse();
                setAllSales(sorted);
                const updated = sorted.find(r => String(r.id) === String(currentSale.id));
                if (updated) setCurrentSale(updated);
            }
        } catch (err) {
            showToast('Unable to complete the operation. Please try again.', 'error');
        } finally {
            setIsCancelling(false);
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
        return words + ' Rupees Only';
    };

    const generateHTML = (sale) => {
        if (!sale) return '';
        const cancelledBanner = isCancelled(sale) ? `<div style="background:#FEF2F2;border:2px solid #EF4444;border-radius:6px;padding:8px 16px;margin-bottom:12px;color:#EF4444;font-weight:bold;font-size:12px;text-align:center;">⚠ CANCELLED — ${sale.cancellation_reason || ''}</div>` : '';
        const accData = accountData || {};

        let addrParts = [];
        if (accData.address) addrParts.push(accData.address);
        if (accData.city) addrParts.push(accData.city);
        let addrLine1 = addrParts.length > 0 ? addrParts.join(', ') : '31/11, Pukkulam Road, Thiyagadurgam, Kallakurichi';
        
        let stateParts = [];
        if (accData.state) stateParts.push(accData.state);
        if (accData.country) stateParts.push(accData.country);
        let addrLine2 = stateParts.length > 0 ? (stateParts.join(', ') + (accData.pin ? ` - ${accData.pin}` : '')) : 'Tamil Nadu - 606 206';

        const vendor = (vendors || []).find(v => String(v.id) === String(sale.vendorId) || v.vendorName === sale.vendorName);
        let baseAddr = sale.vendorAddress || (vendor && (vendor.address || vendor.billAddress)) || '';
        let city = sale.vendorCity || (vendor && (vendor.city || vendor.billCity)) || '';
        let state = sale.vendorState || (vendor && (vendor.state || vendor.billState)) || '';
        let pin = sale.vendorPinCode || sale.vendorPincode || sale.vendorPin || sale.billPinCode || sale.pin || (vendor && (vendor.billPinCode || vendor.billPin || vendor.billPincode || vendor.pinCode || vendor.pincode || vendor.pin || vendor.zipCode || vendor.zip)) || '';
        
        let line1 = baseAddr || '';
        let line2Parts = [city, state].filter(Boolean);
        let line2 = line2Parts.join(', ') + (line2Parts.length > 0 && pin ? ` - ${pin}` : (pin ? pin : ''));
        
        let custAddrHTML = `<div>${line1}</div>${line2 ? `<div>${line2}</div>` : ''}`;
        
        let custGST = sale.vendorGst || (vendor && (vendor.gstin || vendor.gst)) || '-';
        let custPAN = vendor && vendor.panNumber ? vendor.panNumber : '-';

        const borderCol = '#606060';

        let itemsHTML = '';
        let sno = 1;
        let computedSubTotal = 0;
        let computedTaxAmt = 0;
        let sumQty = 0;
        let sumRate = 0;
        let sumAmount = 0;
        let sumDisc = 0;
        let sumFinalAmt = 0;
        let sumTax = 0;
        let sumTotalAmt = 0;

        const taxGroups = {};

        (sale.items || []).forEach(item => {
            const qty = parseFloat(item.qty) || 1;
            const rate = parseFloat(item.rate || item.price) || 0;
            const disc = parseFloat(item.disc || item.discount) || 0;
            const taxPct = parseFloat(item.taxPercent || item.tax) || 0;
            
            const amount = qty * rate;
            const finalAmt = amount - disc;
            const itemTaxAmt = finalAmt * (taxPct / 100);
            const totalAmt = finalAmt + itemTaxAmt;

            computedSubTotal += finalAmt;
            computedTaxAmt += itemTaxAmt;

            sumQty += qty;
            sumRate += rate;
            sumAmount += amount;
            sumDisc += disc;
            sumFinalAmt += finalAmt;
            sumTax += itemTaxAmt;
            sumTotalAmt += totalAmt;

            if (taxPct > 0) {
                if (!taxGroups[taxPct]) taxGroups[taxPct] = 0;
                taxGroups[taxPct] += itemTaxAmt;
            }

            itemsHTML += `
                <tr>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: center;">${sno++}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px;">${item.name || ''}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px;">${item.hsn || '-'}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: center;">${qty} ${item.unit || ''}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${rate.toFixed(2)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${amount.toFixed(2)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${disc.toFixed(2)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${finalAmt.toFixed(2)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: center;">${taxPct}%</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${itemTaxAmt.toFixed(2)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${totalAmt.toFixed(2)}</td>
                </tr>
            `;
        });

        const grandTotal = parseFloat(sale.totalAmount || sale.amount || sale.grandTotal) || 0;
        const received = parseFloat(sale.refundAmount || sale.paidAmount) || 0;
        const pending = Math.max(0, grandTotal - received);

        let computedDiscount = parseFloat(sale.discountAmount || sale.discount) || 0;
        const afterDiscount = computedSubTotal - computedDiscount;
        const computedTotalBeforeRound = afterDiscount + computedTaxAmt;
        const roundOff = grandTotal - computedTotalBeforeRound;

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

        let taxBreakupHTML = '';
        Object.keys(taxGroups).forEach(pct => {
            const val = taxGroups[pct];
            const halfPct = parseFloat(pct) / 2;
            const halfAmt = val / 2;
            taxBreakupHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 16px; border-bottom: 1px solid ${borderCol}; font-size: 11px;">
                    <div style="display: flex; gap: 40px; align-items: center;">
                        <div><span style="font-weight: bold;">CGST ${halfPct}%</span> &nbsp;&nbsp;&nbsp;&nbsp; ₹${halfAmt.toFixed(2)}</div>
                        <div><span style="font-weight: bold;">SGST ${halfPct}%</span> &nbsp;&nbsp;&nbsp;&nbsp; ₹${halfAmt.toFixed(2)}</div>
                        <div><span style="font-weight: bold;">IGST ${pct}%</span> &nbsp;&nbsp;&nbsp;&nbsp; -</div>
                    </div>
                    <span style="font-weight: bold;">₹${val.toFixed(2)}</span>
                </div>
            `;
        });

        return `
            <style>
                .pi-outer-box th, .pi-outer-box td {
                    font-size: inherit !important;
                }
            </style>
            ${cancelledBanner}
            <div class="pi-outer-box" style="width: 100%; max-width: 800px; margin: 0 auto; padding: 16px; background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box; font-family: 'Manrope', sans-serif; font-size: 11px; color: #000;">
                <div style="background-color: #fff; border: 1px solid ${borderCol}; border-radius: 6px; overflow: hidden;">
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid ${borderCol}; padding: 12px 16px;">
                        <div style="text-align: left;">
                            <div style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${accData.company || accData.companyName || 'SRI PARVATHI HARDWARES'}</div>
                            ${addrLine1 ? `<div style="font-size: 10px; color: #333; margin-top: 2px;">${addrLine1}</div>` : ''}
                            ${addrLine2 ? `<div style="font-size: 10px; color: #333;">${addrLine2}</div>` : ''}
                            ${accData.mobile || accData.phone ? `<div style="font-size: 10px; color: #333;">Ph No : <b>${accData.mobile || accData.phone}</b></div>` : ''}
                            ${accData.gstin ? `<div style="font-size: 10px; color: #333;">GSTIN No : <b>${accData.gstin}</b></div>` : ''}
                            ${accData.pan ? `<div style="font-size: 10px; color: #333;">PAN No : <b>${accData.pan}</b></div>` : ''}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; letter-spacing: 1px; color: #000;">PURCHASE RETURN</div>
                    </div>

                    <div style="border-bottom: 1px solid ${borderCol}; padding: 10px 16px; display: flex; justify-content: space-between; line-height: 1.6; font-size: 11px;">
                        <div style="text-align: left; flex: 1;">
                            <div style="display: flex;"><span style="font-weight: bold; width: 90px;">Return No.</span><span style="padding-right: 6px;">-</span><span>${sale.returnNo || sale.piNo || '-'}</span></div>
                            <div style="display: flex;"><span style="font-weight: bold; width: 90px;">Orig PI No.</span><span style="padding-right: 6px;">-</span><span>${sale.invoiceNo || sale.piNo || '-'}</span></div>
                        </div>
                        <div style="text-align: left; width: 180px; flex-shrink: 0;">
                            <div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: 95px; text-align: left;">Date</span><span style="padding-right: 6px;">-</span><span style="width: 75px; text-align: right;">${formatDate(sale.date)}</span></div>
                        </div>
                    </div>

                    <!-- Billing & Shipping Address Box -->
                    <div style="padding: 10px 16px; display: flex; justify-content: space-between; align-items: flex-start; line-height: 1.5; font-size: 11px;">
                        <div style="text-align: left;">
                            <div style="font-weight: bold; margin-bottom: 2px;">Billing Address :</div>
                            <div style="font-weight: bold;">${sale.vendorName || '-'}</div>
                            ${custAddrHTML}
                            <div>GSTIN No. &nbsp;- &nbsp;${custGST}</div>
                            <div>PAN No. &nbsp;&nbsp;&nbsp;&nbsp;- &nbsp;${custPAN}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: bold; margin-bottom: 2px;">Shipping Address :</div>
                            <div style="font-weight: bold;">${sale.vendorName || '-'}</div>
                            ${custAddrHTML}
                            <div>GSTIN No. &nbsp;- &nbsp;${custGST}</div>
                            <div>PAN No. &nbsp;&nbsp;&nbsp;&nbsp;- &nbsp;${custPAN}</div>
                        </div>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; border-bottom: 1px solid ${borderCol}; font-size: 10.5px; text-align: left;">
                        <thead>
                            <tr style="background-color: #f8fafc; border-top: 1px solid ${borderCol}; border-bottom: 1px solid ${borderCol};">
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 35px; text-align: center;">S No</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px;">Item Name</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 75px;">HSN</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 65px; text-align: center;">Qty /Unit</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 60px; text-align: right;">Rate</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 65px; text-align: right;">Amount</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 60px; text-align: right;">Discount</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 65px; text-align: right;">Final Amt</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 50px; text-align: center;">Tax %</th>
                                <th style="border-right: 1px solid ${borderCol}; padding: 6px 8px; width: 60px; text-align: right;">Tax Amt</th>
                                <th style="padding: 6px 8px; width: 70px; text-align: right;">Total Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                            <tr style="background-color: #f8fafc; font-weight: bold; border-top: 1px solid ${borderCol};">
                                <td colspan="5" style="border-right: 1px solid ${borderCol}; padding: 6px 8px;">Total</td>
                                <td style="border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${sumAmount.toFixed(2)}</td>
                                <td style="border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${sumDisc.toFixed(2)}</td>
                                <td style="border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${sumFinalAmt.toFixed(2)}</td>
                                <td style="border-right: 1px solid ${borderCol}; padding: 6px 8px;"></td>
                                <td style="border-right: 1px solid ${borderCol}; padding: 6px 8px; text-align: right;">₹${sumTax.toFixed(2)}</td>
                                <td style="padding: 6px 8px; text-align: right;">₹${sumTotalAmt.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Price Breakup Table UI -->
                    <div style="border-bottom: 1px solid ${borderCol};">
                        <div style="display: flex; justify-content: space-between; padding: 5px 16px; border-bottom: 1px solid ${borderCol}; font-size: 11px;">
                            <span style="font-weight: bold;">Sub Total</span>
                            <span style="font-weight: bold;">₹${computedSubTotal.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 5px 16px; border-bottom: 1px solid ${borderCol}; font-size: 11px;">
                            <span style="font-weight: bold;">Discount</span>
                            <span>₹${computedDiscount.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 5px 16px; border-bottom: 1px solid ${borderCol}; font-size: 11px;">
                            <span style="font-weight: bold;">After Discount</span>
                            <span style="font-weight: bold;">₹${afterDiscount.toFixed(2)}</span>
                        </div>
                        ${taxBreakupHTML}
                        <div style="display: flex; justify-content: space-between; padding: 5px 16px; font-size: 11px;">
                            <span style="font-weight: bold;">Round Off</span>
                            <span>${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</span>
                        </div>
                    </div>

                    <!-- Grand Total Bar -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: 6px 16px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold;">
                        <span>Grand Total</span>
                        <span>₹${grandTotal.toFixed(2)}</span>
                    </div>

                    <!-- Amount In Words & Balances Box -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: 10px 16px; display: flex; justify-content: space-between; align-items: flex-start; line-height: 1.6; font-size: 11px;">
                        <div style="text-align: left; flex: 1; padding-right: 16px;">
                            <div style="font-weight: bold;">Amount In Words</div>
                            <div style="margin-top: 2px;">${numberToWords(grandTotal)}</div>
                        </div>
                        <div style="width: 220px; text-align: left; border-left: 1px solid ${borderCol}; padding-left: 16px; flex-shrink: 0;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Previous Balance :</span>
                                <span style="font-weight: bold;">₹${(vendor && vendor.openingBalance ? parseFloat(vendor.openingBalance) : 0).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                                <span>Current Balance :</span>
                                <span style="font-weight: bold;">₹${pending.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Note Section -->
                    <div style="padding: 10px 16px; text-align: left; font-size: 11px;">
                        <div style="font-weight: bold; margin-bottom: 4px;">Note</div>
                        <div style="border: 1px solid ${borderCol}; border-radius: 6px; padding: 8px 12px; min-height: 36px; color: #000; white-space: pre-wrap;">${sale.note || ''}</div>
                    </div>

                </div>
            </div>
        `;
    };

    const handlePrint = () => {
        if (!currentSale || !iframeRef.current) return;
        const printContent = generateHTML(currentSale);

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Print Purchase Return</title>
                    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                    <style>
                        body { margin: 0; padding: 10px; font-family: 'Manrope', sans-serif; background: white; display: flex; justify-content: center; }
                        @media print { 
                            @page { margin: 4mm auto; size: A4 portrait; } 
                            body { padding: 0; margin: 0; display: flex; justify-content: center; background: white; } 
                            .pi-outer-box { box-shadow: none !important; padding: 12px !important; width: 100% !important; max-width: 100% !important; }
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
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <iframe ref={iframeRef} style={{ display: 'none' }} title="Print Frame" />
            
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Sidebar */}
                <div style={{ width: '280px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', background: 'white', flexShrink: 0 }}>
                    {/* Search */}
                    <div style={{ height: '50px', alignItems: 'center', padding: '0px 16px 0 16px', borderBottom: '1px solid #FCA5A5', display: 'flex', gap: '8px' }}>
                        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', height: '30px', flex: 1, overflow: 'hidden', alignItems: 'center', padding: '0 8px' }}>
                            <Search size={16} color="var(--text-muted)" style={{ marginRight: '6px' }} />
                            <input 
                                type="text" 
                                placeholder="Search INV No / Name" 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', height: '25px' }}
                            />
                        </div>
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <X size={18} color="var(--text-muted)" />
                            </button>
                        )}
                    </div>
                    {/* List Items */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filteredSales.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>No returns found</div>
                        ) : (
                            filteredSales.map(s => {
                                const total = parseFloat(s.totalAmount || s.grandTotal) || 0;
                                const received = parseFloat(s.paidAmount || s.receivedAmount) || 0;
                                const pending = Math.max(0, total - received);
                                const isSelected = currentSale && s.returnNo === currentSale.returnNo;
                                const cancelled = isCancelled(s);
                                
                                return (
                                    <div 
                                        key={s.returnNo} 
                                        onClick={() => setCurrentSale(s)} 
                                        style={{ 
                                            padding: '12px 16px', 
                                            borderBottom: '1px solid #F1F5F9', 
                                            cursor: 'pointer', 
                                            background: isSelected ? '#EEF2FF' : 'transparent', 
                                            borderLeft: isSelected ? '4px solid #000B58' : '4px solid transparent',
                                            opacity: cancelled ? 0.7 : 1
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                                            <div style={{ fontWeight: '600', fontSize: '13px', color: isSelected ? '#000B58' : '#1E293B' }}>{s.returnNo}</div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>₹{total.toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.vendorName || 'Walk In Vendor'}</div>
                                            {cancelled ? (
                                                <div style={{ color: '#EF4444', fontSize: '10px', fontWeight: 600 }}>CANCELLED</div>
                                            ) : pending > 0 ? (
                                                <div style={{ color: '#EF4444', fontSize: '10px', fontWeight: 600 }}>Pending</div>
                                            ) : (
                                                <div style={{ color: '#22C55E', fontSize: '10px', fontWeight: 600 }}>Paid</div>
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
                    <div style={{ height: '50px', background: 'white', borderBottom: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => navigate('/purchase-return')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', background: 'white', cursor: 'pointer' }}>
                                <ChevronLeft size={16} />
                            </button>
                            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>{currentSale?.returnNo}</h2>
                            {currentSale && statusBadge(currentSale)}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {currentSale && !isLegacy(currentSale) && !isCancelled(currentSale) && (
                                <button onClick={() => setShowCancelModal(true)} style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: '1px solid #FCA5A5', borderRadius: '6px', background: '#FEF2F2', color: '#EF4444', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                                    <XCircle size={14} /> Cancel
                                </button>
                            )}
                            {currentSale && isLegacy(currentSale) && (
                                <span style={{ fontSize: '12px', color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', padding: '0 10px', display: 'flex', alignItems: 'center' }}>Historical record — modification unavailable</span>
                            )}
                        </div>
                    </div>

                    {/* Cancelled record info panel */}
                    {currentSale && isCancelled(currentSale) && (
                        <div style={{ margin: '16px 24px 0', padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '13px', color: '#991B1B' }}>
                            <strong>Document Cancelled</strong>
                            {currentSale.cancellation_reason && <div style={{ marginTop: '4px' }}>Reason: {currentSale.cancellation_reason}</div>}
                            {currentSale.cancelled_at && <div style={{ marginTop: '2px', fontSize: '11px', color: '#B91C1C' }}>Cancelled on: {new Date(currentSale.cancelled_at).toLocaleString()}</div>}
                            {currentSale.cancelled_by && <div style={{ marginTop: '2px', fontSize: '11px', color: '#B91C1C' }}>Cancelled by: {currentSale.cancelled_by}</div>}
                        </div>
                    )}

                    {/* Preview Area */}
                    <div style={{ padding: '16px', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                        <div 
                            dangerouslySetInnerHTML={{ __html: generateHTML(currentSale) }} 
                            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
                        />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="sticky-action-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', zIndex: 10, flexShrink: 0 }}>
                <div className="footer-left">
                    <button onClick={() => navigate('/purchase-return')} style={{ height: '35px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
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
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Cancel Purchase Return</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>This action is permanent and cannot be undone.</p>
                            </div>
                        </div>
                        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px', fontSize: '13px', color: '#334155' }}>
                            <div><strong>Document:</strong> Purchase Return</div>
                            <div><strong>Number:</strong> {currentSale?.returnNo}</div>
                            <div><strong>Status:</strong> {currentSale?.status || 'ACTIVE'}</div>
                        </div>
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>Cancellation Reason <span style={{ color: '#EF4444' }}>*</span></label>
                            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} placeholder="Describe the reason for cancellation..." style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}>Close</button>
                            <button onClick={handleCancelSubmit} disabled={isCancelling} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: isCancelling ? '#94A3B8' : '#EF4444', color: 'white', fontWeight: 500, cursor: isCancelling ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                                {isCancelling ? 'Cancelling…' : 'Cancel Document'}
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

export default ViewPurchaseReturnsInvoice;
