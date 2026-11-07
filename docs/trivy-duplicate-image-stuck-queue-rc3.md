# RC3: duplicated image row, false compliance and stuck queue remediation

## Root cause and source fix

If Trivy returns a registry digest different from the Kubernetes runtime image ID, the old Dash result-ingestion controller can insert another `images` row for the exact same name/tag. It then persists the report and clears `scan_queued` on the **new row**, leaving the originally queued image stuck at `scan_queued=true`.

Additionally, the old controller trusted a policy-compliance boolean even when the scan contained HIGH or CRITICAL findings, allowing `Compliant` with nonzero HIGH count.

The corrected controller **always persists to the requested image ID** after cluster ownership verification, does not change the original Kubernetes runtime digest, and forces `Non-compliant` for HIGH/CRITICAL findings or scanner execution errors. Enqueue status now updates **before** message publication and is rolled back when the publish fails; this eliminates the worker-completes-before-queued-flag race.

Do not blindly merge or delete image records. Duplicate rows can have different cluster IDs, image hashes and histories that require inspection.

## Update the code and run regressions (PowerShell)

```powershell
cd D:\AWS\repos\m9sweeper-modern
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed
cd platform\dash\backend
npm ci --legacy-peer-deps
npx jest image.controller.spec.ts image.service.spec.ts --runInBand
npm run build:api
cd ..\..\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build dash
```

Do not use `down -v`, truncate tables, or purge the RabbitMQ queue.

## Inspect existing rows and scan history (read only)

```powershell
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,url,name,tag,docker_image_id,running_in_cluster,scan_queued,scan_results,critical_issues,major_issues FROM images WHERE id IN (1,9) ORDER BY id;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,image_id,policy_id,policy_status,created_at FROM image_scan_results WHERE image_id IN (1,9) ORDER BY created_at DESC LIMIT 15;"'
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
```

**Do not reset image 1 while any scan is in progress.** Verify `trawler_queue` has 0 ready and 0 unacknowledged messages and the trawler logs show no active scan. These checks alone do not rule out an external producer or worker.

## One-time correction of the two reported rows

Only if (1) both rows match the original report (`id=1` stuck; `id=9` falsely compliant with HIGH=34), (2) no scan is active, and (3) you have a database backup, execute:

```powershell
docker exec postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN; UPDATE images SET scan_queued=false WHERE id=1 AND name='''coredns/coredns''' AND tag='''v1.14.6''' AND scan_queued=true; UPDATE images SET scan_results='''Non-compliant''' WHERE id=9 AND name='''coredns/coredns''' AND tag='''v1.14.6''' AND scan_results='''Compliant''' AND (COALESCE(critical_issues,0)>0 OR COALESCE(major_issues,0)>0); COMMIT; SELECT id,scan_queued,scan_results,major_issues FROM images WHERE id IN (1,9) ORDER BY id;"'
```

This only corrects the stale loading flag and unsafe compliance label, **not** the scan history. It does not certify image 1 as clean. Row 9 is retained for audit and can be analyzed separately.

## Rerun and verify

In Dash, use cluster Images, select the **original image row** (ID 1), request one scan and do not submit duplicates while the queue is processing.

```powershell
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker logs m9sweeper-trawler --since 10m --tail 160
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,scan_queued,scan_results,critical_issues,major_issues,last_scanned FROM images WHERE id IN (1,9) ORDER BY id;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,image_id,policy_id,policy_status,created_at FROM image_scan_results WHERE image_id IN (1,9) ORDER BY created_at DESC LIMIT 15;"'
```

**Pass:** a fresh report is attached to original image ID 1; ID 1 queue flag becomes false after persistence; a result containing HIGH findings is Non-compliant. No new duplicate row is created from a mismatched registry digest. The Angular dashboard displays the result for image ID 1. If this fails, leave the RC3 release gate open.
