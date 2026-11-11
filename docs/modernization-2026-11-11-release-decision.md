# Modernization and public release decision — 11 November 2026

**Decision: integration candidate, not a supported production release.** This record distinguishes merged source, passing CI and deployment/environment sign-off. It supersedes dated status summaries only where new evidence is explicit; it does not erase upstream attribution or previously recorded operator observations.

## Confirmed GitHub state

- Main incorporated NestJS 11 [PR #28](https://github.com/sm-joe/m9sweeper-modern/pull/28) at merge commit `45c29471200705854dc3f1972feb623809074691`. The exact reviewed PR head is `ba7c013dc53568f17f0e3f3f0c26ea86c0f4b94b`.
- [Full platform workflow 42871767132](https://github.com/sm-joe/m9sweeper-modern/actions/runs/42871767132) passed all **14 jobs** on that PR head: backend, frontend, JVM trawler and image, dashboard image, runtime integration, real Trivy scan, Kubesec, Compose, Helm, Kind inventory, Linux operator scripts, source parity and aggregate checks.
- [Main workflow 42865738739](https://github.com/sm-joe/m9sweeper-modern/actions/runs/42865738739) passed on pre-merge `77c5419b39ad2155c1b63734c63936d91372c412`. Do **not** misidentify this as testing the NestJS 11 merge commit.
- Angular 22/esbuild, header-only credential defaults, real queued scanner CI and Falco webhook-to-browser acceptance were integrated earlier; see [10 November evidence](modernization-2026-11-10-evidence.md).
- No production-ready release, container/chart support declaration or independent distribution sign-off is evidenced by these CI results.

## Release blockers and required proof

| Gate | Objective acceptance | Current decision |
| --- | --- | --- |
| Main regression | Run full platform CI on the exact merge/release commit; retain job URLs and commit | PR-head passed; merged-head validation must be recorded separately |
| Trivy correctness | Real authorized image scan UUID tracked across RabbitMQ, Java/Trivy, PostgreSQL and Angular; assert HIGH/CRITICAL noncompliance; test registry outage, retry cap, DLQ and no false clean result | Positive CI integration exists; complete negative-path and visual evidence |
| Scanner identity and tenant isolation | Two distinct clusters and user roles; reject nested cross-cluster image, event, report and policy access; revoke key and confirm 401/403 and no DB write | Requires comprehensive integration matrix |
| Falco live node detection | Supported Linux kernel/eBPF event → Falcosidekick → authenticated NestJS → PostgreSQL → Angular, with matching timestamp, cluster and event | Webhook fixture and operator evidence exist; independently record live supported-node proof |
| Helm lifecycle and persistence | Disposable Linux Kubernetes install, upgrade, rollback, migration check, PVC retention, TLS and webhook outage test; restore PostgreSQL dump into separate DB and compare rows | Scripts exist; environment-specific proof and versions absent |
| Public artifacts | Version-pinned container images and charts, checksums, SBOM, attestations/signatures, independent verification, support matrix and licenses | Source archive workflow exists; complete deployable release is unproven |

## Hardened Helm staging lifecycle preflight

The live upgrade/rollback drill in `scripts/verify-helm-rollback-staging-linux.sh` now requires `M9_STAGING_HELM_TEST=YES`, a staging-prefixed namespace that has the `m9sweeper-staging=true` label, private `VALUES_FILE`, and an explicitly matching `M9_EXPECTED_KUBE_CONTEXT`. It refuses to call Helm when the context differs. For example, on a native Linux operator host with a **disposable staging-only** context and already-installed release:

```bash
export M9_STAGING_HELM_TEST=YES
export M9_EXPECTED_KUBE_CONTEXT='your-disposable-staging-context'
export NAMESPACE='m9-staging-acceptance'
export RELEASE='m9-staging'
export VALUES_FILE='/secure/path/staging-values.yaml'
bash scripts/verify-helm-rollback-staging-linux.sh
```

The script requires a new revision for upgrade and rollback, checks the post-rollback release is deployed and its chart identity matches the original, and confirms PVC names/bindings remain unchanged. CI tests the **fail-closed preconditions only** with isolated fake commands. A successful unit/mock test is not a real Kubernetes lifecycle sign-off.

## Scratch database recovery integrity

The existing disposable Linux/Compose recovery drill now compares both table counts and deterministic SHA-256 digests of canonical PostgreSQL JSONB row content in `clusters`, `image_scan_runs`, `image_scan_results`, `image_scan_results_issues`, `project_falco_logs`, and `kube_hunter`. It fails even if row counts match but one finding differs. The restored scratch DB is dropped on exit; the protected, permission-restricted backup remains available for review. **Only run when disposable staging writes are quiescent.** This compares restore correctness; it does not prove PITR or full production disaster recovery.

## Supported-version Kubernetes CI target

The disposable Kind inventory/Helm API test now uses a three-minor digest-pinned matrix: Kind v0.33.0 with Kubernetes v1.35.8, v1.36.4 and v1.37.0 images, asserting the actual API version before scanning. Kubernetes 1.35 is within upstream support in November 2026; versions 1.30-1.34 are end of life. **Successful Kind CI across the matrix verifies cluster API compatibility, inventory, kube-bench and Helm API lifecycle only. It does not certify production EKS/AKS/GKE, application readiness, HA, storage migrations, Falco kernels or end-user deployment support.**

## Execution rules

1. Never run destructive lifecycle checks against existing operator Kind/Compose data, production namespaces, or non-staging volumes.
2. Document **source SHA, workflow/run ID, Linux distribution/kernel, Kubernetes and Helm versions, chart versions, image digests and redacted test outputs** for every release gate.
3. Do not claim a failed scan is compliant, silently discard DLQ messages, expose scanner credentials in query strings or publish real credentials in chart values/logs.
4. Keep `SCANNER_REQUIRE_CLUSTER_BINDINGS=true` as the production target **after** assigning and testing explicit scanner grants; reject cross-cluster access.
5. Public installation instructions must target Linux hosts/Linux-node Kubernetes; Windows PowerShell remains an operator development/testing convenience only.
6. Make a versioned release only after objective gates are closed and exact released artifact digests and release commit are recorded.

## Non-destructive next commands for a Windows development workstation

```powershell
Set-Location D:\AWS\repos\m9sweeper-modern
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
gh pr list --state open
gh run list --branch main --limit 5
```

For Linux **disposable staging only**, use `scripts/verify-trivy-e2e-linux.sh`, `scripts/verify-postgres-restore-linux.sh` with `M9_STAGING_RESTORE_TEST=YES`, and `scripts/verify-helm-rollback-staging-linux.sh` with `M9_STAGING_HELM_TEST=YES` and explicit isolated namespace/release/values variables. The scripts cannot replace independently recorded browser, authorization and live kernel evidence.

**Release owner sign-off:** pending.
