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


## Follow-up P0 hardening: Falco rule changes and API-key identity lifecycle

The follow-up branch `security/p0-falco-rules-key-lifecycle` closes two source-level gaps:
- Falco rule creation, update and deletion are **SUPER_ADMIN only** until per-cluster rule ownership and all-clusters mutation checks are implemented. Ordinary ADMIN rule editing is intentionally denied: the existing rules API accepts arbitrary `clusters` and can turn a scoped rule into an `allClusters` global rule. Read-only scoped rule listing remains available to authorized readers. The Angular UI must hide or disable mutation controls for ordinary admins; API enforcement is authoritative.
- Scanner key identity queries now require active, non-deleted users, not merely active API-key and authority records. Also check user state on the general API-key identity query.

**Live acceptance still required:** revoke the secure-probe key and prove a new report is rejected with no DB row; disable/deactivate the scanner user and repeat; create user A with access to cluster A but not B and attempt every B ID report/event and global Falco policy modification; verify ordinary ADMIN cannot create, update or delete a global Falco rule while SUPER_ADMIN can. For read-only role, check that a scoped list shows only rules applicable to that cluster. Ensure the existing functioning scanner installation remains unaffected.

**No claim of verification:** these changes do not complete the live SQL/Angular report-persistence confirmation, cross-cluster tests, restore/rollback or browser acceptance gate.


## Safe missing/invalid scanner key test using an isolated Kind Pod

This test sends two deliberately unauthenticated **empty** kube-hunter submissions, using only a trusted public CA. No valid scanner key is passed to Kubernetes, the shell, or logs. It validates only negative authentication, not credential revocation or cross-cluster grant enforcement.

From Windows PowerShell after setting `$clusterId` to the actual numeric m9sweeper cluster ID:

```powershell
cd D:\AWS\repos\m9sweeper-modern
$clusterId = 0 # Replace with actual positive numeric cluster ID
if ($clusterId -le 0) { throw "Set the actual cluster ID" }
$targetUrl = "https://m9-dash-tls.m9sweeper-system.svc.cluster.local/api/kubehunter/hunter/$clusterId"

kubectl -n m9sweeper-system create configmap m9-p0-auth-probe-script `
  --from-file=verify.sh=tools/security/test_kubehunter_live_denials.sh `
  --dry-run=client -o yaml | kubectl apply -f -

@"
apiVersion: v1
kind: Pod
metadata:
  name: m9-p0-auth-negative-probe
  namespace: m9sweeper-system
spec:
  automountServiceAccountToken: false
  restartPolicy: Never
  containers:
    - name: probe
      image: curlimages/curl:8.11.1
      command: ["sh", "/scripts/verify.sh"]
      env:
        - name: REPORT_URL
          value: "$targetUrl"
        - name: CA_FILE
          value: "/tls/ca.crt"
      volumeMounts:
        - name: test-script
          mountPath: /scripts
          readOnly: true
        - name: trusted-ca
          mountPath: /tls
          readOnly: true
  volumes:
    - name: test-script
      configMap:
        name: m9-p0-auth-probe-script
    - name: trusted-ca
      secret:
        secretName: m9-dash-relay-ca
"@ | kubectl apply -f -

kubectl -n m9sweeper-system wait --for=jsonpath='{.status.phase}'=Succeeded `
  pod/m9-p0-auth-negative-probe --timeout=120s
kubectl -n m9sweeper-system logs pod/m9-p0-auth-negative-probe
kubectl -n m9sweeper-system delete pod m9-p0-auth-negative-probe
kubectl -n m9sweeper-system delete configmap m9-p0-auth-probe-script
```

Expected: both missing credentials and invalid `X-API-Key` return 401/403. **Verify database report count did not increase** after these denied requests, and the dashboard has no fabricated new clean report. If the Pod fails, inspect its logs before cleanup.

**Revoked token, disabled account, cross-cluster grants and URL-only legacy-token denial:** test against a staging backend with `SCANNER_REQUIRE_CLUSTER_BINDINGS=true` and `SCANNER_ALLOW_LEGACY_QUERY_KEYS=false`, using isolated test credentials. Never send a live key in a URL or log and do not enable these flags on the existing deployment until all scanners have been migrated and granted.


## P0 cluster-group mutation boundary (follow-up)

An ordinary ADMIN must own the target `cluster_group` row before creating a cluster under that group or reassigning an existing cluster's `groupId`. A read grant on a cluster in the group does **not** confer group ownership or permission to move clusters into a foreign tenant. `SUPER_ADMIN` retains global access. Tests include foreign-group create, owned-group create, foreign-group update, missing/invalid group, and global administrator behavior.

Live tenant A/B verification: sign in as an ADMIN owning group A; try creating a cluster using group B's numeric ID and changing A's existing cluster to group B. Both must fail before contacting or mutating Kubernetes, and no new/changed `clusters` row should appear. Repeat an authorized own-group onboarding test using a disposable staging cluster and trusted CA. **Do not use your working kind-local-test cluster as a destructive fixture.**
