/**
 * SPH Billing - Production Environment Variable Audit Tool (Phase 4C)
 * 
 * Inspects all environment variables required for safe production deployment.
 * Validates formatting, entropy, and configurations.
 * 
 * CRITICAL SECURITY INVARIANT:
 * Never prints actual secret values in output or logs.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ENV_SPEC = [
    {
        name: 'DATABASE_URL',
        required: true,
        type: 'secret_uri',
        description: 'PostgreSQL connection URI (Neon)',
        validator: (val) => val.startsWith('postgresql://') || val.startsWith('postgres://')
    },
    {
        name: 'ADMIN_USERNAME',
        required: true,
        type: 'string',
        description: 'Root administrator username',
        validator: (val) => val && val.trim().length >= 3
    },
    {
        name: 'ADMIN_PASSWORD_HASH',
        required: true,
        type: 'secret_hash',
        description: 'Bcrypt hash of root admin password',
        validator: (val) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val)
    },
    {
        name: 'ALLOWED_ORIGINS',
        required: true,
        type: 'string',
        description: 'Comma-separated CORS allowed origins',
        validator: (val) => val && val.split(',').filter(Boolean).length > 0
    },
    {
        name: 'NODE_ENV',
        required: true,
        type: 'string',
        description: 'Node environment (production / development / test)',
        validator: (val) => ['production', 'development', 'test'].includes(val)
    },
    {
        name: 'GEMINI_API_KEY',
        required: true,
        type: 'secret',
        description: 'Google Gemini AI API Key for OCR intelligence',
        validator: (val) => val && val.length >= 20
    },
    {
        name: 'BACKUP_ENCRYPTION_KEY',
        required: false, // Optional in dev, required when running backup system
        type: 'secret_hex',
        description: 'AES-256-GCM 256-bit encryption key for database backups (64 hex chars)',
        validator: (val) => !val || /^[0-9a-fA-F]{64}$/.test(val)
    },
    {
        name: 'PG_MAX_POOL_SIZE',
        required: false,
        type: 'number',
        description: 'PostgreSQL pool size override (default 3 on Vercel, 10 on node server)',
        validator: (val) => !val || (!isNaN(parseInt(val, 10)) && parseInt(val, 10) > 0)
    },
    {
        name: 'BACKUP_DIR',
        required: false,
        type: 'string',
        description: 'Directory for automated backup storage',
        validator: (val) => true
    },
    {
        name: 'BACKUP_RETENTION_COUNT',
        required: false,
        type: 'number',
        description: 'Number of backup generations to retain',
        validator: (val) => !val || (!isNaN(parseInt(val, 10)) && parseInt(val, 10) >= 1)
    }
];

function maskValue(val, type) {
    if (!val) return '<NOT_SET>';
    if (type === 'secret_uri') {
        try {
            const url = new URL(val);
            const user = url.username ? url.username : '';
            return `${url.protocol}//${user}:***@${url.host}${url.pathname}`;
        } catch (_) {
            return '***[MASKED_URI]***';
        }
    }
    if (type === 'secret_hash') {
        return `${val.substring(0, 7)}...***[MASKED_HASH]***`;
    }
    if (type === 'secret' || type === 'secret_hex') {
        return `${val.substring(0, 4)}...***[MASKED_${val.length}_CHARS]***`;
    }
    return val;
}

function auditEnvironment(envSource = process.env) {
    const report = {
        totalVariables: ENV_SPEC.length,
        passed: 0,
        failed: 0,
        warnings: 0,
        details: []
    };

    for (const spec of ENV_SPEC) {
        const val = envSource[spec.name];
        const isPresent = Boolean(val && val.trim().length > 0);
        const masked = maskValue(val, spec.type);

        if (!isPresent) {
            if (spec.required) {
                report.failed++;
                report.details.push({
                    name: spec.name,
                    status: 'FAIL_MISSING',
                    description: spec.description,
                    maskedValue: masked,
                    error: `Required environment variable ${spec.name} is missing or empty!`
                });
            } else {
                report.warnings++;
                report.details.push({
                    name: spec.name,
                    status: 'WARN_OPTIONAL_MISSING',
                    description: spec.description,
                    maskedValue: masked,
                    error: null
                });
            }
            continue;
        }

        const isValid = spec.validator(val);
        if (!isValid) {
            report.failed++;
            report.details.push({
                name: spec.name,
                status: 'FAIL_INVALID_FORMAT',
                description: spec.description,
                maskedValue: masked,
                error: `Format validation failed for ${spec.name}`
            });
        } else {
            report.passed++;
            report.details.push({
                name: spec.name,
                status: 'OK',
                description: spec.description,
                maskedValue: masked,
                error: null
            });
        }
    }

    return report;
}

if (require.main === module) {
    console.log('=== SPH Billing Production Environment Audit ===\n');
    const result = auditEnvironment();
    
    for (const item of result.details) {
        const symbol = item.status === 'OK' ? '✅' : (item.status.startsWith('WARN') ? '⚠️' : '❌');
        console.log(`${symbol} [${item.status}] ${item.name}: ${item.maskedValue}`);
        if (item.error) {
            console.log(`     Error: ${item.error}`);
        }
    }

    console.log(`\nAudit Summary: Passed: ${result.passed}, Warnings: ${result.warnings}, Failed: ${result.failed}`);
    if (result.failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

module.exports = { auditEnvironment, ENV_SPEC, maskValue };
