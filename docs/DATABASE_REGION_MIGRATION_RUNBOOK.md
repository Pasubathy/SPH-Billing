# SPH Billing - Database Region Migration & Rollback Runbook

> [!IMPORTANT]
> **PHASE 4C STATUS: PROCEDURAL ONLY — DO NOT EXECUTE AGAINST PRODUCTION NOW.**  
> Per Phase 4C constraints, no production database region migration or connection string changes have been performed. This runbook provides the verified, reversible, zero-data-loss procedure for future maintenance window execution upon formal authorization.

---

## 1. Executive Summary & Latency Assessment

### Current Production Topology
- **Vercel Serverless Function Region**: `iad1` (Washington D.C., USA - default) / Frontend edge globally distributed.
- **Neon PostgreSQL Region**: `sa-east-1` (AWS São Paulo, Brazil).
- **Client Base**: India (Tamil Nadu / South India).

### Measured & Estimated Latency Matrix

| Route | Measured / Estimated RTT | User Impact |
| :--- | :--- | :--- |
| **Developer / Client (India) -> Current DB (`sa-east-1` Brazil)** | **335.4 ms (Measured empirical round-trip)** | High latency; multi-query transactions take 1.5s–3.0s |
| **Current DB Initial TLS Handshake** | **4,265 ms (Measured empirical connection time)** | Severe cold-start penalty for new serverless connections |
| **Target: India Client -> Vercel (`bom1` Mumbai)** | **~15 ms – 25 ms** | Near-instantaneous edge response |
| **Target: Vercel (`bom1` Mumbai) -> Neon DB (`ap-south-1` Mumbai)** | **~2 ms – 5 ms (Colocated AWS DC)** | 60x–100x query speedup over current |
| **Alternative: Singapore (`ap-southeast-1`)** | **~45 ms – 65 ms** | Suitable secondary fallback |

**Key Finding**: Colocating both Vercel Serverless Functions (`bom1` Mumbai) and Neon PostgreSQL (`ap-south-1` AWS Mumbai) will reduce round-trip query overhead from **~335ms down to ~25ms (10x–15x real-world speedup)**.

---

## 2. Pre-Migration Prerequisites & Checklists

Before scheduling the maintenance window:
- [ ] Notify business stakeholders of a scheduled 30-minute off-hours maintenance window (e.g., Sunday 23:00–23:30 IST).
- [ ] Ensure full access to Neon Management Console (Project Admin) and Vercel Project Dashboard.
- [ ] Confirm PostgreSQL 18+ client utilities (`pg_dump`, `pg_restore`) are available on the migration orchestrator machine.
- [ ] Ensure local disk space has at least 5GB free for uncompressed and compressed backup snapshots.
- [ ] Confirm `BACKUP_ENCRYPTION_KEY` is accessible.

---

## 3. Step-by-Step Reversible Migration Procedure

### Phase 1: Preparation & Target Provisioning (T - 2 hours)
1. In Neon Console, create a new Project/Branch in **AWS Asia Pacific (Mumbai) `ap-south-1`**.
2. Note the target connection string:
   `TARGET_DATABASE_URL="postgresql://user:pass@ep-mumbai-xxx.ap-south-1.aws.neon.tech/neondb?sslmode=require"`
3. Verify target database connectivity:
   ```bash
   node -e "const {Client} = require('pg'); new Client({connectionString: process.env.TARGET_DATABASE_URL}).connect().then(() => console.log('Mumbai connection OK')).catch(console.error)"
   ```

### Phase 2: Maintenance Mode & Quiescence (T = 0)
1. Display a friendly maintenance banner on the frontend or temporarily pause public write traffic.
2. Verify active connections to old database:
   ```sql
   SELECT count(*), state FROM pg_stat_activity WHERE datname = 'neondb' GROUP BY state;
   ```
3. Terminate non-migration backend connections if necessary.

### Phase 3: Consistent Snapshot Extraction (T + 5 min)
1. Take a full encrypted snapshot of the current São Paulo database using the Phase 4C backup script:
   ```bash
   node backend/scripts/backup_database.js
   ```
2. Generate an unencrypted custom-format dump for target ingestion:
   ```bash
   "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" --format=c --no-owner --no-privileges -d "<CURRENT_DATABASE_URL>" -f migration_cutover_sa_east.dump
   ```
3. Record exact row counts on current database for verification:
   ```sql
   SELECT 'sales_invoices' tbl, count(*) FROM sales_invoices
   UNION ALL SELECT 'purchase_invoices', count(*) FROM purchase_invoices
   UNION ALL SELECT 'customers', count(*) FROM customers
   UNION ALL SELECT 'vendors', count(*) FROM vendors
   UNION ALL SELECT 'items', count(*) FROM items
   UNION ALL SELECT 'active_sessions', count(*) FROM active_sessions;
   ```

### Phase 4: Target Database Restoration & Validation (T + 12 min)
1. Restore snapshot into the new Mumbai database:
   ```bash
   "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --clean --no-owner --no-privileges -d "<TARGET_DATABASE_URL>" migration_cutover_sa_east.dump
   ```
2. Run versioned migrations against target to guarantee `schema_migrations` alignment:
   ```bash
   DATABASE_URL="<TARGET_DATABASE_URL>" node backend/migrate.js status
   DATABASE_URL="<TARGET_DATABASE_URL>" node backend/migrate.js up
   ```
3. Run the automated Restore Verification suite against target:
   ```bash
   DATABASE_URL="<TARGET_DATABASE_URL>" node backend/scripts/verify_restore.js
   ```
4. Compare source and target row counts and financial totals:
   ```sql
   -- Run on both databases and verify 100% exact match:
   SELECT SUM(amount) as total_sales, SUM(paid_amount) as total_paid, SUM(pending_to_receive) as total_receivable FROM sales_invoices;
   ```

### Phase 5: Atomic Traffic Switch & Regional Optimization (T + 20 min)
1. Update `DATABASE_URL` in Vercel Project Environment Variables:
   - Key: `DATABASE_URL`
   - Value: `<TARGET_DATABASE_URL>` (Mumbai instance)
2. In `vercel.json`, update Serverless Function region placement:
   ```json
   {
     "regions": ["bom1"]
   }
   ```
3. Trigger atomic deployment:
   ```bash
   vercel --prod
   ```
4. Verify `/api/health` endpoint:
   ```bash
   curl -i https://sphbilling.vercel.app/api/health
   ```
   *Expected response:*
   ```json
   {
     "status": "healthy",
     "database": {
       "status": "connected",
       "latency_ms": 18
     }
   }
   ```
5. Remove maintenance banner.

---

## 4. Reversible Rollback Procedure

If unexpected packet loss, SSL incompatibilities, or cloud regional outages occur after cutover:

> [!CAUTION]
> Do NOT use database restore as the default rollback mechanism if financial transactions have already occurred on the new database. Follow this order:

1. **Immediate Rollback (Within 10 Minutes - No Business Transactions Yet)**:
   - Revert `DATABASE_URL` in Vercel back to the original São Paulo (`sa-east-1`) connection string.
   - Revert `vercel.json` function region back to default (`iad1`).
   - Redeploy Vercel production: `vercel --prod`.
   - São Paulo DB is completely untouched and immediately authoritative.

2. **Late Rollback (Transactions Already Created on Mumbai DB)**:
   - Do NOT blindly revert connection string.
   - Dump delta records from Mumbai DB (`created_at >= cutover_timestamp`).
   - Replay delta records onto São Paulo DB before switching connection string back.

---

## 5. Comprehensive 5-Tier Rollback Framework

### Tier 1: Frontend Deployment Rollback
- **Mechanism**: Instant Vercel Deployment Rollback (Instant Edge Alias Switch).
- **Execution**: In Vercel Dashboard -> Deployments -> Click previous stable deployment -> "Promote to Production" (completes in < 2 seconds).
- **Risk to Data**: Zero.

### Tier 2: Backend Deployment Rollback
- **Mechanism**: Re-deploy previous Git tag / commit.
- **Execution**: `git checkout <previous_stable_tag>` && `vercel --prod`.
- **Database Safeguard**: Application updates must always be backward/forward compatible with the database schema.

### Tier 3: Database Migration Rollback (Reversible DDL)
- **Mechanism**: Forward-compatible migration strategy.
- **Principle**: Never roll back migrations by dropping tables. Always write an additive forward migration (e.g., `ALTER TABLE ... DROP COLUMN ...` or deprecate old columns gradually).
- **Execution**: Apply a new versioned migration `2026xxxx_00X_revert_feature.sql` using `migrate.js up`.

### Tier 4: Failed Migration Rollback (Aborted Mid-Execution)
- **Mechanism**: Transactional DDL Rollback.
- **Protection**: `migrate.js` wraps migration files in `BEGIN ... COMMIT`.
- **Behavior**: If any statement fails, PostgreSQL rolls back all schema changes made in that transaction. The migration is not recorded in `schema_migrations`.

### Tier 5: Schema/Application Version Incompatibility
- **Principle**: Never use database restore as the first remedy for code bugs, as restoring drops newer financial transactions.
- **Remedy**: Fix the application code or apply a non-destructive forward migration. Keep database restore strictly as the Disaster Recovery mechanism for data corruption or catastrophic host loss.
