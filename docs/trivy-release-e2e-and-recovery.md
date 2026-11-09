# Staged Trivy / Java / RabbitMQ / PostgreSQL / Angular acceptance

1. Deploy the release candidate on a disposable Linux staging Compose environment, with a real enabled Trivy policy and Java trawler worker.
2. In Angular, initiate a scan on an actual cluster/image. After completion execute `CLUSTER_ID=1 IMAGE_ID=2 bash scripts/verify-trivy-e2e-linux.sh`, replacing IDs with real ones. The script checks a durable completed run, correlated policy records and vulnerability evidence, fail-closed classifications, RabbitMQ availability and dashboard reachability.
3. In the Angular browser inspect the same image: current status, vulnerability count, CVE details, policy status and history. This browser inspection is not covered by the read-only SQL probe.
4. Test a deliberately failed image in staging, verify retry/DLQ retention and red failed-run UI; never mark a scanner failure compliant.
5. Run `M9_STAGING_RESTORE_TEST=YES bash scripts/verify-postgres-restore-linux.sh` on staging only. It writes a restrictive custom PostgreSQL backup to `private-backups/`, restores to a scratch database, verifies six table counts and removes only that scratch database. The original database is not modified.
6. In a disposable staging namespace verify Helm installation, upgrade and rollback with retained cluster data and Docker network reachability. Do not perform destructive testing on existing Kind/Compose data.

The scripts are real acceptance gates; they do not manufacture successful scans. Live operator and browser evidence is still required before claiming production readiness.

## Real queued Trivy staging launcher

On a **separate Linux staging host only**, with Docker Compose Dash/PostgreSQL/RabbitMQ already healthy and the staging `.env` initialized, run:

```bash
M9_STAGING_E2E_TEST=YES python3 tools/integration/real-trivy-e2e-staging.py
```

The script creates a new staging cluster, policy, enabled Trivy scanner and Alpine image fixture, grants the Java Trawler identity only the fixture cluster, starts the actual worker, queues a scan through the authenticated NestJS API, waits for a durable `completed` result and calls the read-only PostgreSQL evidence checker. It does not insert fabricated reports. These staging fixtures remain in the staging database for auditing. It must not be run against an existing production-like Dash database. Real Trivy image scanning may require a registry connection and a vulnerability DB download.

The final live acceptance also requires visually inspecting the same image in Angular, verifying full findings, RBAC, and an independent Helm upgrade/rollback and PostgreSQL restore drill. `py_compile` in CI verifies script syntax only, not a live scan.

## Staging-only Helm lifecycle drill

Before running, install an existing release in an isolated namespace labelled `m9sweeper-staging=true`. Keep the private values file outside Git and protect its permissions. Run on Linux:

`M9_STAGING_HELM_TEST=YES NAMESPACE=m9-rc-staging RELEASE=m9-staging VALUES_FILE=/secure/path/values.yaml bash scripts/verify-helm-rollback-staging-linux.sh`

The script refuses the `m9sweeper-system` namespace; it upgrades the existing release, rolls back to its prior revision, compares PVC names and volume bindings and prints workload status. It does not prove database contents, schema rollback or scanner connectivity automatically; verify those after the drill using the Trivy/restore checks. Never use it on the user's working Kind deployment.

## External bootstrap Secret support

The umbrella Helm chart now accepts dash.init.existingSecret, in addition to dash.existingSecret and trawler.existingSecret. With all three set, Helm no longer requires the bootstrap account/password or JWT/trawler API key to be placed in release values and the init Job reads secrets through envFrom. Create a restricted Kubernetes Secret containing CLUSTER_API_KEY, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, TRAWLER_API_KEY, KUBE_HUNTER_API_KEY, KUBE_BENCH_API_KEY and FALCO_API_KEY. The Dash and trawler external Secrets must include their normal complete runtime environment variables. Verify Secret creation, controlled key rotation, init sequencing and full Helm staging lifecycle before production. Existing inline values remain supported for legacy test environments only.
