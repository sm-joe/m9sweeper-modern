# RC3 CoreDNS image: stale spinner and historical Trivy error

## Scope
This issue applies to an original CoreDNS image whose `images.scan_queued` remained true after a previous scan was misattributed to another image ID. The screenshot can also show an **old** scanner error while a later registry scan works. Do **not** use the displayed SHA string under “Image ID” as the PostgreSQL image primary key; use `images.id`.

## Fix in RC3
- Image results are stored against the **requested** image ID, not a newly inserted row when the remote registry digest differs from the runtime image hash.
- Queue flag is set before publishing and cleared on completed persistence.
- The Angular page now has one polling subscription, unsubscribes when the page is destroyed, and stops showing the spinner on failed status HTTP calls or a ten-minute timeout (with a warning).
- Report summary selection no longer mutates the table's underlying result array.

## Verify with non-destructive queries

PowerShell, from the project host:

```powershell
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,url,name,tag,scan_queued,scan_results,last_scanned,critical_issues,major_issues FROM images WHERE name='''coredns/coredns''' AND tag='''v1.14.6''' ORDER BY id;"'
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker logs m9sweeper-trawler --since 10m --tail 100
```

The queue having zero messages is necessary but **not sufficient** by itself: also confirm no scan process is active and no external worker is processing that ID.

## One-time repair for the reported original image ID 1

Only after confirming the scan is idle, taking a database backup, verifying that `images.id=1` is the affected CoreDNS image for the correct cluster and no scan is active, run:

```powershell
docker exec postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE images SET scan_queued=false WHERE id=1 AND name='''coredns/coredns''' AND tag='''v1.14.6''' AND scan_queued=true RETURNING id,cluster_id,scan_queued,scan_results,last_scanned;"'
```

This corrects the stale loading state **only**, and does not delete old scan history, clear errors or manufacture clean findings. If the command returns zero rows, the reported condition no longer matches.

## Build the latest UI and backend

```powershell
cd "D:\Suks Repos\m9sweeper-modern"
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed
cd platform\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build dash
```

After the rebuild, reload the Angular page. Historical failed scan evidence should remain visible when its date is selected; it must not be rewritten to claim success. Trigger **one** fresh rescan of the original database ID; check that the new report is saved under that ID, the queue flag becomes false, and findings appear with a correct Non-compliant status if HIGH/CRITICAL vulnerabilities exist.

```powershell
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,image_id,policy_id,created_at FROM image_scan_results WHERE image_id=1 ORDER BY created_at DESC LIMIT 8;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,scan_queued,scan_results,major_issues FROM images WHERE id=1;"'
```

Do not remove ID 9 or other historical rows automatically. Review those as separate audit evidence.
