/**
 * Unified Secure API Client for SPH Billing
 * - Automatically injects Authorization Bearer tokens
 * - Standardizes relative API URL resolution
 * - Handles 401 Unauthorized session expirations gracefully
 */

export async function apiFetch(url, options = {}) {
    const rawToken = localStorage.getItem('sph_auth_token');
    const token = (rawToken && rawToken !== 'null' && rawToken !== 'undefined') ? rawToken.trim() : null;
    
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    // Ensure relative URL if absolute http://localhost:3000 was passed
    const targetUrl = url.startsWith('http://localhost:3000') ? url.replace('http://localhost:3000', '') : url;

    try {
        const response = await fetch(targetUrl, {
            ...options,
            headers
        });

        // Note: 401 session expiration and safe in-place retry are handled globally by window.fetch
        return response;
    } catch (err) {
        console.error(`API Fetch Error [${targetUrl}]:`, err);
        throw err;
    }
}

export default apiFetch;
