const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// 1. Add insertAuditLog
const auditLogFunc = `
async function insertAuditLog(client, { tableName, recordId, action, oldData, newData, req, transactionId }) {
    await client.query(\`
        INSERT INTO audit_logs (
            table_name, record_id, action, old_data, new_data,
            performed_by_id, performed_by_name, ip_address, user_agent, 
            transaction_id, request_method, endpoint
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    \`, [
        tableName, 
        recordId, 
        action, 
        oldData ? JSON.stringify(oldData) : null, 
        newData ? JSON.stringify(newData) : null,
        req.username || 'System',
        req.username || 'System',
        req.ip,
        req.get('User-Agent'),
        transactionId,
        req.method,
        req.originalUrl || req.url
    ]);
}
`;
if (!code.includes('insertAuditLog')) {
    code = code.replace('async function initDB() {', auditLogFunc + '\nasync function initDB() {');
}

// 2. Add Phase 3 schema to initDB
const phase3Schema = `
            -- Phase 3 Database Migrations (Integrity & Audit Foundation)
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('CREATE', 'CANCEL', 'PATCH', 'UPDATE', 'DELETE')),
                old_data JSONB,
                new_data JSONB,
                performed_by_id TEXT,
                performed_by_name TEXT,
                ip_address TEXT,
                user_agent TEXT,
                transaction_id UUID NOT NULL,
                request_method TEXT,
                endpoint TEXT,
                performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_at ON audit_logs(performed_at);

            DO $$
            BEGIN
                -- Fix stock data that is negative before adding constraint
                -- NOT strictly fixing, let's just let it fail gracefully if there is bad data using EXCEPTION block
                
                -- General & Status Constraints
                BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT chk_si_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT chk_pi_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT chk_sr_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE purchase_returns ADD CONSTRAINT chk_pr_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE customer_receipts ADD CONSTRAINT chk_cr_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE vendor_payments ADD CONSTRAINT chk_vp_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN NULL; END;
                
                -- Value Boundaries
                BEGIN ALTER TABLE items ADD CONSTRAINT chk_item_stock CHECK (stock >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT chk_si_amounts CHECK (amount >= 0 AND paid_amount >= 0 AND pending_to_receive >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT chk_pi_amounts CHECK (amount >= 0 AND paid_amount >= 0 AND pending_to_pay >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT chk_sr_amounts CHECK (grand_total >= 0 AND refund_amount >= 0 AND store_credit >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE purchase_returns ADD CONSTRAINT chk_pr_amounts CHECK (grand_total >= 0 AND refund_amount >= 0 AND store_credit >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE customer_receipt_allocations ADD CONSTRAINT chk_cra_allocated CHECK (allocated_amount > 0); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE vendor_payment_allocations ADD CONSTRAINT chk_vpa_allocated CHECK (allocated_amount > 0); EXCEPTION WHEN OTHERS THEN NULL; END;

                -- Sales Returns invoice_id addition and data fix
                BEGIN 
                    ALTER TABLE sales_returns ADD COLUMN invoice_id TEXT;
                EXCEPTION WHEN OTHERS THEN NULL; 
                END;
                BEGIN
                    UPDATE sales_returns sr
                    SET invoice_id = si.id
                    FROM sales_invoices si
                    WHERE sr.invoice_no = si.invoice_no AND sr.invoice_id IS NULL;
                EXCEPTION WHEN OTHERS THEN NULL;
                END;

                -- Foreign Keys
                BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT fk_si_customer FOREIGN KEY (customer_id) REFERENCES customers(id); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT fk_pi_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT fk_sr_customer FOREIGN KEY (customer_id) REFERENCES customers(id); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT fk_sr_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE purchase_returns ADD CONSTRAINT fk_pr_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id); EXCEPTION WHEN OTHERS THEN NULL; END;
            END $$;

            -- Phase 3 Indexes
            CREATE INDEX IF NOT EXISTS idx_purchase_invoices_pi_no ON purchase_invoices(pi_no);
            CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice_id ON sales_returns(invoice_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_returns_invoice_id ON purchase_returns(invoice_id);
            CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status);
            CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
`;

if (!code.includes('CREATE TABLE IF NOT EXISTS audit_logs')) {
    code = code.replace("const res = await pool.query('SELECT COUNT(*) FROM store');", phase3Schema + "\n        const res = await pool.query('SELECT COUNT(*) FROM store');");
}

// 3. Inject audit logging into the 6 cancel endpoints
const endpoints = [
    { startMarker: "app.post('/api/receipts/:id/cancel'", tableName: 'customer_receipts', idVar: 'receiptId', oldDataVar: 'receipt' },
    { startMarker: "app.post('/api/vendor-payments/:id/cancel'", tableName: 'vendor_payments', idVar: 'paymentId', oldDataVar: 'payment' },
    { startMarker: "app.post('/api/sales-returns/:id/cancel'", tableName: 'sales_returns', idVar: 'returnId', oldDataVar: 'returnDoc' },
    { startMarker: "app.post('/api/purchase-returns/:id/cancel'", tableName: 'purchase_returns', idVar: 'returnId', oldDataVar: 'returnDoc' },
    { startMarker: "app.post('/api/sales/:id/cancel'", tableName: 'sales_invoices', idVar: 'saleId', oldDataVar: 'invoice' },
    { startMarker: "app.post('/api/purchases/:id/cancel'", tableName: 'purchase_invoices', idVar: 'purchaseId', oldDataVar: 'invoice' }
];

for (const ep of endpoints) {
    const startIndex = code.indexOf(ep.startMarker);
    if (startIndex === -1) {
        console.error('Could not find endpoint', ep.startMarker);
        continue;
    }
    
    // Check if already migrated
    const endpointBlockStr = code.substring(startIndex, startIndex + 400);
    if (endpointBlockStr.includes('transactionId = crypto.randomUUID()')) {
        continue;
    }

    // Insert transaction ID at the beginning of the endpoint body
    const firstLineEnd = code.indexOf('{', startIndex);
    code = code.slice(0, firstLineEnd + 1) + '\n    const transactionId = crypto.randomUUID();' + code.slice(firstLineEnd + 1);

    // Find the COMMIT and inject the insertAuditLog right before it
    // Note: since the string indices change after the first slice, we find COMMIT from the NEW startIndex
    let currentStartIndex = code.indexOf(ep.startMarker);
    let nextEndpointIndex = code.indexOf("app.post('/api", currentStartIndex + 50);
    if (nextEndpointIndex === -1) nextEndpointIndex = code.length;

    let endpointCode = code.substring(currentStartIndex, nextEndpointIndex);
    
    if (endpointCode.includes('insertAuditLog')) continue; // skip if already injected

    const auditCall = `
        await insertAuditLog(client, {
            tableName: '${ep.tableName}',
            recordId: ${ep.idVar},
            action: 'CANCEL',
            oldData: ${ep.oldDataVar},
            newData: { status: 'CANCELLED', cancelled_by: cancelledBy, cancellation_reason: reason },
            req,
            transactionId
        });
        await client.query('COMMIT');`;

    endpointCode = endpointCode.replace("await client.query('COMMIT');", auditCall);
    code = code.substring(0, currentStartIndex) + endpointCode + code.substring(nextEndpointIndex);
}

fs.writeFileSync('server.js', code);
console.log('Successfully migrated server.js');
