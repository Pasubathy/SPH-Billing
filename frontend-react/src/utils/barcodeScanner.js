import { useEffect, useRef } from 'react';

/**
 * Finds an item in allItems by matching its code or barcode.
 * Matching is trimmed and case-insensitive.
 *
 * @param {Array<Object>} allItems - Array of inventory items
 * @param {string} barcode - Scanned barcode or item code
 * @returns {Object|null} The matching item or null
 */
export function findItemByBarcode(allItems, barcode) {
    if (!barcode || !Array.isArray(allItems)) return null;
    const clean = String(barcode).trim().toLowerCase();
    if (!clean) return null;

    return allItems.find(i => {
        if (!i) return false;
        if (i.code !== undefined && i.code !== null && String(i.code).trim().toLowerCase() === clean) {
            return true;
        }
        if (i.barcode !== undefined && i.barcode !== null && String(i.barcode).trim().toLowerCase() === clean) {
            return true;
        }
        return false;
    }) || null;
}

/**
 * Handles Enter keydown events on search inputs.
 * If the query exactly matches an item barcode/code, it adds the item and clears the search input.
 * If no exact match exists, it prevents unwanted form submission while preserving manual search results.
 *
 * @param {KeyboardEvent} e - React keyboard event
 * @param {string} query - Current search query text
 * @param {Function} onScanItem - Callback with matched item code
 * @param {Array<Object>} allItems - Array of inventory items
 * @param {Function} onClearSearch - Callback to clear search input state
 * @param {Function} [showToast] - Optional toast notification function
 */
export function handleSearchInputKeyDown(e, query, onScanItem, allItems, onClearSearch, showToast) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();

        const cleanQuery = (query || '').trim();
        if (!cleanQuery) return;

        const matchedItem = findItemByBarcode(allItems, cleanQuery);
        if (matchedItem) {
            if (onScanItem) onScanItem(matchedItem.code);
            if (onClearSearch) onClearSearch();
            if (showToast) showToast(`Added: ${matchedItem.name}`, 'success');
        } else {
            // Check if there are partial matches by name
            const hasPartialMatch = Array.isArray(allItems) && allItems.some(i => 
                (i.name && i.name.toLowerCase().includes(cleanQuery.toLowerCase())) ||
                (i.code && String(i.code).toLowerCase().includes(cleanQuery.toLowerCase()))
            );
            if (!hasPartialMatch && showToast) {
                showToast(`Item not found for code: "${cleanQuery}"`, 'error');
            }
        }
    }
}

/**
 * React hook that implements a global USB keyboard-wedge barcode scanner buffer.
 *
 * Requirements:
 * 1. Rapid sequence detection (< 45ms per character) distinguishes scanner bursts from human typing.
 * 2. Focus safety: if a non-search editable input (e.g. quantity or rate) has focus during scan,
 *    subsequent keystrokes are prevented and any leaked initial character is reverted.
 * 3. Normal human typing in customer/input fields is untouched (inter-keystroke times > 80ms).
 * 4. System shortcuts (Ctrl/Alt/Meta) and normal Enter presses are never hijacked.
 * 5. Terminating Enter routes the scanned barcode to item lookup and cart addition.
 *
 * @param {Object} options
 * @param {Array<Object>} options.allItems - Item catalog
 * @param {Function} options.onScanItem - Callback with item code
 * @param {Function} [options.showToast] - Toast notification function
 * @param {boolean} [options.enabled=true] - Whether scanner listener is active
 * @param {number} [options.maxIntervalMs=45] - Maximum inter-character latency for scanner wedge
 * @param {number} [options.minBarcodeLength=3] - Minimum length of valid barcode
 */
export function useBarcodeScanner({
    allItems,
    onScanItem,
    showToast,
    enabled = true,
    maxIntervalMs = 45,
    minBarcodeLength = 3
}) {
    const onScanItemRef = useRef(onScanItem);
    onScanItemRef.current = onScanItem;

    const allItemsRef = useRef(allItems);
    allItemsRef.current = allItems;

    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let buffer = '';
        let lastKeyTime = 0;
        let isScanning = false;
        let corruptedTarget = null;
        let preScanValue = '';
        let lastScannedBarcode = '';
        let lastScanTimestamp = 0;

        const resetBuffer = () => {
            buffer = '';
            lastKeyTime = 0;
            isScanning = false;
            corruptedTarget = null;
            preScanValue = '';
        };

        const handleKeyDown = (e) => {
            // Ignore modifier key combinations (Ctrl+C, Alt+Tab, Cmd+R, etc.)
            if (e.ctrlKey || e.altKey || e.metaKey) {
                resetBuffer();
                return;
            }

            const now = Date.now();
            const interval = now - lastKeyTime;
            const target = e.target;
            const isSearchInput = target && (
                target.classList?.contains('billing-search-input') || 
                target.getAttribute?.('data-barcode-search') === 'true'
            );
            const isEditableInput = target && (
                (target.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio'].includes(target.type)) ||
                target.tagName === 'TEXTAREA'
            );

            // Handle Terminating Enter from scanner
            if (e.key === 'Enter') {
                if (isScanning && buffer.length >= minBarcodeLength) {
                    // Valid scanner burst ending in Enter
                    e.preventDefault();
                    e.stopPropagation();

                    const scannedCode = buffer.trim();

                    // Focus safety: restore any non-search input that was momentarily modified
                    if (corruptedTarget && corruptedTarget !== target && isEditableInput && !isSearchInput) {
                        try {
                            target.value = preScanValue;
                            target.dispatchEvent(new Event('input', { bubbles: true }));
                        } catch (err) {}
                    }

                    resetBuffer();

                    // Debounce duplicate events within 150ms
                    if (scannedCode === lastScannedBarcode && (now - lastScanTimestamp < 150)) {
                        return;
                    }
                    lastScannedBarcode = scannedCode;
                    lastScanTimestamp = now;

                    const matchedItem = findItemByBarcode(allItemsRef.current, scannedCode);
                    if (matchedItem) {
                        if (onScanItemRef.current) {
                            onScanItemRef.current(matchedItem.code);
                        }
                        if (showToastRef.current) {
                            showToastRef.current(`Scanned: ${matchedItem.name}`, 'success');
                        }
                    } else {
                        if (showToastRef.current) {
                            showToastRef.current(`Barcode not recognized: "${scannedCode}"`, 'error');
                        }
                    }
                    return;
                }

                // Ordinary human Enter press — do not hijack
                resetBuffer();
                return;
            }

            // Single printable character keystroke
            if (e.key && e.key.length === 1) {
                if (interval <= maxIntervalMs) {
                    // Rapid sequential keypresses characteristic of USB barcode wedges
                    buffer += e.key;

                    if (buffer.length >= 2) {
                        isScanning = true;

                        // Focus safety: prevent barcode characters from polluting non-search inputs
                        if (isEditableInput && !isSearchInput) {
                            e.preventDefault();
                            e.stopPropagation();

                            // Revert the initial character if target value was altered
                            if (!corruptedTarget && target) {
                                corruptedTarget = target;
                                if (preScanValue !== undefined && target.value !== preScanValue) {
                                    target.value = preScanValue;
                                    try {
                                        target.dispatchEvent(new Event('input', { bubbles: true }));
                                    } catch (err) {}
                                }
                            }
                        }
                    }
                } else {
                    // Interval > maxIntervalMs => Normal typing speed or start of a new potential burst
                    buffer = e.key;
                    isScanning = false;
                    corruptedTarget = null;
                    if (isEditableInput && !isSearchInput) {
                        preScanValue = target.value;
                    } else {
                        preScanValue = '';
                    }
                }

                lastKeyTime = now;
            } else {
                // Non-printable keys: Shift is allowed (for symbols in barcodes), others reset buffer
                if (e.key !== 'Shift') {
                    resetBuffer();
                }
            }
        };

        // Attach with useCapture=true so scanner bursts are intercepted before element handlers
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [enabled, maxIntervalMs, minBarcodeLength]);
}
