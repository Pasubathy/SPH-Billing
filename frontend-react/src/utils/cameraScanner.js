import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Maps raw browser / hardware / permission errors to clear, cashier-friendly messages.
 * Never exposes raw internal errors, promise rejections, or stack traces.
 *
 * @param {Error|string} err - Caught error
 * @returns {string} Clean user-friendly message
 */
export function mapCameraError(err) {
    if (!err) return "Unable to access camera.";
    const errStr = (err.name || err.message || String(err)).toLowerCase();

    if (errStr.includes('notallowederror') || errStr.includes('permission denied')) {
        return "Camera permission denied. Please allow camera access in browser settings.";
    }
    if (errStr.includes('notfounderror') || errStr.includes('no cameras') || errStr.includes('no_cameras_found')) {
        return "No camera detected on this device.";
    }
    if (errStr.includes('notreadableerror') || errStr.includes('in use') || errStr.includes('source unavailable') || errStr.includes('trackstart')) {
        return "Camera is in use by another application or browser tab.";
    }
    if (errStr.includes('overconstrainederror')) {
        return "Camera does not support the requested resolution or orientation.";
    }
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.mediaDevices) {
        return "Camera scanning is not supported in this browser or over an insecure connection (HTTP).";
    }
    return "Unable to start camera. Please verify device camera and try again.";
}

/**
 * Forcefully stops any dangling MediaStreamTracks on video elements inside the target container.
 * This guarantees the camera hardware LED turns off even if Html5Qrcode unmounted abruptly.
 *
 * @param {string} elementId - ID of the container element
 */
export function stopDanglingMediaTracks(elementId) {
    if (!elementId || typeof document === 'undefined') return;
    try {
        const container = document.getElementById(elementId);
        if (!container) return;

        const videoElements = container.querySelectorAll('video');
        videoElements.forEach(video => {
            if (video.srcObject && typeof video.srcObject.getTracks === 'function') {
                video.srcObject.getTracks().forEach(track => {
                    try {
                        track.stop();
                    } catch (e) {}
                });
                video.srcObject = null;
            }
        });
    } catch (err) {
        // Safe silent cleanup
    }
}

/**
 * Safely stops and clears an Html5Qrcode instance.
 * Checks instance state to ensure stop() is not blindly called when not scanning,
 * preventing unhandled promise rejections.
 *
 * @param {Html5Qrcode|null} scannerInstance - Html5Qrcode instance
 * @param {string} [elementId] - Optional container element ID for track cleanup
 */
export async function safeStopAndClear(scannerInstance, elementId) {
    if (!scannerInstance) {
        if (elementId) stopDanglingMediaTracks(elementId);
        return;
    }

    try {
        // Html5QrcodeScannerState: 1 = NOT_STARTED, 2 = SCANNING, 3 = PAUSED
        const state = typeof scannerInstance.getState === 'function'
            ? scannerInstance.getState()
            : (scannerInstance.isScanning ? 2 : 1);

        if (state === 2 || state === 3 || scannerInstance.isScanning) {
            await scannerInstance.stop();
        }
    } catch (err) {
        // Ignore "Cannot stop, scanner is not running" or abort errors
        console.warn("[safeStopAndClear] stop notice:", err?.message || err);
    }

    try {
        scannerInstance.clear();
    } catch (err) {
        console.warn("[safeStopAndClear] clear notice:", err?.message || err);
    }

    if (elementId) {
        stopDanglingMediaTracks(elementId);
    }
}

/**
 * React hook managing the complete lifecycle of an Html5Qrcode camera barcode scanner.
 *
 * Guarantees:
 * 1. Camera stream is stopped and tracks released when scanner closes or component unmounts.
 * 2. Start/stop race conditions are handled safely via session IDs and abort flags.
 * 3. Asynchronous start cannot proceed against a detached/missing DOM element.
 * 4. Repeated OPEN -> START -> SCAN -> CLOSE cycles (5+ times) leave 0 orphaned streams or errors.
 * 5. Camera hardware errors (denied permission, device not found, busy) are mapped to user-friendly toasts.
 *
 * @param {Object} options
 * @param {string} options.elementId - DOM ID of the container element
 * @param {Function} options.onScan - Callback when a barcode is successfully decoded
 * @param {Function} [options.showToast] - Optional toast notification function
 * @param {number} [options.fps=10] - Frames per second
 * @param {Object} [options.qrbox={ width: 250, height: 250 }] - QR box dimensions
 * @returns {{ isScannerOpen: boolean, startScanner: Function, stopScanner: Function }}
 */
export function useCameraScanner({
    elementId,
    onScan,
    showToast,
    fps = 10,
    qrbox = { width: 250, height: 250 }
}) {
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const scannerRef = useRef(null);
    const isStartingRef = useRef(false);
    const shouldStopRef = useRef(false);
    const activeSessionIdRef = useRef(0);

    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;

    const notifyError = useCallback((msg) => {
        if (showToastRef.current) {
            showToastRef.current(msg, 'error');
        } else if (typeof alert === 'function') {
            alert(msg);
        }
    }, []);

    const startScanner = useCallback(() => {
        shouldStopRef.current = false;
        setIsScannerOpen(true);
    }, []);

    const stopScanner = useCallback(async () => {
        // Invalidate active session and signal abort
        activeSessionIdRef.current += 1;
        shouldStopRef.current = true;
        setIsScannerOpen(false);

        if (scannerRef.current) {
            const scanner = scannerRef.current;
            scannerRef.current = null;
            await safeStopAndClear(scanner, elementId);
        } else {
            stopDanglingMediaTracks(elementId);
        }
    }, [elementId]);

    // Handle component unmount / navigation
    useEffect(() => {
        return () => {
            activeSessionIdRef.current += 1;
            shouldStopRef.current = true;
            if (scannerRef.current) {
                const scanner = scannerRef.current;
                scannerRef.current = null;
                safeStopAndClear(scanner, elementId);
            }
            stopDanglingMediaTracks(elementId);
        };
    }, [elementId]);

    // Handle modal open -> lifecycle initialization
    useEffect(() => {
        if (!isScannerOpen) return;

        const currentSessionId = ++activeSessionIdRef.current;
        shouldStopRef.current = false;
        isStartingRef.current = true;

        let timeoutId = null;

        const initScanner = async () => {
            // Wait briefly for React to mount the modal container into the DOM
            await new Promise(resolve => {
                timeoutId = setTimeout(resolve, 120);
            });

            // Check if closed while waiting for DOM
            if (currentSessionId !== activeSessionIdRef.current || shouldStopRef.current) {
                isStartingRef.current = false;
                return;
            }

            const domElement = document.getElementById(elementId);
            if (!domElement) {
                console.warn(`[useCameraScanner] Target DOM element #${elementId} not found.`);
                isStartingRef.current = false;
                stopScanner();
                return;
            }

            // Ensure any stale instance on this element is fully cleared
            if (scannerRef.current) {
                await safeStopAndClear(scannerRef.current, elementId);
                scannerRef.current = null;
            }

            if (currentSessionId !== activeSessionIdRef.current || shouldStopRef.current) {
                isStartingRef.current = false;
                return;
            }

            try {
                if (typeof navigator !== 'undefined' && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
                    throw new Error("MEDIA_DEVICES_NOT_SUPPORTED");
                }

                const scanner = new Html5Qrcode(elementId);
                scannerRef.current = scanner;

                const devices = await Html5Qrcode.getCameras();
                if (!devices || devices.length === 0) {
                    throw new Error("NO_CAMERAS_FOUND");
                }

                let cameraId = devices[0].id;
                const backCamera = devices.find(d => 
                    d.label && (d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'))
                );
                if (backCamera) {
                    cameraId = backCamera.id;
                }

                // Check abort before start
                if (currentSessionId !== activeSessionIdRef.current || shouldStopRef.current) {
                    await safeStopAndClear(scanner, elementId);
                    scannerRef.current = null;
                    isStartingRef.current = false;
                    return;
                }

                await scanner.start(
                    cameraId,
                    { fps, qrbox },
                    (decodedText) => {
                        const clean = (decodedText || '').trim();
                        if (clean && onScanRef.current) {
                            onScanRef.current(clean);
                        }
                        stopScanner();
                    },
                    () => {
                        // Frame scan failure is expected when no barcode is in frame
                    }
                );

                // Check abort after start resolves
                if (currentSessionId !== activeSessionIdRef.current || shouldStopRef.current) {
                    await safeStopAndClear(scanner, elementId);
                    scannerRef.current = null;
                    isStartingRef.current = false;
                } else {
                    isStartingRef.current = false;
                }
            } catch (err) {
                if (currentSessionId === activeSessionIdRef.current && !shouldStopRef.current) {
                    const userMsg = mapCameraError(err);
                    notifyError(userMsg);
                    stopScanner();
                }
                isStartingRef.current = false;
            }
        };

        initScanner();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [isScannerOpen, elementId, fps, qrbox, stopScanner, notifyError]);

    return {
        isScannerOpen,
        startScanner,
        stopScanner
    };
}
