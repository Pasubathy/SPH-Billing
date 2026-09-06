import assert from 'node:assert';
import { getThermalDimensions, formatReceiptDate, buildReceiptHTML, printThermalReceipt } from './src/utils/thermalPrinter.js';

console.log('--- RUNNING THERMAL PRINTER TESTS ---');

// 1. Paper Dimension Mapping Tests
{
    const dim2 = getThermalDimensions('2inch');
    assert.strictEqual(dim2.paperWidthMM, '58mm', '2inch must map to 58mm');
    assert.strictEqual(dim2.is2, true, 'is2 must be true for 2inch');
    assert.strictEqual(dim2.printPadding, '4px', '2inch padding must be 4px');

    const dim3 = getThermalDimensions('3inch');
    assert.strictEqual(dim3.paperWidthMM, '80mm', '3inch must map to 80mm');
    assert.strictEqual(dim3.is2, false);
    assert.strictEqual(dim3.is4, false);
    assert.strictEqual(dim3.printPadding, '8px');

    const dim4 = getThermalDimensions('4inch');
    assert.strictEqual(dim4.paperWidthMM, '100mm', '4inch must map to 100mm');
    assert.strictEqual(dim4.is4, true, 'is4 must be true for 4inch');
    assert.strictEqual(dim4.printPadding, '12px');

    const dimDefault = getThermalDimensions(undefined);
    assert.strictEqual(dimDefault.paperWidthMM, '80mm', 'Default fallback must be 80mm');

    console.log('✓ Paper dimension tests passed (58mm / 80mm / 100mm).');
}

// 2. Date Formatting Tests
{
    assert.strictEqual(formatReceiptDate('2026-09-06T10:00:00.000Z'), '06/09/2026');
    assert.strictEqual(formatReceiptDate('2026-09-06'), '06/09/2026');
    assert.strictEqual(formatReceiptDate('06/09/2026'), '06/09/2026');
    assert.strictEqual(formatReceiptDate(''), '');
    console.log('✓ Receipt date formatting tests passed.');
}

// 3. Invoice HTML Generation Test (80mm)
{
    const sampleInvoice = {
        invoiceNumber: 'INV-2026-001',
        date: '2026-09-06',
        customerName: 'Test Customer',
        customerMobile: '9876543210',
        customerAddress: '123 Main St',
        customerCity: 'Chennai',
        customerState: 'Tamil Nadu',
        customerPinCode: '600001',
        items: [
            {
                name: 'Cement Bag 50kg',
                code: 'CEM50',
                hsn: '2523',
                qty: 2,
                unit: 'Bag',
                rate: 380,
                disc: 10,
                finalAmt: 750,
                taxPercent: 18,
                taxAmount: 135,
                totalAmt: 885
            }
        ],
        subTotal: 750,
        discount: 0,
        taxAmount: 135,
        grandTotal: 885,
        paidAmount: 885,
        creditBalance: 0
    };

    const settings = {
        invWidth: '3inch',
        invOptPhone: true,
        invOptGSTIN: true,
        invOptPAN: true,
        invOptLogo: false,
        invOptHSN: true,
        invOptTaxPct: true,
        invOptTaxAmt: true,
        invOptTotalAmt: true,
        invOptTaxBreakup: true,
        invOptRound: true,
        invOptTotalBreakup: true,
        invOptCreditBalance: true,
        invOptPaidAmt: true,
        invOptPendingAmt: true,
        note: 'Thank you for your patronage.'
    };

    const account = {
        company: 'SRI PARVATHI HARDWARES',
        address: 'Pukkulam Road',
        city: 'Thiyagadurgam',
        state: 'Tamil Nadu',
        pin: '606206',
        mobile: '9994121042',
        gstin: '33AABCU9603R1ZM'
    };

    const html = buildReceiptHTML(sampleInvoice, 'invoice', settings, account);

    assert.ok(html.includes('INVOICE'), 'Receipt must have INVOICE title');
    assert.ok(html.includes('INV-2026-001'), 'Receipt must contain invoice number');
    assert.ok(html.includes('Test Customer'), 'Receipt must contain customer name');
    assert.ok(html.includes('Cement Bag 50kg'), 'Receipt must contain item name');
    assert.ok(html.includes('2523'), 'Receipt must contain HSN code when enabled');
    assert.ok(html.includes('33AABCU9603R1ZM'), 'Receipt must contain GSTIN');
    assert.ok(html.includes('CGST 9%'), 'Receipt must contain CGST split for 18% tax');
    assert.ok(html.includes('SGST 9%'), 'Receipt must contain SGST split for 18% tax');
    assert.ok(html.includes('₹885.00'), 'Receipt must contain formatted grand total');
    assert.ok(html.includes('Eight Hundred and Eighty Five Rupees Only'), 'Receipt must contain words');

    console.log('✓ Sales Invoice HTML generation passed.');
}

// 4. Sales Return HTML Generation Test (58mm)
{
    const sampleReturn = {
        returnNo: 'RET-2026-005',
        invoiceNo: 'INV-2026-001',
        date: '2026-09-06',
        customerName: 'Return Customer',
        customerMobile: '9876543210',
        customerAddress: '456 Side St',
        items: [
            {
                name: 'Defective Pipe 10ft',
                code: 'PIP10',
                qty: 1,
                unit: 'Pcs',
                rate: 150,
                disc: 0,
                finalAmt: 150,
                taxPercent: 5,
                taxAmount: 7.5,
                totalAmt: 157.5
            }
        ],
        subTotal: 150,
        discount: 0,
        taxAmount: 7.5,
        grandTotal: 158,
        paidAmount: 158,
        creditBalance: 50
    };

    const settings = {
        invWidth: '2inch',
        invOptPhone: true,
        invOptTaxBreakup: true,
        invOptPaidAmt: true,
        invOptPendingAmt: true
    };

    const account = {
        company: 'SRI PARVATHI HARDWARES',
        mobile: '9994121042'
    };

    const html = buildReceiptHTML(sampleReturn, 'return', settings, account);

    assert.ok(html.includes('SALES RETURN'), 'Receipt must have SALES RETURN title');
    assert.ok(html.includes('RET-2026-005'), 'Receipt must contain return number');
    assert.ok(html.includes('INV-2026-001'), 'Receipt must contain original invoice number');
    assert.ok(html.includes('Defective Pipe 10ft'), 'Receipt must contain returned item name');
    assert.ok(html.includes('max-width:280px'), '2inch paper must use 280px container');

    console.log('✓ Sales Return 58mm HTML generation passed.');
}

// 5. Environment Safety Test (printThermalReceipt non-browser execution)
{
    const res = await printThermalReceipt({ invoiceNumber: 'INV001' }, 'invoice');
    assert.strictEqual(res, undefined, 'printThermalReceipt should resolve safely when document is undefined');
    console.log('✓ Headless environment safety check passed.');
}

console.log('--- ALL THERMAL PRINTER TESTS COMPLETED SUCCESSFULLY ---');
