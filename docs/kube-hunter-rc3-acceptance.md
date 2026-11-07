# kube-hunter RC3 acceptance evidence

**Scope:** Kind + Docker Compose development deployment. This checks real scan delivery, persisted rows, and the Angular UI. It is not a general production-security certification.

## 1. Pull and build the exact branch

From repository root:

```powershell
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed
cd platform\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build
docker compose ps
```

Do not delete existing Postgres volumes. The local Compose environment must contain unique credentials, a healthy Dash, and a Pod-reachable `SCANNER_REPORT_INGESTION_URL`.

## 2. Verify chart paths and connectivity

```powershell
cd ..\..
helm lint ./platform/manifests/charts/kube-hunter --strict --set cronjob.enabled=true --set-string dispatchAuth.existingSecret=m9sweeper-kube-hunter-dispatch
helm lint ./platform/manifests/charts/kube-hunter --strict --set cronjob.enabled=false --set-string dispatchAuth.existingSecret=m9sweeper-kube-hunter-dispatch
kubectl -n m9sweeper-system get secret m9sweeper-kube-hunter-dispatch
$endpoint = (docker exec m9sweeper-dash printenv SCANNER_REPORT_INGESTION_URL).TrimEnd('/')
kubectl run dash-connectivity-test -n m9sweeper-system --image=curlimages/curl:8.12.1 --restart=Never --rm -i -- curl -fsS --max-time 15 "$endpoint/api/health"
```

Expected: both lint modes pass, Secret exists and a Kind Pod successfully reaches Dash. The Secret must carry the **rotated** API key; do not print it.

## 3. Record baseline and run one-time scan

Set the actual registered numeric cluster ID:

```powershell
$clusterId = 1
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,created_at FROM kube_hunter ORDER BY id DESC LIMIT 5;"'
helm upgrade --install kube-hunter ./platform/manifests/charts/kube-hunter -n m9sweeper-system --set cronjob.enabled=false --set-string dispatchAuth.existingSecret=m9sweeper-kube-hunter-dispatch --wait --timeout 10m
kubectl -n m9sweeper-system get jobs,pods
```

For Job log inspection, select the actual `kube-hunter` Job name reported by `kubectl get jobs` and run `kubectl logs -n m9sweeper-system job/<JOB_NAME>`. **Do not paste raw logs publicly:** the legacy HTTP dispatcher can leak its URL query token.

## 4. Verify persisted report and correct tenant/cluster mapping

```powershell
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,to_timestamp(created_at / 1000.0) AS scanned_at, json_typeof(vulnerabilities) AS vulnerability_data_type FROM kube_hunter ORDER BY id DESC LIMIT 10;"'
```

Expected: a **new** record appears after the scan with the intended `cluster_id`, a fresh `created_at`, and parseable `vulnerabilities` JSON. A row from a previous scan is not evidence of a new successful delivery.

Do not mutate, truncate, or delete scanner-report rows to run this test.

## 5. Verify Angular dashboard

Open Dash in the browser, select the same cluster ID, and go to **kube-hunter → Past Audits**. Confirm:
- New report ID and timestamp match the database row.
- The report details display the same vulnerabilities returned by kube-hunter.
- The Low, Medium and High counters represent the actual findings; they must not start at 1 with no evidence.
- Errors or missing reports do not display as a clean, successful audit.

## Pass conditions

All of these must be true: chart lint and Kubernetes connectivity pass; kube-hunter Job executes; fresh report persists in PostgreSQL for correct cluster; Angular displays the fresh report and accurate findings. If any item fails, keep live acceptance pending.

Security limitations: the legacy ingest token is still query-string-based inside the kube-hunter dispatcher; a header-based relay, read-side authorization, and secret rotation policies remain separate production blockers.
