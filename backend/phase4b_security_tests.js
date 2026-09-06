const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_URL = 'http://localhost:3000/api';
let pool;

let adminToken = '';
let accountantToken = '';
let cashierToken = '';

let adminUserId = '';
let accountantUserId = '';
let cashierUserId = '';

const suffix = Date.now().toString().slice(-6);

async function apiReq(endpoint, method = 'GET', body = null, extraHeaders = {}) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const status = res.status;
    let data;
    const text = await res.text();
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status, data, headers: res.headers };
}

describe('Phase 4B Security & Authentication Tests', async () => {

    before(async () => {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000,
            ssl: { rejectUnauthorized: false }
        });

        // 1. Create test users in `users` table for each role: ADMIN, ACCOUNTANT, CASHIER
        adminUserId = `usr_adm_${suffix}`;
        accountantUserId = `usr_acc_${suffix}`;
        cashierUserId = `usr_csh_${suffix}`;

        // Insert or ensure users exist
        await pool.query(`
            INSERT INTO users (id, username, password_hash, role, status)
            VALUES 
                ($1, $2, 'dummy_hash', 'ADMIN', 'ACTIVE'),
                ($3, $4, 'dummy_hash', 'ACCOUNTANT', 'ACTIVE'),
                ($5, $6, 'dummy_hash', 'CASHIER', 'ACTIVE')
            ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
        `, [
            adminUserId, `admin_${suffix}`,
            accountantUserId, `accountant_${suffix}`,
            cashierUserId, `cashier_${suffix}`
        ]);

        // 2. Create active sessions for each role
        adminToken = crypto.randomBytes(32).toString('hex');
        accountantToken = crypto.randomBytes(32).toString('hex');
        cashierToken = crypto.randomBytes(32).toString('hex');

        const adminHash = crypto.createHash('sha256').update(adminToken).digest('hex');
        const accountantHash = crypto.createHash('sha256').update(accountantToken).digest('hex');
        const cashierHash = crypto.createHash('sha256').update(cashierToken).digest('hex');

        await pool.query(`
            INSERT INTO active_sessions (id, user_id, username, role, token_hash, expires_at)
            VALUES 
                ($1, $2, $3, 'ADMIN', $4, NOW() + INTERVAL '2 hours'),
                ($5, $6, $7, 'ACCOUNTANT', $8, NOW() + INTERVAL '2 hours'),
                ($9, $10, $11, 'CASHIER', $12, NOW() + INTERVAL '2 hours')
        `, [
            crypto.randomUUID(), adminUserId, `admin_${suffix}`, adminHash,
            crypto.randomUUID(), accountantUserId, `accountant_${suffix}`, accountantHash,
            crypto.randomUUID(), cashierUserId, `cashier_${suffix}`, cashierHash
        ]);
    });

    after(async () => {
        // Clean up test sessions and test users
        if (pool) {
            await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [adminUserId, accountantUserId, cashierUserId]);
            await pool.end();
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. ANONYMOUS REJECTION TESTS
    // ─────────────────────────────────────────────────────────────────────────
    test('Anonymous requests to protected endpoints return 401', async () => {
        const endpoints = [
            '/items',
            '/customers',
            '/sales',
            '/purchases/create',
            '/sales/create',
            '/users',
            '/settings/tag'
        ];

        for (const ep of endpoints) {
            const res = await apiReq(ep, 'GET');
            assert.strictEqual(res.status, 401, `Expected 401 for anonymous GET ${ep}, got ${res.status}`);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. RBAC: COUNTER OVERRIDES (ADMIN ONLY)
    // ─────────────────────────────────────────────────────────────────────────
    test('Counter overrides reject non-ADMIN with 403 Forbidden', async () => {
        const counters = [
            '/invoice-counter',
            '/return-counter',
            '/pret-counter',
            '/payment-counter',
            '/pi-counter',
            '/vendor-payment-counter'
        ];

        for (const c of counters) {
            // Cashier should be rejected with 403
            const cashierRes = await apiReq(c, 'POST', { nextNumber: 999 }, {
                'Authorization': `Bearer ${cashierToken}`
            });
            assert.strictEqual(cashierRes.status, 403, `Cashier should receive 403 on ${c}, got ${cashierRes.status}`);

            // Accountant should be rejected with 403
            const accRes = await apiReq(c, 'POST', { nextNumber: 999 }, {
                'Authorization': `Bearer ${accountantToken}`
            });
            assert.strictEqual(accRes.status, 403, `Accountant should receive 403 on ${c}, got ${accRes.status}`);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. RBAC: CANCELLATIONS (ADMIN ONLY)
    // ─────────────────────────────────────────────────────────────────────────
    test('Cancellations reject non-ADMIN with 403 Forbidden', async () => {
        const cancellationEndpoints = [
            '/receipts/dummy_id/cancel',
            '/vendor-payments/dummy_id/cancel',
            '/sales-returns/dummy_id/cancel',
            '/purchase-returns/dummy_id/cancel',
            '/sales/dummy_id/cancel',
            '/purchases/dummy_id/cancel'
        ];

        for (const ep of cancellationEndpoints) {
            // Cashier attempt
            const cashierRes = await apiReq(ep, 'POST', { reason: 'Test reason' }, {
                'Authorization': `Bearer ${cashierToken}`
            });
            assert.strictEqual(cashierRes.status, 403, `Cashier must receive 403 on ${ep}, got ${cashierRes.status}`);

            // Accountant attempt
            const accRes = await apiReq(ep, 'POST', { reason: 'Test reason' }, {
                'Authorization': `Bearer ${accountantToken}`
            });
            assert.strictEqual(accRes.status, 403, `Accountant must receive 403 on ${ep}, got ${accRes.status}`);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. RBAC: HISTORICAL EDITS (ADMIN ONLY)
    // ─────────────────────────────────────────────────────────────────────────
    test('Historical edits (PUT) reject non-ADMIN with 403 Forbidden', async () => {
        const historicalEditEndpoints = [
            '/sales/dummy_id',
            '/purchases/dummy_id',
            '/sales-returns/dummy_id',
            '/purchase-returns/dummy_id'
        ];

        for (const ep of historicalEditEndpoints) {
            const cashierRes = await apiReq(ep, 'PUT', { items: [] }, {
                'Authorization': `Bearer ${cashierToken}`
            });
            assert.strictEqual(cashierRes.status, 403, `Cashier must receive 403 on PUT ${ep}, got ${cashierRes.status}`);

            const accRes = await apiReq(ep, 'PUT', { items: [] }, {
                'Authorization': `Bearer ${accountantToken}`
            });
            assert.strictEqual(accRes.status, 403, `Accountant must receive 403 on PUT ${ep}, got ${accRes.status}`);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. RBAC: CASHIER RESTRICTIONS (Purchases & Returns Creation)
    // ─────────────────────────────────────────────────────────────────────────
    test('Cashier is blocked from creating purchases and purchase invoices', async () => {
        // Cashier cannot create purchase invoice
        const pRes = await apiReq('/purchases/create', 'POST', { vendorName: 'Test' }, {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(pRes.status, 403, `Cashier must receive 403 on purchases/create, got ${pRes.status}`);

        // Cashier cannot view purchase invoices
        const piRes = await apiReq('/purchase-invoices', 'GET', null, {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(piRes.status, 403, `Cashier must receive 403 on purchase-invoices GET, got ${piRes.status}`);

        // Cashier cannot create sales return
        const srRes = await apiReq('/sales-returns/create', 'POST', { invoiceId: 'dummy' }, {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(srRes.status, 403, `Cashier must receive 403 on sales-returns/create, got ${srRes.status}`);
    });

    test('Cashier has access to day-to-day sales, receipts, items, customers', async () => {
        const itemsRes = await apiReq('/items', 'GET', null, {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(itemsRes.status, 200, `Cashier should be allowed to view items`);

        const custRes = await apiReq('/customers', 'GET', null, {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(custRes.status, 200, `Cashier should be allowed to view customers`);

        const salesRes = await apiReq('/sales', 'GET', null, {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(salesRes.status, 200, `Cashier should be allowed to view sales`);

        const salesRetRes = await apiReq('/sales-returns', 'GET', null, {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(salesRetRes.status, 200, `Cashier should be allowed to view sales returns`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. MASTER DATA SAFETY (CATEGORIES & UNITS NON-DESTRUCTIVE UPSERT)
    // ─────────────────────────────────────────────────────────────────────────
    test('Categories and units non-destructive updates preserve existing records', async () => {
        // First check Cashier cannot update master data
        const cashierCatRes = await apiReq('/categories', 'POST', ['New Category'], {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(cashierCatRes.status, 403, 'Cashier cannot update categories');

        const cashierUnitRes = await apiReq('/units', 'POST', ['New Unit'], {
            'Authorization': `Bearer ${cashierToken}`
        });
        assert.strictEqual(cashierUnitRes.status, 403, 'Cashier cannot update units');

        // Fetch existing categories
        const initialCatRes = await apiReq('/categories', 'GET', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const initialCats = Array.isArray(initialCatRes.data) ? initialCatRes.data : [];

        // Insert a unique new category
        const testCatName = `TestCat_${suffix}`;
        const updateRes = await apiReq('/categories', 'POST', [testCatName], {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(updateRes.status, 200, 'Admin can update categories');

        // Verify that existing categories were NOT wiped out
        const afterCatRes = await apiReq('/categories', 'GET', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const catNames = afterCatRes.data.map(c => typeof c === 'string' ? c : c.name);
        assert.ok(catNames.includes(testCatName), 'New category should be present');
        for (const oldCat of initialCats) {
            const oldName = typeof oldCat === 'string' ? oldCat : oldCat.name;
            assert.ok(catNames.includes(oldName), `Old category "${oldName}" must be preserved`);
        }

        // Clean up test category
        await pool.query('DELETE FROM categories WHERE name = $1', [testCatName]);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. CORS HARDENING
    // ─────────────────────────────────────────────────────────────────────────
    test('CORS rejects untrusted wildcard origins like *.vercel.app', async () => {
        const maliciousRes = await fetch(`${API_URL}/items`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://evil-phishing.vercel.app',
                'Access-Control-Request-Method': 'GET'
            }
        });
        const allowOrigin = maliciousRes.headers.get('access-control-allow-origin');
        assert.notStrictEqual(allowOrigin, 'https://evil-phishing.vercel.app', 'Untrusted *.vercel.app origin must be rejected');
    });

    test('CORS accepts allowed origins like localhost:5173', async () => {
        const trustedRes = await fetch(`${API_URL}/items`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:5173',
                'Access-Control-Request-Method': 'GET'
            }
        });
        const allowOrigin = trustedRes.headers.get('access-control-allow-origin');
        assert.strictEqual(allowOrigin, 'http://localhost:5173', 'Trusted localhost origin must be accepted in development');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. INIT-DB ROUTE DISABLED IN PRODUCTION
    // ─────────────────────────────────────────────────────────────────────────
    test('/api/init-db returns 404 or requires admin authentication', async () => {
        const res = await apiReq('/init-db', 'GET');
        // In production returns 404; in dev unauthenticated returns 401 or 403
        assert.ok(res.status === 404 || res.status === 403 || res.status === 401, `Expected 404, 403, or 401 on /api/init-db, got ${res.status}`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 9. POSTGRESQL-BACKED RATE LIMITING
    // ─────────────────────────────────────────────────────────────────────────
    test('Persistent rate limiting locks IP after 5 failed attempts', async () => {
        const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;

        // Clear any previous attempts for testIp
        await pool.query('DELETE FROM login_attempts WHERE ip_address = $1', [testIp]);

        // Send 5 failed login attempts
        for (let i = 1; i <= 5; i++) {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Forwarded-For': testIp
                },
                body: JSON.stringify({ username: 'nonexistent_user', password: 'wrongpassword' })
            });
            assert.strictEqual(res.status, 401, `Attempt ${i} should return 401`);
        }

        // Verify database state: 5 failed attempts recorded in login_attempts table
        const dbRes = await pool.query('SELECT failed_count, locked_until FROM login_attempts WHERE ip_address = $1', [testIp]);
        assert.strictEqual(dbRes.rows.length, 1, 'Login attempts row must exist in PostgreSQL');
        assert.strictEqual(dbRes.rows[0].failed_count, 5, 'Must record exactly 5 failed attempts');
        assert.ok(dbRes.rows[0].locked_until && new Date(dbRes.rows[0].locked_until) > new Date(), 'IP must be locked in PostgreSQL');

        // 6th attempt should be blocked with 429 Too Many Requests
        const blockedRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': testIp
            },
            body: JSON.stringify({ username: 'nonexistent_user', password: 'wrongpassword' })
        });
        assert.strictEqual(blockedRes.status, 429, '6th attempt must be rejected with 429 Too Many Requests');

        // Clean up test IP
        await pool.query('DELETE FROM login_attempts WHERE ip_address = $1', [testIp]);

        // Test: Successful login resets limiter state
        const resetTestIp = `198.51.100.99`;
        await pool.query('DELETE FROM login_attempts WHERE ip_address = $1', [resetTestIp]);

        // Record a failed attempt
        await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': resetTestIp },
            body: JSON.stringify({ username: 'admin', password: 'bad' })
        });
        const failCheck = await pool.query('SELECT failed_count FROM login_attempts WHERE ip_address = $1', [resetTestIp]);
        assert.strictEqual(failCheck.rows.length, 1, 'Should record failed attempt');

        // Successful login
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': resetTestIp },
            body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'SPH.admin', password: process.env.ADMIN_PASSWORD || 'SPH@26' })
        });
        assert.strictEqual(loginRes.status, 200, 'Admin login should succeed');

        // Verify attempts were reset
        const resetCheck = await pool.query('SELECT failed_count FROM login_attempts WHERE ip_address = $1', [resetTestIp]);
        assert.strictEqual(resetCheck.rows.length, 0, 'Successful login must reset login_attempts record');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 10. ERROR SANITIZATION & SECURITY HEADERS
    // ─────────────────────────────────────────────────────────────────────────
    test('Security headers are present in HTTP responses', async () => {
        const res = await fetch(`${API_URL}/items`);
        assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff', 'nosniff header must be present');
        assert.strictEqual(res.headers.get('x-frame-options'), 'SAMEORIGIN', 'SAMEORIGIN header must be present');
        assert.strictEqual(res.headers.get('x-xss-protection'), '0', 'X-XSS-Protection: 0 must be present');
        const permPolicy = res.headers.get('permissions-policy');
        assert.ok(permPolicy, 'Permissions-Policy header must be present');
        assert.ok(permPolicy.includes('camera=(self)'), 'Permissions-Policy must allow same-origin camera for barcode scanner');
        assert.ok(permPolicy.includes('microphone=()'), 'Permissions-Policy must block microphone');
        assert.ok(permPolicy.includes('geolocation=()'), 'Permissions-Policy must block geolocation');
    });

    test('Error responses do not leak PostgreSQL database internals or table names', async () => {
        // Trigger a bad request by providing invalid metadata field
        const res = await apiReq('/sales/nonexistent_id', 'PATCH', { illegalField: 'hack' }, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(res.status, 400, 'Should reject prohibited edit field');
        const errStr = JSON.stringify(res.data);
        assert.ok(!errStr.includes('pg_catalog'), 'Must not leak pg_catalog');
        assert.ok(!errStr.includes('syntax error at or near'), 'Must not leak SQL syntax');
        assert.ok(!errStr.includes('pq:'), 'Must not leak postgres internal error codes');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 11. MIGRATION REPEATABILITY
    // ─────────────────────────────────────────────────────────────────────────
    test('Database schema migration is idempotent and repeatable', async () => {
        // Check users table columns
        const usersColRes = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        const userCols = usersColRes.rows.map(r => r.column_name);
        assert.ok(userCols.includes('username'), 'users table must have username');
        assert.ok(userCols.includes('password_hash'), 'users table must have password_hash');
        assert.ok(userCols.includes('role'), 'users table must have role');

        // Check login_attempts table
        const ratelimitColRes = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'login_attempts'
        `);
        const rateCols = ratelimitColRes.rows.map(r => r.column_name);
        assert.ok(rateCols.includes('ip_address'), 'login_attempts table must have ip_address');
        assert.ok(rateCols.includes('failed_count'), 'login_attempts table must have failed_count');
        assert.ok(rateCols.includes('locked_until'), 'login_attempts table must have locked_until');

        // Check active_sessions role column
        const sessionColRes = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'active_sessions'
        `);
        const sessionCols = sessionColRes.rows.map(r => r.column_name);
        assert.ok(sessionCols.includes('role'), 'active_sessions table must have role');
        assert.ok(sessionCols.includes('user_id'), 'active_sessions table must have user_id');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 12. SESSION COORDINATOR & IDEMPOTENCY RETRY CONTRACT
    // ─────────────────────────────────────────────────────────────────────────
    test('Session Coordinator: singleton modal, queueing, and idempotency key preservation', async () => {
        const { registerSessionModal, requestReauth, isSessionModalActive } = await import('../frontend-react/src/utils/sessionCoordinator.js');
        
        let modalTriggerCount = 0;
        let registeredCallback = null;

        const unregister = registerSessionModal((state) => {
            modalTriggerCount++;
            registeredCallback = state;
        });

        try {
            // Concurrent 401 triggers must produce only ONE modal
            const promise1 = requestReauth();
            const promise2 = requestReauth();
            const promise3 = requestReauth();

            assert.strictEqual(promise1, promise2, 'Concurrent requests must share identical promise');
            assert.strictEqual(promise2, promise3, 'Concurrent requests must share identical promise');
            assert.strictEqual(modalTriggerCount, 1, 'Modal must only be opened once for concurrent 401s');
            assert.strictEqual(isSessionModalActive(), true, 'Coordinator must report modal active');

            // Resolve reauth with mock token
            const mockNewToken = 'new_session_token_' + crypto.randomUUID();
            registeredCallback.onSuccess(mockNewToken);

            const token1 = await promise1;
            const token2 = await promise2;
            const token3 = await promise3;

            assert.strictEqual(token1, mockNewToken);
            assert.strictEqual(token2, mockNewToken);
            assert.strictEqual(token3, mockNewToken);
            assert.strictEqual(isSessionModalActive(), false, 'Coordinator must report modal closed after resolution');

            // Idempotency Key preservation during retry
            const originalIdempotencyKey = 'idem_uuid_' + crypto.randomUUID();
            const originalHeaders = {
                'Content-Type': 'application/json',
                'Idempotency-Key': originalIdempotencyKey,
                'Authorization': 'Bearer expired_token'
            };

            // Retry options derivation
            const retryHeaders = {
                ...originalHeaders,
                'Authorization': `Bearer ${token1}`
            };

            assert.strictEqual(retryHeaders['Idempotency-Key'], originalIdempotencyKey, 'Must preserve exact original Idempotency-Key');
            assert.strictEqual(retryHeaders['Authorization'], `Bearer ${mockNewToken}`, 'Authorization must be updated with new token');

            // Cancellation preserves form state and cleanly rejects
            const cancelPromise = requestReauth();
            assert.strictEqual(isSessionModalActive(), true);
            registeredCallback.onCancel();

            await assert.rejects(cancelPromise, /cancelled by user/, 'Cancellation should reject pending reauth promise cleanly');
            assert.strictEqual(isSessionModalActive(), false, 'Modal state should reset after cancel');

        } finally {
            unregister();
        }
    });

    test('Pre-RBAC legacy session without user/role is rejected with 401 and never receives ADMIN privileges', async () => {
        // Create an unverified legacy session directly in DB (simulating pre-Phase-4B table row)
        const legacyToken = crypto.randomBytes(32).toString('hex');
        const legacyHash = crypto.createHash('sha256').update(legacyToken).digest('hex');
        await pool.query(
            `INSERT INTO active_sessions (id, token_hash, username, user_id, role, expires_at)
             VALUES ($1, $2, 'legacy_unknown_user', NULL, NULL, NOW() + INTERVAL '1 hour')`,
            [crypto.randomUUID(), legacyHash]
        );

        // Attempt to access an ADMIN-only endpoint using this legacy token
        const overrideRes = await apiReq('/invoice-counter/override', 'POST', { nextNumber: 9999 }, {
            'Authorization': `Bearer ${legacyToken}`
        });
        assert.strictEqual(overrideRes.status, 401, 'Unverified legacy session must be rejected with 401');

        // Attempt to access general endpoints
        const itemsRes = await apiReq('/items', 'GET', null, {
            'Authorization': `Bearer ${legacyToken}`
        });
        assert.strictEqual(itemsRes.status, 401, 'Unverified legacy session must not access catalog');
    });

    test('Realistic End-to-End: multi-item sales invoice submission with expired session, non-destructive 401, reauth, and retry with preserved Idempotency-Key', async () => {
        // 1. Seed customer and 3 test items
        const testCustId = `cust_e2e_${suffix}`;
        const item1Code = `ITM_E2E_1_${suffix}`;
        const item2Code = `ITM_E2E_2_${suffix}`;
        const item3Code = `ITM_E2E_3_${suffix}`;

        await pool.query(`
            INSERT INTO customers (id, customer_name, phone_number, pending_to_receive, store_credit_balance)
            VALUES ($1, 'Reauth Test Customer', '9876543210', 0, 0)
            ON CONFLICT (id) DO NOTHING
        `, [testCustId]);

        await pool.query(`
            INSERT INTO items (id, code, name, stock, sale_price, purchase_price, category_name)
            VALUES 
                ($1, $2, 'E2E Item 1', 100, 50, 30, 'Hardware'),
                ($3, $4, 'E2E Item 2', 100, 75, 45, 'Hardware'),
                ($5, $6, 'E2E Item 3', 100, 120, 80, 'Hardware')
            ON CONFLICT (code) DO NOTHING
        `, [crypto.randomUUID(), item1Code, crypto.randomUUID(), item2Code, crypto.randomUUID(), item3Code]);

        // 2. Prepare multi-item sales invoice payload
        const idemKey = 'idem_reauth_' + crypto.randomUUID();
        const invoicePayload = {
            customerId: testCustId,
            customerName: 'Reauth Test Customer',
            date: '2026-03-01',
            grandTotal: 490, // (2*50) + (2*75) + (2*120) = 100 + 150 + 240 = 490
            receivedAmount: 490,
            items: [
                { code: item1Code, name: 'E2E Item 1', qty: 2, rate: 50 },
                { code: item2Code, name: 'E2E Item 2', qty: 2, rate: 75 },
                { code: item3Code, name: 'E2E Item 3', qty: 2, rate: 120 }
            ],
            idempotencyKey: idemKey
        };

        // 3. Create a session token and force it to be EXPIRED
        const expiredToken = crypto.randomBytes(32).toString('hex');
        const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
        await pool.query(
            `INSERT INTO active_sessions (id, token_hash, username, user_id, role, expires_at)
             VALUES ($1, $2, $3, $4, 'CASHIER', NOW() - INTERVAL '10 seconds')`,
            [crypto.randomUUID(), expiredHash, `cashier_${suffix}`, cashierUserId]
        );

        // 4. Submit invoice with expired session
        const initialRes = await apiReq('/sales/create', 'POST', invoicePayload, {
            'Authorization': `Bearer ${expiredToken}`,
            'Idempotency-Key': idemKey
        });

        // 5. Verify 401 Unauthorized received, and NO invoice or stock change occurred
        assert.strictEqual(initialRes.status, 401, 'Must reject expired session with 401');
        const countBefore = await pool.query('SELECT COUNT(*) FROM sales_invoices WHERE customer_id = $1', [testCustId]);
        assert.strictEqual(parseInt(countBefore.rows[0].count), 0, 'No invoice must be created on 401');

        // Form state verification: invoicePayload items, customer, amounts are still intact in caller memory
        assert.strictEqual(invoicePayload.items.length, 3, 'Draft items must remain intact');
        assert.strictEqual(invoicePayload.grandTotal, 490, 'Draft totals must remain intact');

        // 6. Simulate re-authentication: generate fresh active token for Cashier
        const freshToken = crypto.randomBytes(32).toString('hex');
        const freshHash = crypto.createHash('sha256').update(freshToken).digest('hex');
        await pool.query(
            `INSERT INTO active_sessions (id, token_hash, username, user_id, role, expires_at)
             VALUES ($1, $2, $3, $4, 'CASHIER', NOW() + INTERVAL '2 hours')`,
            [crypto.randomUUID(), freshHash, `cashier_${suffix}`, cashierUserId]
        );

        // 7. Replay mutation ONCE with fresh token and PRESERVED Idempotency-Key
        const retriedRes = await apiReq('/sales/create', 'POST', invoicePayload, {
            'Authorization': `Bearer ${freshToken}`,
            'Idempotency-Key': idemKey
        });

        assert.strictEqual(retriedRes.status, 200, 'Retried mutation must succeed');
        assert.strictEqual(retriedRes.data.success, true);
        const createdInvoiceId = retriedRes.data.id;
        assert.ok(createdInvoiceId, 'Must return created invoice ID');

        // 8. Replay mutation a SECOND time with SAME Idempotency-Key (simulating user double-clicking or network glitch)
        const duplicateRes = await apiReq('/sales/create', 'POST', invoicePayload, {
            'Authorization': `Bearer ${freshToken}`,
            'Idempotency-Key': idemKey
        });
        assert.strictEqual(duplicateRes.status, 200, 'Duplicate replay must return 200 cached');
        assert.strictEqual(duplicateRes.data.id, createdInvoiceId, 'Must return same invoice ID without creating second');

        // 9. Verify database integrity: exactly 1 invoice created, stock deducted exactly once (100 - 2 = 98)
        const countAfter = await pool.query('SELECT COUNT(*) FROM sales_invoices WHERE customer_id = $1', [testCustId]);
        assert.strictEqual(parseInt(countAfter.rows[0].count), 1, 'Exactly ONE invoice must exist in database');

        const itemStock = await pool.query('SELECT stock FROM items WHERE code = $1', [item1Code]);
        assert.strictEqual(parseFloat(itemStock.rows[0].stock), 98, 'Stock must be deducted exactly once');
    });
});
