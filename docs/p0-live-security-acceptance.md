# P0 live security acceptance — PR #11

**Status:** SOURCE CHANGES ONLY until the operator performs and records the staging checks below. Do not merge PR #11 or deploy header-only authentication to the working Kind installation without collector migration. Preserve existing scanner configuration, PostgreSQL volumes and RabbitMQ messages.

## What the branch changes

- Scanner report endpoints default to `X-API-Key` and reject `?key=` unless temporary `SCANNER_ALLOW_LEGACY_QUERY_KEYS=true` is explicitly configured.
- kube-bench uses the shared credential selector, rejects malformed header downgrade, and honors cluster grants when `SCANNER_REQUIRE_CLUSTER_BINDINGS=true`.
- Raw kube-bench key export is disabled unless explicitly allowed and is SUPER_ADMIN-only.
- kube-bench report reads/deletes, cluster events, namespace inventory and vulnerability exports now require cluster access checks; unscoped aggregates fail for non-SUPER_ADMIN until a safe filtered-aggregate implementation exists.
- kube-hunter Helm supports an **opt-in** localhost relay. With `reportRelay.enabled=true`, kube-hunter POSTs to `http://127.0.0.1:8765/`; the isolated sidecar injects `X-API-Key` into a verified HTTPS POST to Dash. No URL token is required. The legacy path is unchanged when relay is disabled.

## Source/Helm checks

On a Linux developer host:

```bash
git fetch origin
git switch security/p0-retire-query-key-default
git pull --ff-only
cd platform/dash/backend
npm ci --legacy-peer-deps
npx jest scanner-ingest-auth.spec.ts kube-bench.controller.spec.ts kube-hunter.controller.spec.ts cluster-access.guard.spec.ts --runInBand --no-cache
npm run build:api
cd ../../..
helm lint platform/manifests/charts/kube-hunter --set reportRelay.enabled=true \
  --set-string reportRelay.targetUrl=https://dash.example.invalid/api/kubehunter/hunter/1 \
  --set-string reportRelay.existingSecret=report-auth
helm template hunter platform/manifests/charts/kube-hunter --set cronjob.enabled=false \
  --set reportRelay.enabled=true \
  --set-string reportRelay.targetUrl=https://dash.example.invalid/api/kubehunter/hunter/1 \
  --set-string reportRelay.existingSecret=report-auth > /tmp/hunter-relay-render.yaml
```

Inspect rendered volumes and sidecar, ensure `REPORT_RELAY_API_KEY` references a Secret and the kube-hunter callback contains no query credentials. A successful Helm render **does not** prove delivery.

## Linux Kubernetes staging migration

1. Take a verified off-cluster PostgreSQL backup and capture the existing Helm release values securely. Do not delete the working kube-hunter Job, Secret or Docker/Kind networks.
2. Choose an HTTPS Dash ingestion hostname reachable from the cluster with a certificate trusted by the relay Pod. A private test CA must be mounted and installed in the relay's trust store before use; do not turn off TLS verification.
3. Provision a least-privilege scanner identity that has KUBEHUNTER authority and an explicit write grant for the chosen cluster. Create its token as a Kubernetes Secret using protected input (never a URL). Example when a protected local file exists:
   ```bash
   kubectl -n m9sweeper-system create secret generic m9sweeper-kube-hunter-relay-auth \
     --from-file=apiKey=/secure/path/kube-hunter-token
   ```
4. In a separate staging namespace/release, configure the chart values `reportRelay.enabled=true`, `reportRelay.targetUrl=https://<trusted-dash-host>/api/kubehunter/hunter/<cluster-id>`, `reportRelay.existingSecret=m9sweeper-kube-hunter-relay-auth`, and `cronjob.enabled=false`. Do not include the token in values or CLI arguments.
5. Run a scan and verify all of: healthy sidecar, HTTP success from reporter, a new `kube_hunter` row for the correct cluster, and the same result in Angular. Check that failed relay delivery gives no new report and no fabricated clean result.
6. Negative tests: missing credential, malformed header, wrong scanner role, revoked token, wrong cluster, invalid cluster ID, malicious URL query token, and unreachable upstream must not create a report.
7. In Dash staging, enable `SCANNER_REQUIRE_CLUSTER_BINDINGS=true` and `SCANNER_ALLOW_LEGACY_QUERY_KEYS=false`. Verify live Falco, kube-bench, kube-hunter and Java trawler still ingest, with separate credentials and explicit grants.
8. Rotate all legacy URL-exposed credentials; validate no key appears in ingress/proxy logs. Only then plan upgrade of the existing cluster.

## Cross-cluster authorization matrix

Create two independently granted clusters A and B, a SUPER_ADMIN, a read-only user granted only A, a writer granted only A, and an ungranted user. For each endpoint below, record the HTTP status, database row count delta, and absence of rows belonging to cluster B.

| Endpoint family | Positive | Negative |
| --- | --- | --- |
| kube-bench upload | Header token and A scanner grant | URL-only token, B scanner token, malformed header |
| kube-bench GET/DELETE by report ID | Allowed A user and matching A report | A-only user with B report ID, read-only delete |
| kube-hunter upload/read by report ID | Authorized A sender or A reader | B report ID or B-scoped scanner identity |
| Falco webhook/events | A-scoped sender and A event | B event ID and invalid A sender |
| Cluster event list/create | Granted A reader/writer respectively | Unauthorized B query or write |
| Namespace inventory | Authorized explicit A scope | Missing scope or B scope |
| Vulnerability exports, CSV, history | Authorized explicit A scope | Missing scope or B scope |

Verify endpoint-specific resource IDs and nested IDs, not only the cluster ID in the URL. Non-super-admin global reports currently require an explicit cluster: record any Angular compatibility regressions.

## Helm and database gate (not replaced by rendering)

On each claimed supported **Linux-node** Kubernetes version: `helm upgrade --install --wait --atomic`; verify Dash, PostgreSQL, broker, trawler, scanner, and UI; back up DB; deploy a new image; run migrations; induce a failed upgrade; run rollback; restore the backup **into a separate database** and validate counts and foreign keys; document rollback constraints of irreversible migrations. Record SHA, image digests, Helm revisions, chart version, Kubernetes/kernel details and redacted evidence. Keep PVC and RabbitMQ DLQ data intact.

## Outstanding release blockers

- Live staged kube-hunter relay report persistence and rejection tests, including HTTPS CA trust and failure handling.
- Full endpoint-by-endpoint and nested-resource authorization review, especially global cluster listings, policies/exceptions, aggregated reports, and group identifiers. Static guard presence is not proof of data isolation.
- Safe role-aware aggregate behavior for previously global report and inventory screens.
- Full Linux-node Kubernetes Helm lifecycle, PostgreSQL restore, browser E2E and resilience verification.
- Scanner credential rotation and audit of all generated URLs, logs and Secret permissions.

No P0 completion or production release may be claimed solely on green GitHub Actions checks.
