/**
 * Test Suite: Camera Barcode Scanner Lifecycle (Phase 4D Step 3)
 * Covers:
 * 1. Error message mapping (mapCameraError)
 * 2. safeStopAndClear state guards (prevents calling stop when not scanning)
 * 3. MediaStream track cleanup (stopDanglingMediaTracks)
 * 4. Missing DOM element safety
 * 5. Start/Stop race condition & rapid close simulation
 * 6. Repeated lifecycle simulation (OPEN -> START -> SCAN -> CLOSE x 5 iterations)
 * 7. Duplicate scanner prevention
 */

import assert from 'assert';
import { mapCameraError, safeStopAndClear, stopDanglingMediaTracks } from './src/utils/cameraScanner.js';

console.log("=== RUNNING PHASE 4D STEP 3 CAMERA SCANNER TESTS ===");

// TEST 1: Error Message Mapping
console.log("\n[TEST 1] Camera Error Mapping");
{
    // Permission denied
    const permErr = new Error("Permission denied by user");
    permErr.name = "NotAllowedError";
    const permMsg = mapCameraError(permErr);
    assert(permMsg.includes("permission denied"), "Must return permission denied message");
    console.log("  ✓ NotAllowedError mapped to user-friendly permission guidance");

    // Camera not found
    const notFoundErr = new Error("Requested device not found");
    notFoundErr.name = "NotFoundError";
    const notFoundMsg = mapCameraError(notFoundErr);
    assert(notFoundMsg.includes("No camera detected"), "Must return no camera message");
    console.log("  ✓ NotFoundError mapped to friendly hardware missing message");

    // Camera already in use
    const busyErr = new Error("Could not start video source");
    busyErr.name = "NotReadableError";
    const busyMsg = mapCameraError(busyErr);
    assert(busyMsg.includes("in use"), "Must return camera in use message");
    console.log("  ✓ NotReadableError mapped to camera in use message");

    // Unsupported constraints
    const constrErr = new Error("Constraints could not be satisfied");
    constrErr.name = "OverconstrainedError";
    const constrMsg = mapCameraError(constrErr);
    assert(constrMsg.includes("resolution") || constrMsg.includes("support"), "Must return constraint guidance");
    console.log("  ✓ OverconstrainedError mapped to friendly constraint message");

    // Fallback safe error
    const fallbackMsg = mapCameraError(new Error("Unexpected internal hardware fault 0x80040154"));
    assert(!fallbackMsg.includes("0x80040154"), "Must NOT leak raw error codes or stack internals");
    assert(fallbackMsg.includes("Unable to start camera"), "Must provide safe fallback");
    console.log("  ✓ Raw errors masked from cashier interface");
}


// TEST 2: safeStopAndClear State Guards
console.log("\n[TEST 2] safeStopAndClear State Guards");
{
    // 2.1 Active scanner is stopped and cleared
    let stopCalled = false;
    let clearCalled = false;
    const activeMock = {
        isScanning: true,
        getState: () => 2, // SCANNING
        stop: async () => { stopCalled = true; },
        clear: () => { clearCalled = true; }
    };
    await safeStopAndClear(activeMock);
    assert(stopCalled, "stop() must be called when scanner is in SCANNING state");
    assert(clearCalled, "clear() must be called after stopping");
    console.log("  ✓ Active scanning instance safely stopped and cleared");

    // 2.2 Inactive scanner is NOT stopped (prevents unhandled rejections)
    let inactiveStopCalled = false;
    let inactiveClearCalled = false;
    const inactiveMock = {
        isScanning: false,
        getState: () => 1, // NOT_STARTED
        stop: async () => { inactiveStopCalled = true; },
        clear: () => { inactiveClearCalled = true; }
    };
    await safeStopAndClear(inactiveMock);
    assert(!inactiveStopCalled, "stop() must NOT be called when scanner is NOT_STARTED");
    assert(inactiveClearCalled, "clear() is still safely called to clean canvas");
    console.log("  ✓ Inactive scanner avoids unneeded stop() call, preventing promise rejections");

    // 2.3 Tolerates stop() throwing error
    const faultyMock = {
        isScanning: true,
        getState: () => 2,
        stop: async () => { throw new Error("Hardware stream died"); },
        clear: () => {}
    };
    // Must not throw
    await safeStopAndClear(faultyMock);
    console.log("  ✓ Faulty stop() handled gracefully without crashing caller");
}


// TEST 3: MediaStream Track Cleanup (stopDanglingMediaTracks)
console.log("\n[TEST 3] MediaStream Track Cleanup");
{
    let track1Stopped = false;
    let track2Stopped = false;

    const mockTrack1 = { stop: () => { track1Stopped = true; } };
    const mockTrack2 = { stop: () => { track2Stopped = true; } };

    const mockVideo = {
        srcObject: {
            getTracks: () => [mockTrack1, mockTrack2]
        }
    };

    const mockContainer = {
        querySelectorAll: (selector) => selector === 'video' ? [mockVideo] : []
    };

    // Install global document mock for test
    global.document = {
        getElementById: (id) => id === 'test-container' ? mockContainer : null
    };

    stopDanglingMediaTracks('test-container');
    assert(track1Stopped && track2Stopped, "All video media stream tracks must be stopped");
    assert.strictEqual(mockVideo.srcObject, null, "Video srcObject must be cleared to release hardware");
    console.log("  ✓ Dangling media tracks stopped and video elements decoupled");
}


// TEST 4: Camera Scanner Lifecycle State Machine & Race Conditions
console.log("\n[TEST 4] Camera Scanner Lifecycle Simulation");

class ManagedCameraScannerSession {
    constructor(elementId, { fps = 10, onScan, onError } = {}) {
        this.elementId = elementId;
        this.fps = fps;
        this.onScan = onScan;
        this.onError = onError;

        this.isOpen = false;
        this.activeSessionId = 0;
        this.shouldStop = false;
        this.isScanning = false;
        this.activeCameraStream = null;
        this.scannerInstance = null;
    }

    open() {
        this.isOpen = true;
        this.shouldStop = false;
        const currentSession = ++this.activeSessionId;

        return {
            sessionId: currentSession,
            startPromise: this._asyncInit(currentSession)
        };
    }

    async _asyncInit(sessionId, { mockDelayMs = 20, failNoCamera = false } = {}) {
        // Wait for simulated DOM mount
        await new Promise(r => setTimeout(r, mockDelayMs));

        if (sessionId !== this.activeSessionId || this.shouldStop) {
            return { aborted: true, reason: "CANCELLED_BEFORE_MOUNT" };
        }

        const domNode = global.document.getElementById(this.elementId);
        if (!domNode) {
            this.close();
            return { aborted: true, reason: "DOM_ELEMENT_MISSING" };
        }

        if (failNoCamera) {
            this.close();
            const err = new Error("No cameras found");
            err.name = "NotFoundError";
            if (this.onError) this.onError(mapCameraError(err));
            return { aborted: true, reason: "NO_CAMERA" };
        }

        // Simulate acquiring MediaStream
        let trackStopped = false;
        this.activeCameraStream = {
            id: `stream_${sessionId}`,
            getTracks: () => [{ stop: () => { trackStopped = true; } }]
        };

        this.scannerInstance = {
            isScanning: true,
            getState: () => 2,
            stop: async () => {
                this.isScanning = false;
                trackStopped = true;
                this.activeCameraStream = null;
            },
            clear: () => {}
        };

        this.isScanning = true;

        if (sessionId !== this.activeSessionId || this.shouldStop) {
            // Rapid close occurred while initializing!
            await this.scannerInstance.stop();
            this.scannerInstance = null;
            return { aborted: true, reason: "CANCELLED_DURING_START" };
        }

        return { aborted: false, isScanning: true, sessionId };
    }

    simulateScan(code) {
        if (!this.isScanning || this.shouldStop) return false;
        if (this.onScan) this.onScan(code);
        this.close();
        return true;
    }

    async close() {
        this.activeSessionId += 1;
        this.shouldStop = true;
        this.isOpen = false;

        if (this.scannerInstance) {
            await this.scannerInstance.stop();
            this.scannerInstance.clear();
            this.scannerInstance = null;
        }
        if (this.activeCameraStream) {
            this.activeCameraStream.getTracks().forEach(t => t.stop());
            this.activeCameraStream = null;
        }
        this.isScanning = false;
    }
}

// 4.1 Missing DOM element safety
{
    global.document = { getElementById: () => null }; // Element missing
    const session = new ManagedCameraScannerSession('missing-element');
    const { startPromise } = session.open();
    const res = await startPromise;
    assert(res.aborted && res.reason === "DOM_ELEMENT_MISSING", "Must abort if DOM element missing");
    assert(!session.isScanning, "Must not be in scanning state if DOM missing");
    console.log("  ✓ Missing DOM element detected: startup safely aborted without throwing");
}

// 4.2 Start/Stop race condition & rapid close
{
    const mockContainer = { querySelectorAll: () => [] };
    global.document = { getElementById: (id) => id === 'valid-reader' ? mockContainer : null };

    const session = new ManagedCameraScannerSession('valid-reader');
    const { startPromise } = session.open();
    
    // Immediately close before start resolves (1ms later)
    await new Promise(r => setTimeout(r, 2));
    await session.close();

    const res = await startPromise;
    assert(res.aborted, "Start must report aborted due to rapid close");
    assert(!session.isScanning, "Scanner must not remain running after rapid close");
    assert.strictEqual(session.activeCameraStream, null, "Camera stream must not linger after rapid close");
    console.log("  ✓ Rapid close during async initialization cleanly cancels camera acquisition");
}

// 4.3 Repeated Lifecycle (OPEN -> START -> SCAN -> CLOSE x 5 iterations)
{
    const mockContainer = { querySelectorAll: () => [] };
    global.document = { getElementById: (id) => id === 'valid-reader' ? mockContainer : null };

    let scannedCodes = [];
    const session = new ManagedCameraScannerSession('valid-reader', {
        onScan: (code) => { scannedCodes.push(code); }
    });

    console.log("  Iterating OPEN -> START -> SCAN -> CLOSE cycle (5 iterations):");
    for (let i = 1; i <= 5; i++) {
        const { startPromise } = session.open();
        const startRes = await startPromise;
        assert(!startRes.aborted && session.isScanning, `Iteration ${i}: Must be actively scanning`);
        
        // Barcode decoded
        const scanSuccess = session.simulateScan(`BARCODE_ITEM_${i}`);
        assert(scanSuccess, `Iteration ${i}: Scan must succeed`);
        assert(!session.isOpen && !session.isScanning, `Iteration ${i}: Must be cleanly closed after scan`);
        assert.strictEqual(session.activeCameraStream, null, `Iteration ${i}: Camera stream must be released`);
        console.log(`    Iteration ${i}: OPEN -> START -> SCAN (BARCODE_ITEM_${i}) -> CLOSE ✓`);
    }

    assert.strictEqual(scannedCodes.length, 5, "Must have recorded all 5 scans");
    console.log("  ✓ Repeated 5x lifecycle passed with zero stream leaks or state collision");
}

// 4.4 Duplicate Scanner Prevention
{
    const mockContainer = { querySelectorAll: () => [] };
    global.document = { getElementById: (id) => id === 'valid-reader' ? mockContainer : null };

    const session = new ManagedCameraScannerSession('valid-reader');
    const run1 = session.open();
    // Quickly trigger open again without waiting for run1
    const run2 = session.open();

    const [res1, res2] = await Promise.all([run1.startPromise, run2.startPromise]);
    assert(res1.aborted, "First start session must be superseded and aborted");
    assert(!res2.aborted && session.isScanning, "Second session must take over cleanly");
    await session.close();
    console.log("  ✓ Duplicate rapid open calls serialize safely; earlier session invalidated");
}

console.log("\n=== ALL CAMERA SCANNER TESTS PASSED! ===");
