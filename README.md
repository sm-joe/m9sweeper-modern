# m9sweeper-new

**An emerging Kubernetes security operations platform** — an attributed, source-preserving modernization of the original open-source m9sweeper project.

> **Status: v0.1.0-rc2 developer integration candidate. Not production-ready.**
> This project is not a certified CIS compliance checker; actual scanner results, coverage and benchmark compatibility must be verified for each target cluster.

## Why a new product

The original application is preserved as the migration baseline in [`platform/`](platform/). This branch is **not** a finished rewrite or a claim of compatibility with all current Kubernetes releases. It replaces unsupported and unsafe assumptions with incremental, tested product functionality while retaining the actual user/cluster/scanner/policy/reporting workflows.

### Functional scope (retained from upstream, not necessarily E2E verified)

- Angular application: cluster inventory, image vulnerability dashboards, policies, exceptions, user management, scan history and security reports
- NestJS API with PostgreSQL persistence, JWT authentication, RabbitMQ and integration with Kubernetes
- Java trawler for Trivy image scanning; upstream kube-bench, Kubesec, Falco and kube-hunter integration source
- Admission policy, Gatekeeper, Helm deployment charts, and Docker Compose development stack

### What is new and verified so far

| Track | Actual implementation | Evidence |
|---|---|---|
| Product UI | Updated login/navigation; scanner report readiness status using standalone Angular Signals component | Angular production build; live API configuration in RC1 |
| Backend | Policy and admission fixes; hardened API-key validation; cluster-scoped kube-bench reporting | Jest regression suites, login + database smoke |
| Kubernetes | CA-required service-account onboarding; clearer failures; token readiness; no insecure TLS fallback on changed paths | Source regressions and Kind client inventory |
| Scanner | Java worker image using Trivy v0.76.2; corrected Trivy severity classification, unknown finding treatment, malformed scan handling, and secret-safe debug output | Maven + JUnit and real standalone Trivy scan |
| Compliance | kube-bench Secret-backed HTTP-header auth; observed result counts explicitly not official compliance scores | Helm templates, Kind kube-bench job, m9sweeper PDF integration test |
| Deployment | Optional Kind Compose overlay; private local defaults and required secrets; CI-gated source candidate | Compose, image build, Helm lint/template, Kind smoke |

**Important:** a unit test or individual scanner run does not prove the full scanner→queue→database→dashboard pipeline.

## Architecture (current implementation)

```text
Angular UI (Dash)
     | REST / JWT
NestJS API ------- PostgreSQL (inventory, findings, policies, reports)
     | \
     |  RabbitMQ ---> Java trawler ---> Trivy
     |
     +-- Kubernetes API (cluster resources / RBAC)
     +-- kube-bench / Kubesec / Falco / kube-hunter (varied maturity)
     +-- Admission and policy hooks (not fully E2E release-validated)
```

## Getting started: development integration

**Prerequisites:** Linux/Unix development host or a compatible Docker environment, Docker Compose, and optionally Kind + kubectl + Helm. This is not a hardened production installer.

1. Clone and check out the `release/m9sweeper-new-v0.1.0-rc2` branch (once published).
2. In `platform/docker-compose/`, copy `.env.sample` to `.env` and supply unique credentials. Never commit `.env`.
3. Run `docker compose up -d --build` and check `http://localhost:3000/api/health`. The login application is available at `http://localhost:3000`.
4. For **local Kind only**, use `docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build`. This automatically attaches Dash to the Docker `kind` bridge; see [Kind integration](docs/local-kind-integration.md).
5. Set `SCANNER_REPORT_INGESTION_URL` to the **Pod-reachable API origin**, not your browser's `localhost`. Verify from inside the Kubernetes cluster before generating scanner Jobs.
6. For kube-bench, create the namespace-local API-key Secret referenced by the generated Helm command. See the [RC2 test guide](docs/m9sweeper-new-0.1.0-rc2.md).
7. Verify new findings are **persisted** and shown by the application; HTTP health alone is not enough.

For real Kubernetes deployment, use internally routable HTTPS and Secrets, least privilege, trusted CAs and tested image signatures. The bundled Helm stack has not yet passed release-level installation/rollback checks.

## CI and source RC

The [full platform CI workflow](.github/workflows/revamp-platform-ci.yml) covers source parity, Angular and NestJS, Java scanner tests, runtime authentication, PostgreSQL and RabbitMQ, Trivy and Kubesec, Kind inventory/kube-bench, container images and Helm rendering. A versioned source archive is built **only after all existing CI gates pass**. This is a test candidate, not a signed production release.

See [RC2 acceptance criteria](docs/m9sweeper-new-0.1.0-rc2.md), [product release blockers](docs/m9sweeper-new-release-gates.md), and [integration evidence ledger](docs/integration-acceptance.md).

## Blockers before a public product release

- Supported Angular and NestJS framework/tooling upgrades; design-system and browser regression coverage
- Trivy queue→DB→UI E2E, and full live Falco/kube-hunter ingestion and isolation
- Short-lived identities, least-privilege Kubernetes RBAC, credential encryption, OIDC/RBAC and multicluster authorization
- Full Helm lifecycle tests, admission webhook TLS/outage behavior, DB migration backup/restore, and audited release artifacts
- Validated version-specific CIS benchmark mappings with reviewable evidence and remediation; no fabricated certification or score

**Do not advertise this branch as production-certified or fully modernized until the blockers have tested evidence.**

## Licensing and upstream attribution

This project is based on the original [m9sweeper](https://github.com/m9sweeper/m9sweeper) repository, pinned at upstream revision `2bc394b5db0d00e3a5784d388ba26be6451ff9c0`. The original **Apache License 2.0** is retained unmodified at [`platform/LICENSE`](platform/LICENSE); original file notices, attribution and third-party notices must remain intact. See [`ATTRIBUTION.md`](ATTRIBUTION.md).

The `m9sweeper-new` development name does **not** imply endorsement or affiliation by upstream maintainers. Trademark, upstream notices and third-party scanner licenses require review before distributing independently.

## RC3 development integration (2026-11-07)

RC3 builds on the tested RC2 baseline and adds important correctness and operational safeguards. **These changes are not a published production release.**

- **Trivy queue and persistence:** fail closed on rejected RabbitMQ writes, acknowledge scan work only after the Java trawler submits results, confirm durable retry messages, and quarantine repeatedly failed scans in `trawler_queue.failed` after three retries. Scanner failures are never synthesized as clean findings. A scan-run idempotency key and managed recovery workflow are still required to prevent duplicates and handle quarantined jobs.
- **API isolation:** reject empty and malformed scan uploads, negative vulnerability counts, and image IDs that do not belong to the declared cluster. New NestJS regressions cover these cases.
- **kube-hunter:** Pod-reachable callback, Kubernetes Secret-backed local Helm configuration, authenticated report reads, and accurate displayed vulnerability counters. The operator confirmed a live scan works in local Kind.
- **Falco:** use `X-API-Key` header authentication, prefer it over the legacy query token, and generate a Secret-backed Falcosidekick install command using the original pinned chart's existing Secret support. The live Falco pipeline is not yet validated.
- **Delivery proof:** independent Trivy, Falco, and kube-hunter runbooks distinguish successful API/worker execution from actual PostgreSQL persistence and Angular display. See [Trivy acceptance](docs/trivy-rc3-live-acceptance.md), [Falco acceptance](docs/falco-rc3-live-acceptance.md), and [kube-hunter acceptance](docs/kube-hunter-rc3-acceptance.md).

For development, check out `fix/rc3-trivy-queue-fail-closed` and rebuild the existing Compose stack using its Kind overlay. Do not delete existing volumes. Verify the latest branch CI SHA and run the E2E procedures before marking RC3 accepted.

**Outstanding production blockers:** live Trivy queue→DB→UI and Falco event→DB→UI evidence; token removal from URL-based legacy paths; multi-cluster RBAC; idempotent queue processing and DLQ recovery; full Helm lifecycle; supported Angular/NestJS upgrades; accessibility/E2E UI redesign and artifact security checks.

## RC4 security and reliability candidate

The `release/m9sweeper-new-rc4-security-reliability` branch contains RC3's operator-verified Kind Trivy/kube-hunter flows plus RC4's authentication, scan-run and Falco reliability changes. **This is an integrated release candidate, not a verified production release.**

### Added

- Explicit per-cluster user read/write grants, super-admin grant management, scanner identity binding controls and tests for cross-cluster denial.
- Scan UUID ledger; atomic per-policy results, image severity totals and queue status; completed-run idempotency, concurrent scan rejection, bounded RabbitMQ retries and quarantined failed-job reconciliation.
- Native lifecycle-managed stale-run timer, so the scanner does not depend on the Node-incompatible scheduling decorator.
- Header-first scanner webhooks, optional strict legacy-query rejection, raw API-key export disabled by default, and Falco post-persistence notification failure isolation.
- Corrected RC4 PostgreSQL mapping for the current schema, preventing inserts into columns removed by historical migrations.

### Deployment and validation

1. Back up PostgreSQL and deploy migrations **before** updating the Dash and trawler containers.
2. Keep `SCANNER_REQUIRE_CLUSTER_BINDINGS=false` until the dedicated scanner identities have the intended per-cluster write grants. Do not disable the legacy kube-hunter query token until a header-authenticated reporter replaces it.
3. Run backend and Java tests, then rebuild the existing Compose/Kind stack without deleting volumes.
4. Test one real Trivy rescan and confirm its UUID reaches `completed`, no duplicate policy results exist, the original image has `scan_queued=false`, and HIGH/CRITICAL findings remain Non-compliant.
5. Verify a real Falco event from the Kubernetes sensor appears in both `project_falco_logs` and the corresponding Angular cluster view; test unauthorized cluster requests.
6. Verify the Helm deployment lifecycle and backup restore before production promotion.

Detailed procedures: [RC4 staged acceptance](docs/rc4-final-acceptance.md) and [read-only PowerShell probe](scripts/verify-rc4.ps1).

From the repository root, after migration and one successful live scan:

```powershell
.\scripts\verify-rc4.ps1 -ClusterId <actual-cluster-id> -ImageId <actual-image-id> -RequireFalcoEvent
```

The script verifies backend database/queue evidence, **not** the browser view or whether the event originated in the Falco kernel sensor. Do not treat it as a substitute for live E2E evidence.

**Still required for production:** complete endpoint-by-endpoint authorization audit, strict scanner service identity migration, real Falco/Angular evidence, dead-letter operational replay and alerting, Helm install/upgrade/rollback, disaster recovery, framework modernization, release artifact provenance and a green full CI on the exact release commit.
