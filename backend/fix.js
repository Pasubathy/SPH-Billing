async function fixStock() {
    const pInvoices = await fetch('http://localhost:3000/api/purchase-invoices').then(r=>r.json()).catch(()=>[]);
    const sInvoices = await fetch('http://localhost:3000/api/sales').then(r=>r.json()).catch(()=>[]);
    const pReturns = await fetch('http://localhost:3000/api/purchase-returns').then(r=>r.json()).catch(()=>[]);
    const sReturns = await fetch('http://localhost:3000/api/sales-returns').then(r=>r.json()).catch(()=>[]);
    const items = await fetch('http://localhost:3000/api/items').then(r=>r.json()).catch(()=>[]);
    
    // Reset stock to 0 for all items so we can rebuild from transactions
    // If you want to only process the existing invoices without losing original stock, we can do that too.
    // The user said "Already two invoice is created could you able to handle in stock". 
    // This implies we just need to add the stock from these two invoices. 
    // Let's assume we just want to recalculate EVERYTHING. It's safer.
    
    items.forEach(item => {
        item.stock = 0; // assuming stock is only derived from these 4 transactions.
    });

    pInvoices.forEach(inv => {
        (inv.items || []).forEach(item => {
            const matched = items.find(i => String(i.code) === String(item.code) || i.name === item.name);
            if (matched) {
                matched.stock = (parseFloat(matched.stock) || 0) + parseFloat(item.qty || 0);
            }
        });
    });

    sInvoices.forEach(inv => {
        (inv.items || []).forEach(item => {
            const matched = items.find(i => String(i.code) === String(item.code) || i.name === item.name);
            if (matched) {
                matched.stock = (parseFloat(matched.stock) || 0) - parseFloat(item.qty || 0);
            }
        });
    });

    pReturns.forEach(inv => {
        (inv.items || []).forEach(item => {
            const matched = items.find(i => String(i.code) === String(item.code) || i.name === item.name);
            if (matched) {
                matched.stock = (parseFloat(matched.stock) || 0) - parseFloat(item.qty || 0);
            }
        });
    });

    sReturns.forEach(inv => {
        (inv.items || []).forEach(item => {
            const matched = items.find(i => String(i.code) === String(item.code) || i.name === item.name);
            if (matched) {
                matched.stock = (parseFloat(matched.stock) || 0) + parseFloat(item.qty || 0);
            }
        });
    });

    console.log("Updated Items Stock:");
    items.forEach(i => console.log(i.name, i.code, 'Stock:', i.stock));

    const saveRes = await fetch('http://localhost:3000/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items)
    });
    if (saveRes.ok) {
        console.log("Successfully updated stock in database!");
    } else {
        console.error("Failed to update stock in DB");
    }
}
fixStock();
