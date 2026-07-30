# Purchase Return Creation Implementation Report

## 1. Files Changed
- [backend/server.js](file:///f:/MY%20Works/SPH%20Software/backend/server.js) - Added schema updates, exposed `vendor_credit_balance`, and implemented the atomic endpoint `POST /api/purchase-returns/create`.
- [frontend-react/src/pages/CreatePurchaseReturn.jsx](file:///f:/MY%20Works/SPH%20Software/frontend-react/src/pages/CreatePurchaseReturn.jsx) - Updated selection dropdown to bind to stable `id`, added double-submit lock, and updated payload mapping.

---

## 2. Schema Migrations Applied
We added columns dynamically on startup within the database initialization transaction in `server.js`:
- Added `vendors.vendor_credit_balance NUMERIC NOT NULL DEFAULT 0`
- Added the following columns to `purchase_returns`:
  - `invoice_id TEXT REFERENCES purchase_invoices(id)`
  - `vendor_credit NUMERIC DEFAULT 0`
  - `cash_received NUMERIC DEFAULT 0`
  - `status TEXT NOT NULL DEFAULT 'ACTIVE'`
  - `created_at TIMESTAMPTZ DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ DEFAULT NOW()`

---

## 3. Transaction Flow & Lock Order
The `POST /api/purchase-returns/create` endpoint executes in a single PostgreSQL transaction with the following deterministic lock order to prevent deadlocks:
1. **Original Purchase Invoice**: Locked by primary key `id` (`SELECT ... FOR UPDATE`).
2. **Document Sequence**: The sequence row for `purchase_return` is locked for prefix generation (`SELECT ... FOR UPDATE`).
3. **Item Rows**: Affected item rows are retrieved and locked in alphabetically sorted order by `code` (`ORDER BY code ASC FOR UPDATE`).
4. **Vendor Row**: Locked by primary key `id` (`SELECT ... FOR UPDATE`).

---

## 4. Stable Invoice & Vendor Relationships
- **Stable Invoice ID**: The frontend passes `invoiceId` (referencing `purchase_invoices.id`) rather than the invoice number. The backend queries and locks this row. No fallback to name or pi_no is allowed.
- **Stable Vendor Identification**: The vendor ID must match the vendor associated with the original invoice (`originalInvoice.vendor_id == vendorId`). Mismatches lead to transaction rollback.

---

## 5. Item Processing & Validation
- **Duplicate Item Aggregation**: Requested item codes are aggregated before validation or deduction.
- **Cumulative Over-Return Validation**: Aggregated requested quantities + previously returned quantities (`ACTIVE` returns only) are checked against the original purchased quantities. Over-returns are rejected.
- **Physical-Stock Validation**: Stock deduction ensures `currentStock >= totalReturnedQty` for all items. Returns are rejected if inventory is insufficient.
- **Stock Deduction**: Inventory rows are decremented correctly.

---

## 6. Financial Calculation & Inclusive/Exclusive Taxes
- Proportional item line discounts, proportional global discounts, and tax amounts are derived from the original Purchase Invoice snapshot.
- Taxes are calculated depending on the item's `purchase_tax_type` (`'with'` for inclusive, `'without'` for exclusive):
  - Inclusive: `taxAmount = finalAmt * (taxPct / (100 - taxPct))`
  - Exclusive: `taxAmount = finalAmt * (taxPct / 100)`
- Global invoice discount and GST reductions are applied proportionally to the returned amount.

---

## 7. Vendor Credit & Allocation Invariant
We lock the vendor and calculate allocations in this exact order:
```javascript
const payableReduction = Math.min(returnGrandTotal, currentPendingToPay);
const amountAfterPayable = returnGrandTotal - payableReduction;
const cashReceivedFromVendor = Math.min(requestedCashReceived, amountAfterPayable);
const vendorCreditCreated = amountAfterPayable - cashReceivedFromVendor;
```
- **Payable Reduction First**: Outstanding payable to the vendor is reduced first before any cash refunds or credits are calculated.
- **Allocation Invariant**: Checks `payableReduction + cashReceivedFromVendor + vendorCreditCreated = returnGrandTotal`.
- **Vendor Balance Update**: Deducts `payableReduction` from vendor's `pending_to_pay` and adds `vendorCreditCreated` to vendor's `vendor_credit_balance`.

---

## 8. Legacy Compatibility
- Legacy purchase return rows (where `invoice_id` is `NULL`) remain readable by GET endpoints.
- Legacy `store_credit` values are not migrated or reinterpreted as `vendor_credit_balance`.

---

## 9. Frontend Refactoring & Double Submission Protection
- Replaced `selectedPiNo` with `selectedInvoiceId` in `CreatePurchaseReturn.jsx`.
- Added `isSubmitting` state.
- Immediately set `isSubmitting = true` on submit, disabling the Save buttons until the request resolves.
- Sent clean, minimal payload (identifiers + returned items + cash received + date/note).

---

## 10. Build & Lint Validation
- **Backend check**: `node --check server.js` passed successfully.
- **Linter check**: `oxlint` executed on the frontend React components with no compilation/lint errors.
