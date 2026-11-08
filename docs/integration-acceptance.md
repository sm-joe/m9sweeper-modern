# Integrated acceptance ledger (original m9sweeper, PR #2)

This ledger distinguishes actual runtime tests from source-preservation and build checks.
All code paths belong to `platform/` except integration test harnesses.

| Requirement | Automated evidence | Status |
|---|---|---|
| Original Angular and NestJS application compiles | Angular production / NestJS builds | **Passed** |
| Backend policy threshold isolation, required scanners and admission logic | Jest regression suites in `platform/dash/backend/src/modules/` | **Passed** (latest admission tests awaiting CI) |
| Original dashboard starts with PostgreSQL and RabbitMQ | `tools/integration/runtime-smoke.sh` | **Passed** on prior CI run |
| Real database migrations and authenticated admin login | Original dashboard + `dash-init` in Compose; JWT returned from NestJS | **Passed** |
| All scanner service accounts have persisted active credentials | New strict SQL assertion in runtime smoke; fixed user/seed race | **Latest run pending** |
| Trivy scanner executes a real image and returns JSON CVEs | `trivy-live-scan` job (alpine:3.21) | **Passed**, but **not yet end-to-end trawler ingestion** |
| JVM trawler container with modern Trivy | `trawler-jvm-image` job | **Passed** image build and version checks; queue-to-DB E2E pending |
| Kubesec executes real YAML policy analysis | `kubesec-live-scan` job (secure vs privileged Pod) | **Passed** |
| Kubernetes namespace, Pod and image discovery | `kind-inventory` tests the original KubernetesApiService | **Latest run pending** |
| kube-bench produces CIS results against a real Kind node | `kind-inventory` kube-bench Job (v0.16.0) | **Latest run pending** |
| kube-hunter live cluster assessment + report ingestion | No real integration acceptance yet | **Not verified** |
| Falco alert ingestion, querying and alert history | No real integration acceptance yet | **Not verified** |
| Admission webhook rejects unscanned and noncompliant image in a real cluster | Unit coverage only; webhook TLS, fail policies require real E2E | **Not verified** |
| Helm dependency resolution and Kubernetes manifests | Helm lint and template (Kubernetes 1.31 target) | **Passed** |
| Helm install/upgrade/uninstall with actual workloads | Real cluster Helm release acceptance missing | **Not verified** |
| User/role isolation, OIDC/LDAP and multi-cluster security | Full auth/RBAC E2E missing | **Not verified** |
| Production-worthy framework/image version upgrades and data restore | Dependency/security and upgrade matrix not complete | **Not verified** |

## Safety and scope

- Helm webhook remains disabled by default.
- Pod admission source now checks regular, init, and ephemeral containers, refuses malformed Pods, and has Jest regressions. This does not prove real admission webhook TLS or availability handling.
- The original KubernetesApiService contains historical `skipTLSVerify: true` in service-account onboarding, and must not be considered production-hardened until that flow is replaced with CA verification.
- The original kube-hunter integration remains preserved, but upstream kube-hunter is not actively maintained; treat it as a high-risk legacy dependency until isolated/validated.
- Do not merge PR #2 or expose Dash publicly until security and real cluster acceptance passes.
- No fabricated compliance scores or fake scanner data are used in these test gates.

## Run integration tests

Full runtime (ephemeral test credentials, clean database on isolated CI):
```bash
bash tools/integration/runtime-smoke.sh
```

Individual checks are in `.github/workflows/revamp-platform-ci.yml`. The Kind job creates a disposable cluster and only tests the original Kubernetes client plus kube-bench, not the entire deployed application.

Verified successful full-stack run (earlier checkpoint): https://github.com/sm-joe/m9sweeper-modern/actions/runs/42280613320
