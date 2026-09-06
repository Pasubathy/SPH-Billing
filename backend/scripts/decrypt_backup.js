/**
 * SPH Billing - Standalone Backup Decryption Tool (Disaster Recovery)
 * 
 * Usage:
 *   node decrypt_backup.js <path-to-encrypted-dump> [output-path]
 * 
 * Uses standard Node.js crypto module (no third-party dependencies required).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function decryptFile(inputPath, outputPath, keySecret) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file does not exist: ${inputPath}`);
    }
    if (!keySecret) {
        throw new Error('Encryption key secret is required (set BACKUP_ENCRYPTION_KEY or pass as 3rd argument)');
    }

    const key = crypto.createHash('sha256').update(keySecret).digest();
    const encryptedBuffer = fs.readFileSync(inputPath);

    if (encryptedBuffer.length < 28) {
        throw new Error('Encrypted backup file is corrupt or truncated (less than 28 bytes).');
    }

    const iv = encryptedBuffer.subarray(0, 12);
    const authTag = encryptedBuffer.subarray(12, 28);
    const ciphertext = encryptedBuffer.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const targetOutput = outputPath || inputPath.replace(/\.enc$/, '');
    fs.writeFileSync(targetOutput, decrypted);
    console.log(`✅ Decryption successful. Decrypted file written to: ${targetOutput} (${decrypted.length} bytes)`);
    return targetOutput;
}

if (require.main === module) {
    const inputArg = process.argv[2];
    const outputArg = process.argv[3];
    const keyArg = process.argv[4] || process.env.BACKUP_ENCRYPTION_KEY;

    if (!inputArg) {
        console.log('Usage: node decrypt_backup.js <encrypted_file.dump.enc> [output_file.dump] [optional_key]');
        process.exit(1);
    }

    try {
        decryptFile(inputArg, outputArg, keyArg);
    } catch (err) {
        console.error('Decryption failed:', err.message);
        process.exit(1);
    }
}

module.exports = { decryptFile };
