import { requestReauth } from './utils/sessionCoordinator';

// Global fetch interceptor to attach Authorization token to all backend API calls
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    // If this request is an explicit re-auth attempt from SessionExpiredModal, bypass interceptor
    if (options._isReauthLogin) {
        return await originalFetch(url, options);
    }

    const rawToken = localStorage.getItem('sph_auth_token');
    const token = (rawToken && rawToken !== 'null' && rawToken !== 'undefined') ? rawToken.trim() : null;
    
    // Normalize headers object
    const headers = { ...(options.headers || {}) };

    // Clean up any accidental "Bearer null" or "Bearer undefined"
    if (headers['Authorization'] === 'Bearer null' || headers['Authorization'] === 'Bearer undefined' || headers['Authorization'] === 'Bearer ') {
        delete headers['Authorization'];
    }

    // Inject canonical auth token if it exists and request is to backend api
    if (token && url.toString().includes('/api/') && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const requestOptions = { ...options, headers };
    const response = await originalFetch(url, requestOptions);
    
    // Handle 401 Unauthorized session expirations gracefully WITHOUT destructive redirects
    if (response.status === 401 && !url.toString().includes('/api/auth/login') && !options._isRetry) {
        try {
            // Trigger singleton reauth modal and await user credentials
            const newToken = await requestReauth();
            if (newToken) {
                // Retry the exact failed mutation ONCE preserving the exact original Idempotency-Key
                const retryHeaders = {
                    ...headers,
                    'Authorization': `Bearer ${newToken}`
                };
                return await originalFetch(url, {
                    ...options,
                    headers: retryHeaders,
                    _isRetry: true
                });
            }
        } catch (authErr) {
            console.warn('Session re-authentication failed or cancelled; preserving active state.', authErr);
            // Return original 401 without redirecting, keeping invoice component mounted
            return response;
        }
    }
    
    return response;
};

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register Service Worker for PWA capabilities
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered with scope:', registration.scope);

        // Auto update check
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version available! Reload to update.');
              }
            };
          }
        };
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker registration failed:', error);
      });
  });
}

