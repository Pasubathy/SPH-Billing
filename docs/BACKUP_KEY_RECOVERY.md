# SPH Billing - Backup Encryption Key Custody & Disaster Recovery Guide

## 1. Overview

SPH Billing database backups are encrypted at rest using **AES-256-GCM** (Galois/Counter Mode with 128-bit authentication tag). Encryption ensures confidentiality, while the AEAD auth tag guarantees data integrity and tamper detection.

> [!CAUTION]
> A backup without a recoverable encryption key is completely useless. In a disaster recovery event where application servers and cloud infrastructure are destroyed, disaster recovery personnel must be able to decrypt the database dump using an independent, offline procedure.

---

## 2. Key Specifications

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Algorithm** | `AES-256-GCM` | Authenticated Encryption with Associated Data (AEAD) |
| **Key Length** | 256 bits (32 bytes) | Represented as a 64-character hexadecimal string |
| **IV (Initialization Vector)** | 96 bits (12 bytes) | Cryptographically secure random bytes generated per backup |
| **Auth Tag** | 128 bits (16 bytes) | Appended to ciphertext; validates authenticity before decryption |
| **File Format** | Header + IV + Tag + Ciphertext | Self-describing `.dump.enc` binary package |

---

## 3. Key Storage & Custody

The production encryption key (`BACKUP_ENCRYPTION_KEY`) must **NEVER** be committed to Git repositories or printed in log files.

### Storage Locations:
1. **Primary Runtime**: Vercel Environment Secrets / Production Server `.env` (restricted to root process).
2. **Offline Key Vault (Cold Storage)**:
   - Primary: Password-protected hardware security module (HSM) or corporate password vault (e.g., 1Password / Bitwarden enterprise vault).
   - Secondary: Physical paper key backup stored inside a fireproof safe at corporate headquarters.
3. **Designated Custodians**:
   - **Primary Key Custodian**: SPH System Administrator / CTO
   - **Secondary Key Custodian**: Managing Director / Lead Infrastructure Engineer
   - **Access Model**: Two-person rule (M-of-N quorum) recommended for production vault access.

---

## 4. Disaster Recovery Scenario: Application Server Destroyed

If the Vercel project, production backend servers, or developer machines are entirely compromised or destroyed:

### Recovery Steps:
1. **Retrieve the Key from Cold Storage**:
   - Authorized custodians retrieve the 64-hex-character `BACKUP_ENCRYPTION_KEY` from the secure corporate vault or physical safe.
2. **Retrieve the Encrypted Backup**:
   - Download the latest `.dump.enc` file from the independent offsite backup storage location (e.g., AWS S3, Cloudflare R2, or offline NAS).
3. **Verify Host Prerequisites**:
   - Any machine with **Node.js (>=16)** installed (no application dependencies or node_modules required).
   - Standard PostgreSQL client utilities (`pg_restore`).
4. **Execute Standalone Decryption**:
   - Run the zero-dependency decryption script:
   ```bash
   node backend/scripts/decrypt_backup.js <path_to_backup.dump.enc> <path_to_decrypted_output.dump> <BACKUP_ENCRYPTION_KEY>
   ```
   *Note: If `BACKUP_ENCRYPTION_KEY` is exported in the environment, the 3rd argument can be omitted.*

5. **Verify Decryption Integrity**:
   - If the key is correct and the file has not been corrupted, the script will output:
     ```
     [AES-256-GCM] Auth tag verified. Decryption successful.
     Output: <path_to_decrypted_output.dump>
     ```
   - If corrupted or wrong key:
     ```
     FATAL: Decryption failed. Authentication tag verification failed or key is invalid.
     ```

6. **Restore Database**:
   - Restore into target PostgreSQL instance:
   ```bash
   pg_restore --clean --no-owner --no-privileges -d "<TARGET_DATABASE_URL>" <path_to_decrypted_output.dump>
   ```

---

## 5. Key Rotation Procedure

When rotating the backup encryption key:
1. Generate a new 256-bit key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Store the new key in the secure vault with the activation date.
3. Update `BACKUP_ENCRYPTION_KEY` on the production server / Vercel secrets.
4. Immediately trigger a fresh backup using `node backend/scripts/backup_database.js`.
5. **Retain old keys** until all historical backups encrypted with those keys exceed their retention period and are safely deleted. Never discard old keys while backups encrypted with them still exist.
