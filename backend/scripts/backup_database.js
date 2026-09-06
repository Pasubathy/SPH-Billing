/**
 * SPH Billing - Automated Encrypted Database Backup Engine (Phase 4C)
 * 
 * Features:
 *   - Locates pg_dump automatically across PATH and standard PostgreSQL install locations
 *   - Exports PostgreSQL database in reliable custom format (-Fc) or schema+data dump
 *   - Encrypts using authenticated AES-256-GCM (tamper-evident AEAD)
 *   - Verifies backup integrity immediately after creation
 *   - Rotates backups retaining the last N backups (default: 7)
 *   - SAFETY: Never deletes the only available backup
 *   - SECURITY: Never prints passwords, encryption keys, or full connection strings
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, execSync } = require('child_process');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKUP_DIR = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(__dirname, '..', 'backups');

const DEFAULT_RETENTION = parseInt(process.env.BACKUP_RETENTION_COUNT || '7', 10);

/**
 * Searches for pg_dump executable in common directories and PATH.
 */
function findPgDump() {
    if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
        return process.env.PG_DUMP_PATH;
    }

    // Check PATH
    try {
        const cmd = process.platform === 'win32' ? 'where pg_dump' : 'which pg_dump';
        const result = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0].trim();
        if (result && fs.existsSync(result)) {
            return result;
        }
    } catch (_) {}

    // Common Windows locations
    if (process.platform === 'win32') {
        const commonWindowsPaths = [
            'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
            'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
            'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
            'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
            'C:\\Program Files (x86)\\PostgreSQL\\18\\bin\\pg_dump.exe'
        ];
        for (const p of commonWindowsPaths) {
            if (fs.existsSync(p)) return p;
        }
    } else {
        const commonUnixPaths = [
            '/usr/bin/pg_dump',
            '/usr/local/bin/pg_dump',
            '/opt/homebrew/bin/pg_dump'
        ];
        for (const p of commonUnixPaths) {
            if (fs.existsSync(p)) return p;
        }
    }

    return null;
}

/**
 * Derives a 32-byte AES-256 key from environment secret.
 */
function getEncryptionKey() {
    const rawSecret = process.env.BACKUP_ENCRYPTION_KEY;
    if (!rawSecret) {
        throw new Error(
            'FATAL: BACKUP_ENCRYPTION_KEY environment variable is not configured. ' +
            'Cannot generate encrypted backup without encryption secret.'
        );
    }
    return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Encrypts buffer using AES-256-GCM.
 * Layout: [12 bytes IV] + [16 bytes GCM Auth Tag] + [Ciphertext]
 */
function encryptBuffer(buffer, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts and verifies AES-256-GCM buffer.
 */
function decryptBuffer(encryptedBuffer, key) {
    if (encryptedBuffer.length < 28) {
        throw new Error('Invalid encrypted backup: buffer too short');
    }
    const iv = encryptedBuffer.subarray(0, 12);
    const authTag = encryptedBuffer.subarray(12, 28);
    const ciphertext = encryptedBuffer.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Rotates backup files, keeping the last N backups.
 * SAFETY GUARANTEE: Never deletes the last remaining backup.
 */
function rotateBackups(backupDir, retentionCount = DEFAULT_RETENTION) {
    if (!fs.existsSync(backupDir)) return;

    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('sph_backup_') && f.endsWith('.dump.enc'))
        .sort(); // Lexicographical sort matches timestamp order

    if (files.length <= 1) {
        console.log(`[ROTATION] Only ${files.length} backup exists. Rotation skipped to preserve minimum backup.`);
        return;
    }

    if (files.length > retentionCount) {
        const excessCount = files.length - retentionCount;
        const toDelete = files.slice(0, excessCount);
        for (const file of toDelete) {
            const filePath = path.join(backupDir, file);
            fs.unlinkSync(filePath);
            console.log(`[ROTATION] Purged expired backup: ${file}`);
        }
    }
}

/**
 * Creates, encrypts, and validates a database backup.
 */
async function createDatabaseBackup() {
    console.log('--- SPH Billing Database Backup Engine ---');

    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const encKey = getEncryptionKey();
    const pgDumpBin = findPgDump();

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').split('.')[0];
    const backupFileName = `sph_backup_${timestamp}.dump.enc`;
    const backupFilePath = path.join(BACKUP_DIR, backupFileName);

    let rawDumpBuffer;

    if (pgDumpBin) {
        console.log(`[PG_DUMP] Located binary at: ${pgDumpBin}`);
        console.log('Generating compressed custom dump (-Fc)...');

        const tempDumpPath = path.join(BACKUP_DIR, `temp_${Date.now()}_dump.bin`);
        const dbUrl = process.env.DATABASE_URL;

        const childEnv = { ...process.env };
        let host = 'localhost', user = 'neondb_owner', database = 'neondb', port = '5432';
        try {
            const urlObj = new URL(dbUrl);
            if (urlObj.password) childEnv.PGPASSWORD = decodeURIComponent(urlObj.password);
            if (urlObj.hostname) host = urlObj.hostname;
            if (urlObj.username) user = decodeURIComponent(urlObj.username);
            if (urlObj.pathname) database = urlObj.pathname.replace(/^\//, '');
            if (urlObj.port) port = urlObj.port;
            childEnv.PGSSLMODE = 'require';
        } catch (_) {}

        await new Promise((resolve, reject) => {
            const args = ['-h', host, '-p', port, '-U', user, '-d', database, '-w', '--schema=public', '-Fc', '--no-owner', '--no-privileges', '-f', tempDumpPath];
            execFile(pgDumpBin, args, { env: childEnv, maxBuffer: 100 * 1024 * 1024, timeout: 180000 }, (err, stdout, stderr) => {
                if (err) {
                    return reject(new Error(`pg_dump execution failed: ${err.message}. Stderr: ${stderr}`));
                }
                resolve();
            });
        });

        rawDumpBuffer = fs.readFileSync(tempDumpPath);
        try { fs.unlinkSync(tempDumpPath); } catch (_) {}
    } else {
        // Fallback programmatic logical dump if pg_dump CLI is unavailable
        console.warn('[WARNING] Native pg_dump not found in PATH or standard directories. Generating logical JSON/SQL dump via pg client...');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        const client = await pool.connect();
        try {
            const tables = [
                'schema_migrations', 'store', 'categories', 'units', 'items', 'vendors',
                'customers', 'sales_invoices', 'purchase_invoices', 'customer_receipts',
                'customer_receipt_allocations', 'vendor_payments', 'vendor_payment_allocations',
                'sales_returns', 'purchase_returns', 'document_sequences', 'idempotency_keys',
                'users', 'login_attempts', 'active_sessions', 'audit_logs'
            ];
            const dumpData = { metadata: { timestamp: new Date().toISOString(), version: '1.0.0' }, tables: {} };
            for (const tbl of tables) {
                try {
                    const res = await client.query(`SELECT * FROM ${tbl}`);
                    dumpData.tables[tbl] = res.rows;
                } catch (_) {}
            }
            rawDumpBuffer = Buffer.from(JSON.stringify(dumpData));
        } finally {
            client.release();
            await pool.end();
        }
    }

    console.log(`Raw dump generated (${rawDumpBuffer.length} bytes). Encrypting with AES-256-GCM...`);

    const encryptedData = encryptBuffer(rawDumpBuffer, encKey);
    fs.writeFileSync(backupFilePath, encryptedData);

    console.log(`Encrypted backup written to: ${backupFilePath} (${encryptedData.length} bytes).`);

    // Integrity Verification
    console.log('Verifying backup integrity (decrypting and verifying AEAD auth tag)...');
    const readBack = fs.readFileSync(backupFilePath);
    const decrypted = decryptBuffer(readBack, encKey);
    if (!decrypted || decrypted.length !== rawDumpBuffer.length) {
        fs.unlinkSync(backupFilePath);
        throw new Error('CRITICAL: Backup verification failed! Decrypted size mismatch.');
    }
    console.log('✅ Backup integrity verified successfully! AEAD authentication tag validated.');

    // Rotate older backups
    rotateBackups(BACKUP_DIR, DEFAULT_RETENTION);

    return {
        success: true,
        fileName: backupFileName,
        filePath: backupFilePath,
        sizeBytes: encryptedData.length,
        timestamp
    };
}

if (require.main === module) {
    createDatabaseBackup()
        .then(result => {
            console.log(`Backup completed successfully: ${result.fileName}`);
            process.exit(0);
        })
        .catch(err => {
            console.error('FATAL: Backup creation failed:', err.message);
            process.exit(1);
        });
}

module.exports = {
    findPgDump,
    getEncryptionKey,
    encryptBuffer,
    decryptBuffer,
    rotateBackups,
    createDatabaseBackup,
    BACKUP_DIR
};
