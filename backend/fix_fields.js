const fs = require('fs');

function fixFile(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');

    code = code.replace(/customer_id:/g, 'customerId:');
    code = code.replace(/vendor_id:/g, 'vendorId:');
    code = code.replace(/sub_total:/g, 'subTotal:');
    code = code.replace(/discount_amount:/g, 'discount:');
    code = code.replace(/total_tax:/g, 'taxAmount:');
    // amount -> grandTotal but we might have 'taxAmount' so be careful
    code = code.replace(/ amount:/g, ' grandTotal:');
    code = code.replace(/, amount:/g, ', grandTotal:');
    
    code = code.replace(/received_amount:/g, 'receivedAmount:');
    code = code.replace(/quantity:/g, 'qty:');
    code = code.replace(/selling_price:/g, 'rate:');
    code = code.replace(/purchase_price:/g, 'rate:');
    code = code.replace(/finalAmount:/g, 'amount:');

    // add code for items
    code = code.replace(/id: testState\.item\.id, qty:/g, 'id: testState.item.id, code: testState.item.code, qty:');
    code = code.replace(/id: testState\.item1\.id, qty:/g, 'id: testState.item1.id, code: testState.item1.code, qty:');
    code = code.replace(/id: testState\.item2\.id, qty:/g, 'id: testState.item2.id, code: testState.item2.code, qty:');

    // receipts
    code = code.replace(/payment_mode:/g, 'paymentMode:');
    code = code.replace(/'Cash'/g, "'CASH'");
    code = code.replace(/reference_type:/g, 'referenceType:');
    code = code.replace(/invoice_id:/g, 'invoiceId:');

    fs.writeFileSync(filename, code);
}

fixFile('e2e.js');
fixFile('e2e_put_tests.js');
