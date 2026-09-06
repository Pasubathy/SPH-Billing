/**
 * Test Suite: USB Keyboard-Wedge Barcode Scanner Input Handling
 * Covers:
 * 1. findItemByBarcode (exact match, case insensitivity, barcode vs code, missing)
 * 2. handleSearchInputKeyDown (exact match adds item & clears query, prevents default, partial match preservation, unknown code error toast)
 * 3. Scanner timing / keyboard wedge simulation (rapid input detection <= 45ms vs human typing >= 80ms)
 * 4. Focus safety simulation (non-search inputs protected, pre-scan value preserved)
 */

import assert from 'assert';
import { findItemByBarcode, handleSearchInputKeyDown } from './src/utils/barcodeScanner.js';

console.log("=== RUNNING PHASE 4D STEP 2 BARCODE SCANNER TESTS ===");

const sampleItems = [
    { id: 1, code: 'ITEM001', barcode: '8901234567890', name: 'Tata Salt 1kg', sellingPrice: 28 },
    { id: 2, code: 'ITEM002', barcode: '8909876543210', name: 'Aashirvaad Atta 5kg', sellingPrice: 275 },
    { id: 3, code: 'PARLE-G', barcode: '8901030000010', name: 'Parle-G Biscuit 100g', sellingPrice: 10 },
    { id: 4, code: '1004', barcode: '', name: 'Loose Rice Ponni 1kg', sellingPrice: 60 }
];

// TEST 1: findItemByBarcode
console.log("\n[TEST 1] Item Barcode / Code Lookup");

// 1.1 Match by code
const itemByCode = findItemByBarcode(sampleItems, 'ITEM001');
assert(itemByCode && itemByCode.name === 'Tata Salt 1kg', 'Failed to match item by code');
console.log("  ✓ Matched item by exact code 'ITEM001'");

// 1.2 Case insensitive code
const itemByCaseCode = findItemByBarcode(sampleItems, 'item001');
assert(itemByCaseCode && itemByCaseCode.name === 'Tata Salt 1kg', 'Failed case-insensitive match');
console.log("  ✓ Case-insensitive code match 'item001'");

// 1.3 Match by barcode
const itemByBarcode = findItemByBarcode(sampleItems, '8909876543210');
assert(itemByBarcode && itemByBarcode.name === 'Aashirvaad Atta 5kg', 'Failed to match item by barcode');
console.log("  ✓ Matched item by exact barcode '8909876543210'");

// 1.4 Trimmed match
const itemTrimmed = findItemByBarcode(sampleItems, '  8901030000010 \n');
assert(itemTrimmed && itemTrimmed.code === 'PARLE-G', 'Failed trimmed match');
console.log("  ✓ Trimmed whitespace around barcode '  8901030000010 \\n'");

// 1.5 Non-existent barcode
const itemNotFound = findItemByBarcode(sampleItems, '9999999999999');
assert(itemNotFound === null, 'Should return null for non-existent barcode');
console.log("  ✓ Non-existent barcode returns null");

// 1.6 Empty/null inputs
assert(findItemByBarcode(sampleItems, '') === null, 'Empty barcode must return null');
assert(findItemByBarcode(sampleItems, null) === null, 'Null barcode must return null');
assert(findItemByBarcode(null, 'ITEM001') === null, 'Null items list must return null');
console.log("  ✓ Safe null/empty argument handling");


// TEST 2: handleSearchInputKeyDown
console.log("\n[TEST 2] Search Input Enter Handling");

// 2.1 Exact match on Enter adds item & clears query
{
    let addedCode = null;
    let searchCleared = false;
    let toastMessage = null;
    let defaultPrevented = false;
    let propagationStopped = false;

    const mockEvent = {
        key: 'Enter',
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => { propagationStopped = true; }
    };

    handleSearchInputKeyDown(
        mockEvent,
        '8901234567890',
        (code) => { addedCode = code; },
        sampleItems,
        () => { searchCleared = true; },
        (msg, type) => { toastMessage = { msg, type }; }
    );

    assert(defaultPrevented, 'Enter must call preventDefault() to stop form submission');
    assert(propagationStopped, 'Enter must call stopPropagation()');
    assert.strictEqual(addedCode, 'ITEM001', 'Must pass matched item code to onScanItem');
    assert(searchCleared, 'Must clear search input after successful match');
    assert(toastMessage && toastMessage.type === 'success', 'Must display success toast');
    console.log("  ✓ Enter with exact barcode adds item, clears search, and prevents form submission");
}

// 2.2 Partial match on Enter preserves search query for manual selection
{
    let addedCode = null;
    let searchCleared = false;
    let toastMessage = null;
    let defaultPrevented = false;

    const mockEvent = {
        key: 'Enter',
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => {}
    };

    handleSearchInputKeyDown(
        mockEvent,
        'Tata', // Partial match with 'Tata Salt 1kg', but not exact code/barcode
        (code) => { addedCode = code; },
        sampleItems,
        () => { searchCleared = true; },
        (msg, type) => { toastMessage = { msg, type }; }
    );

    assert(defaultPrevented, 'Must preventDefault to avoid unwanted form submission');
    assert.strictEqual(addedCode, null, 'Partial match must not auto-add item');
    assert(!searchCleared, 'Search query must NOT be cleared on partial match');
    console.log("  ✓ Enter with partial text preserves search results without auto-adding");
}

// 2.3 Unknown barcode on Enter shows error toast without submitting
{
    let addedCode = null;
    let searchCleared = false;
    let toastMessage = null;
    let defaultPrevented = false;

    const mockEvent = {
        key: 'Enter',
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => {}
    };

    handleSearchInputKeyDown(
        mockEvent,
        'UNKNOWN_BARCODE_XYZ',
        (code) => { addedCode = code; },
        sampleItems,
        () => { searchCleared = true; },
        (msg, type) => { toastMessage = { msg, type }; }
    );

    assert(defaultPrevented, 'Must preventDefault on unknown code');
    assert.strictEqual(addedCode, null, 'Must not add any item on unknown code');
    assert(!searchCleared, 'Must not clear search query on unknown code');
    assert(toastMessage && toastMessage.type === 'error', 'Must display error toast for unknown code');
    console.log("  ✓ Enter with unknown code displays error toast and does not submit form");
}

// 2.4 Other keys (e.g. typing characters) are ignored by handleSearchInputKeyDown
{
    let addedCode = null;
    let defaultPrevented = false;

    const mockEvent = {
        key: 'a',
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => {}
    };

    handleSearchInputKeyDown(
        mockEvent,
        '8901234567890',
        (code) => { addedCode = code; },
        sampleItems,
        () => {},
        () => {}
    );

    assert(!defaultPrevented, 'Non-Enter keys must not be prevented');
    assert.strictEqual(addedCode, null, 'Non-Enter keys must not trigger scan action');
    console.log("  ✓ Non-Enter keys (typing) pass through unaffected");
}


// TEST 3: Scanner Timing & Wedge Buffer Logic Simulation
console.log("\n[TEST 3] Scanner Wedge Detection State Machine");

class MockScannerWedgeSimulator {
    constructor({ maxIntervalMs = 45, minBarcodeLength = 3, onScanItem, allItems }) {
        this.maxIntervalMs = maxIntervalMs;
        this.minBarcodeLength = minBarcodeLength;
        this.onScanItem = onScanItem;
        this.allItems = allItems;
        this.buffer = '';
        this.lastKeyTime = 0;
        this.isScanning = false;
        this.corruptedTarget = null;
        this.preScanValue = '';
    }

    resetBuffer() {
        this.buffer = '';
        this.lastKeyTime = 0;
        this.isScanning = false;
        this.corruptedTarget = null;
        this.preScanValue = '';
    }

    handleEvent(e, timestamp) {
        if (e.ctrlKey || e.altKey || e.metaKey) {
            this.resetBuffer();
            return { handled: false, scannerDetected: false };
        }

        const now = timestamp;
        const interval = now - this.lastKeyTime;
        const target = e.target;
        const isSearchInput = target && target.dataset && target.dataset.barcodeSearch === 'true';
        const isEditableInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

        if (e.key === 'Enter') {
            if (this.isScanning && this.buffer.length >= this.minBarcodeLength) {
                e.preventDefault();
                e.stopPropagation();

                const scannedCode = this.buffer.trim();
                if (this.corruptedTarget && this.corruptedTarget !== target && isEditableInput && !isSearchInput) {
                    target.value = this.preScanValue;
                }

                this.resetBuffer();
                const matched = findItemByBarcode(this.allItems, scannedCode);
                if (matched && this.onScanItem) {
                    this.onScanItem(matched.code);
                }
                return { handled: true, scannerDetected: true, barcode: scannedCode, matched: !!matched };
            }
            this.resetBuffer();
            return { handled: false, scannerDetected: false };
        }

        if (e.key && e.key.length === 1) {
            if (interval <= this.maxIntervalMs) {
                this.buffer += e.key;
                if (this.buffer.length >= 2) {
                    this.isScanning = true;
                    if (isEditableInput && !isSearchInput) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!this.corruptedTarget && target) {
                            this.corruptedTarget = target;
                            if (this.preScanValue !== undefined) {
                                target.value = this.preScanValue;
                            }
                        }
                    }
                }
            } else {
                this.buffer = e.key;
                this.isScanning = false;
                this.corruptedTarget = null;
                if (isEditableInput && !isSearchInput) {
                    this.preScanValue = target.value;
                } else {
                    this.preScanValue = '';
                }
            }
            this.lastKeyTime = now;
            return { handled: this.isScanning, scannerDetected: this.isScanning };
        }

        if (e.key !== 'Shift') {
            this.resetBuffer();
        }
        return { handled: false, scannerDetected: false };
    }
}

// 3.1 Fast input (< 45ms per char) detected as scanner burst
{
    let scannedItemCode = null;
    const sim = new MockScannerWedgeSimulator({
        maxIntervalMs: 45,
        minBarcodeLength: 3,
        allItems: sampleItems,
        onScanItem: (code) => { scannedItemCode = code; }
    });

    const barcode = '8901234567890';
    let time = 1000;
    for (let i = 0; i < barcode.length; i++) {
        const char = barcode[i];
        sim.handleEvent({
            key: char,
            target: { tagName: 'BODY', dataset: {} },
            preventDefault: () => {},
            stopPropagation: () => {}
        }, time);
        time += 20; // 20ms inter-character latency (typical USB scanner)
    }

    // Terminating Enter
    let defaultPrevented = false;
    const enterRes = sim.handleEvent({
        key: 'Enter',
        target: { tagName: 'BODY', dataset: {} },
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => {}
    }, time + 20);

    assert(enterRes.scannerDetected, 'Fast burst followed by Enter must be detected as scanner');
    assert(defaultPrevented, 'Scanner terminating Enter must be prevented from submitting form');
    assert.strictEqual(scannedItemCode, 'ITEM001', 'Scanner burst must resolve to ITEM001');
    console.log("  ✓ Rapid keystroke burst (20ms) detected as scanner and routed to cart");
}

// 3.2 Human typing (> 80ms per char) NOT detected as scanner
{
    let scannedItemCode = null;
    const sim = new MockScannerWedgeSimulator({
        maxIntervalMs: 45,
        minBarcodeLength: 3,
        allItems: sampleItems,
        onScanItem: (code) => { scannedItemCode = code; }
    });

    const humanText = 'ITEM001';
    let time = 1000;
    let anyHandled = false;
    for (let i = 0; i < humanText.length; i++) {
        const char = humanText[i];
        const res = sim.handleEvent({
            key: char,
            target: { tagName: 'INPUT', value: humanText.slice(0, i), dataset: { barcodeSearch: 'false' } },
            preventDefault: () => {},
            stopPropagation: () => {}
        }, time);
        if (res.scannerDetected) anyHandled = true;
        time += 120; // 120ms inter-keystroke interval (normal human typing)
    }

    let defaultPrevented = false;
    const enterRes = sim.handleEvent({
        key: 'Enter',
        target: { tagName: 'INPUT', value: humanText, dataset: { barcodeSearch: 'false' } },
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => {}
    }, time + 120);

    assert(!anyHandled, 'Human typing (>80ms) must NOT trigger scanner detection');
    assert(!enterRes.scannerDetected, 'Human Enter must NOT be treated as scanner burst');
    assert(!defaultPrevented, 'Human Enter on non-search input must NOT have default prevented');
    assert.strictEqual(scannedItemCode, null, 'Human typing must not trigger onScanItem');
    console.log("  ✓ Human typing (120ms) correctly ignored without hijacking Enter or input");
}

// 3.3 Focus safety: non-search editable input (e.g. quantity input) protected during scan
{
    let scannedItemCode = null;
    const sim = new MockScannerWedgeSimulator({
        maxIntervalMs: 45,
        minBarcodeLength: 3,
        allItems: sampleItems,
        onScanItem: (code) => { scannedItemCode = code; }
    });

    const qtyInput = {
        tagName: 'INPUT',
        value: '5', // Pre-scan value is 5
        dataset: { barcodeSearch: 'false' }
    };

    const barcode = '8901234567890';
    let time = 1000;
    let preventedCount = 0;

    for (let i = 0; i < barcode.length; i++) {
        const char = barcode[i];
        sim.handleEvent({
            key: char,
            target: qtyInput,
            preventDefault: () => { preventedCount++; },
            stopPropagation: () => {}
        }, time);
        time += 15; // 15ms USB scanner speed
    }

    sim.handleEvent({
        key: 'Enter',
        target: qtyInput,
        preventDefault: () => {},
        stopPropagation: () => {}
    }, time + 15);

    assert(preventedCount >= barcode.length - 1, 'Keystrokes after character 1 must be prevented on non-search input');
    assert.strictEqual(qtyInput.value, '5', 'Quantity input value must be preserved as 5 without barcode digits');
    assert.strictEqual(scannedItemCode, 'ITEM001', 'Item must be scanned successfully despite focus in quantity field');
    console.log("  ✓ Focus safety: quantity field preserved at original value '5', burst prevented");
}

console.log("\n=== ALL BARCODE SCANNER TESTS PASSED! ===");
