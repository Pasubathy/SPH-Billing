/**
 * Session Coordinator for SPH Billing (Phase 4B)
 * - Singleton session-expired modal management
 * - Queueing for concurrent 401 requests
 * - Safe in-place re-authentication without component unmounting or state loss
 */

let modalListener = null;
let pendingAuthPromise = null;
let isModalOpen = false;

/**
 * Register the global modal listener (called by SessionExpiredModal on mount)
 */
export function registerSessionModal(listener) {
    modalListener = listener;
    return () => {
        if (modalListener === listener) {
            modalListener = null;
        }
    };
}

/**
 * Request re-authentication when a 401 response is intercepted.
 * Guarantees that only ONE modal opens even if 10 concurrent requests return 401 simultaneously.
 */
export function requestReauth() {
    if (pendingAuthPromise) {
        return pendingAuthPromise;
    }

    pendingAuthPromise = new Promise((resolve, reject) => {
        isModalOpen = true;
        if (modalListener) {
            modalListener({
                isOpen: true,
                onSuccess: (newToken) => {
                    isModalOpen = false;
                    pendingAuthPromise = null;
                    if (modalListener) modalListener({ isOpen: false });
                    resolve(newToken);
                },
                onCancel: () => {
                    isModalOpen = false;
                    pendingAuthPromise = null;
                    if (modalListener) modalListener({ isOpen: false });
                    reject(new Error('Re-authentication was cancelled by user'));
                }
            });
        } else {
            isModalOpen = false;
            pendingAuthPromise = null;
            reject(new Error('Session modal listener not registered'));
        }
    });

    return pendingAuthPromise;
}

export function isSessionModalActive() {
    return isModalOpen;
}
