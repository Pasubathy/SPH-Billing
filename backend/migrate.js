/**
 * SPH Billing - Unified Versioned Database Migration Engine (Phase 4C)
 * 
 * Model:
 *   EXISTING DATABASE -> BASELINE (verifies Phase 1-4B schema) -> FUTURE MIGRATIONS
 * 
 * Guarantees:
 *   - Strictly transactional migrations
 *   - SHA-256 Checksum validation for tamper detection
 *   - Never recreates, drops, or alters existing financial tables during baseline
 *   - Never prints passwords, hashes, or connection strings
 *   - CLI commands: 'up', 'status', 'baseline'
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Required Phase 1-4B tables that must exist for baseline verification
const REQUIRED_BASELINE_TABLES = [
    'store',
    'items',
    'customers',
    'vendors',
    'sales_invoices',
    'purchase_invoices',
    'customer_receipts',
    'customer_receipt_allocations',
    'vendor_payments',
    'vendor_payment_allocations',
    'sales_returns',
    'purchase_returns',
    'document_sequences',
    'idempotency_keys',
    'users',
    'login_attempts',
    'active_sessions'
];

// Critical business and financial columns required in baseline
const REQUIRED_CRITICAL_COLUMNS = [
    { table: 'sales_invoices', column: 'invoice_no' },
    { table: 'sales_invoices', column: 'amount' },
    { table: 'sales_invoices', column: 'paid_amount' },
    { table: 'sales_invoices', column: 'pending_to_receive' },
    { table: 'sales_invoices', column: 'returned_amount' },
    { table: 'sales_returns', column: 'return_no' },
    { table: 'sales_returns', column: 'invoice_id' },
    { table: 'sales_returns', column: 'grand_total' },
    { table: 'purchase_invoices', column: 'pi_no' },
    { table: 'purchase_invoices', column: 'vendor_id' },
    { table: 'customer_receipts', column: 'receipt_no' },
    { table: 'customer_receipt_allocations', column: 'allocated_amount' },
    { table: 'users', column: 'role' },
    { table: 'users', column: 'password_hash' },
    { table: 'active_sessions', column: 'token_hash' },
    { table: 'document_sequences', column: 'current_number' }
];

// Required primary keys on core tables
const REQUIRED_PRIMARY_KEY_TABLES = [
    'customers', 'vendors', 'items', 'sales_invoices', 'purchase_invoices', 'users'
];

// Required unique constraints
const REQUIRED_UNIQUE_CONSTRAINTS = [
    { table: 'sales_invoices', column: 'invoice_no' },
    { table: 'purchase_invoices', column: 'pi_no' },
    { table: 'users', column: 'username' }
];

const BASELINE_VERSION = '20260306_000_baseline_phase4b';
const BASELINE_NAME = 'Phase 1 to Phase 4B Baseline Schema';
const BASELINE_CHECKSUM = 'baseline_verified';

function getPool(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
        throw new Error('FATAL: DATABASE_URL is not configured.');
    }
    return new Pool({
        connectionString,
        ssl: (process.env.NODE_ENV === 'production' || connectionString.includes('neon.tech'))
            ? { rejectUnauthorized: false }
            : false
    });
}

function calculateChecksum(content) {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Ensures schema_migrations tracking table exists.
 */
async function ensureSchemaMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            version VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            checksum VARCHAR(64) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            execution_time_ms INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
    `);
}

/**
 * Deep structural inspection of existing database schema:
 * Validates tables, critical columns, primary keys, and unique constraints.
 */
async function verifySchemaInvariants(client) {
    // 1. Table existence
    const tableQuery = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const existingTables = new Set(tableQuery.rows.map(r => r.table_name.toLowerCase()));
    const missingTables = REQUIRED_BASELINE_TABLES.filter(t => !existingTables.has(t.toLowerCase()));

    // 2. Critical columns
    const colQuery = await client.query(`
        SELECT table_name, column_name FROM information_schema.columns 
        WHERE table_schema = 'public'
    `);
    const existingCols = new Set(colQuery.rows.map(r => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`));
    const missingCols = REQUIRED_CRITICAL_COLUMNS.filter(c => !existingCols.has(`${c.table.toLowerCase()}.${c.column.toLowerCase()}`));

    // 3. Primary keys
    const pkQuery = await client.query(`
        SELECT tc.table_name FROM information_schema.table_constraints tc 
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
    `);
    const existingPks = new Set(pkQuery.rows.map(r => r.table_name.toLowerCase()));
    const missingPks = REQUIRED_PRIMARY_KEY_TABLES.filter(t => !existingPks.has(t.toLowerCase()));

    // 4. Unique constraints
    const uqQuery = await client.query(`
        SELECT tc.table_name, kcu.column_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name 
        WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    `);
    const existingUqs = new Set(uqQuery.rows.map(r => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`));
    const missingUqs = REQUIRED_UNIQUE_CONSTRAINTS.filter(u => !existingUqs.has(`${u.table.toLowerCase()}.${u.column.toLowerCase()}`));

    const isValid = missingTables.length === 0 && missingCols.length === 0 && missingPks.length === 0 && missingUqs.length === 0;
    return {
        isValid,
        missingTables,
        missingCols,
        missingPks,
        missingUqs
    };
}

/**
 * Inspects existing database schema.
 * If all Phase 1-4B tables, critical columns, PKs and constraints exist, records the baseline safely
 * WITHOUT modifying any tables, recreating schemas, or dropping financial data.
 */
async function recordBaselineIfEligible(client) {
    await ensureSchemaMigrationsTable(client);

    // Check if baseline already recorded
    const existingRes = await client.query(
        'SELECT version, applied_at FROM schema_migrations WHERE version = $1',
        [BASELINE_VERSION]
    );
    if (existingRes.rows.length > 0) {
        return { baselined: false, message: 'Baseline already recorded', record: existingRes.rows[0] };
    }

    // Inspect actual database schema deeply for required structures
    const invariants = await verifySchemaInvariants(client);

    if (invariants.isValid) {
        // All Phase 1-4B tables, columns, PKs and constraints verified! Record baseline safely.
        await client.query(`
            INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
            VALUES ($1, $2, $3, NOW(), 0)
            ON CONFLICT (version) DO NOTHING
        `, [BASELINE_VERSION, BASELINE_NAME, BASELINE_CHECKSUM]);

        return { baselined: true, message: 'Verified Phase 1-4B schema (tables, critical columns, PKs, constraints) and safely recorded baseline version.' };
    } else {
        const errors = [];
        if (invariants.missingTables.length > 0) errors.push(`tables: ${invariants.missingTables.join(', ')}`);
        if (invariants.missingCols.length > 0) errors.push(`columns: ${invariants.missingCols.map(c => `${c.table}.${c.column}`).join(', ')}`);
        if (invariants.missingPks.length > 0) errors.push(`PKs: ${invariants.missingPks.join(', ')}`);
        if (invariants.missingUqs.length > 0) errors.push(`unique: ${invariants.missingUqs.map(u => `${u.table}.${u.column}`).join(', ')}`);
        return {
            baselined: false,
            message: `Cannot record baseline: missing structural invariants -> ${errors.join(' | ')}`
        };
    }
}

/**
 * Discovers migration files in migrations directory, sorted by version name.
 */
function getMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        return [];
    }
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort()
        .map(file => {
            const match = file.match(/^(\d{8}_\d{3}|\d{3,})_(.+)\.sql$/);
            const version = match ? match[1] : path.basename(file, '.sql');
            const name = match ? match[2] : path.basename(file, '.sql');
            const fullPath = path.join(MIGRATIONS_DIR, file);
            const content = fs.readFileSync(fullPath, 'utf8');
            const checksum = calculateChecksum(content);
            return { file, version, name, fullPath, content, checksum };
        });
}

async function acquireClient(poolOrClient) {
    if (poolOrClient.release && typeof poolOrClient.release === 'function') {
        return { client: poolOrClient, shouldRelease: false };
    }
    const client = await poolOrClient.connect();
    return { client, shouldRelease: true };
}

/**
 * Queries migration status (applied vs pending) and validates checksums.
 */
async function getMigrationStatus(poolOrClient) {
    const { client, shouldRelease } = await acquireClient(poolOrClient);
    try {
        await ensureSchemaMigrationsTable(client);

        const dbRes = await client.query(
            'SELECT version, name, checksum, applied_at, execution_time_ms FROM schema_migrations ORDER BY version ASC'
        );
        const appliedMap = new Map();
        for (const row of dbRes.rows) {
            appliedMap.set(row.version, row);
        }

        const files = getMigrationFiles();
        const results = [];

        // Check baseline
        if (appliedMap.has(BASELINE_VERSION)) {
            const bRow = appliedMap.get(BASELINE_VERSION);
            results.push({
                version: bRow.version,
                name: bRow.name,
                status: 'APPLIED',
                appliedAt: bRow.applied_at,
                executionTimeMs: bRow.execution_time_ms,
                checksumMatch: true
            });
        } else {
            results.push({
                version: BASELINE_VERSION,
                name: BASELINE_NAME,
                status: 'PENDING_BASELINE',
                appliedAt: null,
                executionTimeMs: 0,
                checksumMatch: true
            });
        }

        // Check versioned files
        for (const f of files) {
            if (appliedMap.has(f.version)) {
                const applied = appliedMap.get(f.version);
                const checksumMatch = applied.checksum === f.checksum;
                results.push({
                    version: f.version,
                    name: f.name,
                    file: f.file,
                    status: checksumMatch ? 'APPLIED' : 'CHECKSUM_MISMATCH',
                    appliedAt: applied.applied_at,
                    executionTimeMs: applied.execution_time_ms,
                    checksumMatch
                });
            } else {
                results.push({
                    version: f.version,
                    name: f.name,
                    file: f.file,
                    status: 'PENDING',
                    appliedAt: null,
                    executionTimeMs: 0,
                    checksumMatch: true
                });
            }
        }

        return results;
    } finally {
        if (shouldRelease) client.release();
    }
}

/**
 * Runs migration up: checks baseline, verifies applied checksums, and executes pending migrations.
 */
async function runMigrationUp(poolOrClient) {
    const { client, shouldRelease } = await acquireClient(poolOrClient);

    try {
        console.log('--- SPH Billing Versioned Migration Runner ---');
        await ensureSchemaMigrationsTable(client);

        // 1. Check and record baseline if eligible
        const baselineResult = await recordBaselineIfEligible(client);
        console.log(`[BASELINE] ${baselineResult.message}`);

        // 2. Get status of all migrations
        const statusList = await getMigrationStatus(client);

        // Check for checksum tampering
        const tampered = statusList.filter(s => s.status === 'CHECKSUM_MISMATCH');
        if (tampered.length > 0) {
            throw new Error(
                `CRITICAL: Migration checksum mismatch detected for version(s): ${tampered.map(t => t.version).join(', ')}. ` +
                `An already-applied migration file has been modified on disk. Aborting for safety.`
            );
        }

        const pending = statusList.filter(s => s.status === 'PENDING');
        if (pending.length === 0) {
            console.log('Database schema is fully up to date. Zero pending migrations.');
            return { success: true, appliedCount: 0 };
        }

        console.log(`Found ${pending.length} pending migration(s) to apply.`);
        const files = getMigrationFiles();
        const fileMap = new Map(files.map(f => [f.version, f]));

        let appliedCount = 0;

        for (const item of pending) {
            const mFile = fileMap.get(item.version);
            if (!mFile) continue;

            console.log(`Applying migration [${mFile.version}] ${mFile.name}...`);
            const startTime = Date.now();

            await client.query('BEGIN');
            try {
                // Execute migration SQL inside transaction
                await client.query(mFile.content);

                const durationMs = Date.now() - startTime;

                // Record into schema_migrations
                await client.query(`
                    INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
                    VALUES ($1, $2, $3, NOW(), $4)
                `, [mFile.version, mFile.name, mFile.checksum, durationMs]);

                await client.query('COMMIT');
                appliedCount++;
                console.log(`Migration [${mFile.version}] applied successfully in ${durationMs}ms.`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw new Error(`Migration [${mFile.version}] failed. Rolled back transaction. Error: ${err.message}`);
            }
        }

        // 3. Ensure admin user account seeded safely via parameterized query
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        if (adminPasswordHash) {
            await client.query(`
                INSERT INTO users (id, username, password_hash, role, full_name, status)
                VALUES ('usr_admin_default', $1, $2, 'ADMIN', 'System Administrator', 'ACTIVE')
                ON CONFLICT (username) DO UPDATE 
                SET password_hash = EXCLUDED.password_hash, role = 'ADMIN'
            `, [adminUsername, adminPasswordHash]);
        }

        console.log(`Successfully applied ${appliedCount} migration(s). Database is ready.`);
        return { success: true, appliedCount };
    } finally {
        if (shouldRelease) client.release();
    }
}

/**
 * CLI Entry point
 */
async function cli() {
    const action = (process.argv[2] || 'up').toLowerCase();
    const pool = getPool();

    try {
        if (action === 'status') {
            console.log('--- SPH Billing Migration Status ---');
            const status = await getMigrationStatus(pool);
            console.log('\n' + '='.repeat(85));
            console.log(
                'Version'.padEnd(35) +
                'Status'.padEnd(20) +
                'Applied At'.padEnd(20) +
                'Duration'
            );
            console.log('='.repeat(85));
            for (const s of status) {
                const appliedStr = s.appliedAt ? new Date(s.appliedAt).toISOString().split('T')[0] : '—';
                const durStr = s.executionTimeMs ? `${s.executionTimeMs}ms` : '—';
                console.log(
                    s.version.padEnd(35) +
                    s.status.padEnd(20) +
                    appliedStr.padEnd(20) +
                    durStr
                );
            }
            console.log('='.repeat(85) + '\n');
        } else if (action === 'baseline') {
            console.log('--- SPH Billing Baseline Execution ---');
            const client = await pool.connect();
            try {
                const res = await recordBaselineIfEligible(client);
                console.log(`[RESULT] ${res.message}`);
            } finally {
                client.release();
            }
        } else if (action === 'up') {
            await runMigrationUp(pool);
        } else {
            console.log(`Usage: node migrate.js [up | status | baseline]`);
        }
    } catch (err) {
        console.error('Migration operation failed:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    cli();
}

module.exports = {
    getPool,
    ensureSchemaMigrationsTable,
    recordBaselineIfEligible,
    verifySchemaInvariants,
    getMigrationStatus,
    runMigrationUp,
    calculateChecksum,
    BASELINE_VERSION,
    REQUIRED_BASELINE_TABLES,
    REQUIRED_CRITICAL_COLUMNS,
    REQUIRED_PRIMARY_KEY_TABLES,
    REQUIRED_UNIQUE_CONSTRAINTS
};
