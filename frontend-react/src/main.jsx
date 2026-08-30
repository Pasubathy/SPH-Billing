// Global fetch interceptor to attach Authorization token to all backend API calls
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    const token = localStorage.getItem('sph_auth_token');
    // Inject auth token if it exists and request is to backend api
    if (token && url.toString().includes('/api/')) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    const response = await originalFetch(url, options);
    
    // Redirect to login if token is expired/invalid (401 Unauthorized)
    if (response.status === 401 && !url.toString().includes('/api/auth/login')) {
        localStorage.removeItem('sph_auth_token');
        window.location.href = '/login';
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

