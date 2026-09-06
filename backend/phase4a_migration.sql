-- Phase 4A Database Migration: Financial & Transaction Safety

-- 1. Idempotency Keys Table for atomic, persistent request de-duplication
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    document_id TEXT,
    response_code INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (endpoint, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_at);

-- 2. Sales Invoices Return Tracking and Idempotency
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS returned_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- 3. Purchase Invoices Return Tracking and Idempotency
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS returned_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- 4. Sales Returns and Purchase Returns Balance Reduction Tracking
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS receivable_reduction NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS payable_reduction NUMERIC NOT NULL DEFAULT 0;

-- 5. Sync safety constraints
DO $$
BEGIN
    BEGIN ALTER TABLE items ADD CONSTRAINT chk_item_stock CHECK (stock >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT chk_si_amounts CHECK (amount >= 0 AND paid_amount >= 0 AND pending_to_receive >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT chk_pi_amounts CHECK (amount >= 0 AND paid_amount >= 0 AND pending_to_pay >= 0); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE sales_invoices ADD CONSTRAINT fk_si_customer FOREIGN KEY (customer_id) REFERENCES customers(id); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE purchase_invoices ADD CONSTRAINT fk_pi_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id); EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
