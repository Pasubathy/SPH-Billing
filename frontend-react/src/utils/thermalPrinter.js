import { numberToWords } from './numberToWords.js';

/**
 * Maps configured thermal printer paper width to physical print dimensions and CSS spacing.
 * Supports:
 *  - '2inch' => 58mm
 *  - '3inch' => 80mm
 *  - '4inch' => 100mm
 */
export function getThermalDimensions(invWidth) {
    const is4 = invWidth === '4inch';
    const is2 = invWidth === '2inch';

    return {
        is4,
        is2,
        paperWidthMM: is4 ? '100mm' : is2 ? '58mm' : '80mm',
        maxWidthPx: is4 ? '600px' : is2 ? '280px' : '420px',
        pSpace: is4 ? '12px 16px' : is2 ? '3px 6px' : '8px 12px',
        tSpace: is4 ? '6px 8px' : is2 ? '2px 2px' : '3px 4px',
        rowHeight: is4 ? '24px' : is2 ? '14px' : '20px',
        rowPadding: is4 ? '0 16px' : is2 ? '0 6px' : '0 12px',
        fCustomer: is4 ? '11px' : is2 ? '6px' : '7px',
        fTable: is4 ? '10px' : is2 ? '6px' : '7px',
        fCompany: is4 ? '14px' : is2 ? '9px' : '11px',
        fSubText: is4 ? '10px' : is2 ? '7px' : '8px',
        fHeaderTitle: is4 ? '20px' : is2 ? '12px' : '16px',
        fGrandTotal: is4 ? '13px' : is2 ? '9px' : '11px',
        fFooter: is4 ? '11px' : is2 ? '7.5px' : '9px',
        printPadding: is2 ? '4px' : is4 ? '12px' : '8px'
    };
}

/**
 * Gracefully formats various date representations (ISO, timestamp, DD/MM/YYYY) to DD/MM/YYYY.
 */
export function formatReceiptDate(d) {
    if (!d) return '';
    const str = String(d).trim();
    if (str.includes('/')) return str;
    if (str.includes('-')) {
        const parts = str.split('T')[0].split('-');
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return str;
    }
    const dt = new Date(str);
    return isNaN(dt.getTime()) ? str : dt.toLocaleDateString('en-GB');
}

/**
 * Builds standalone thermal receipt HTML for Sales Invoice or Sales Return.
 *
 * @param {Object} doc - The transaction document (sale or return)
 * @param {'invoice'|'return'} type - Document type
 * @param {Object} [settings] - Invoice configuration settings (width, optional columns, etc.)
 * @param {Object} [account] - Organization branding/profile (name, address, tax IDs, logo)
 * @returns {string} Fully styled HTML string ready for isolated printing
 */
export function buildReceiptHTML(doc, type = 'invoice', settings = null, account = null) {
    if (!doc) return '';

    const invSettings = settings || (() => {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('invoiceSettings') : null;
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    })();

    const accData = account || (() => {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('myAccountData') : null;
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    })();

    const invWidth = invSettings.width || invSettings.invWidth || '3inch';
    const dim = getThermalDimensions(invWidth);
    const borderCol = '#606060';

    // Company Header Info
    const addrParts = [];
    if (accData.address) addrParts.push(accData.address);
    if (accData.city) addrParts.push(accData.city);
    const addrLine1 = addrParts.length > 0 ? addrParts.join(', ') : '31/11, Pukkulam Road, Thiyagadurgam, Kallakurichi';

    const stateParts = [];
    if (accData.state) stateParts.push(accData.state);
    if (accData.country) stateParts.push(accData.country);
    const addrLine2 = stateParts.length > 0 ? (stateParts.join(', ') + (accData.pin ? ` - ${accData.pin}` : '')) : 'Tamil Nadu - 606 206';

    // Items calculation & rendering
    let itemsHTML = '';
    let sno = 1;
    let computedSubTotal = 0;
    let computedTaxAmt = 0;
    let sumFinalAmt = 0;
    let sumTaxAmt = 0;
    let sumTotalAmt = 0;
    const taxGroups = {};

    (doc.items || []).forEach(item => {
        const qty = parseFloat(item.qty) || 1;
        const rate = parseFloat(item.rate || item.price) || 0;
        const disc = parseFloat(item.disc || item.discount) || 0;
        const finalAmt = item.finalAmt !== undefined ? parseFloat(item.finalAmt) : (item.amount !== undefined ? parseFloat(item.amount) : (qty * rate - disc));
        const taxPercent = parseFloat(item.taxPercent || item.tax || 0);
        const taxAmt = item.taxAmount !== undefined ? parseFloat(item.taxAmount) : (item.taxAmt !== undefined ? parseFloat(item.taxAmt) : 0);
        const totalAmt = item.totalAmt !== undefined ? parseFloat(item.totalAmt) : (finalAmt + taxAmt);

        computedSubTotal += finalAmt;
        computedTaxAmt += taxAmt;
        sumFinalAmt += finalAmt;
        sumTaxAmt += taxAmt;
        sumTotalAmt += totalAmt;

        if (taxPercent > 0) {
            if (!taxGroups[taxPercent]) {
                taxGroups[taxPercent] = {
                    cgstPct: taxPercent / 2,
                    sgstPct: taxPercent / 2,
                    igstPct: taxPercent,
                    taxAmt: 0
                };
            }
            taxGroups[taxPercent].taxAmt += taxAmt;
        }

        itemsHTML += `
            <tr>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:center;white-space:nowrap;">${sno++}</td>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};word-break:break-word;">${item.name || ''}</td>
                ${invSettings.invOptHSN ? `<td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};white-space:nowrap;">${item.hsn || '-'}</td>` : ''}
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:center;white-space:nowrap;">${qty} ${item.unit || ''}</td>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;white-space:nowrap;">₹${rate.toFixed(2)}</td>
                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;white-space:nowrap;">₹${(qty * rate).toFixed(2)}</td>
                ${invSettings.invOptTaxPct ? `<td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:center;white-space:nowrap;">${taxPercent}%</td>` : ''}
                ${invSettings.invOptTaxAmt ? `<td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;white-space:nowrap;">₹${taxAmt.toFixed(2)}</td>` : ''}
                ${invSettings.invOptTotalAmt ? `<td style="border-bottom:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;white-space:nowrap;">₹${totalAmt.toFixed(2)}</td>` : ''}
            </tr>
        `;
    });

    const grandTotal = parseFloat(doc.totalAmount || doc.grandTotal) || 0;
    const received = parseFloat(doc.paidAmount || doc.receivedAmount) || 0;
    const pending = Math.max(0, grandTotal - received);
    const rawTotal = computedSubTotal + computedTaxAmt;
    const computedDiscount = parseFloat(doc.discount) || 0;
    const roundOff = grandTotal - (rawTotal - computedDiscount);
    const afterDiscount = computedSubTotal - computedDiscount;

    // Customer Address Details
    const baseAddr = doc.customerAddress || doc.address || '';
    const city = doc.customerCity || doc.city || '';
    const state = doc.customerState || doc.state || '';
    const pin = doc.customerPinCode || doc.customerPincode || doc.customerPin || doc.pin || '';
    const cityState = [city, state].filter(Boolean).join(', ');
    const custAddrLine2 = cityState + (cityState && pin ? ` - ${pin}` : (pin ? pin : ''));
    let finalCustAddr = baseAddr;
    if (custAddrLine2 && custAddrLine2 !== baseAddr) {
        finalCustAddr += (finalCustAddr ? ' <br /> ' : '') + custAddrLine2;
    }
    const custAddr = finalCustAddr || '-';
    const custMobile = doc.customerMobile || doc.mobile || '-';

    // Tax Breakup Lines
    let taxBreakupHTML = '';
    Object.keys(taxGroups).forEach(pct => {
        const g = taxGroups[pct];
        const half = g.taxAmt / 2;
        taxBreakupHTML += `
            <div style="display:flex;border-bottom:1px solid ${borderCol};align-items:center;justify-content:space-between;font-size:${dim.is4 ? '10px' : dim.is2 ? '5.5px' : '8px'};font-weight:bold;padding:0;height:${dim.rowHeight};">
                <div style="display:flex;flex:1;justify-content:space-between;padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;border-right:1px solid ${borderCol};">
                    <span>CGST ${g.cgstPct}%</span><span>₹${half.toFixed(2)}</span>
                </div>
                <div style="display:flex;flex:1;justify-content:space-between;padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;border-right:1px solid ${borderCol};">
                    <span>SGST ${g.sgstPct}%</span><span>₹${half.toFixed(2)}</span>
                </div>
                <div style="display:flex;flex:1;justify-content:space-between;padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;border-right:1px solid ${borderCol};">
                    <span>IGST ${g.igstPct}%</span><span>-</span>
                </div>
                <div style="padding:${dim.rowPadding};flex:0.5;text-align:right;height:${dim.rowHeight};display:flex;align-items:center;justify-content:flex-end;">
                    <span>₹${g.taxAmt.toFixed(2)}</span>
                </div>
            </div>
        `;
    });

    if (!taxBreakupHTML && invSettings.invOptTaxBreakup) {
        taxBreakupHTML = `
            <div style="display:flex;border-bottom:1px solid ${borderCol};align-items:center;justify-content:space-between;font-size:${dim.is4 ? '10px' : dim.is2 ? '5.5px' : '8px'};font-weight:bold;padding:0;height:${dim.rowHeight};">
                <div style="display:flex;flex:1;justify-content:space-between;padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;border-right:1px solid ${borderCol};">
                    <span>CGST 0%</span><span>₹0.00</span>
                </div>
                <div style="display:flex;flex:1;justify-content:space-between;padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;border-right:1px solid ${borderCol};">
                    <span>SGST 0%</span><span>₹0.00</span>
                </div>
                <div style="display:flex;flex:1;justify-content:space-between;padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;border-right:1px solid ${borderCol};">
                    <span>IGST 0%</span><span>-</span>
                </div>
                <div style="padding:${dim.rowPadding};flex:0.5;text-align:right;height:${dim.rowHeight};display:flex;align-items:center;justify-content:flex-end;">
                    <span>₹0.00</span>
                </div>
            </div>
        `;
    }

    const totalColSpan = invSettings.invOptHSN ? 5 : 4;
    const isCancelled = doc.status === 'CANCELLED';
    const cancelledBanner = isCancelled ? `
        <div style="background:#FEF2F2;border:2px solid #EF4444;border-radius:6px;padding:8px 16px;margin-bottom:12px;color:#EF4444;font-weight:bold;font-size:12px;text-align:center;">
            ⚠ CANCELLED — ${doc.cancellation_reason || ''}
        </div>
    ` : '';

    const isReturn = type === 'return';
    const docTitle = isReturn ? 'SALES RETURN' : 'INVOICE';
    const docNoLabel = isReturn ? 'Return No.' : 'INV No.';
    const docNoValue = isReturn ? (doc.returnNo || '') : (doc.invoiceNumber || '');
    const paidLabel = isReturn ? 'Refund Given :' : 'Paid Amount :';
    const pendingLabel = isReturn ? 'Store Credit :' : 'Current Balance :';

    return `
        <style>
            .invoice-print-wrapper th, .invoice-print-wrapper td { font-size: inherit !important; }
        </style>
        ${cancelledBanner}
        <div class="invoice-outer-box" style="width:100%;max-width:${dim.maxWidthPx};margin:0 auto;padding:16px;background:white;box-shadow:0 4px 16px rgba(0,0,0,0.08);border-radius:8px;box-sizing:border-box;font-family:'Manrope',-apple-system,BlinkMacSystemFont,sans-serif;font-size:${dim.is4 ? '14px' : dim.is2 ? '10px' : '12px'};color:#000;">
            <div style="background-color:#fff;padding:0;border-radius:4px;">
                <div class="invoice-print-wrapper" style="border:1px solid ${borderCol};border-radius:4px;overflow:hidden;">
                    
                    <!-- Company Branding Header -->
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid ${borderCol};padding:${dim.pSpace};">
                        <div style="display:flex;gap:12px;align-items:center;">
                            ${invSettings.invOptLogo ? (
                                accData.logo ? `<img src="${accData.logo}" style="width:${dim.is4 ? '50px' : dim.is2 ? '30px' : '40px'};height:${dim.is4 ? '50px' : dim.is2 ? '30px' : '40px'};object-fit:contain;" alt="Logo">` : `
                                <div style="width:${dim.is4 ? '40px' : dim.is2 ? '24px' : '32px'};height:${dim.is4 ? '40px' : dim.is2 ? '24px' : '32px'};background-color:#f1f5f9;display:flex;align-items:center;justify-content:center;border-radius:6px;">
                                    <span style="font-weight:bold;font-size:${dim.is4 ? '14px' : dim.is2 ? '9px' : '11px'};color:#64748b;">SPH</span>
                                </div>
                                `
                            ) : ''}
                            <div style="text-align:left;">
                                <div style="font-size:${dim.fCompany};font-weight:bold;text-transform:uppercase;">${accData.company || 'SRI PARVATHI HARDWARES'}</div>
                                <div style="font-size:${dim.fSubText};color:#555;margin-top:2px;">${addrLine1}</div>
                                <div style="font-size:${dim.fSubText};color:#555;">${addrLine2}</div>
                                ${invSettings.invOptPhone !== false ? `<div style="font-size:${dim.fSubText};color:#555;">Ph No : <b>${accData.mobile || '9994121042'}</b></div>` : ''}
                                ${(invSettings.invOptGSTIN || invSettings.invOptPAN) ? `
                                    <div style="font-size:${dim.fSubText};color:#555;margin-top:2px;">
                                        ${invSettings.invOptGSTIN && accData.gstin ? `<span>GSTIN : <b>${accData.gstin}</b></span>` : ''}
                                        ${invSettings.invOptGSTIN && invSettings.invOptPAN && accData.gstin && accData.pan ? ` | ` : ''}
                                        ${invSettings.invOptPAN && accData.pan ? `<span>PAN : <b>${accData.pan}</b></span>` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div style="font-size:${dim.fHeaderTitle};font-weight:bold;letter-spacing:1px;color:#000;padding-top:5px;">${docTitle}</div>
                    </div>

                    <!-- Customer & Transaction Info -->
                    <div style="border-bottom:1px solid ${borderCol};padding:${dim.pSpace};display:flex;justify-content:space-between;line-height:${dim.is2 ? '1.3' : '1.6'};font-size:${dim.fCustomer};">
                        <div style="text-align:left;flex:1;">
                            <div style="display:flex;"><span style="font-weight:bold;width:${dim.is4 ? '100px' : dim.is2 ? '55px' : '85px'};">Customer Name</span><span style="padding-right:4px;">-</span><span>${doc.customerName || 'Walk In Customer'}</span></div>
                            <div style="display:flex;"><span style="font-weight:bold;width:${dim.is4 ? '100px' : dim.is2 ? '55px' : '85px'};">Mobile No.</span><span style="padding-right:4px;">-</span><span>${custMobile}</span></div>
                            <div style="display:flex;"><span style="font-weight:bold;width:${dim.is4 ? '100px' : dim.is2 ? '55px' : '85px'};">Address</span><span style="padding-right:4px;">-</span><span style="flex:1;">${custAddr}</span></div>
                        </div>
                        <div style="text-align:left;width:${dim.is4 ? '190px' : dim.is2 ? '95px' : '150px'};flex-shrink:0;">
                            <div style="display:flex;justify-content:flex-end;"><span style="font-weight:bold;width:${dim.is4 ? '75px' : dim.is2 ? '42px' : '60px'};text-align:left;">${docNoLabel}</span><span style="padding-right:4px;">-</span><span style="width:${dim.is4 ? '85px' : dim.is2 ? '45px' : '70px'};text-align:right;font-weight:bold;">${docNoValue}</span></div>
                            ${isReturn && doc.invoiceNo ? `<div style="display:flex;justify-content:flex-end;"><span style="font-weight:bold;width:${dim.is4 ? '75px' : dim.is2 ? '42px' : '60px'};text-align:left;">Orig Inv No.</span><span style="padding-right:4px;">-</span><span style="width:${dim.is4 ? '85px' : dim.is2 ? '45px' : '70px'};text-align:right;">${doc.invoiceNo}</span></div>` : ''}
                            <div style="display:flex;justify-content:flex-end;"><span style="font-weight:bold;width:${dim.is4 ? '75px' : dim.is2 ? '42px' : '60px'};text-align:left;">Date</span><span style="padding-right:4px;">-</span><span style="width:${dim.is4 ? '85px' : dim.is2 ? '45px' : '70px'};text-align:right;">${formatReceiptDate(doc.date)}</span></div>
                        </div>
                    </div>

                    <!-- Items Table -->
                    <table style="width:100%;border-collapse:collapse;border-bottom:1px solid ${borderCol};font-size:${dim.fTable};text-align:left;">
                        <thead>
                            <tr style="background-color:#f8fafc;">
                                <th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:center;">S No</th>
                                <th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};">Item Name</th>
                                ${invSettings.invOptHSN ? `<th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};">HSN</th>` : ''}
                                <th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:center;">Qty /Unit</th>
                                <th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;">Rate</th>
                                <th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;">Amount</th>
                                ${invSettings.invOptTaxPct ? `<th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:center;">Tax %</th>` : ''}
                                ${invSettings.invOptTaxAmt ? `<th style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;">Tax Amt</th>` : ''}
                                ${invSettings.invOptTotalAmt ? `<th style="border-bottom:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;">Total Amt</th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                            <tr style="font-weight:bold;background-color:#f8fafc;">
                                <td colspan="${totalColSpan}" style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:left;">Total</td>
                                <td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;">₹${sumFinalAmt.toFixed(2)}</td>
                                ${invSettings.invOptTaxPct ? `<td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};"></td>` : ''}
                                ${invSettings.invOptTaxAmt ? `<td style="border-bottom:1px solid ${borderCol};border-right:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;">₹${sumTaxAmt.toFixed(2)}</td>` : ''}
                                ${invSettings.invOptTotalAmt ? `<td style="border-bottom:1px solid ${borderCol};padding:${dim.tSpace};text-align:right;">₹${sumTotalAmt.toFixed(2)}</td>` : ''}
                            </tr>
                        </tbody>
                    </table>

                    <!-- Price Breakup -->
                    <div style="display:flex;flex-direction:column;font-size:${dim.fTable};">
                        <div style="display:flex;justify-content:space-between;border-bottom:1px solid ${borderCol};padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;font-weight:bold;">
                            <span>Sub Total</span><span>₹${computedSubTotal.toFixed(2)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;border-bottom:1px solid ${borderCol};padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;font-weight:bold;">
                            <span>Discount</span><span>₹${computedDiscount.toFixed(2)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;border-bottom:1px solid ${borderCol};padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;font-weight:bold;">
                            <span>After Discount</span><span>₹${afterDiscount.toFixed(2)}</span>
                        </div>
                        ${invSettings.invOptTaxBreakup ? taxBreakupHTML : ''}
                        ${invSettings.invOptRound ? `
                            <div style="display:flex;justify-content:space-between;border-bottom:1px solid ${borderCol};padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;font-weight:bold;">
                                <span>Round Off</span><span>₹${roundOff.toFixed(2)}</span>
                            </div>
                        ` : ''}
                        ${invSettings.invOptTotalBreakup ? `
                            <div style="display:flex;justify-content:space-between;border-bottom:1px solid ${borderCol};padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;font-weight:bold;">
                                <span>Total</span><span>₹${grandTotal.toFixed(2)}</span>
                            </div>
                        ` : ''}
                        ${invSettings.invOptCreditBalance ? `
                            <div style="display:flex;justify-content:space-between;border-bottom:1px solid ${borderCol};padding:${dim.rowPadding};height:${dim.rowHeight};align-items:center;font-weight:bold;">
                                <span>Credit Balance</span><span>₹${(parseFloat(doc.creditBalance) || 0).toFixed(2)}</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Grand Total Bar -->
                    <div style="border-bottom:1px solid ${borderCol};padding:${dim.is4 ? '12px 16px' : dim.is2 ? '6px 8px' : '8px 12px'};color:#000;font-size:${dim.fGrandTotal};font-weight:bold;display:flex;justify-content:space-between;text-transform:uppercase;">
                        <span>Grand Total</span><span>₹${grandTotal.toFixed(2)}</span>
                    </div>

                    <!-- Amount In Words & Payment Balances -->
                    <div style="border-bottom:1px solid ${borderCol};padding:${dim.pSpace};display:flex;justify-content:space-between;align-items:flex-start;line-height:${dim.is2 ? '1.3' : '1.6'};font-size:${dim.is4 ? '11px' : dim.is2 ? '6.5px' : '9.5px'};">
                        <div style="text-align:left;flex:1;padding-right:${dim.is2 ? '6px' : '16px'};">
                            <div style="font-weight:bold;">Amount In Words</div>
                            <div style="margin-top:2px;">${numberToWords(grandTotal)}</div>
                        </div>
                        ${(invSettings.invOptPaidAmt || invSettings.invOptPendingAmt) ? `
                            <div style="width:${dim.is4 ? '200px' : dim.is2 ? '95px' : '150px'};text-align:left;border-left:1px solid ${borderCol};padding-left:${dim.is2 ? '6px' : '16px'};flex-shrink:0;">
                                ${invSettings.invOptPaidAmt ? `
                                    <div style="display:flex;justify-content:space-between;">
                                        <span>${paidLabel}</span>
                                        <span style="font-weight:bold;">₹${received.toFixed(2)}</span>
                                    </div>
                                ` : ''}
                                ${invSettings.invOptPendingAmt ? `
                                    <div style="display:flex;justify-content:space-between;margin-top:2px;">
                                        <span>${pendingLabel}</span>
                                        <span style="font-weight:bold;">₹${pending.toFixed(2)}</span>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>

                    <!-- Optional Note -->
                    ${invSettings.note ? `
                        <div style="border-bottom:1px solid ${borderCol};padding:${dim.pSpace};text-align:left;font-size:${dim.is4 ? '10px' : dim.is2 ? '7px' : '8.5px'};line-height:1.5;color:#000;">
                            <div style="font-weight:bold;margin-bottom:4px;">NOTE :</div>
                            <div style="white-space:pre-wrap;">${invSettings.note}</div>
                        </div>
                    ` : ''}

                    <!-- Footer Message -->
                    <div style="padding:${dim.is4 ? '12px' : dim.is2 ? '6px' : '8px'};text-align:center;font-weight:bold;font-size:${dim.fFooter};text-transform:uppercase;letter-spacing:0.5px;">
                        THANK YOU PURCHASE !!!!
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Executes isolated thermal receipt printing using a dynamically mounted hidden iframe.
 * 
 * Flow:
 * 1. Reads current invoice settings (width: 58mm/80mm/100mm) and account branding.
 * 2. Compiles standalone HTML document with strict @media print and mm physical units.
 * 3. Mounts off-screen iframe (positioned off-viewport to ensure cross-browser rendering).
 * 4. Waits for iframe document and resources (fonts, images) to load before calling print().
 * 5. Uses onafterprint event listener to reliably clean up the iframe after the user closes the dialog.
 * 6. Includes safety cleanup timers to prevent memory leaks or hanging if onafterprint is unsupported.
 * 7. Never calls window.location.reload() or re-triggers any backend requests.
 *
 * @param {Object} saleData - The document payload to print
 * @param {'invoice'|'return'} [type='invoice'] - Document type
 * @returns {Promise<void>} Resolves when the print action has been dispatched and completed/cleaned up
 */
export function printThermalReceipt(saleData, type = 'invoice') {
    return new Promise((resolve) => {
        if (!saleData || typeof document === 'undefined') {
            resolve();
            return;
        }

        let invSettings = {};
        try {
            const raw = localStorage.getItem('invoiceSettings');
            if (raw) invSettings = JSON.parse(raw);
        } catch (e) {}

        let accData = {};
        try {
            const raw = localStorage.getItem('myAccountData');
            if (raw) accData = JSON.parse(raw);
        } catch (e) {}

        const invWidth = invSettings.width || invSettings.invWidth || '3inch';
        const dim = getThermalDimensions(invWidth);
        const receiptContent = buildReceiptHTML(saleData, type, invSettings, accData);

        const standaloneHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${type === 'return' ? 'Sales Return' : 'Sales Invoice'}</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 10px;
            font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: white;
            display: flex;
            justify-content: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        @media print {
            @page {
                margin: 2mm auto;
                size: ${dim.paperWidthMM} auto;
            }
            body {
                padding: 0;
                margin: 0;
                width: 100%;
                display: flex;
                justify-content: center;
                background: white;
            }
            .no-print {
                display: none !important;
            }
            .invoice-outer-box {
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
                padding: ${dim.printPadding} !important;
                width: 100% !important;
                max-width: 100% !important;
            }
        }
    </style>
</head>
<body>
    ${receiptContent}
</body>
</html>`;

        // Create invisible off-screen iframe
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '-9999px';
        iframe.style.width = '100px';
        iframe.style.height = '100px';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.title = 'Thermal Print Frame';

        let isCleanedUp = false;
        const cleanup = () => {
            if (isCleanedUp) return;
            isCleanedUp = true;
            try {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            } catch (err) {}
            resolve();
        };

        document.body.appendChild(iframe);

        const iframeWin = iframe.contentWindow;
        if (!iframeWin) {
            cleanup();
            return;
        }

        const triggerPrint = () => {
            try {
                // Listen for when print dialog is completed/cancelled
                iframeWin.onafterprint = () => {
                    cleanup();
                };

                iframeWin.focus();
                iframeWin.print();

                // Fallback cleanup in case onafterprint doesn't fire (headless, non-standard webview)
                setTimeout(cleanup, 2500);
            } catch (printErr) {
                console.warn('Thermal print execution error:', printErr);
                cleanup();
            }
        };

        const iframeDoc = iframeWin.document;
        iframeDoc.open();
        iframeDoc.write(standaloneHTML);
        iframeDoc.close();

        // Ensure all resources within the iframe are fully loaded before calling print
        const verifyLoadedAndPrint = () => {
            const images = iframeDoc.images;
            if (images && images.length > 0) {
                let pendingImages = 0;
                let fired = false;
                const onImageDone = () => {
                    pendingImages--;
                    if (pendingImages <= 0 && !fired) {
                        fired = true;
                        triggerPrint();
                    }
                };

                for (let i = 0; i < images.length; i++) {
                    if (!images[i].complete) {
                        pendingImages++;
                        images[i].addEventListener('load', onImageDone, { once: true });
                        images[i].addEventListener('error', onImageDone, { once: true });
                    }
                }

                if (pendingImages === 0) {
                    triggerPrint();
                } else {
                    // Maximum image wait fallback of 1 second
                    setTimeout(() => {
                        if (!fired) {
                            fired = true;
                            triggerPrint();
                        }
                    }, 1000);
                }
            } else {
                triggerPrint();
            }
        };

        if (iframeDoc.readyState === 'complete') {
            verifyLoadedAndPrint();
        } else {
            iframeWin.onload = () => {
                verifyLoadedAndPrint();
            };
            // Fallback if onload event missed
            setTimeout(() => {
                if (!isCleanedUp) {
                    verifyLoadedAndPrint();
                }
            }, 600);
        }
    });
}
