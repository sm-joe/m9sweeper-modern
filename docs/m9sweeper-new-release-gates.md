# m9sweeper-new: new product release gates

**Branch:** `product/m9sweeper-new-foundation`  
**Release status:** development only; not ready for a public release.

## Product contract

Maintain original operational features while replacing old implementations in tested increments, without synthetic scan results or fabricated compliance scores. This is a new distributable product built on an attributed open-source codebase, **not** a standalone product already released.

| Track | Product acceptance condition | Present evidence | Remaining blockers |
|---|---|---|---|
| Frontend | Responsive, accessible, supported Angular architecture; actual role-restricted login, user/cluster/policy/exception routes | Existing Angular app compiles and partial UI refresh | Angular framework migration; complete browser E2E; accessibility checks |
| Backend | Authenticated contract-safe APIs, audited RBAC, secure Kubernetes access, reliable background jobs | NestJS build + policy/admission regressions, DB/auth runtime smoke | OIDC and role review; TLS CA and service-account hardening; cross-cluster isolation |
| Scanner & compliance | Trivy scan -> queue -> DB -> UI; actual kube-bench, Kubesec, Falco, kube-hunter with persisted proof and benchmark compatibility | Real Trivy/Kubesec scans and Kind kube-bench; user-produced kube-bench PDF | Queue-to-UI proof, live Falco/hunter, documented coverage and CIS compatibility |
| Deployment | Supported Linux/Unix + Kubernetes distributions, proper Secrets, internal service networking, Helm install/upgrade/uninstall and database backup/restore | Docker Compose, Helm render, current local Kind example | Helm runtime lifecycle, TLS management, secret management, restore/rollback |
| Release | Reproducible signed artifacts, documentation, security review and clean acceptance matrix | CI integration jobs | Artifact signatures/SBOM, vulnerabilities, license/trademark clearance, documented threat model |

## Network and configuration boundary

`SERVER_BASE_URL` is the browser-facing origin and **not a scanner report endpoint**. Set `SCANNER_REPORT_INGESTION_URL` to a private Kubernetes-reachable base origin; the UI rejects absent or loopback values instead of silently generating Jobs that POST to their own loopback address. Configuration alone does not prove reachability: test DNS, TLS, and report persistence inside a cluster.

The existing kube-bench endpoint currently authenticates via an API key in the query string. This must be migrated to authenticated headers or short-lived scoped credentials (with protected Kubernetes Secrets) before production release. Keep token-bearing rendered Helm commands confidential.

## Security defaults

- Do not expose the Docker Compose database, broker or dashboard to public interfaces by default.
- Admission webhook enforcement remains opt-in until certificate rotation and outage tests exist.
- Never disable TLS verification to make onboarding work.
- Do not turn manual CIS reviews into fails, nor claim official compliance from a legacy benchmark.
- Do not publish this new product until scanner ingestion and real Kubernetes lifecycle tests are green.

## Release candidate security acceptance added

- kube-bench report upload now accepts `X-API-Key` as a non-URL alternative to the legacy query parameter, with header precedence.
- Denies absent, unknown and unauthorized scanner credentials (401), and rejects malformed data and invalid cluster identifiers (400).
- Unit tests cover the credential and evidence gates; runtime CI asserts HTTP 401 for unauthenticated uploads.
- The UI now uses the checked-out local kube-bench chart, not the original upstream Helm repository, to avoid mixing new-product code with legacy published chart artifacts.
- **Still blocked for production:** the frontend's legacy command still exposes the key in Helm values, and the Helm chart does not yet provision a credential Secret. Migrate to Kubernetes Secret-backed header authentication before publishing.

## Multi-cluster reporting isolation

Kube-bench report counts and latest-result queries are now explicitly cluster scoped, with deterministic ordering and bounded pagination. Regression tests verify query isolation. A separate multi-cluster HTTP + PostgreSQL acceptance test remains required for production release.

## Kubernetes onboarding security gate (post-RC1)

- The legacy kubeconfig path that used `skipTLSVerify: true` is prohibited. Onboarding now fails before Kubernetes resource mutations when the cluster CA is missing or TLS verification is disabled.
- A `caFile` path must be readable from the backend container, and is converted into embedded `certificate-authority-data` for downstream connections; a CA embedded in kubeconfig is preferred.
- Service-account token provisioning must be complete before a newly issued kubeconfig is saved. Token-only helper requires a CA parameter.
- Legacy long-lived service-account tokens and broad RBAC remain an open production blocker; adopt time-limited TokenRequest / workload identity with least privilege before a general release.

## RC2 implementation checkpoint (security, not complete product modernization)

Implemented on modernization branch after RC1:

- Reject unverified Kubernetes TLS and missing cluster CAs before onboarding object mutations.
- Embed readable CA data in the returned kubeconfig, fail if service-account token is absent, and prevent token-only insecure config creation.
- Require trusted certificate-authority-data in the manual service-account wizard and reject insecure prebuilt service-account kubeconfigs.
- Remove direct logging of credential-bearing kubeconfig objects in initial cluster seeding.
- Introduce a local Kind-specific Docker Compose overlay that preserves Dash membership in the external `kind` network across recreation.

**Unsupported or not verified as complete:** legacy service-account token storage and broad RBAC model, 100% UI modernization, framework upgrades, full scanner ingestion, Helm runtime and rollback, complete authentication isolation, and official CIS compatibility. The source RC is for test environments only.

## RC3 kube-hunter follow-up (2026-11-07)

- Fixed the kube-hunter dialog to use the server-validated Pod-reachable scanner ingestion origin instead of browser `localhost`.
- Local Job and CronJob charts now obtain the callback from a named Secret; both are linted/rendered in CI using `batch/v1`.
- Fixed the dashboard severity counters starting from 1, which inflated displayed vulnerability counts.
- The operator reported that the live kube-hunter scan now works in Kind. This is operator-observed evidence, **not** independently collected database or browser evidence.
- Fresh database-row correlation and Angular display acceptance commands are documented in [kube-hunter RC3 acceptance](kube-hunter-rc3-acceptance.md); until they pass, the persisted report and UI checks remain unverified.
- The legacy kube-hunter dispatcher still places the credential in an HTTP URL internally. Keep production publication blocked until header-based dispatch, authorization, and secret rotation are verified.
- RC3 CI is configured on the fix branch; mark it successful only when the **latest commit SHA** has a completed green run.


## RC3 Trivy queue, authentication and Falco hardening (2026-11-07)

- Java trawler switched from automatic broker acknowledgment to explicit acknowledgment **after** Dash report submission. API and scanner failures requeue the delivery rather than losing it.
- Trivy report ingestion rejects missing/empty/invalid vulnerability counts and validates image membership in the claimed cluster before processing.
- NestJS regression tests cover invalid image reports and cross-cluster image IDs. Existing Trivy severity and scan-error regressions remain mandatory.
- kube-hunter report **read** routes require authenticated allowed roles; kube-hunter and Falco **ingest** routes now accept `X-API-Key` preferentially to legacy URL query credentials. Header-based migration does not mean query-string authentication has been removed.
- Live, non-synthetic queue→worker→database→Angular acceptance is documented in [trivy-rc3-live-acceptance.md](trivy-rc3-live-acceptance.md). Until fresh DB and browser evidence are recorded, full integration is **not confirmed**.
- **Production blockers:** bounded message retries/dead-letter queue, idempotent scan-run records, cluster-scoped role authorization, token rotation/revocation, removal of legacy URL credentials, Falco runtime verification, Angular/NestJS framework upgrades and browser/UI regression tests.
- Do not merge or publish the entire product as production-ready based on compile-only checks or a green standalone scanner job.
