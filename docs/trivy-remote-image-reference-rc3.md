# RC3 Trivy registry image-reference fix

## Symptom

Trivy fails with `MANIFEST_UNKNOWN` for a reference similar to:

```text
registry.k8s.io/coredns/coredns:v1.14.6@sha256:520212b8...
```

The m9sweeper image inventory stores a Kubernetes runtime image hash, but the legacy Java worker appended it to the registry name as though it were a registry **manifest** digest. These digest types are not interchangeable. The worker has no Docker/containerd/Podman socket, which is expected for a remote-registry scan; mounting the host socket is not required.

## Fix

The Java Trivy scanner now uses `--image-src remote` and the registry **tag** (for example, `registry.k8s.io/coredns/coredns:v1.14.6`), not `tag@sha256:<runtime image id>`. If the tag is gone or private authentication fails, the scan must report failure, not silently mark it clean. Tags are mutable: inspect the resolved digest in Trivy metadata and **do not claim the scan proves the precise runtime image digest** unless they match after appropriate manifest resolution.

## PowerShell reproduction and validation

Run from the repository root:

```powershell
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed

cd platform\trawler
mvn -B -ntp test
cd ..\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml build trawler
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --no-deps --force-recreate trawler
docker exec m9sweeper-trawler trivy --version
```

Check the exact registry tag before submitting new queued work:

```powershell
docker exec m9sweeper-trawler trivy image --image-src remote --timeout 10m --scanners vuln --format json registry.k8s.io/coredns/coredns:v1.14.6 > "$env:TEMP\coredns-trivy.json"
if ($LASTEXITCODE -ne 0) { throw 'Remote Trivy registry scan failed' }
$report = Get-Content "$env:TEMP\coredns-trivy.json" -Raw | ConvertFrom-Json
$report.ArtifactName
$report.Metadata.RepoDigests
$report.Results | ForEach-Object { $_.Vulnerabilities } | Group-Object Severity | Select-Object Name,Count
```

If this manual check succeeds, open Dash, select the correct cluster and its image, and request a rescan. Check:

```powershell
docker logs m9sweeper-trawler --tail 100
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT r.id,r.image_id,i.cluster_id,to_timestamp(r.created_at/1000.0) AS scanned_at FROM image_scan_results r JOIN images i ON i.id=r.image_id ORDER BY r.id DESC LIMIT 10;"'
```

**Acceptance:** a new correctly attributed result exists in PostgreSQL; the corresponding Angular view displays actual findings; scanner failures are not clean. If the exact tag no longer exists, do not replace it with an unrelated tag and claim the current runtime image was assessed.

No host Docker socket mount, database reset, or disabling of scanner-failure classification is necessary.

## RC3 dashboard scan-stall correction (2026-11-07)

A direct CLI scan could finish while the dashboard worker appeared stuck because the Java scanner performed `trivy image --clear-cache` before every scan. This separate cache process had no progress output or timeout in the worker, and cache purging could contend with other scans. RC3 removes that per-scan cache step, logs the **actual registry tag** rather than the obsolete runtime digest, and preserves the Trivy exit status instead of masking it with shell cleanup commands.

### Apply and test without touching your existing Postgres volume

```powershell
cd D:\AWS\repos\m9sweeper-modern
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed
cd platform\trawler
mvn -B -ntp test
cd ..\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml build trawler
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --no-deps --force-recreate trawler
docker logs m9sweeper-trawler --tail 80
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
```

If messages were previously stuck `unacknowledged`, recreating the worker will cause RabbitMQ to redeliver them. Do **not** repeatedly click Scan while one is processing. Repeated invalid/failed jobs may eventually appear in the durable `trawler_queue.failed` quarantine; inspect the queue but do not purge or replay messages without identifying their failure cause.

### Check the specific image scan

```powershell
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,name,tag,scan_queued,scan_results,critical_issues,major_issues FROM images WHERE name LIKE '%coredns%' ORDER BY id DESC;"'
docker logs m9sweeper-trawler --since 10m --tail 160
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
```

The worker should log `Initiating remote Trivy scan of registry.k8s.io/coredns/coredns:v1.14.6`, `Remote Trivy process launched`, and a process exit status. A completed valid scan should clear `scan_queued` and update the database; the dashboard should show findings, not a clean status. Use the full [Trivy queue-to-UI acceptance](trivy-rc3-live-acceptance.md) to verify that result.

**Limitations:** The worker may still reprocess jobs when its report upload fails and can quarantine them after bounded retries; a quarantined scan may leave `scan_queued` set in the existing schema until explicit failure reconciliation is implemented. No claim of completed live dashboard acceptance is made by this source change.
