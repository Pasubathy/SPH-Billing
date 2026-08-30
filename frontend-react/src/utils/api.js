/**
 * Unified Secure API Client for SPH Billing
 * - Automatically injects Authorization Bearer tokens
 * - Standardizes relative API URL resolution
 * - Handles 401 Unauthorized session expirations gracefully
 */

export async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('sph_auth_token') || localStorage.getItem('token');
    
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

        if (response.status === 401 && !targetUrl.includes('/api/auth/login')) {
            // Token expired or invalid
            localStorage.removeItem('sph_auth_token');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        return response;
    } catch (err) {
        console.error(`API Fetch Error [${targetUrl}]:`, err);
        throw err;
    }
}

export default apiFetch;
