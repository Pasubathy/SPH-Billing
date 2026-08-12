import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ArrowLeft, Search, Printer, Download, Edit3, X, AlertTriangle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ViewSalesReturnsInvoice = ({ initialSale, allSales: propAllSales, customers, onBack, onRefresh }) => {
    const [currentSale, setCurrentSale] = useState(initialSale);
    const [allSales, setAllSales] = useState(propAllSales || []);
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

    const [allCustomers, setAllCustomers] = useState(customers || []);

    useEffect(() => {
        setAllSales(propAllSales || []);
    }, [propAllSales]);

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
        
        const invStr = localStorage.getItem('invoiceSettings');
        if (invStr) {
            try { 
                setInvoiceSettings(JSON.parse(invStr)); 
            } catch (e) {}
        } else {
            setInvoiceSettings({
                invWidth: '3inch', invOptPhone: true, invOptGSTIN: false, invOptPAN: false, invOptLogo: false,
                invOptHSN: false, invOptTaxPct: false, invOptTaxAmt: false, invOptTotalAmt: false,
                invOptTaxBreakup: true, invOptTotalBreakup: true, invOptRound: true, invOptCreditBalance: true,
                invOptPaidAmt: true, invOptPendingAmt: true, note: 'This is a computer-generated invoice.'
            });
        }
    }, []);

    const filteredSales = [...allSales].filter(s => {
        const q = searchQuery.toLowerCase().trim();
        return (s.returnNo && s.returnNo.toLowerCase().includes(q)) ||
               (s.customerName && s.customerName.toLowerCase().includes(q));
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
            const res = await fetch(`/api/sales-returns/${currentSale.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reason: cancelReason.trim() })
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Cancellation failed.', 'error');
                return;
            }
            showToast(`Sales Return ${currentSale.returnNo} cancelled successfully.`);
            setShowCancelModal(false);
            setCancelReason('');

            // Refresh from backend
            const refreshRes = await fetch('/api/sales-returns', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (refreshRes.ok) {
                const freshReturns = await refreshRes.json();
                const sorted = (freshReturns || []).reverse();
                setAllSales(sorted);
                const updated = sorted.find(r => String(r.id) === String(currentSale.id));
                if (updated) setCurrentSale(updated);
            }
            if (onRefresh) onRefresh();
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
        
        const numString = num.toString();
        if (num === 0) return 'Zero';
        
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

        const invWidth = invoiceSettings.width || invoiceSettings.invWidth || '3inch';
        const is4 = invWidth === '4inch';
        const is2 = invWidth === '2inch';

        const maxWidth = is4 ? '600px' : is2 ? '280px' : '420px';
        const pSpace = is4 ? '12px 16px' : is2 ? '3px 6px' : '8px 12px';
        const tSpace = is4 ? '6px 8px' : is2 ? '2px 2px' : '3px 4px';
        const rowHeight = is4 ? '24px' : is2 ? '14px' : '20px';
        const rowPadding = is4 ? '0 16px' : is2 ? '0 6px' : '0 12px';

        const fCustomer = is4 ? '11px' : is2 ? '6px' : '7px';
        const fTable = is4 ? '10px' : is2 ? '6px' : '7px';
        const fCompany = is4 ? '14px' : is2 ? '9px' : '11px';
        const fSubText = is4 ? '10px' : is2 ? '7px' : '8px';
        const borderCol = '#606060';

        let addrParts = [];
        if (accountData.address) addrParts.push(accountData.address);
        if (accountData.city) addrParts.push(accountData.city);
        let addrLine1 = addrParts.length > 0 ? addrParts.join(', ') : '31/11, Pukkulam Road, Thiyagadurgam, Kallakurichi';
        
        let stateParts = [];
        if (accountData.state) stateParts.push(accountData.state);
        if (accountData.country) stateParts.push(accountData.country);
        let addrLine2 = stateParts.length > 0 ? (stateParts.join(', ') + (accountData.pin ? ` - ${accountData.pin}` : '')) : 'Tamil Nadu - 606 206';

        let itemsHTML = '';
        let sno = 1;
        let computedSubTotal = 0;
        let computedTaxAmt = 0;
        let sumQty = 0;
        let sumRate = 0;
        let sumFinalAmt = 0;
        let sumTaxAmt = 0;
        let sumTotalAmt = 0;

        const taxGroups = {};

        (sale.items || []).forEach(item => {
            const qty = parseFloat(item.qty) || 1;
            const rate = parseFloat(item.rate || item.price) || 0;
            const disc = parseFloat(item.disc || item.discount) || 0;
            const finalAmt = item.finalAmt || item.amount || (qty * rate - disc);
            const taxAmt = parseFloat(item.taxAmount || item.taxAmt) || 0;
            const totalAmt = item.totalAmt || (finalAmt + taxAmt);
            const taxPercent = parseFloat(item.taxPercent || item.tax || 0);

            computedSubTotal += finalAmt;
            computedTaxAmt += taxAmt;

            sumQty += qty;
            sumRate += rate;
            sumFinalAmt += finalAmt;
            sumTaxAmt += taxAmt;
            sumTotalAmt += totalAmt;

            if (taxPercent > 0) {
                if (!taxGroups[taxPercent]) {
                    taxGroups[taxPercent] = { cgstPct: taxPercent / 2, sgstPct: taxPercent / 2, igstPct: taxPercent, taxAmt: 0 };
                }
                taxGroups[taxPercent].taxAmt += taxAmt;
            }

            itemsHTML += `
                <tr>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: center; white-space: nowrap;">${sno++}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; word-break: break-word;">${item.name || ''}</td>
                    ${invoiceSettings.invOptHSN ? `<td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; white-space: nowrap;">${item.hsn || '-'}</td>` : ''}
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: center; white-space: nowrap;">${qty} ${item.unit || ''}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: right; white-space: nowrap;">₹${rate.toFixed(2)}</td>
                    <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: right; white-space: nowrap;">₹${(qty * rate).toFixed(2)}</td>
                    ${invoiceSettings.invOptTaxPct ? `<td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: center; white-space: nowrap;">${taxPercent}%</td>` : ''}
                    ${invoiceSettings.invOptTaxAmt ? `<td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: right; white-space: nowrap;">₹${taxAmt.toFixed(2)}</td>` : ''}
                    ${invoiceSettings.invOptTotalAmt ? `<td style="border-bottom: 1px solid ${borderCol}; padding: ${tSpace}; text-align: right; white-space: nowrap;">₹${totalAmt.toFixed(2)}</td>` : ''}
                </tr>
            `;
        });

        const grandTotal = parseFloat(sale.totalAmount || sale.grandTotal) || 0;
        const received = parseFloat(sale.paidAmount || sale.receivedAmount) || 0;
        const pending = Math.max(0, grandTotal - received);

        const rawTotal = computedSubTotal + computedTaxAmt;
        let computedDiscount = parseFloat(sale.discount) || 0;
        let computedTotalBeforeRound = rawTotal - computedDiscount;
        let roundOff = grandTotal - computedTotalBeforeRound;
        const afterDiscount = computedSubTotal - computedDiscount;

        const customer = (allCustomers || []).find(c => 
            (sale.customerId && String(c.id) === String(sale.customerId)) || 
            (c.name && sale.customerName && c.name.toLowerCase() === sale.customerName.toLowerCase()) ||
            (c.customerName && sale.customerName && c.customerName.toLowerCase() === sale.customerName.toLowerCase())
        );

        let baseAddr = sale.customerAddress || sale.address || (customer && (customer.address || customer.billingAddress || customer.billAddress)) || '';
        let city = sale.customerCity || sale.city || (customer && (customer.city || customer.billCity)) || '';
        let state = sale.customerState || sale.state || (customer && (customer.state || customer.billState)) || '';
        let pin = sale.customerPinCode || sale.customerPincode || sale.customerPin || sale.billPinCode || sale.pinCode || sale.pincode || sale.pin || (customer && (customer.billPinCode || customer.billPin || customer.billPincode || customer.pinCode || customer.pincode || customer.pin || customer.zipCode || customer.zip)) || '';
        
        let custAddrLine1 = baseAddr || '';
        let cityState = [city, state].filter(Boolean).join(', ');
        let custAddrLine2 = cityState + (cityState && pin ? ` - ${pin}` : (pin ? pin : ''));
        
        let finalCustAddr = custAddrLine1;
        if (custAddrLine2 && custAddrLine2 !== custAddrLine1) {
            finalCustAddr += (finalCustAddr ? ' <br /> ' : '') + custAddrLine2;
        }
        
        let custAddr = finalCustAddr || '-';
        let custMobile = sale.customerMobile || sale.mobile || (customer && (customer.mobile || customer.phone)) || '-';

        const formatDate = (d) => {
            if (!d) return '';
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

        // Render Tax Groups
        let taxBreakupHTML = '';
        Object.keys(taxGroups).forEach(pct => {
            const g = taxGroups[pct];
            const cgstAmt = g.taxAmt / 2;
            const sgstAmt = g.taxAmt / 2;
            taxBreakupHTML += `
                <div style="display: flex; border-bottom: 1px solid ${borderCol}; align-items: center; justify-content: space-between; font-size: ${is4 ? '10px' : is2 ? '5.5px' : '8px'}; font-weight: bold; padding: 0; height: ${rowHeight};">
                    <div style="display: flex; flex: 1; justify-content: space-between; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; border-right: 1px solid ${borderCol};">
                        <span>CGST ${g.cgstPct}%</span>
                        <span>₹${cgstAmt.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; flex: 1; justify-content: space-between; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; border-right: 1px solid ${borderCol};">
                        <span>SGST ${g.sgstPct}%</span>
                        <span>₹${sgstAmt.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; flex: 1; justify-content: space-between; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; border-right: 1px solid ${borderCol};">
                        <span>IGST ${g.igstPct}%</span>
                        <span>-</span>
                    </div>
                    <div style="padding: ${rowPadding}; flex: 0.5; text-align: right; height: ${rowHeight}; display: flex; align-items: center; justify-content: flex-end;">
                        <span>₹${g.taxAmt.toFixed(2)}</span>
                    </div>
                </div>
            `;
        });

        if (!taxBreakupHTML && invoiceSettings.invOptTaxBreakup) {
            taxBreakupHTML = `
                <div style="display: flex; border-bottom: 1px solid ${borderCol}; align-items: center; justify-content: space-between; font-size: ${is4 ? '10px' : is2 ? '5.5px' : '8px'}; font-weight: bold; padding: 0; height: ${rowHeight};">
                    <div style="display: flex; flex: 1; justify-content: space-between; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; border-right: 1px solid ${borderCol};">
                        <span>CGST 0%</span>
                        <span>₹0.00</span>
                    </div>
                    <div style="display: flex; flex: 1; justify-content: space-between; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; border-right: 1px solid ${borderCol};">
                        <span>SGST 0%</span>
                        <span>₹0.00</span>
                    </div>
                    <div style="display: flex; flex: 1; justify-content: space-between; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; border-right: 1px solid ${borderCol};">
                        <span>IGST 0%</span>
                        <span>-</span>
                    </div>
                    <div style="padding: ${rowPadding}; flex: 0.5; text-align: right; height: ${rowHeight}; display: flex; align-items: center; justify-content: flex-end;">
                        <span>₹0.00</span>
                    </div>
                </div>
            `;
        }

        const totalColSpan = invoiceSettings.invOptHSN ? 5 : 4;

        return `
            <style>
                .invoice-print-wrapper th, .invoice-print-wrapper td {
                    font-size: inherit !important;
                }
            </style>
            ${cancelledBanner}
            <div class="invoice-outer-box" style="width: 100%; max-width: ${maxWidth}; margin: 0 auto; padding: 16px; background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box; font-family: 'Manrope', sans-serif; font-size: ${is4 ? '14px' : is2 ? '10px' : '12px'}; color: #000;">
                <div style="background-color: #fff; padding: 0; border-radius: 4px;">
                    <div class="invoice-print-wrapper" style="border: 1px solid ${borderCol}; border-radius: 4px; overflow: hidden;">
                        
                        <!-- Header Section -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid ${borderCol}; padding: ${pSpace};">
                            <div style="display: flex; gap: 12px; align-items: center;">
                            ${invoiceSettings.invOptLogo ? (
                                accountData.logo ? `<img src="${accountData.logo}" style="width: ${is4 ? '50px' : is2 ? '30px' : '40px'}; height: ${is4 ? '50px' : is2 ? '30px' : '40px'}; object-fit: contain;">` : `
                                <div style="width: ${is4 ? '40px' : is2 ? '24px' : '32px'}; height: ${is4 ? '40px' : is2 ? '24px' : '32px'}; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center; border-radius: 6px;">
                                    <span style="font-weight: bold; font-size: ${is4 ? '14px' : is2 ? '9px' : '11px'}; color: #64748b;">SPH</span>
                                </div>
                                `
                            ) : ''}
                            <div style="text-align: left;">
                                <div style="font-size: ${fCompany}; font-weight: bold; text-transform: uppercase;">${accountData.company || 'SRI PARVATHI HARDWARES'}</div>
                                <div style="font-size: ${fSubText}; color: #555; margin-top: 2px;">${addrLine1}</div>
                                <div style="font-size: ${fSubText}; color: #555;">${addrLine2}</div>
                                ${invoiceSettings.invOptPhone ? `<div style="font-size: ${fSubText}; color: #555;">Ph No : <b>${accountData.mobile || '9994121042'}</b></div>` : ''}
                                ${(invoiceSettings.invOptGSTIN || invoiceSettings.invOptPAN) ? `
                                    <div style="font-size: ${fSubText}; color: #555; margin-top: 2px;">
                                        ${invoiceSettings.invOptGSTIN ? `<span>GSTIN No : <b>${accountData.gstin || ''}</b></span>` : ''}
                                        ${invoiceSettings.invOptGSTIN && invoiceSettings.invOptPAN ? ` | ` : ''}
                                        ${invoiceSettings.invOptPAN ? `<span>PAN No : <b>${accountData.pan || ''}</b></span>` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div style="font-size: ${is4 ? '18px' : is2 ? '11px' : '14px'}; font-weight: bold; letter-spacing: 1px; color: #000; padding-top: 5px;">SALES RETURN</div>
                    </div>

                    <!-- Customer & Return Info Box -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: ${pSpace}; display: flex; justify-content: space-between; line-height: ${is2 ? '1.3' : '1.6'}; font-size: ${fCustomer};">
                        <div style="text-align: left; flex: 1;">
                            <div style="display: flex;"><span style="font-weight: bold; width: ${is4 ? '100px' : is2 ? '55px' : '85px'};">Customer Name</span><span style="padding-right: 4px;">-</span><span>${sale.customerName || 'Walk In Customer'}</span></div>
                            <div style="display: flex;"><span style="font-weight: bold; width: ${is4 ? '100px' : is2 ? '55px' : '85px'};">Mobile No.</span><span style="padding-right: 4px;">-</span><span>${custMobile}</span></div>
                            <div style="display: flex;"><span style="font-weight: bold; width: ${is4 ? '100px' : is2 ? '55px' : '85px'};">Address</span><span style="padding-right: 4px;">-</span><span style="flex: 1;">${custAddr}</span></div>
                        </div>
                        <div style="text-align: left; width: ${is4 ? '190px' : is2 ? '95px' : '150px'}; flex-shrink: 0;">
                            <div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: ${is4 ? '75px' : is2 ? '42px' : '60px'}; text-align: left;">Return No.</span><span style="padding-right: 4px;">-</span><span style="width: ${is4 ? '80px' : is2 ? '42px' : '65px'}; text-align: right; font-weight: bold;">${sale.returnNo || ''}</span></div>
                            ${sale.invoiceNo ? `<div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: ${is4 ? '75px' : is2 ? '42px' : '60px'}; text-align: left;">Orig Inv No.</span><span style="padding-right: 4px;">-</span><span style="width: ${is4 ? '80px' : is2 ? '42px' : '65px'}; text-align: right;">${sale.invoiceNo}</span></div>` : ''}
                            <div style="display: flex; justify-content: flex-end;"><span style="font-weight: bold; width: ${is4 ? '75px' : is2 ? '42px' : '60px'}; text-align: left;">Date</span><span style="padding-right: 4px;">-</span><span style="width: ${is4 ? '80px' : is2 ? '42px' : '65px'}; text-align: right;">${formatDate(sale.date)}</span></div>
                        </div>
                    </div>

                    <!-- Items Table -->
                    <table style="width: 100%; border-collapse: collapse; border-bottom: 1px solid ${borderCol}; font-size: ${fTable}; text-align: left;">
                        <thead>
                            <tr style="background-color: #f8fafc;">
                                <th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '40px' : is2 ? '18px' : '22px'}; text-align: center; white-space: nowrap;">S No</th>
                                <th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; min-width: ${is4 ? '120px' : is2 ? '50px' : '80px'};">Item Name</th>
                                ${invoiceSettings.invOptHSN ? `<th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '60px' : is2 ? '28px' : '34px'}; white-space: nowrap;">HSN</th>` : ''}
                                <th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '60px' : is2 ? '30px' : '38px'}; text-align: center; white-space: nowrap;">Qty /Unit</th>
                                <th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '60px' : is2 ? '30px' : '38px'}; text-align: right; white-space: nowrap;">Rate</th>
                                <th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '70px' : is2 ? '34px' : '42px'}; text-align: right; white-space: nowrap;">Amount</th>
                                ${invoiceSettings.invOptTaxPct ? `<th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '45px' : is2 ? '22px' : '28px'}; text-align: center; white-space: nowrap;">Tax %</th>` : ''}
                                ${invoiceSettings.invOptTaxAmt ? `<th style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '60px' : is2 ? '30px' : '38px'}; text-align: right; white-space: nowrap;">Tax Amt</th>` : ''}
                                ${invoiceSettings.invOptTotalAmt ? `<th style="border-bottom: 1px solid ${borderCol}; padding: ${tSpace}; width: ${is4 ? '75px' : is2 ? '36px' : '45px'}; text-align: right; white-space: nowrap;">Total Amt</th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                            <!-- Totals Row -->
                            <tr style="font-weight: bold; background-color: #f8fafc;">
                                <td colspan="${totalColSpan}" style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: left;">Total</td>
                                <td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: right; white-space: nowrap;">₹${sumFinalAmt.toFixed(2)}</td>
                                ${invoiceSettings.invOptTaxPct ? `<td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: center;"></td>` : ''}
                                ${invoiceSettings.invOptTaxAmt ? `<td style="border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: ${tSpace}; text-align: right; white-space: nowrap;">₹${sumTaxAmt.toFixed(2)}</td>` : ''}
                                ${invoiceSettings.invOptTotalAmt ? `<td style="border-bottom: 1px solid ${borderCol}; padding: ${tSpace}; text-align: right; white-space: nowrap;">₹${sumTotalAmt.toFixed(2)}</td>` : ''}
                            </tr>
                        </tbody>
                    </table>

                    <!-- Price Breakup Box -->
                    <div style="display: flex; flex-direction: column; font-size: ${fTable};">
                        
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid ${borderCol}; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; font-weight: bold;">
                            <span>Sub Total</span>
                            <span>₹${computedSubTotal.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid ${borderCol}; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; font-weight: bold;">
                            <span>Discount</span>
                            <span>₹${computedDiscount.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid ${borderCol}; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; font-weight: bold;">
                            <span>After Discount</span>
                            <span>₹${afterDiscount.toFixed(2)}</span>
                        </div>
                        
                        <!-- Tax groups container -->
                        ${invoiceSettings.invOptTaxBreakup ? taxBreakupHTML : ''}

                        ${invoiceSettings.invOptRound ? `
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid ${borderCol}; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; font-weight: bold;">
                            <span>Round Off</span>
                            <span>₹${roundOff.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        ${invoiceSettings.invOptTotalBreakup ? `
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid ${borderCol}; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; font-weight: bold;">
                            <span>Total</span>
                            <span>₹${grandTotal.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        ${invoiceSettings.invOptCreditBalance ? `
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid ${borderCol}; padding: ${rowPadding}; height: ${rowHeight}; align-items: center; font-weight: bold;">
                            <span>Credit Balance</span>
                            <span>₹${(parseFloat(sale.creditBalance) || 0).toFixed(2)}</span>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Grand Total Bar -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: ${is4 ? '12px 16px' : is2 ? '6px 8px' : '8px 12px'}; color: #000; font-size: ${is4 ? '13px' : is2 ? '9px' : '11px'}; font-weight: bold; display: flex; justify-content: space-between; text-transform: uppercase;">
                        <span>Grand Total</span>
                        <span>₹${grandTotal.toFixed(2)}</span>
                    </div>

                    <!-- Amount In Words & Paid/Balance Box -->
                    <div style="border-bottom: 1px solid ${borderCol}; padding: ${pSpace}; display: flex; justify-content: space-between; align-items: flex-start; line-height: ${is2 ? '1.3' : '1.6'}; font-size: ${is4 ? '11px' : is2 ? '6.5px' : '9.5px'};">
                        <div style="text-align: left; flex: 1; padding-right: ${is2 ? '6px' : '16px'};">
                            <div style="font-weight: bold;">Amount In Words</div>
                            <div style="margin-top: 2px;">${numberToWords(grandTotal)}</div>
                        </div>
                        ${(invoiceSettings.invOptPaidAmt || invoiceSettings.invOptPendingAmt) ? `
                        <div style="width: ${is4 ? '200px' : is2 ? '95px' : '150px'}; text-align: left; border-left: 1px solid ${borderCol}; padding-left: ${is2 ? '6px' : '16px'}; flex-shrink: 0;">
                            ${invoiceSettings.invOptPaidAmt ? `
                            <div style="display: flex; justify-content: space-between;">
                                <span>Paid Amount :</span>
                                <span style="font-weight: bold;">₹${received.toFixed(2)}</span>
                            </div>
                            ` : ''}
                            ${invoiceSettings.invOptPendingAmt ? `
                            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                                <span>Store Credit :</span>
                                <span style="font-weight: bold;">₹${pending.toFixed(2)}</span>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                    </div>

                    <!-- Footer Message Box -->
                    <div style="padding: ${is4 ? '12px' : is2 ? '6px' : '8px'}; text-align: center; font-weight: bold; font-size: ${is4 ? '11px' : is2 ? '7.5px' : '9px'}; text-transform: uppercase; letter-spacing: 0.5px;">
                        THANK YOU PURCHASE !!!!
                    </div>
                </div>
              </div>
            </div>
        `;
    };

    const handlePrint = () => {
        if (!currentSale || !iframeRef.current) return;
        const printContent = generateHTML(currentSale);
        
        const invWidth = invoiceSettings.width || invoiceSettings.invWidth || '3inch';
        const printWidthMM = invWidth === '4inch' ? '100mm' : invWidth === '2inch' ? '58mm' : '80mm';
        const printPadding = invWidth === '2inch' ? '6px' : '12px';
        let paperSize = `${printWidthMM} auto`;

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Print Sales Return</title>
                    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                    <style>
                        body { margin: 0; padding: 10px; font-family: 'Manrope', sans-serif; background: white; display: flex; justify-content: center; }
                        @media print { 
                            @page { margin: 4mm auto; size: ${paperSize}; } 
                            body { padding: 0; margin: 0; display: flex; justify-content: center; background: white; } 
                            .invoice-outer-box { box-shadow: none !important; padding: ${printPadding} !important; width: 100% !important; max-width: 100% !important; }
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
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No returns found</div>
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
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.customerName || 'Walk In Customer'}</div>
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
                            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', background: 'white', cursor: 'pointer' }}>
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
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Cancel Sales Return</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>This action is permanent and cannot be undone.</p>
                            </div>
                        </div>
                        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px', fontSize: '13px', color: '#334155' }}>
                            <div><strong>Document:</strong> Sales Return</div>
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

export default ViewSalesReturnsInvoice;
