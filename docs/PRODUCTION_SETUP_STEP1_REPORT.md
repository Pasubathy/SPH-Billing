# SPH Billing — Production Setup Step 1: Environment Configuration Report

**Project:** Sri Parvathi Hardwares (SPH) Billing & Inventory System  
**Stage:** Production Setup — Step 1: Environment Configuration  
**Date:** March 2026  
**Status:** COMPLETE (Strictly Read-Only)  
**Security Governance:** Zero actual secrets, passwords, hashes, API keys, or database URLs exposed.  
**Hardware Verification Policy:** Physical hardware verification remains explicitly classified as **PENDING** and does not block software deployment preparation.

---

## 1. Executive Summary

Production Setup Step 1 establishes the exact environment variable specifications, cryptographic key generation procedures, and deployment target checklists required to prepare the SPH Billing system for live hosting.

### Scope Governance & Safety Invariants Preserved:
1. **Zero Application Source Code Changes**: Application logic across all backend and frontend modules remains completely untouched.
2. **Zero Premature Migrations**: Production database baseline and forward migrations have **not** been executed.
3. **Zero Deployments**: No deployment to Vercel or external hosting was initiated.
4. **Zero Region Cutover**: The Neon PostgreSQL database remains on AWS São Paulo (`sa-east-1`).
5. **Zero Secret Exposure**: All secret states are reported strictly as `SET / NOT SET / INVALID`. No real secrets or credentials were created or committed to git.

---

## 2. Production Environment Variables Specification

The table below catalogs every variable actually referenced by [`backend/server.js`](file:///f:/MY%20Works/SPH%20Software/backend/server.js), [`backend/migrate.js`](file:///f:/MY%20Works/SPH%20Software/backend/migrate.js), and [`backend/scripts/backup_database.js`](file:///f:/MY%20Works/SPH%20Software/backend/scripts/backup_database.js):

> [!NOTE]
> **Authentication Architecture Verification:** The codebase uses stateful database-backed session tokens (`crypto.randomBytes(32)`) hashed with SHA-256 in the `active_sessions` table. **`JWT_SECRET` is NOT used anywhere in the codebase and has NOT been added.**

| Variable | Required | Current Local State | Production Value Needed | Where It Must Be Configured |
| :--- | :---: | :---: | :--- | :--- |
| **`DATABASE_URL`** | **YES** | **SET** | Production Neon PostgreSQL pooler URI (`sslmode=require`) | Vercel Project Settings & Backup Runner |
| **`ADMIN_USERNAME`** | **YES** | **SET** | Store Administrator username (e.g. `SPH.admin`) | Vercel Project Settings & Migration CLI |
| **`ADMIN_PASSWORD_HASH`** | **YES** | **SET** *(Dev Hash)* | Freshly generated bcrypt hash with salt rounds $\ge 12$ | Vercel Project Settings |
| **`ALLOWED_ORIGINS`** | **YES** | **SET** *(Local Dev)* | Production domain(s) without trailing slash (e.g. `https://sph-billing.vercel.app`) | Vercel Project Settings |
| **`NODE_ENV`** | **YES** | **SET** *(`development`)* | `production` (enforces HSTS, strict CORS, and disables debug routes) | Vercel Project Settings |
| **`GEMINI_API_KEY`** | **YES** | **SET** | Valid Google Gemini API Key for automated OCR invoice parsing | Vercel Project Settings |
| **`BACKUP_ENCRYPTION_KEY`** | **YES** *(Backup)* | **NOT SET** | 64-character random hex string (256-bit AES key for AES-256-GCM) | Dedicated Backup Runner *(NOT in Vercel)* |
| **`PG_MAX_POOL_SIZE`** | **NO** *(Optional)* | **NOT SET** | `3` (Optimal for Vercel Serverless to protect Neon pooler limits) | Vercel Project Settings |
| **`BACKUP_DIR`** | **NO** *(Optional)* | **NOT SET** | Local dump storage directory (defaults to `./backups` on host) | Dedicated Backup Runner *(NOT in Vercel)* |
| **`BACKUP_RETENTION_COUNT`** | **NO** *(Optional)* | **NOT SET** | Integer $\ge 1$ (defaults to `7` generations if unset) | Dedicated Backup Runner *(NOT in Vercel)* |
| **`HEALTH_CHECK_TIMEOUT_MS`** | **NO** *(Optional)* | **NOT SET** | Milliseconds for health probe timeout (defaults to `5000`) | Vercel Project Settings |
| **`GEMINI_MODEL`** | **NO** *(Optional)* | **NOT SET** | Model name override (defaults to `gemini-1.5-flash`) | Vercel Project Settings |

---

## 3. Security & Repository Cleanliness Verifications

1. **Gitignore Status**: **VERIFIED**
   - Both `.env` and `backend/backups/` are strictly ignored by `.gitignore`.
   - Verified via `git check-ignore backend/.env backend/backups/sph_backup.dump.enc` (both returned exit code 0).
2. **Template Hygiene (`.env.example`)**: **VERIFIED**
   - [`backend/.env.example`](file:///f:/MY%20Works/SPH%20Software/backend/.env.example) contains only generic placeholders:
     - `DATABASE_URL=postgresql://user:password@ep-host-pooler...`
     - `ADMIN_PASSWORD_HASH=<generate_bcrypt_hash_cost_12>`
     - `GEMINI_API_KEY=your_gemini_api_key_here`
   - Zero actual credentials or live hosts exist in the template.
3. **Production CORS Isolation**: **VERIFIED**
   - In production (`NODE_ENV=production`), `backend/server.js#L69-L85` disables localhost regex fallbacks and enforces strict equality matching against `ALLOWED_ORIGINS`.
   - Wildcards (`*`) are disallowed.
4. **Environment Mode (`NODE_ENV`)**: **VERIFIED**
   - Setting `NODE_ENV=production` automatically adds `Strict-Transport-Security: max-age=31536000; includeSubDomains` and permanently disables `/api/init-db` (returns HTTP 404).
5. **Connection Pool Bounds (`PG_MAX_POOL_SIZE`)**: **VERIFIED**
   - In `backend/server.js#L202`, pool size is resolved as:
     `max: process.env.PG_MAX_POOL_SIZE ? parseInt(process.env.PG_MAX_POOL_SIZE) : (process.env.VERCEL ? 3 : 10)`
   - Capping at `3` on Vercel is verified as safe and optimal; higher numbers risk exhausting Neon connection pooler capacity across concurrent serverless invocations.
6. **Decoupling of Backup Infrastructure**: **VERIFIED**
   - Vercel Serverless Functions have ephemeral local filesystems, a 15-second execution budget, and no `pg_dump.exe` binary.
   - `BACKUP_ENCRYPTION_KEY` is needed **only** on the machine or CI/CD worker executing `backup_database.js`, eliminating unnecessary secret exposure in Vercel.
7. **Admin Credential Rotation**: **VERIFIED**
   - Local development uses a development cost-10 hash.
   - Production requires generating a brand-new bcrypt hash with salt rounds $\ge 12$.
8. **Zero Committed Credentials**: **VERIFIED**
   - Searches across all README files, codebases, scripts, frontend assets, and configurations confirm zero committed secrets.

---

## 4. Environment Audit Findings

### A. Exact Variables Required in Production
- **In Vercel**: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ALLOWED_ORIGINS`, `NODE_ENV`, `GEMINI_API_KEY`, and `PG_MAX_POOL_SIZE=3`.
- **On the Backup Runner Host**: `DATABASE_URL` and `BACKUP_ENCRYPTION_KEY`.

### B. Missing Variables (Must be provisioned)
- `BACKUP_ENCRYPTION_KEY` (currently unset; needed on backup runner).

### C. Invalid Variables (Must be reconfigured for production)
- `NODE_ENV`: Currently `development` locally $\rightarrow$ must be set to `production` in Vercel.
- `ALLOWED_ORIGINS`: Currently set to `http://localhost:3000,http://localhost:5173` $\rightarrow$ must be changed to the production Vercel / custom domain.
- `ADMIN_PASSWORD_HASH`: Local hash is a development hash $\rightarrow$ must be regenerated with cost 12 using the store owner's production master password.

---

## 5. Safe Commands for Generating Production Secrets

Run these non-destructive Node.js one-liners on your administrative terminal to generate the required cryptographic values without storing them in git history:

### 1. Generate 256-Bit `BACKUP_ENCRYPTION_KEY` (AES-256-GCM)
```bash
node -e "console.log('BACKUP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```
*(Produces a 64-character cryptographic hex string. Record this offline in the store safe.)*

### 2. Generate Cost-12 `ADMIN_PASSWORD_HASH` (bcrypt)
Replace `<STORE_OWNER_STRONG_PASSWORD>` with the store manager's chosen password:
```bash
node -e "const p = process.argv[1]; console.log('ADMIN_PASSWORD_HASH=' + require('bcryptjs').hashSync(p, 12));" "<STORE_OWNER_STRONG_PASSWORD>"
```
*(Produces a secure `$2b$12$...` bcrypt hash string ready for Vercel.)*

---

## 6. Target Deployment Checklists

### E. Exact Vercel Configuration Checklist
In your **Vercel Dashboard $\rightarrow$ Project Settings $\rightarrow$ Environment Variables**, configure:

| Key | Environment | Value Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Production | `postgresql://<user>:<pass>@<neon-pooler-host>/neondb?sslmode=require` |
| `ADMIN_USERNAME` | Production | e.g. `SPH.admin` |
| `ADMIN_PASSWORD_HASH` | Production | The generated `$2b$12$...` hash |
| `ALLOWED_ORIGINS` | Production | `https://<your-project>.vercel.app` *(No trailing slash, no localhost)* |
| `NODE_ENV` | Production | `production` |
| `GEMINI_API_KEY` | Production | Valid Google AI Studio API Key |
| `PG_MAX_POOL_SIZE` | Production | `3` |

### F. Backup-Runner Environment Checklist
On the dedicated machine or scheduled runner (e.g. GitHub Actions secret or store back-office server):

| Key | Value Description |
| :--- | :--- |
| `DATABASE_URL` | Same production Neon PostgreSQL connection URI |
| `BACKUP_ENCRYPTION_KEY` | The 64-character random hex string generated in Section 5 |
| `BACKUP_DIR` | (Optional) Destination folder path on disk |
| `BACKUP_RETENTION_COUNT` | (Optional) Number of backup generations (e.g. `14` or `30`) |

---

## 7. Next Steps in Production Setup Sequence

With Step 1 (Environment Configuration) complete and verified, the chronological production roadmap is:
1. **Step 1: Environment Configuration** — **COMPLETE & VERIFIED**
2. **Step 2: Software Deployment & Build Validation** — Deploy frontend/backend to Vercel and verify HTTP routing.
3. **Step 3: Database Migration Baseline** — Execute `migrate.js baseline` and `migrate.js up` on the production database.
4. **Step 4: Backup Scheduling & Monitoring** — Configure automated backup runner and point external monitor to `/api/health`.
5. **Step 5: Physical Hardware UAT (Phase 4D Step 6)** — Connect on-site peripherals when available.
6. **Step 6: Live Store Opening**.

---

*Report certified following completion of Production Setup Step 1.*
