# Phase 4D Step 5: A4 Invoice & Multi-Grid Label Printing — Implementation Report

**Status:** COMPLETE & VERIFIED  
**Date:** 2026-09-06  
**Scope:** Phase 4D Step 5 ONLY — A4 Invoice & Multi-Grid Label Printing  
**Objective:** Eliminate screen-pixel conversions (`3.78 px/mm`), establish strict CSS physical A4 geometry (`mm`), enforce mathematical grid fit validation, eliminate unmanaged `window.open()` popups and `window.print()` on the main window via isolated hidden iframes, and preserve user-configured sticker sheet dimensions and thermal receipt isolation.

---

## 1. Executive Summary

In Phase 4D Step 5, we addressed **Finding 2** and **Finding 5** identified during the Phase 4D Hardware & Real-World UAT audit:
1. **Screen-Pixel Elimination**: Previously, `PrintTags.jsx`, `AutoScalingLabel.jsx`, `ViewItem.jsx`, and `CreateItem.jsx` relied on client-side pixel conversions multiplying millimetre measurements by `3.78` (`1mm ≈ 3.78px` at 96 DPI). This caused rounding drift and page creeping across multiple rows on physical A4 sticker sheets. We eliminated the `3.78` multiplier, transitioning entirely to CSS physical units (`mm`) with `@page { size: A4 portrait; margin: 0; }` and `.a4-page { width: 210mm; height: 297mm; }`.
2. **Physical Fit Validation**: Implemented strict mathematical layout validation ensuring configured grids physically fit within standard A4 dimensions ($210\text{mm} \times 297\text{mm}$) before rendering or triggering print. If a user sets an oversized layout in Settings or PrintTags, a clear error is displayed with the exact millimetre overflow instead of clipping or compressing labels.
3. **Isolated Hidden Iframe Printing**: Replaced unmanaged `window.open()` popups and main-page `window.print()` calls with the proven hidden iframe printing pattern from Step 1. Printing never navigates, reloads, or modifies the active application window.
4. **Zero Impact on Financial/Thermal/Scanner Logic**: Thermal receipt printing (`thermalPrinter.js`), barcode scanner handling (`barcodeScanner.js`), camera scanner lifecycle (`cameraScanner.js`), and database idempotency remain 100% untouched and isolated.

---

## 2. Files Changed & Summary of Modifications

| File | Action | Purpose & Scope |
| :--- | :---: | :--- |
| `frontend-react/src/utils/a4Printer.js` | **NEW** | Centralized A4 printing engine: `validateA4LabelLayout()`, `buildA4LabelSheetHTML()`, `buildThermalTagHTML()`, `executeIsolatedIframePrint()`, `printItemTags()`, `printA4Document()`. |
| `frontend-react/src/pages/PrintTags.jsx` | **MODIFIED** | Switched sheet preview and print generator from `* 3.78px` to CSS `mm`; integrated `validateA4LabelLayout()` and error alerts; uses `printItemTags()`. |
| `frontend-react/src/components/AutoScalingLabel.jsx` | **MODIFIED** | Replaced `* 3.78` calculations with pure `mm` styling and DOM-measured scaling; eliminated font overflow. |
| `frontend-react/src/pages/Settings.jsx` | **MODIFIED** | Replaced `* 3.78px` with CSS `mm` in tag preview container; added real-time A4 overflow alert banner. |
| `frontend-react/src/pages/ViewItem.jsx` | **MODIFIED** | Replaced `window.open()` popup printing with `printItemTags()` isolated hidden iframe execution. |
| `frontend-react/src/pages/CreateItem.jsx` | **MODIFIED** | Removed 140 lines of duplicate popup HTML generator; routes to `printItemTags()`. |
| `frontend-react/src/pages/ViewVendor.jsx` | **MODIFIED** | Replaced `window.open()` popup with `printA4Document()` isolated hidden iframe print. |
| `frontend-react/src/pages/ViewVoucher.jsx` | **MODIFIED** | Replaced direct `window.print()` on root application with `printA4Document()`. |
| `frontend-react/src/pages/ViewPurchaseInvoice.jsx` | **MODIFIED** | Replaced direct `window.print()` with `printA4Document()` with A4 CSS wrapping. |
| `frontend-react/src/pages/ViewPurchaseReturn.jsx` | **MODIFIED** | Replaced direct `window.print()` with `printA4Document()` with A4 CSS wrapping. |
| `frontend-react/src/pages/ViewCustomer.jsx` | **MODIFIED** | Replaced direct `window.print()` on statement with `printA4Document()`. |
| `frontend-react/test_a4_printing.js` | **NEW** | 7 automated test suites validating A4 geometry, math, overflow checks, pagination, empty cells, and iframe behavior. |

---

## 3. Exact A4 Geometry Calculations & CSS Rules

Standard ISO 216 A4 dimensions are:
- **Width**: $210\text{ mm}$
- **Height**: $297\text{ mm}$

### CSS Print Geometry Rules:
```css
@page {
    size: A4 portrait;
    margin: 0;
}
html, body {
    margin: 0;
    padding: 0;
    background: white !important;
    font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.a4-page {
    width: 210mm;
    height: 297mm;
    box-sizing: border-box;
    page-break-after: always;
    break-after: page;
    background: white;
    overflow: hidden;
    margin: 0 auto;
}
.a4-page:last-child {
    page-break-after: auto;
    break-after: auto;
}
```

### Elimination of 3.78px Multiplier:
- **Prior Code**: Multiplied millimeter dimensions by `3.78` to obtain pixel values (`width: ${settings.tsWidth * 3.78}px`). At standard display resolutions, fractional rounding errors accumulated across rows and columns, leading to vertical creeping on physical sticker sheets.
- **New Code**: Utilizes native CSS `mm` units directly (`width: ${labelWidth}mm; height: ${labelHeight}mm`). CSS layout engines render physical millimetres directly to printer hardware rasterizers with sub-millimetre precision.

---

## 4. Mapping of User-Configurable Settings to Millimeters

All settings stored in `localStorage` under `tagSettings` (configured via `Settings.jsx`) map directly 1:1 into millimetres:

| Setting Key | Label / Description | Stored Value Type | CSS Layout Mapping |
| :--- | :--- | :--- | :--- |
| `tsWidth` | Label Width | Number (mm) | `width: ${tsWidth}mm;` |
| `tsHeight` | Label Height | Number (mm) | `height: ${tsHeight}mm;` |
| `tsA4Rows` | Grid Rows | Integer | `grid-template-rows: repeat(${rows}, ${height}mm);` |
| `tsA4Cols` | Grid Columns | Integer | `grid-template-columns: repeat(${cols}, ${width}mm);` |
| `tsA4MarginLeft` | Sheet Left Margin | Number (mm) | `padding-left: ${tsA4MarginLeft}mm;` |
| `tsA4MarginRight`| Sheet Right Margin | Number (mm) | `padding-right: ${tsA4MarginRight}mm;` |
| `tsA4MarginTop` | Sheet Top Margin | Number (mm) | `padding-top: ${tsA4MarginTop}mm;` |
| `tsA4MarginBottom`| Sheet Bottom Margin | Number (mm) | `padding-bottom: ${tsA4MarginBottom}mm;` |
| `tsA4HSpace` | Horizontal Gap between stickers | Number (mm) | `column-gap: ${tsA4HSpace}mm;` |
| `tsA4VSpace` | Vertical Gap between stickers | Number (mm) | `row-gap: ${tsA4VSpace}mm;` |
| `tsMarginTop` | Internal Label Padding (Top) | Number (mm) | Label cell inner `padding-top` |
| `tsMarginBottom` | Internal Label Padding (Bottom) | Number (mm) | Label cell inner `padding-bottom` |
| `tsMarginLeft` | Internal Label Padding (Left) | Number (mm) | Label cell inner `padding-left` |
| `tsMarginRight` | Internal Label Padding (Right) | Number (mm) | Label cell inner `padding-right` |
| `tsAlign` | Text Alignment | String (`left`/`center`/`right`) | Flexbox justify & text-align |
| `tsSizeCode` | Code Font Size | Number (px) | `font-size: ${tsSizeCode}px;` |
| `tsSizeName` | Name Font Size | Number (px) | `font-size: ${tsSizeName}px;` |
| `tsSizePrice` | Price Font Size | Number (px) | `font-size: ${tsSizePrice}px;` |
| `tsSizeQR` | QR Dimension (% of width) | Percentage | `width: ${(tsSizeQR / 100) * tsWidth}mm;` |

---

## 5. Physical Overflow & Fit Validation Engine

Implemented in `validateA4LabelLayout(settings)` in `a4Printer.js`:

### Mathematical Invariants:
$$W_{\text{total}} = \text{leftMargin} + (\text{columns} \times \text{labelWidth}) + ((\text{columns} - 1) \times \text{horizontalGap}) + \text{rightMargin} \le 210\text{ mm}$$
$$H_{\text{total}} = \text{topMargin} + (\text{rows} \times \text{labelHeight}) + ((\text{rows} - 1) \times \text{verticalGap}) + \text{bottomMargin} \le 297\text{ mm}$$

### Behavior on Overflow:
1. **No Silent Alteration**: The system never compresses, scales down, or clips the user's configured dimensions.
2. **Detailed Error Messaging**: When $W_{\text{total}} > 210.05\text{mm}$ or $H_{\text{total}} > 297.05\text{mm}$, `validateA4LabelLayout()` returns `valid: false` with exact overflow metrics:
   > *"Horizontal grid width (230mm) exceeds A4 width (210mm) by 20.0mm [Left: 10mm + 4×50mm + 3×4mm + Right: 10mm]."*
3. **UI Integration**:
   - In `Settings.jsx`: An amber alert warning banner appears directly above the live preview if the current inputs overflow.
   - In `PrintTags.jsx`: A red alert box displays the validation error and disables the "Print A4 Labels" button.
   - In `printItemTags()`: The function fails gracefully and returns `{ success: false, error }`, alerting the user and halting print generation.

---

## 6. Multi-Page Pagination & Empty-Cell Placement

For partial sticker sheet reuse:
- **Formula**:
  - $\text{labelsPerPage} = \text{rows} \times \text{cols}$
  - $\text{totalCells} = (\text{start} - 1) + \text{copies}$
  - $\text{totalPages} = \lceil \text{totalCells} / \text{labelsPerPage} \rceil$
- **Empty-Cell Preservation**:
  - When $\text{cellIndex} < \text{start}$ or $\text{cellIndex} \ge \text{start} + \text{copies}$, an invisible placeholder cell is injected:
    ```html
    <div class="label-cell empty-cell" style="width: 50mm; height: 25mm;"></div>
    ```
  - Empty cells have `border: none; background: transparent;` and exact physical dimensions, ensuring subsequent stickers occupy their exact physical cutouts on partially-used sheets without shifting.

---

## 7. Isolated Hidden Iframe Printing Implementation

Replaced unmanaged popups (`window.open`) and root `window.print()` across the entire frontend:
1. **DOM Construction**: Creates an invisible, zero-opacity, aria-hidden `<iframe>` positioned at `-9999px`.
2. **Document Loading**: Injects the full standalone HTML document with A4 portrait CSS rules.
3. **Resource Synchronization**: Inspects all `<img>` tags (e.g., QR codes) and waits for `onload` events before triggering printing (with a safety timeout fallback).
4. **Trigger & Cleanup**: Calls `iframeWin.print()`. Binds `iframeWin.onafterprint` and a safety timer to automatically remove the iframe from the DOM without touching or reloading the host application.

---

## 8. Automated Tests & Results

We created a comprehensive automated test suite in `frontend-react/test_a4_printing.js`.

### Test Summary:
| Group | Test Description | Result |
| :---: | :--- | :---: |
| **Group 1** | A4 Geometry Constants ($210\text{mm} \times 297\text{mm}$) | **PASSED** |
| **Group 2** | Native Millimetre Conversion (No `3.78px` screen scaling) | **PASSED** |
| **Group 3** | User Configurable Settings Persistence (Rows, cols, margins, gaps) | **PASSED** |
| **Group 4** | Physical A4 Fit & Overflow Validation (Horizontal & Vertical limits) | **PASSED** |
| **Group 5** | Multi-Page Pagination & Partial Sheet Empty-Cell Placement | **PASSED** |
| **Group 6** | Isolated Hidden Iframe Printing & Main Window Safety | **PASSED** |
| **Group 7** | A4 Document Wrapper for Invoices, Statements, and Vouchers | **PASSED** |

**Total Test Groups: 7/7 PASSED (100%)**

---

## 9. Regression Verification Results

| Suite | Component Tested | Result |
| :--- | :--- | :---: |
| `node test_thermal.js` | Phase 4D Step 1: Thermal Receipt Printing & Iframe Isolation | **5/5 PASSED** |
| `node test_barcode_scanner.js` | Phase 4D Step 2: Keyboard-Wedge Barcode Scanner | **13/13 PASSED** |
| `node test_camera_scanner.js` | Phase 4D Step 3: Camera Barcode Scanner Lifecycle | **11/11 PASSED** |
| `node phase4d_step4_idempotency_tests.js`| Phase 4D Step 4: Database Idempotency Expansion | **11/11 PASSED** |
| `npm run build` | Frontend Production Build Validation | **PASSED (0 errors)** |

---

## 10. Remaining Physical Hardware Calibration Checklist

Before go-live on client hardware, perform this final physical check on the targeted label printer and office laser/inkjet printer:
1. **Printer Driver Margin Settings**: Ensure printer driver is set to "Actual Size" or "100%" (not "Fit to Printable Area" or "Shrink to Fit") to avoid driver-level rescaling.
2. **Sheet Media Alignment**: Confirm sticker sheet is inserted squarely into the manual bypass/multipurpose tray.
3. **Hardware Non-Printable Margin**: Physical laser printers have a mechanical non-printable border (typically $3\text{mm} - 5\text{mm}$). Verify sheet's `tsA4MarginTop` and `tsA4MarginLeft` exceed the hardware's minimum printable margin.
4. **Thermal vs A4 Profile Separation**: Confirm thermal roll stickers use `thermal` print type, while A4 sheets use `a4` print type in `Settings.jsx`.
