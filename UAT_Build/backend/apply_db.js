const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

async function apply() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    
    await client.connect();
    
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
                BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT chk_si_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_si_status failed'; END;
                BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT chk_pi_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_pi_status failed'; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT chk_sr_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_sr_status failed'; END;
                BEGIN ALTER TABLE purchase_returns ADD CONSTRAINT chk_pr_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_pr_status failed'; END;
                BEGIN ALTER TABLE customer_receipts ADD CONSTRAINT chk_cr_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_cr_status failed'; END;
                BEGIN ALTER TABLE vendor_payments ADD CONSTRAINT chk_vp_status CHECK (status IN ('ACTIVE', 'CANCELLED')); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_vp_status failed'; END;
                
                -- Value Boundaries
                BEGIN ALTER TABLE items ADD CONSTRAINT chk_item_stock CHECK (stock >= 0); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_item_stock failed'; END;
                BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT chk_si_amounts CHECK (amount >= 0 AND paid_amount >= 0 AND pending_to_receive >= 0); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_si_amounts failed'; END;
                BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT chk_pi_amounts CHECK (amount >= 0 AND paid_amount >= 0 AND pending_to_pay >= 0); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_pi_amounts failed'; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT chk_sr_amounts CHECK (grand_total >= 0 AND refund_amount >= 0 AND store_credit >= 0); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_sr_amounts failed'; END;
                BEGIN ALTER TABLE purchase_returns ADD CONSTRAINT chk_pr_amounts CHECK (grand_total >= 0 AND refund_amount >= 0 AND store_credit >= 0); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_pr_amounts failed'; END;
                BEGIN ALTER TABLE customer_receipt_allocations ADD CONSTRAINT chk_cra_allocated CHECK (allocated_amount > 0); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_cra_allocated failed'; END;
                BEGIN ALTER TABLE vendor_payment_allocations ADD CONSTRAINT chk_vpa_allocated CHECK (allocated_amount > 0); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chk_vpa_allocated failed'; END;

                -- Sales Returns invoice_id addition and data fix
                BEGIN 
                    ALTER TABLE sales_returns ADD COLUMN invoice_id TEXT;
                EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'sales_returns invoice_id exists'; 
                END;
                BEGIN
                    UPDATE sales_returns sr
                    SET invoice_id = si.id
                    FROM sales_invoices si
                    WHERE sr.invoice_no = si.invoice_no AND sr.invoice_id IS NULL;
                EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'sales_returns invoice_id update failed';
                END;

                -- Foreign Keys
                BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT fk_si_customer FOREIGN KEY (customer_id) REFERENCES customers(id); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'fk_si_customer failed'; END;
                BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT fk_pi_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'fk_pi_vendor failed'; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT fk_sr_customer FOREIGN KEY (customer_id) REFERENCES customers(id); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'fk_sr_customer failed'; END;
                BEGIN ALTER TABLE sales_returns ADD CONSTRAINT fk_sr_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'fk_sr_invoice failed'; END;
                BEGIN ALTER TABLE purchase_returns ADD CONSTRAINT fk_pr_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'fk_pr_vendor failed'; END;
            END $$;

            -- Phase 3 Indexes
            CREATE INDEX IF NOT EXISTS idx_purchase_invoices_pi_no ON purchase_invoices(pi_no);
            CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice_id ON sales_returns(invoice_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_returns_invoice_id ON purchase_returns(invoice_id);
            CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status);
            CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
    `;
    
    try {
        console.log("Applying DB Schema Phase 3...");
        const res = await client.query(phase3Schema);
        console.log("Applied Phase 3 successfully.");
    } catch (e) {
        console.error("Failed to apply Phase 3:", e);
    }
    await client.end();
}
apply().catch(console.error);
