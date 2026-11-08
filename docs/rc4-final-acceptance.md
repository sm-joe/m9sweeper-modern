# RC4 integrated security and reliability acceptance

**Post-merge status (2026-11-08):** RC4 was integrated through PR #8 and promoted to `main` through PR #9 (`9b77f9d`). Source CI passed on `b97df4f`. Operator-confirmed real Trivy scan UUID `2a00ae7c-3d55-4667-9d0e-9a7607b176f8` reached `completed`, produced a persisted noncompliant policy report and showed in Angular. Falco modern eBPF generated a real sensitive-file read alert; cluster 1 PostgreSQL reported three events, and the operator confirmed the Angular view. The operator additionally reported that scoped RBAC, controlled DLQ failure/recovery and staging production-acceptance tests passed, **but detailed redacted negative-HTTP, DLQ and Helm rollback artifacts have not been attached**.

**Release boundary:** RC4 was merged as a validated integration candidate, **not** a certified, signed or generally supported production distribution. New Linux/Kubernetes requirements and unresolved public-production gates are in [Linux/Kubernetes release readiness](linux-k8s-release-readiness.md). The procedures below remain useful for reproducing acceptance in an isolated cluster. Do not use the old draft-PR gating statement as the current project status.

This runbook assumes a **development** Docker Compose + Kind deployment, and that RC3 Trivy and kube-hunter already worked. Preserve existing Postgres volumes, scanner Secrets, RabbitMQ queues and reports. Take a verified Postgres backup before applying migrations.

## 1. Pull, compile and test

In PowerShell:

```powershell
cd "D:\Suks Repos\m9sweeper-modern"
git fetch origin
git switch release/m9sweeper-new-rc4-security-reliability
git pull --ff-only origin release/m9sweeper-new-rc4-security-reliability
git log -1 --oneline

cd platform\dash\backend
npm ci --legacy-peer-deps
npx jest image.controller.spec.ts image.service.spec.ts falco.controller.spec.ts falco.service.spec.ts kube-hunter.controller.spec.ts cluster-access.guard.spec.ts auth.guard.spec.ts authority.guard.spec.ts scanner-ingest-auth.spec.ts --runInBand --no-cache
npm run build:api
cd ..\..\trawler
mvn -B -ntp test
```

For a full backend suite: `cd ..\dash\backend; npm test -- --runInBand`.

## 2. Backup and deploy schema

A new `image_scan_runs` table and `image_scan_results.scan_run_id` column are **mandatory** before deploying the RC4 Dash/trawler combination. A `cluster_user_access` table stores explicit user grants. On Compose, the `dash-init` job runs migrations with `DATABASE_MIGRATION_ENABLED=1`.

First backup (choose a private local backup destination and restrict access):

```powershell
cd ..\docker-compose
docker exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --file=/tmp/m9sweeper-pre-rc4.dump'
if ($LASTEXITCODE -ne 0) { throw 'Postgres backup failed' }
docker cp postgres:/tmp/m9sweeper-pre-rc4.dump "$env:TEMP\m9sweeper-pre-rc4.dump"
if ($LASTEXITCODE -ne 0) { throw 'Postgres backup copy failed' }
```

Run Compose initialization and the new application (no `down -v`):

```powershell
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build dash-init
docker compose -f docker-compose.yml -f docker-compose.kind.yml logs --tail=100 dash-init
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build dash trawler
docker compose -f docker-compose.yml -f docker-compose.kind.yml ps
```

Confirm schema before accepting any new scan:

```powershell
docker exec postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT to_regclass('''public.image_scan_runs''') AS scan_runs,to_regclass('''public.cluster_user_access''') AS cluster_grants;"'
```

Both tables must exist. Check `information_schema.columns` for `image_scan_results.scan_run_id`. A missing table means migrations did not complete: **do not start scanning on RC4**.

## 3. Apply per-cluster authorization grants

Human users who are not SUPER_ADMIN must be owners of the cluster's group or have an explicit `cluster_user_access` row. Access remains additionally restricted by each endpoint's global authority checks. The SUPER_ADMIN-only API is:

- `GET /api/clusters/access/{clusterId}/users`
- `POST /api/clusters/access/{clusterId}/users/{userId}` with JSON `{"canWrite": true}` (or false for read-only)
- `DELETE /api/clusters/access/{clusterId}/users/{userId}`

Use your authenticated super-admin session/client. Never place a bearer token in a shell command history or paste it into logs.

For scanner identities, **first grant** write permission to the dedicated trawler, Falco and kube-hunter service users on the correct cluster ID. Once granted, set the following Dash environment option and recreate Dash:

```text
SCANNER_REQUIRE_CLUSTER_BINDINGS=true
```

The default stays legacy-compatible until grants are configured. This mode applies cluster bindings to scanner webhook/API service identities; test cross-cluster denied requests. To disable query-string keys, migrate the kube-hunter sender to header-based authentication before setting `SCANNER_ALLOW_LEGACY_QUERY_KEYS=false`. Do not enable raw API key exports.

**Negative tests:** an ADMIN with only cluster A access must get 403 from cluster B image/report endpoints. A scanner user bound only to A must get 401/403 for an ingest request targeting B and no event/scan row should be written.

## 4. Validate scan-run identity and correct completion

From Dash, request exactly one Trivy scan of a registered image in the authorized Kind cluster. Watch:

```powershell
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker logs m9sweeper-trawler --since 10m --tail 120
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,image_id,status,compliant,created_at,updated_at FROM image_scan_runs ORDER BY created_at DESC LIMIT 10;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT scan_run_id,policy_id,count(*) FROM image_scan_results WHERE scan_run_id IS NOT NULL GROUP BY scan_run_id,policy_id ORDER BY count(*) DESC LIMIT 10;"'
```

Expected: a UUID run transitions `queued → published/processing → completed`; each run/policy has exactly **one** result; image `scan_queued=false`; HIGH/CRITICAL findings remain Non-compliant in Angular. The full report, image summary and run completion are committed in one DB transaction.

## 5. Failure and dead-letter recovery

In an **isolated test deployment**, cause a controlled scanner failure (e.g. a nonexistent test-only registry image). After bounded retries, the job should be moved to `trawler_queue.failed`. The worker sends an authenticated terminal-failure callback to Dash. The corresponding run should become `failed` and the image's loading indicator should clear. An older failed run must **not** clear a newer active run.

If Dash is unavailable when the terminal callback is sent, the durable failed queue retains evidence. A five-minute periodic reconciler marks run IDs abandoned for over one hour as failed. This is *reconciliation*, not automatic safe rescan or DLQ replay. Replay requires an operator decision because the registry/credentials may remain broken.

```powershell
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,image_id,status,failure_reason,updated_at FROM image_scan_runs WHERE status='''failed''' ORDER BY updated_at DESC LIMIT 10;"'
```

Never purge the failed queue to make status appear green.

## 6. Live Falco acceptance

Use [Falco Kind acceptance](falco-rc3-live-acceptance.md) to set up a **Pod-reachable** Falcosidekick webhook with a Kubernetes Secret holding `WEBHOOK_ADDRESS` and `WEBHOOK_CUSTOMHEADERS`. Enable scanner cluster grants after creating them.

Before and after an authorized, benign test event, run:

```powershell
kubectl -n falco get pods
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,creation_timestamp,rule,level FROM project_falco_logs ORDER BY id DESC LIMIT 10;"'
```

Confirm a **new** event belongs to the test cluster, is visible in the corresponding Angular Falco dashboard, and that the actual Falco driver created the event (not a synthetic REST-only request). Negative cases: invalid key, unauthorized cluster, malformed payload and DB outage must fail closed. A notification-email outage **after event persistence** must not cause duplicate retries.

## 7. Final release gate

All of the following must be true, based on current SHA evidence:
- Full GitHub CI successful, including backend unit suite, frontend build, Java tests, Docker and Helm checks.
- Database migrations verified and backup restore tested.
- Trivy existing CoreDNS and a new scan complete correctly; no duplicate result on re-delivery.
- Quarantine and 1-hour stale reconciliation fail closed; retry and recovery evidence recorded.
- Human per-cluster grant/deny and scanner cross-cluster negative tests pass.
- Falco real event appears in PostgreSQL and Angular.
- kube-hunter remains working, with no unauthorized report access.
- No tokens are exposed via browser, logs, URLs or Helm values in the strict production configuration.

**Never mark RC4 production-ready based solely on green source CI or a successful Trivy CLI scan.** Production packaging additionally requires a verified Helm install/upgrade/rollback and approved supported-framework upgrade plan.

## Historical batch timeout recovery (November 7–8, 2026)

An operator reported ten image runs for cluster 1 (images 1–9, including two runs for image 2), created around 2026-11-07 19:03 UTC and all marked `failed: Scan timed out` together on 2026-11-08 at 06:51 UTC. This is evidence of stale-run reconciliation, **not** proof that Trivy failed on each image. The original one-hour threshold applied to queued/published jobs even when RabbitMQ prefetch was one; late jobs in a large batch could expire without ever getting a worker slot. RC4 now uses a 24-hour orphan threshold for queued/published jobs and one hour for report-ingestion claims.

**Do not change old failed rows to completed or purge the failed queue.**

After pulling the current RC4 branch, run the targeted Node/Jest and Java regressions:

```powershell
cd "D:\Suks Repos\m9sweeper-modern"
git fetch origin
git switch release/m9sweeper-new-rc4-security-reliability
git pull --ff-only origin release/m9sweeper-new-rc4-security-reliability
cd platform\dash\backend
npx jest image.dao.rc4.spec.ts image.service.spec.ts image.controller.spec.ts --runInBand --no-cache
npm run build:api
cd ..\..\trawler
mvn -B -ntp test
cd ..\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build dash trawler
docker compose -f docker-compose.yml -f docker-compose.kind.yml ps
docker logs m9sweeper-trawler --tail 80
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
```

Do one new Trivy rescan in Dash for **one** image (for example cluster 1, image 3 if it is still active and belongs to that cluster). Watch the worker log for the new `Received image scan job ... run UUID` line and successful Dash persistence acknowledgment. Check the new run and errors before scanning the remainder:

```powershell
$sql = @'
SELECT id, image_id, status, failure_reason,
       to_timestamp(created_at/1000.0) AS started,
       to_timestamp(updated_at/1000.0) AS updated
FROM image_scan_runs
WHERE cluster_id = 1 AND image_id = 3
ORDER BY created_at DESC LIMIT 3;
'@
$sql | docker exec -i postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Then run `\.\scripts\verify-rc4.ps1 -ClusterId 1 -ImageId 3` from the repository root. A new `completed` row, image queue cleared and report linked to that UUID are required for acceptance. If the new run fails, collect the **new** run UUID, `failure_reason`, worker logs and RabbitMQ queue counts. This distinguishes missing consumption from report-ingestion failure. Historical failures alone cannot identify the cause.

Keep the final RC4 acceptance gate open until current-commit CI and local runtime checks pass.
