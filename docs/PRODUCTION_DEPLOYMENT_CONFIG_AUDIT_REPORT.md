# SPH Billing — Production Deployment Configuration & Readiness Audit Report

**Project:** Sri Parvathi Hardwares (SPH) Billing & Inventory System  
**Report Type:** Production Deployment Configuration & Readiness Audit  
**Date:** March 2026  
**Status:** Audit Complete (Strictly Read-Only)  
**Security Governance:** Zero secrets, passwords, hashes, tokens, or credentials exposed.  
**Hardware Verification Policy:** Physical hardware verification remains explicitly classified as **PENDING** and does not block software deployment preparation.

---

## 1. Executive Summary

This audit evaluates the operational, infrastructure, and deployment readiness of the SPH Billing system following the completion of Phase 4D Step 5. 

All software features across Phases 1 through 4D (financial accounting, double-entry ledgers, return reversals, RBAC security, database-backed idempotency, thermal printing, A4 sticker sheet millimeter geometry, and USB/camera barcode scanning) are **100% complete and verified by automated regression test suites with 0 build errors**.

The system currently has **zero code blockers**. The remaining pre-go-live activities are purely operational: provisioning production hosting secrets, baselining the production database schema, establishing a nightly backup schedule, and connecting physical store hardware for on-site verification.

---

## 2. Production Deployment Configuration Matrix

| Area | Status | Finding | Required Action |
| :--- | :---: | :--- | :--- |
| **`DATABASE_URL`** | **NEEDS CONFIGURATION** | Local `.env` references a development Neon branch in AWS São Paulo (`sa-east-1`). PostgreSQL connection pooling and SSL auto-reconnect are fully configured in code. | Provide the production PostgreSQL connection URI in Vercel environment variables. |
| **`JWT_SECRET` / Session Tokens** | **READY** | SPH Billing uses stateful database-backed session tokens (`crypto.randomBytes(32)`) hashed with SHA-256 in the `active_sessions` table. A stateless `JWT_SECRET` is not used in code, eliminating JWT secret forgery risks. | None. Session architecture is fully operational. |
| **`ADMIN_PASSWORD_HASH`** | **NEEDS CONFIGURATION** | `server.js` requires a bcrypt hash of the administrator password as an environment fallback and seed credential. | Generate a fresh bcrypt hash (salt rounds $\ge 12$) for the store owner and set in Vercel environment variables. |
| **`ALLOWED_ORIGINS`** | **NEEDS CONFIGURATION** | Server strictly validates incoming `Origin` headers against `ALLOWED_ORIGINS` without wildcards. Development configuration includes localhost ports. | Set `ALLOWED_ORIGINS` in production to the exact production domain(s) (e.g. `https://sph-billing.vercel.app`) and remove localhost origins. |
| **`BACKUP_ENCRYPTION_KEY`** | **NEEDS CONFIGURATION** | `backup_database.js` requires a 256-bit hex key (64 hex characters) for AES-256-GCM encryption. Currently absent from git (properly ignored). | Generate a 64-character random hex string (`crypto.randomBytes(32).toString('hex')`) and configure on the backup execution runner. |
| **`PG_MAX_POOL_SIZE`** | **READY** | Code dynamically defaults pool size to `3` on Vercel Serverless (protecting Neon connection limits) and `10` on Node servers. | Optional. Default behavior is production-ready. |
| **`NODE_ENV`** | **NEEDS CONFIGURATION** | Local environment runs in `development`. Production mode enforces HSTS security headers and disables debug endpoints like `/api/init-db`. | Set `NODE_ENV=production` in Vercel environment settings. |
| **`GEMINI_API_KEY`** | **NEEDS CONFIGURATION** | Required by `server.js` startup checks for AI invoice parsing and OCR extraction. | Provide a production Google Gemini API key in Vercel environment settings. |
| **`ADMIN_USERNAME`** | **NEEDS CONFIGURATION** | Required by `server.js` startup checks. Currently defaults to `admin`. | Set production administrator username in Vercel environment settings. |
| **Credential & Secret Cleanliness** | **READY** | Audit across `README.md`, `.env.example`, source code, scripts, frontend code, and configs confirmed **zero** real secrets, API keys, or passwords exist in repository files. `.env.example` contains only sanitized placeholders. | None. Repository is clean of leaked secrets. |
| **Production CORS Configuration** | **READY** | `server.js` implements strict origin whitelisting, sets `Vary: Origin`, supports preflight `OPTIONS` (HTTP 200), and permits `Idempotency-Key` and `Authorization` headers without wildcards. | Controlled via `ALLOWED_ORIGINS` environment variable. |
| **Vercel Deployment Configuration** | **READY** | `vercel.json` correctly routes `/api/(.*)` to `@vercel/node`, maps static SPA routing to `/frontend-react/dist`, and applies `Cache-Control: max-age=0, must-revalidate` on PWA manifests and service workers. | Ready for deployment to Vercel. |
| **Build Configuration** | **READY** | `frontend-react` compiles cleanly via Vite v8.1.4 in 3.56s with 0 errors. Backend uses standard Node.js with native Express and `pg` dependencies. | Ready for production build pipelines. |
| **Versioned Migration Engine** | **NEEDS CONFIGURATION** | `backend/migrate.js` is fully implemented and tested. Baseline (`20260306_000_baseline_phase4b`) and forward infrastructure migrations (`20260306_001_phase4c_infrastructure.sql`) have not yet been recorded on the target production database. | Run `node backend/migrate.js baseline` followed by `node backend/migrate.js up` against the production database during initial setup. |
| **Backup Scheduling & Storage** | **NEEDS CONFIGURATION** | `backup_database.js` produces encrypted AES-256-GCM dumps and rotates local copies. However, Vercel Serverless cannot run background schedulers or write to persistent disks. No automated scheduler currently exists in `.github` or crontab. | Configure an external scheduled runner (e.g. GitHub Actions cron, on-premise Windows Task Scheduler, or dedicated worker) with offsite replication to AWS S3 or Cloudflare R2. |
| **Health Monitoring Configuration** | **NEEDS CONFIGURATION** | `GET /api/health` is fully functional with bounded 5000ms timeout, DB latency ping, public bypass, and zero credential leakage. No external monitoring service is currently configured to probe it. | Register `https://<production-domain>/api/health` with BetterStack, Datadog, or UptimeRobot set to a 60-second probe interval. |
| **Hardware-Dependent Features** | **NEEDS MANUAL VERIFICATION** | Thermal receipt printing, A4 sticker sheet die-cut alignment, USB barcode scanner carriage return, and camera autofocus are code-complete with passing automated driver tests. They do **not** block software deployment preparation. | Mark physical verification as **PENDING** until hardware is connected on-site at the Kallakurichi store (Phase 4D Step 6). |
| **`.gitignore` & Secret Exclusion** | **READY** | Root `.gitignore` strictly excludes `.env`, `*.pfx`, `*.log`, `backend/backups/`, `*.dump`, `*.dump.enc`, `*.enc`. Frontend `.gitignore` excludes `dist/`, `node_modules/`, and editor files. Verified with `git check-ignore`. | None. Secret and backup files are safely prevented from committing to git. |

---

## 3. Subsystem Breakdown & Verification Details

### 3.1 Environment Variables & Secret Hygiene
- **Inspection Finding**: `backend/scripts/audit_env.js` validates 10 environment variables, checks format constraints, and verifies bcrypt hash patterns (`/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`).
- **No Secret Leakage**:
  - `backend/.env.example` contains sanitized placeholders (`postgresql://user:password@...`, `<generate_bcrypt_hash_cost_12>`).
  - No database connection strings, passwords, or Gemini API keys are hardcoded in frontend or backend source files.
  - `git check-ignore backend/.env backend/backups/sph_backup.dump.enc` confirmed that active environment files and database dumps are excluded from version control.

### 3.2 Security Headers & CORS Controls
- **CORS Rules**: Handled in `backend/server.js#L69-L92`. When `NODE_ENV === 'production'`, only origins matching `ALLOWED_ORIGINS` are granted `Access-Control-Allow-Origin`. Wildcards (`*`) are disallowed.
- **OWASP Headers**: Enforced on every response:
  - `X-Frame-Options: SAMEORIGIN` (prevents clickjacking)
  - `X-Content-Type-Options: nosniff` (prevents MIME confusion)
  - `X-XSS-Protection: 0` (modern standard)
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (enforced on HTTPS and in production)
  - `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (permits barcode camera scanner, blocks audio/location)
  - `Cross-Origin-Opener-Policy: same-origin`

### 3.3 Vercel & Build Configuration
- **Serverless API**: `vercel.json` maps `/api/(.*)` to `@vercel/node` running `backend/server.js`.
- **Client SPA**: Maps `/frontend-react/package.json` to `@vercel/static-build` with `distDir: "dist"`.
- **Asset Routing**: Clean regular expression routing for PWA service worker (`/sw.js`), manifest (`/manifest.json`), images, icons, and fonts with `Cache-Control: max-age=0, must-revalidate`.
- **Build Verification**: `frontend-react` compiles cleanly via Vite v8.1.4 in 3.56s with zero errors, outputting modular chunks for `a4Printer.js`, `thermalPrinter.js`, `barcodeScanner.js`, and `cameraScanner.js`.

### 3.4 Database Migrations & Versioning
- **Engine**: `backend/migrate.js` operates transactionally and records migration state in `schema_migrations`.
- **Baseline Integrity**: The baseline command (`node backend/migrate.js baseline`) asserts the presence of all 17 Phase 1–4B tables and critical financial columns before writing the baseline record `20260306_000_baseline_phase4b`. It never replays historical DDL on an existing database.
- **Forward Migrations**: `node backend/migrate.js up` applies forward migrations (such as `20260306_001_phase4c_infrastructure.sql` for session table indexes) with SHA-256 checksum tamper validation.

### 3.5 Backup Automation & Health Monitoring
- **Backup Architecture**: `backend/scripts/backup_database.js` produces authenticated AES-256-GCM encrypted dumps with 12-byte random IVs and 16-byte AEAD authentication tags.
- **Offline Decryption**: `backend/scripts/decrypt_backup.js` requires zero application dependencies and decrypts directly to standard `PGDMP` archives.
- **Vercel Statelessness**: Because Vercel serverless functions have ephemeral local filesystems and strict execution timeouts, backups cannot run inside Vercel. An external cron scheduler (GitHub Actions or a dedicated back-office PC) must run `backup_database.js` nightly.
- **Health Endpoint**: `GET /api/health` returns JSON with server uptime and PostgreSQL round-trip latency (`database.latency_ms`) within a 5000ms bounded timeout. No internal credentials or error details are leaked.

### 3.6 Hardware Status Decoupling
- Hardware-dependent features (thermal receipt printing, A4 sticker sheet die-cut alignment, USB scanner carriage returns, camera scanner autofocus, and cash drawer RJ11 kicks) have standard web fallbacks and passing automated driver test suites.
- They do **not** block software deployment or staging validation. Physical verification remains cataloged as **PENDING** until hardware is connected on-site.

---

## 4. Chronological Production Setup & Go-Live Sequence

When you are ready to transition the system to live store operations, proceed in this exact chronological order:

```
[Phase 1: Environment Setup] ────────► [Phase 2: Software Deployment] ────────► [Phase 3: DB Migration Baseline]
  • Generate 256-bit encryption key      • Deploy backend & frontend to Vercel    • Run migrate.js baseline
  • Generate admin bcrypt hash           • Verify Vite build & routing            • Run migrate.js up
  • Configure Vercel env variables                                                • Probe /api/health (HTTP 200)
            │                                                                                   │
            ▼                                                                                   ▼
[Phase 4: Backup & Monitoring] ──────► [Phase 5: On-Site Hardware UAT] ───────► [Phase 6: Live Store Opening]
  • Schedule nightly backup cron         • Connect thermal printer (80mm)         • SPH Billing live for cashiers!
  • Configure offsite S3/R2 sync         • Verify A4 sticker margin alignment     • Active uptime monitoring
  • Vault backup key offline             • Verify USB barcode scanner Enter key
```

### Detailed Execution Steps:

#### Step 1: DevOps & Environment Configuration (Pre-Deployment)
1. **Generate Cryptographic Keys**:
   - Generate `BACKUP_ENCRYPTION_KEY`: 64-character random hex string (`crypto.randomBytes(32).toString('hex')`).
   - Generate `ADMIN_PASSWORD_HASH`: cost-12 bcrypt hash of the store owner's chosen master password.
2. **Populate Vercel Environment Variables**:
   - `DATABASE_URL`: Production Neon PostgreSQL connection string (`sslmode=require`).
   - `ADMIN_USERNAME`: Store administrator username.
   - `ADMIN_PASSWORD_HASH`: The generated bcrypt hash.
   - `ALLOWED_ORIGINS`: Production domain (e.g. `https://sph-billing.vercel.app`).
   - `NODE_ENV`: `production`.
   - `GEMINI_API_KEY`: Google Gemini API key.
   - `PG_MAX_POOL_SIZE`: `3`.

#### Step 2: Vercel Software Deployment
3. Deploy the application to Vercel.
4. Verify the build succeeds with 0 errors and static assets are served properly.

#### Step 3: Production Database Baseline & Health Probe
5. From an administrative environment with production `DATABASE_URL` configured:
   ```bash
   node backend/migrate.js baseline
   node backend/migrate.js up
   ```
6. Probe `https://<production-domain>/api/health`. Confirm HTTP 200 response with `status: "healthy"` and record baseline `database.latency_ms`.

#### Step 4: Backup Automation & External Monitoring
7. Configure a nightly automated task (GitHub Actions cron or store back-office PC Windows Task Scheduler) calling `node backend/scripts/backup_database.js`.
8. Configure offsite replication of `.dump.enc` files to AWS S3 (with Object Lock) or Cloudflare R2.
9. Store the `BACKUP_ENCRYPTION_KEY` in secure offline custody (printed paper in store safe).
10. Register `https://<production-domain>/api/health` with BetterStack, Datadog, or UptimeRobot with a 60-second probe interval.

#### Step 5: Physical Hardware Verification (Phase 4D Step 6)
11. When physical hardware arrives at the Kallakurichi store:
    - Connect 80mm thermal receipt printer; lock browser print settings to Scale: 100%, Margins: None, Headers/Footers: Off.
    - Feed 24-up / 40-up A4 sticker sheets into the laser printer bypass tray; print a test sheet from `PrintTags.jsx` to verify die-cut alignment.
    - Plug in handheld USB barcode scanner; scan 5 test items into the billing screen to confirm auto-add on Enter.
    - Run 1 hour of simultaneous test billing on Terminal 1 and Terminal 2.

#### Step 6: Live Store Opening
12. Transition to live cashier operations at Sri Parvathi Hardwares.

---

*Report certified following completion of Phase 4D Step 5.*
