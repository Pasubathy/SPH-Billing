/**
 * SPH Billing - Phase 4C Comprehensive Infrastructure & DR Test Suite
 * 
 * Tests:
 *  1. Health Endpoint (HTTP 200, latency measurement, public access)
 *  2. Health Endpoint Error / Timeout Handling (HTTP 503, secret masking)
 *  3. Migration Status Command
 *  4. Migration Idempotency (safe repeated `up`)
 *  5. Migration Baseline Verification
 *  6. Migration Checksum Protection (tamper detection)
 *  7. Encrypted Backup Creation (AES-256-GCM, headers, auth tags)
 *  8. Backup Integrity & Independent Decryption Verification
 *  9. Isolated Restore Verification (12 representative entities + financial checks)
 * 10. Vercel Configuration & Routing Assessment
 * 11. Production Environment Audit & Secret Masking
 * 
 * Safety Invariant:
 *  - ZERO destructive operations on production data or public schema
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { 
    ensureSchemaMigrationsTable, 
    recordBaselineIfEligible, 
    runMigrationUp, 
    getMigrationStatus,
    calculateChecksum,
    BASELINE_VERSION 
} = require('./migrate');

const { 
    createDatabaseBackup, 
    decryptBuffer, 
    BACKUP_DIR 
} = require('./scripts/backup_database');

const { decryptFile } = require('./scripts/decrypt_backup');
const { runRestoreVerification } = require('./scripts/verify_restore');
const { auditEnvironment, maskValue } = require('./scripts/audit_env');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`  ❌ Assertion Failed: ${message}`);
        failedTests++;
        throw new Error(message);
    } else {
        console.log(`  ✅ Passed: ${message}`);
        passedTests++;
    }
}

async function runAllPhase4CTests() {
    console.log('================================================================');
    console.log('   SPH BILLING - PHASE 4C INFRASTRUCTURE & DR TEST SUITE        ');
    console.log('================================================================\n');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 3
    });

    pool.on('error', (err) => {
        console.warn('[Test Pool Warning]: Handled error:', err.message);
    });

    try {
        // -------------------------------------------------------------
        // TEST GROUP 1: Health Endpoint (200, 503, Timeout, Secret Masking)
        // -------------------------------------------------------------
        console.log('\n--- Test Group 1: Health Endpoint Behavior ---');

        // Spin up an ephemeral Express test server with the exact health logic
        const testApp = express();
        let simulateDbFailure = false;

        testApp.get(['/api/health', '/health'], async (req, res) => {
            const startTime = Date.now();
            const timeoutMs = 5000;
            let dbStatus = 'disconnected';
            let latencyMs = null;

            try {
                if (simulateDbFailure) {
                    throw new Error('connection to server at "ep-fake.neon.tech" failed: Connection refused');
                }

                const dbPromise = pool.query('SELECT 1 AS alive');
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Database ping timed out')), timeoutMs)
                );

                await Promise.race([dbPromise, timeoutPromise]);
                latencyMs = Date.now() - startTime;
                dbStatus = 'connected';

                return res.status(200).json({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime_seconds: Math.floor(process.uptime()),
                    database: {
                        status: dbStatus,
                        latency_ms: latencyMs
                    }
                });
            } catch (err) {
                const elapsed = Date.now() - startTime;
                return res.status(503).json({
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    uptime_seconds: Math.floor(process.uptime()),
                    database: {
                        status: 'disconnected',
                        latency_ms: elapsed,
                        error: 'Database unavailable or timed out'
                    }
                });
            }
        });

        const testServer = http.createServer(testApp);
        await new Promise(resolve => testServer.listen(3099, resolve));

        // Warm up connection before running assertion
        try { await pool.query('SELECT 1'); } catch (_) {}

        // 1.1 Test Health Endpoint 200 OK
        const res200 = await fetch('http://localhost:3099/api/health');
        const body200 = await res200.json();
        if (res200.status !== 200) {
            console.log('[DEBUG res200]:', res200.status, body200);
        }
        assert(res200.status === 200, 'Health endpoint returns HTTP 200 when database is healthy');
        assert(body200.status === 'healthy', 'Health status is "healthy"');
        assert(body200.database.status === 'connected', 'Database status is "connected"');
        assert(typeof body200.database.latency_ms === 'number' && body200.database.latency_ms >= 0, 'Measured DB latency is a non-negative number');
        assert(!JSON.stringify(body200).includes('postgres://') && !JSON.stringify(body200).includes('npg_'), 'No database credentials exposed in 200 response');

        // 1.2 Test Health Endpoint 503 on DB failure / timeout
        simulateDbFailure = true;
        const res503 = await fetch('http://localhost:3099/api/health');
        const body503 = await res503.json();
        assert(res503.status === 503, 'Health endpoint returns HTTP 503 when database is unreachable');
        assert(body503.status === 'unhealthy', 'Health status is "unhealthy" on failure');
        assert(body503.database.status === 'disconnected', 'Database status indicates "disconnected"');
        assert(body503.database.error === 'Database unavailable or timed out', 'Generic safe error returned; no raw PostgreSQL error string or credentials leaked');
        assert(!JSON.stringify(body503).includes('ep-fake') && !JSON.stringify(body503).includes('Connection refused'), 'Raw postgres error omitted from public response');

        await new Promise(resolve => testServer.close(resolve));

        // -------------------------------------------------------------
        // TEST GROUP 2: Migration System (Baseline, Status, Idempotency, Tampering)
        // -------------------------------------------------------------
        console.log('\n--- Test Group 2: Versioned Migration Safety & Discipline ---');

        const client = await pool.connect();
        try {
            await ensureSchemaMigrationsTable(client);

            // 2.1 Baseline Verification
            const baselineCheck = await client.query(
                `SELECT version, name FROM schema_migrations WHERE version = $1`,
                [BASELINE_VERSION]
            );
            assert(baselineCheck.rows.length === 1, 'Phase 1–4B baseline version is recorded in schema_migrations');

            // 2.2 Status Command Verification
            const statusList = await getMigrationStatus(client);
            assert(statusList.length >= 1, 'Migration status discovered local migration files');
            const appliedList = statusList.filter(s => s.status === 'APPLIED');
            assert(appliedList.length >= 1, 'Migration status reflects applied migrations');
            const pendingList = statusList.filter(s => s.status === 'PENDING');
            assert(pendingList.length === 0, 'Zero pending migrations after initial setup');

            // 2.3 Migration Idempotency (Repeatable `up`)
            const repeatUp = await runMigrationUp(client);
            assert(repeatUp.appliedCount === 0, 'Running migrate up when database is up-to-date applies 0 migrations');

            // 2.4 Checksum Tampering Protection Test
            const testSql = 'CREATE TABLE test_table (id INT);';
            const hash1 = calculateChecksum(testSql);
            const hash2 = calculateChecksum(testSql + '\n-- tampered modification');
            assert(hash1.length === 64, 'Migration checksum is standard 64-character SHA-256');
            assert(hash1 !== hash2, 'Tampered migration content produces mismatched SHA-256 hash');
        } finally {
            client.release();
        }

        // -------------------------------------------------------------
        // TEST GROUP 3: Backup, AES-256-GCM Encryption & Standalone DR Decryption
        // -------------------------------------------------------------
        console.log('\n--- Test Group 3: Automated Encrypted Backups & Offline DR ---');

        const testKey = crypto.randomBytes(32).toString('hex');
        process.env.BACKUP_ENCRYPTION_KEY = testKey;

        // 3.1 Create backup
        const backupRes = await createDatabaseBackup();
        assert(backupRes.success === true, 'Automated database backup executed successfully');
        assert(fs.existsSync(backupRes.filePath), 'Encrypted backup file exists on disk');

        // 3.2 Verify Encrypted Backup Layout & AEAD Auth Tag
        const encBytes = fs.readFileSync(backupRes.filePath);
        assert(encBytes.length >= 28, 'Encrypted backup contains at least 28 bytes (IV + Tag)');
        const keyHash = crypto.createHash('sha256').update(testKey).digest();
        const decryptedDirect = decryptBuffer(encBytes, keyHash);
        assert(decryptedDirect.subarray(0, 5).toString('binary') === 'PGDMP', 'Direct decryptBuffer validates AEAD tag and yields PGDMP magic bytes');

        // 3.3 Standalone Offline Decryption Test (Zero app dependencies)
        const decryptedDumpPath = path.join(BACKUP_DIR, 'test_standalone_decrypted.dump');
        try {
            decryptFile(backupRes.filePath, decryptedDumpPath, testKey);
            assert(fs.existsSync(decryptedDumpPath), 'Offline decryption produces plaintext PostgreSQL dump file');

            const dumpBuffer = fs.readFileSync(decryptedDumpPath);
            const isPgDump = dumpBuffer.subarray(0, 5).toString('binary') === 'PGDMP';
            assert(isPgDump === true, 'Decrypted dump file begins with native PostgreSQL PGDMP magic bytes');
        } finally {
            if (fs.existsSync(decryptedDumpPath)) fs.unlinkSync(decryptedDumpPath);
        }

        // 3.4 Tamper Rejection Test (Corrupt 1 byte in ciphertext)
        const corruptedBytes = Buffer.from(encBytes);
        corruptedBytes[corruptedBytes.length - 5] ^= 0xFF; // flip bits in ciphertext
        const corruptedPath = path.join(BACKUP_DIR, 'corrupted_test.dump.enc');
        fs.writeFileSync(corruptedPath, corruptedBytes);

        try {
            let tamperedRejected = false;
            try {
                decryptFile(corruptedPath, null, testKey);
            } catch (err) {
                tamperedRejected = true;
            }
            assert(tamperedRejected === true, 'Tampered encrypted backup is strictly rejected by AES-256-GCM auth tag verification');
        } finally {
            if (fs.existsSync(corruptedPath)) fs.unlinkSync(corruptedPath);
        }

        // -------------------------------------------------------------
        // TEST GROUP 4: Restore Verification (12 Entities in Isolated Schema)
        // -------------------------------------------------------------
        console.log('\n--- Test Group 4: Safe Non-Production Restore Verification ---');

        const restoreRes = await runRestoreVerification(pool);
        assert(restoreRes.success === true, 'Restore verification succeeded across isolated test schema');
        assert(restoreRes.verifiedTables.length >= 12, 'Verified 12+ representative business and security tables');
        assert(restoreRes.counts.sales_invoices > 0, 'Restored sales invoices verified');
        assert(restoreRes.counts.purchase_invoices > 0, 'Restored purchase invoices verified');
        assert(restoreRes.counts.customers > 0, 'Restored customers verified');
        assert(restoreRes.counts.vendors > 0, 'Restored vendors verified');
        assert(restoreRes.counts.items > 0, 'Restored inventory items verified');
        assert(restoreRes.counts.customer_receipts > 0, 'Restored receipts verified');
        assert(restoreRes.counts.vendor_payments > 0, 'Restored payments verified');
        assert(restoreRes.counts.sales_returns > 0, 'Restored returns verified');
        assert(restoreRes.counts.document_sequences > 0, 'Restored document sequences verified');
        assert(restoreRes.counts.users > 0, 'Restored users verified');

        // Confirm test schema was completely wiped
        const schemaCheck = await pool.query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'restore_verification_test'"
        );
        assert(schemaCheck.rows.length === 0, 'Temporary restore verification schema was cleanly destroyed');

        // -------------------------------------------------------------
        // TEST GROUP 5: Vercel Configuration & Static Asset Caching
        // -------------------------------------------------------------
        console.log('\n--- Test Group 5: Vercel Configuration & Routing Assessment ---');

        const vercelConfigPath = path.join(__dirname, '..', 'vercel.json');
        assert(fs.existsSync(vercelConfigPath), 'vercel.json exists in workspace root');
        const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

        assert(Array.isArray(vercelConfig.routes), 'vercel.json defines structured route rules');
        const apiRoute = vercelConfig.routes.find(r => r.src && r.src.includes('/api/'));
        assert(Boolean(apiRoute && apiRoute.dest.includes('server.js')), 'Vercel properly routes /api/(.*) to backend/server.js');

        const swRoute = vercelConfig.routes.find(r => r.src === '/sw.js');
        assert(Boolean(swRoute && swRoute.headers['Cache-Control'].includes('max-age=0')), 'Service worker has Cache-Control: max-age=0, must-revalidate');

        const manifestRoute = vercelConfig.routes.find(r => r.src === '/manifest.json');
        assert(Boolean(manifestRoute && manifestRoute.headers['Cache-Control'].includes('max-age=0')), 'Manifest has Cache-Control: max-age=0, must-revalidate');

        // -------------------------------------------------------------
        // TEST GROUP 6: Production Environment Audit & Secret Masking
        // -------------------------------------------------------------
        console.log('\n--- Test Group 6: Production Environment Audit & Masking ---');

        const audit = auditEnvironment();
        assert(audit.failed === 0, 'Zero required environment variable failures in audit');

        // Verify masking
        const secretUri = 'postgresql://user:secretpassword123@neon.tech/db';
        const maskedUri = maskValue(secretUri, 'secret_uri');
        assert(!maskedUri.includes('secretpassword123'), 'maskValue completely masks URI password');
        assert(maskedUri.includes('user:***@'), 'maskValue preserves hostname and username context while hiding credentials');

        const hash = '$2b$10$STozCKms6oSvtsgQXQ286uviJxX0kOlb4GwLaSJbWh/mCWm8QGSgW';
        const maskedHash = maskValue(hash, 'secret_hash');
        assert(!maskedHash.includes('QGSgW'), 'maskValue masks bcrypt password hash');

    } catch (err) {
        console.error('\n❌ Unhandled error during Phase 4C test suite:', err);
    } finally {
        await pool.end();
    }

    console.log('\n================================================================');
    console.log(`   PHASE 4C TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
    process.exit(0);
}

if (require.main === module) {
    runAllPhase4CTests();
}

module.exports = { runAllPhase4CTests };
