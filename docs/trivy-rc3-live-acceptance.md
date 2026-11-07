# RC3 Trivy queue → worker → database → Angular live acceptance

**Release gate:** A standalone Trivy binary or passing unit tests do not prove the integrated product workflow. Use a **nonproduction** registered cluster and an image you are authorized to assess. Preserve your existing database; never run Docker Compose with `down -v`.

## 1. Check out the newest integration changes and rebuild

Run from the repository root in PowerShell:

```powershell
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed
cd platform\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.kind.yml ps
Invoke-WebRequest http://localhost:3000/api/health
```

If you want to isolate regressions without rebuilding the complete stack:

```powershell
cd ..\dash\backend
npm ci --legacy-peer-deps
npx jest image.service.spec.ts image.controller.spec.ts falco.controller.spec.ts kube-hunter.controller.spec.ts --runInBand
npm run build:api
cd ..\..\trawler
mvn -B -ntp test
```

## 2. Baseline the queue and database before scanning

```powershell
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,image_id,to_timestamp(created_at / 1000.0) AS time FROM image_scan_results ORDER BY id DESC LIMIT 10;"'
```

Record the latest `image_scan_results.id` for comparison. Identify the correct cluster and image in the Angular UI.

## 3. Trigger a real product scan

In Dash at `http://localhost:3000`, log in as a permitted administrator, select an already onboarded cluster, and navigate to **Images**. Confirm that an active vulnerability policy with an enabled Trivy scanner is assigned to the target cluster. Select an existing image and use **Scan/Rescan**.

The API should enqueue the requested image and mark it as queued; the Java trawler should consume from `trawler_queue`, run the actual Trivy executable, and submit the scanner result through the authenticated API. No sample JSON or fabricated CVEs are acceptable evidence.

## 4. Assert worker-to-database persistence

```powershell
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker compose -f docker-compose.yml -f docker-compose.kind.yml logs --tail=120 trawler
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT r.id,r.image_id,i.cluster_id,to_timestamp(r.created_at / 1000.0) AS scanned_at FROM image_scan_results r JOIN images i ON i.id=r.image_id ORDER BY r.id DESC LIMIT 10;"'
```

**Pass:** a new scan result ID exists for the selected image and cluster. Its timestamp must postdate the scan trigger. The queue must not be stuck unacknowledged. Repeated scanner failures may place the message in the durable `trawler_queue.failed` queue after three retries; inspect that queue before treating a missing result as a lost scan. Do not share unredacted logs: registry credentials and previous legacy token URLs may appear.

## 5. Confirm evidence in Angular

Open **Images → selected image → scan results**. Match the report date, policy and severity counts against the newly persisted DB record. HIGH and CRITICAL findings must not count as compliant. Scanner errors must not display as clean reports. The page must distinguish pending/failed scans from completed scans.

## 6. Failure-path test in a disposable environment

Do not stop RabbitMQ or alter a real production system. On an isolated test copy, interrupt the Dash ingestion service while a scan is outstanding. Verify that the trawler **does not acknowledge** a scan when it cannot persist the report, and that RabbitMQ still carries the message. Restore the service and confirm the report eventually persists. Beware of repeated attempts and duplicates if the server persisted a report just before the connection failed.

**Not yet production hardened:** the worker now republishes failed deliveries with a bounded retry count and quarantines them in `trawler_queue.failed`. A queued message is acknowledged only after a confirmed broker publish or a completed Dash submission. At-least-once delivery can still create duplicate reports if the API commits but its response is lost. A transactional/idempotent scan-run identifier, operator-visible dead-letter handling and monitored retries are required before claiming production reliability.

## Fail-closed conditions

- Broker publish failure must return a failed API request, not “queued”.
- Worker/API failure must not be acknowledged or represented as a clean scan.
- Empty, incomplete or negative-count report payloads must be refused.
- A report whose image ID belongs to another cluster must be refused.
- Ingestion requires an authorized trawler identity, and read routes require authentication.

Mark this gate complete only after the operator records the new report ID, timestamp, correct cluster and matching Angular findings.
