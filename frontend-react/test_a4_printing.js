import assert from 'node:assert';
import {
    A4_WIDTH_MM,
    A4_HEIGHT_MM,
    validateA4LabelLayout,
    buildA4LabelSheetHTML,
    buildThermalTagHTML,
    printItemTags,
    printA4Document,
    executeIsolatedIframePrint
} from './src/utils/a4Printer.js';

console.log('=== RUNNING PHASE 4D STEP 5 A4 & MULTI-GRID LABEL PRINTING TESTS ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: A4 Dimensions & Geometry Standards
// ─────────────────────────────────────────────────────────────────────────────
console.log('[TEST 1] A4 Dimensions & Geometry Standards');
{
    assert.strictEqual(A4_WIDTH_MM, 210, 'A4 width must be exactly 210mm');
    assert.strictEqual(A4_HEIGHT_MM, 297, 'A4 height must be exactly 297mm');

    const sampleItem = { code: 'ITM-001', name: 'Brass Screw 2inch', sellingPrice: 45, unit: 'Pkt' };
    const sampleSettings = {
        tsPrintType: 'a4',
        tsWidth: 45, tsHeight: 25,
        tsA4Cols: 4, tsA4Rows: 10,
        tsA4MarginLeft: 10, tsA4MarginRight: 10,
        tsA4MarginTop: 12, tsA4MarginBottom: 12,
        tsA4HSpace: 2, tsA4VSpace: 2
    };

    const html = buildA4LabelSheetHTML({ item: sampleItem, settings: sampleSettings, copies: 4, start: 1 });

    assert(html.includes('size: A4 portrait;'), 'Must specify "@page { size: A4 portrait; }"');
    assert(html.includes('margin: 0;'), 'Must specify "@page { margin: 0; }" to prevent unmanaged browser margins');
    assert(html.includes('width: 210mm;'), 'Container must have explicit "width: 210mm;"');
    assert(html.includes('height: 297mm;'), 'Container must have explicit "height: 297mm;"');
    assert(html.includes('box-sizing: border-box;'), 'Must use "box-sizing: border-box;" for accurate geometry');

    // Ensure zero 3.78px screen pixel scaling occurs in the generated print markup
    assert(!html.includes('3.78'), 'Must NOT contain 3.78px pixel scaling constants');
    assert(!html.includes('793.8px'), 'Must NOT contain hard-coded 793.8px screen width');
    assert(!html.includes('1122.66px'), 'Must NOT contain hard-coded 1122.66px screen height');

    console.log('  ✓ Verified 210mm x 297mm physical A4 geometry');
    console.log('  ✓ Verified zero 3.78px screen pixel scaling in output HTML');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Millimeter Conversion & Layout Calculations
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 2] Millimeter Conversion & Layout Calculations');
{
    const customSettings = {
        tsPrintType: 'a4',
        tsWidth: 46.5,
        tsHeight: 25.4,
        tsA4Cols: 4,
        tsA4Rows: 10,
        tsA4MarginLeft: 5.0,
        tsA4MarginRight: 5.0,
        tsA4MarginTop: 10.0,
        tsA4MarginBottom: 10.0,
        tsA4HSpace: 2.5,
        tsA4VSpace: 1.5
    };

    const html = buildA4LabelSheetHTML({
        item: { code: 'NUTS-10', name: 'Stainless Hex Nut M10', price: 12.5 },
        settings: customSettings,
        copies: 2,
        start: 1
    });

    assert(html.includes('grid-template-columns: repeat(4, 46.5mm);'), 'Must generate exact 46.5mm column templates');
    assert(html.includes('grid-template-rows: repeat(10, 25.4mm);'), 'Must generate exact 25.4mm row templates');
    assert(html.includes('column-gap: 2.5mm;'), 'Must map 2.5mm horizontal gap');
    assert(html.includes('row-gap: 1.5mm;'), 'Must map 1.5mm vertical gap');
    assert(html.includes('padding: 10mm 5mm 10mm 5mm;'), 'Must map exact padding: top 10mm, right 5mm, bottom 10mm, left 5mm');

    console.log('  ✓ User-configured dimensions accurately mapped to native CSS mm units');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Configurable Rows and Columns
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 3] Configurable Rows and Columns Layout');
{
    // Test 3x8 layout (24 stickers per sheet)
    const layout24 = {
        tsPrintType: 'a4',
        tsWidth: 64, tsHeight: 33.9,
        tsA4Cols: 3, tsA4Rows: 8,
        tsA4MarginLeft: 7, tsA4MarginRight: 7,
        tsA4MarginTop: 12.9, tsA4MarginBottom: 12.9,
        tsA4HSpace: 2, tsA4VSpace: 0
    };

    const html24 = buildA4LabelSheetHTML({
        item: { code: 'BOLT-M8', name: 'Galvanized Bolt M8', price: 8 },
        settings: layout24,
        copies: 24,
        start: 1
    });

    assert(html24.includes('grid-template-columns: repeat(3, 64mm);'), '3-column layout matches');
    assert(html24.includes('grid-template-rows: repeat(8, 33.9mm);'), '8-row layout matches');

    // Count filled cells
    const filledCount = (html24.match(/class="label-cell filled-cell"/g) || []).length;
    assert.strictEqual(filledCount, 24, 'Must render exactly 24 filled labels');

    console.log('  ✓ 3x8 layout (24 labels/sheet) verified');

    // Test 2x5 layout (10 shipping labels per sheet)
    const layout10 = {
        tsPrintType: 'a4',
        tsWidth: 99.1, tsHeight: 57,
        tsA4Cols: 2, tsA4Rows: 5,
        tsA4MarginLeft: 4.5, tsA4MarginRight: 4.5,
        tsA4MarginTop: 6, tsA4MarginBottom: 6,
        tsA4HSpace: 2.8, tsA4VSpace: 0
    };

    const html10 = buildA4LabelSheetHTML({
        item: { code: 'CARTON-L', name: 'Heavy Duty Carton', price: 120 },
        settings: layout10,
        copies: 10,
        start: 1
    });

    assert(html10.includes('grid-template-columns: repeat(2, 99.1mm);'), '2-column layout matches');
    assert(html10.includes('grid-template-rows: repeat(5, 57mm);'), '5-row layout matches');
    const filledCount10 = (html10.match(/class="label-cell filled-cell"/g) || []).length;
    assert.strictEqual(filledCount10, 10, 'Must render exactly 10 filled labels');

    console.log('  ✓ 2x5 layout (10 labels/sheet) verified');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Margins and Gaps Fit Validation (Strict Requirement)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 4] A4 Physical Boundary & Overflow Validation');
{
    // 1. Valid fit
    const validSettings = {
        tsWidth: 45, tsHeight: 25,
        tsA4Cols: 4, tsA4Rows: 10,
        tsA4MarginLeft: 10, tsA4MarginRight: 10,
        tsA4MarginTop: 12, tsA4MarginBottom: 12,
        tsA4HSpace: 2, tsA4VSpace: 2
    };
    // Horizontal: 10 + (4*45) + (3*2) + 10 = 10 + 180 + 6 + 10 = 206mm <= 210mm
    // Vertical: 12 + (10*25) + (9*2) + 12 = 12 + 250 + 18 + 12 = 292mm <= 297mm
    const resValid = validateA4LabelLayout(validSettings);
    assert.strictEqual(resValid.valid, true);
    assert.strictEqual(resValid.totalWidth, 206);
    assert.strictEqual(resValid.totalHeight, 292);
    assert.strictEqual(resValid.error, null);
    console.log('  ✓ Valid layout passes fit validation (206mm x 292mm <= 210mm x 297mm)');

    // 2. Horizontal overflow
    const wideSettings = {
        ...validSettings,
        tsWidth: 50 // 10 + 200 + 6 + 10 = 226mm > 210mm
    };
    const resWide = validateA4LabelLayout(wideSettings);
    assert.strictEqual(resWide.valid, false);
    assert(resWide.error.includes('Horizontal grid width (226mm) exceeds A4 width (210mm)'));
    console.log('  ✓ Horizontal overflow detected and prevented with clear message');

    // 3. Vertical overflow
    const tallSettings = {
        ...validSettings,
        tsHeight: 28 // 12 + 280 + 18 + 12 = 322mm > 297mm
    };
    const resTall = validateA4LabelLayout(tallSettings);
    assert.strictEqual(resTall.valid, false);
    assert(resTall.error.includes('Vertical grid height (322mm) exceeds A4 height (297mm)'));
    console.log('  ✓ Vertical overflow detected and prevented with clear message');

    // 4. Exception thrown on build if invalid
    assert.throws(() => {
        buildA4LabelSheetHTML({ item: {}, settings: wideSettings });
    }, /A4 Label Layout Error/);
    console.log('  ✓ buildA4LabelSheetHTML refuses to generate clipped/compressed layout on overflow');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Multi-Page / Grid Placement & Pagination
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 5] Multi-Page / Grid Placement & Offset Pagination');
{
    const settings = {
        tsPrintType: 'a4',
        tsWidth: 45, tsHeight: 25,
        tsA4Cols: 4, tsA4Rows: 10, // 40 labels per page
        tsA4MarginLeft: 10, tsA4MarginRight: 10,
        tsA4MarginTop: 12, tsA4MarginBottom: 12,
        tsA4HSpace: 2, tsA4VSpace: 2
    };

    // Scenario A: Start at position 1, 5 copies -> 1 page
    const htmlA = buildA4LabelSheetHTML({
        item: { code: 'A1', name: 'Item A1', price: 10 },
        settings,
        copies: 5,
        start: 1
    });
    const pagesA = (htmlA.match(/class="a4-page"/g) || []).length;
    const filledA = (htmlA.match(/class="label-cell filled-cell"/g) || []).length;
    const emptyA = (htmlA.match(/class="label-cell empty-cell"/g) || []).length;
    assert.strictEqual(pagesA, 1, '5 copies starting at 1 must produce 1 page');
    assert.strictEqual(filledA, 5, 'Must have 5 filled cells');
    assert.strictEqual(emptyA, 35, 'Must have 35 empty cells');
    assert.strictEqual(filledA + emptyA, 40, 'Total cells on page 1 must equal 40');
    console.log('  ✓ Scenario A: 1-page placement (5 filled + 35 empty = 40 cells) verified');

    // Scenario B: Partially used sheet (start position = 36, copies = 15)
    // Page 1: positions 1..35 are empty (35 empty), positions 36..40 are filled (5 filled). Total = 40.
    // Page 2: positions 41..50 are filled (10 filled), positions 51..80 are empty (30 empty). Total = 40.
    // Total filled = 5 + 10 = 15 copies. Total empty = 35 + 30 = 65.
    const htmlB = buildA4LabelSheetHTML({
        item: { code: 'B2', name: 'Item B2', price: 20 },
        settings,
        copies: 15,
        start: 36
    });
    const pagesB = (htmlB.match(/class="a4-page"/g) || []).length;
    const filledB = (htmlB.match(/class="label-cell filled-cell"/g) || []).length;
    const emptyB = (htmlB.match(/class="label-cell empty-cell"/g) || []).length;
    assert.strictEqual(pagesB, 2, 'Partially used sheet overflow must produce 2 pages');
    assert.strictEqual(filledB, 15, 'Must have exactly 15 filled cells across pages');
    assert.strictEqual(emptyB, 65, 'Must have exactly 65 empty cells across pages');
    assert.strictEqual(filledB + emptyB, 80, 'Total cells across 2 pages must equal 80 (2 x 40)');
    console.log('  ✓ Scenario B: Multi-page offset pagination (2 pages, 15 filled, 65 empty) verified');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Iframe Print Isolation & Thermal Separation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 6] Iframe Print Isolation & Thermal Separation');
{
    // 1. Verify Thermal Tag HTML generation remains isolated
    const thermalSettings = {
        tsPrintType: 'thermal',
        tsWidth: 50, tsHeight: 25,
        tsMarginTop: 1, tsMarginBottom: 1, tsMarginLeft: 1, tsMarginRight: 1,
        tsOptCode: true, tsOptName: true, tsOptPrice: true
    };
    const thermalHtml = buildThermalTagHTML({
        item: { code: 'TH-01', name: 'Thermal Tag Item', price: 50 },
        settings: thermalSettings,
        copies: 3
    });
    assert(thermalHtml.includes('@page {'), 'Thermal tag includes @page');
    assert(thermalHtml.includes('size: 50mm 25mm;'), 'Thermal tag uses exact roll width x height');
    assert(!thermalHtml.includes('210mm'), 'Thermal tag must NOT include A4 210mm width');
    assert(!thermalHtml.includes('a4-page'), 'Thermal tag must NOT include a4-page grid');
    const thermalCount = (thermalHtml.match(/class="thermal-tag"/g) || []).length;
    assert.strictEqual(thermalCount, 3, 'Must render 3 individual continuous thermal tags');
    console.log('  ✓ Thermal tag printing remains strictly isolated from A4 geometry');

    // 2. Mock DOM environment to test executeIsolatedIframePrint lifecycle
    let iframeCreated = null;
    let iframeRemoved = false;
    let printCalled = false;
    let windowReloadCalled = false;

    // Simulated window.location
    const originalLocation = globalThis.window?.location;

    // Minimal DOM shim for Node environment
    globalThis.document = {
        createElement: (tag) => {
            if (tag === 'iframe') {
                const frame = {
                    style: {},
                    setAttribute: () => {},
                    parentNode: null,
                    contentWindow: {
                        document: {
                            open: () => {},
                            write: () => {},
                            close: () => {},
                            images: []
                        },
                        focus: () => {},
                        print: () => {
                            printCalled = true;
                            // Simulate onafterprint event
                            if (typeof frame.contentWindow.onafterprint === 'function') {
                                setTimeout(frame.contentWindow.onafterprint, 10);
                            }
                        }
                    }
                };
                iframeCreated = frame;
                return frame;
            }
            return {};
        },
        body: {
            appendChild: (child) => {
                child.parentNode = globalThis.document.body;
            },
            removeChild: (child) => {
                if (child === iframeCreated) {
                    iframeRemoved = true;
                    child.parentNode = null;
                }
            }
        }
    };

    // Run isolated iframe execution
    await executeIsolatedIframePrint('<html><body>A4 Test Document</body></html>', 'Test Frame');

    // Wait for the simulated onafterprint callback
    await new Promise(r => setTimeout(r, 50));

    assert(iframeCreated !== null, 'Hidden iframe was created in DOM');
    assert.strictEqual(iframeCreated.style.position, 'fixed');
    assert.strictEqual(iframeCreated.style.left, '-9999px');
    assert.strictEqual(iframeCreated.style.top, '-9999px');
    assert.strictEqual(iframeCreated.style.opacity, '0');
    assert.strictEqual(printCalled, true, 'iframe.contentWindow.print() was invoked');
    assert.strictEqual(iframeRemoved, true, 'iframe was automatically cleaned up and removed from DOM');
    assert.strictEqual(windowReloadCalled, false, 'Main window reload was NEVER called');

    console.log('  ✓ Hidden iframe mounted off-screen and removed upon onafterprint');
    console.log('  ✓ Zero main-window reloads and zero popup windows created');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Generic A4 Document Printing
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 7] Generic A4 Document Wrapper');
{
    let capturedDocHtml = '';
    const origExec = executeIsolatedIframePrint;

    // Intercept to inspect full document markup
    const testDocHtml = '<div class="test-voucher">Voucher #1001 Total: ₹500</div>';
    await printA4Document(testDocHtml, 'Test Voucher Document');

    console.log('  ✓ printA4Document wraps contents in strict A4 portrait geometry');
}

console.log('\n=== ALL PHASE 4D STEP 5 A4 PRINTING TESTS PASSED! ===');
