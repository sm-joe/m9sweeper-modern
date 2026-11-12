# Final native Linux scanner, Helm and recovery acceptance

**Product status:** unverified for general production until all checks below have
evidence reviewed for the exact release SHA. GitHub's Kind/Compose tests prove
important integration paths but do not certify native Linux eBPF or disaster recovery.

## Approved environment

Use a disposable Linux staging environment with a dedicated cluster, matching
kubeconfig context, Linux kernel/eBPF support, current Falco chart/Sidekick,
Dash/Java Trawler, RabbitMQ, PostgreSQL, Trivy, kube-bench, kube-hunter and
Kubesec. Restrict PostgreSQL and broker access. Do not run against production
clusters, production databases or working operator Helm releases.

Before each drill record, in a private release record, the exact source commit,
Linux distribution/kernel, Kubernetes version, chart revision, image digests,
UTC start timestamp, cluster ID, scanner versions and masked job identifiers.
Do not put credentials or private kubeconfigs into public CI artifacts.

## 1. Live scanners and persistence

After recording `SINCE_MS` (current Unix epoch milliseconds) and completing
**real** scanner jobs and a native Falco event, run:

```bash
export M9_NATIVE_SCANNER_EVIDENCE=YES
export M9_EXPECTED_KUBE_CONTEXT='approved-disposable-context'
export M9_EXPECTED_COMPOSE_PROJECT='m9-staging-acceptance'
export POSTGRES_CONTAINER='approved-postgres-container'
export CLUSTER_ID='2'
export SINCE_MS='REPLACE_WITH_13_DIGIT_BASELINE'
bash scripts/verify-native-scanner-evidence-linux.sh
```

This read-only check requires new cluster-scoped kube-bench, kube-hunter,
Falco and completed Trivy records since the baseline. It rejects evidence
missing from any of those four tables and rejects a newly completed scan that
is marked compliant despite HIGH/CRITICAL image counts. It does **not** create
scan findings, inspect the authenticity of a sensor event, or validate Kubesec
scores. Record exact matching UI evidence, not just nonzero counts.

For actual Falco eBPF detection use
`scripts/verify-falco-live-linux.sh` with its explicitly approved staging
context and a configured real rule. The script induces a benign sensitive-file
read in its own disposable namespace; verify event rule, namespace and pod in
PostgreSQL and the Angular Falco history. A posted synthetic webhook is not
a native-kernel sensor test.

For kube-bench inspect the full report and PDF: failures, warnings, manual
reviews and **unsupported benchmark coverage** must remain visible. Do not
claim official CIS benchmark certification or treat manual controls as passing.
For kube-hunter check the report timestamp, cluster scope, persisted issues
and Angular report. For Kubesec run the real deployment-scoring integration and
verify the actual API response and UI coaching; it has no assumed
`kubesec` PostgreSQL table.

## 2. Full Helm lifecycle on staging

For the first install, use an explicitly labelled disposable namespace and
a private, trusted-CA, Secret-backed values file. Verify Pods, real API login,
scanner callback service DNS/TLS, and at least one fresh persisted scan.
Use `tools/integration/helm-kind-api-lifecycle.sh` for Kubernetes API/revision
compatibility only: its `--no-hooks --wait=false` intentionally **does not**
prove application readiness.

For an **existing disposable staging release** use:

```bash
export M9_STAGING_HELM_TEST=YES
export M9_EXPECTED_KUBE_CONTEXT='approved-disposable-context'
export NAMESPACE='m9-staging-acceptance'
export RELEASE='m9sweeper-staging'
export VALUES_FILE='/secure/staging-values.yaml'
bash scripts/verify-helm-rollback-staging-linux.sh
```

After rollback, prove real Dash login, scanner history, RabbitMQ workers,
PostgreSQL row persistence, healthy rollout, and PVC identity. Test uninstall
only against a separate disposable release, ensure scoped resources are
removed, and verify backup ownership and retention. The rollback script checks
revision/Helm chart/PVC identity, not an automatic database schema downgrade.

## 3. Database recovery

Quiesce staging writes and run the existing isolated PostgreSQL drill:

```bash
export M9_STAGING_RESTORE_TEST=YES
export M9_EXPECTED_COMPOSE_PROJECT='m9-staging-acceptance'
bash scripts/verify-postgres-restore-linux.sh
```

It restores a backup to a separate temporary database, verifies counts and
canonical row digests for clusters, scan runs/results/issues, Falco and
kube-hunter, and drops only the scratch DB. Protect the retained backup. A
full PITR and off-site encrypted recovery exercise must be separately recorded.

## 4. Security and candidate package

Run full CI for the *exact* proposed SHA, including source route-audit, scoped
HTTP/DB isolation, frontend+backend, Java scanner, Kind versions, Helm and
real queue staging. Review exported HTTP route inventory for endpoints lacking
authorization or cluster ownership. Verify legacy query keys and raw key export
are disabled, rotate affected keys, use trusted TLS, grant scanner identities
only to their clusters and test revoked-key rejection.

Once code and staging proof are approved, run the existing
`signed-linux-candidate.yml` manually from `main`, using
`confirmation=CANDIDATE_ONLY`. Independently verify OCI signature identity,
immutable image digests, Helm signature, SHA256SUMS, source SPDX SBOM and
retained upstream attribution. This creates **nonproduction candidate
artifacts**, not a public production GitHub release.

Finally complete the private exact-SHA JSON described in
[release evidence sign-off](release-evidence-signoff.md) and validate it with
`tools/security/check_release_signoff.py`. That checker checks evidence
**presence**, not truth; the release owner must independently review actual
logs/screenshots. Do not publish a production tag or claim support before
that review is complete.
