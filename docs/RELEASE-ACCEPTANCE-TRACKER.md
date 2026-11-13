# m9sweeper-modern — release acceptance tracker

> **Historical engineering record.** The [v0.1.0-beta.1 public prerelease](https://github.com/sm-joe/m9sweeper-modern/releases/tag/v0.1.0-beta.1) was published after exact-source CI and downloaded-chart Kind acceptance passed for commit `36f63ebf1d68a4a6308cc000e3e2deead3f2b697`. Older “not yet published” statements below describe earlier checkpoints, not current release status. The beta remains **not production certified**; for installation use the [current guide](mvp-public-beta-install.md), including its immutable beta.1 installer advisory.

**Current checkpoint: 13 November 2026 — integration candidate, NOT approved for production release.**

This is the current source-of-truth checkpoint. The pre-November-13 history
below is retained only for traceability; old pending descriptions do not
supersede verified, merged work. The release is **not** complete simply because
repository CI is green.

## Current merged source and CI evidence

| Gate | Evidence as of 13 November 2026 | Decision |
| --- | --- | --- |
| Dashboard startup/summary filters | [PR #74](https://github.com/sm-joe/m9sweeper-modern/pull/74) merged as `86d3809`, backend Jest and full platform PR CI passed; outdated #65 closed | Code and PR CI completed; runtime release confirmation still required |
| Trivy queue → Java → PostgreSQL → Angular | [PR #71](https://github.com/sm-joe/m9sweeper-modern/pull/71) merged as `df1d024`; real staging queue and Chromium acceptance passed, including replay idempotency and DLQ | Verified in disposable CI; native production environment not certified |
| Scanner multicluster authorization | [PR #72](https://github.com/sm-joe/m9sweeper-modern/pull/72) merged as `33389ec`; full integration matrix passed | Disposable CI authorization passed; final live tenancy review required |
| Exact-commit release evidence | [PR #73](https://github.com/sm-joe/m9sweeper-modern/pull/73) merged as `7fd6bf6`; fail-closed manifest validator and fast CI passed | Evidence schema implemented; operator sign-off not yet supplied |
| Fresh native scanner evidence | [PR #75](https://github.com/sm-joe/m9sweeper-modern/pull/75) merged as `abc7960`; native Linux read-only staging scanner checker and fast safety CI passed | **Native sensor and cluster evidence not yet executed/attested** |
| Helm and DB restore | Existing staging lifecycle/rollback scripts and scratch DB digest verification; full Kind API compatibility CI | **Production-like Linux rollout and independent recovery proof outstanding** |
| Signed Linux candidate | `.github/workflows/signed-linux-candidate.yml` supports nonproduction OCI images, signatures, Helm, SBOM | **No successful final candidate publication independently verified** |
| Public v1.0.0 | No public GitHub release published in this checkpoint | **Blocked** |

## Remaining public-release blockers

1. Approved native Linux/eBPF Falco sensor → Sidekick → NestJS → PostgreSQL → Angular, plus fresh kube-bench evidence/PDF, kube-hunter, Kubesec and Trivy in one qualified staging environment.
2. Full Helm install, upgrade, rollback, uninstall/cleanup and trusted-TLS/Secrets operational validation with retained before/after evidence.
3. Quiesced staging backup and scratch PostgreSQL restore; verify counts and content digests, retain private backup, and separately document recovery objectives.
4. Route-by-route cluster ownership/security assessment, least-privilege scanner identities, signed release asset review, third-party dependency/license and upstream attribution confirmation.
5. Independently verified OCI/Helm signature and SBOM artifacts pinned to the exact proposed release SHA, followed by reviewed [release sign-off evidence](release-evidence-signoff.md). Do not publish a production tag before sign-off.

Follow the [native Linux end-to-end procedure](native-linux-final-acceptance.md).
Do not fabricate scanner or CIS compliance results. Existing Kind and Compose CI
does not establish native Linux kernel compatibility or disaster recovery.

---

## Archived 9 November tracker (historical context)

**Historical snapshot: 9 November 2026; superseded by the 13 November checkpoint above.** Do not merge a PR merely because an individual scan worked or a unit test passed.

Product target: independently maintained Linux/Kubernetes deployment of m9sweeper-new with maintained upstream license attribution, professional documentation, and a functioning Angular dashboard, NestJS API, Java scanner/trawler, RabbitMQ transport and PostgreSQL persistence. Maintain original Trivy, kube-bench, Kubesec, kube-hunter, Falco, policy/admission and risk-scoring features.

## Evidence-backed status

| Area | Evidence available | Release gate |
| --- | --- | --- |
| Existing kube-hunter | Operator reported four vulnerabilities on Kind; original Helm release retained | **Scanner works in Kind**; preserve |
| Header-authenticated kube-hunter relay | Separate kube-hunter-secure-probe Job Complete 1/1; local relay dispatcher logged; private CA HTTPS Kind probe passed | **Partial**: independently verify API response, new DB record and Angular history; invalid/revoked-key rejection |
| Docker Compose ↔ Kind | Dash accessible on Kind network; API health reports Postgres OK; TLS proxy 1/1 | **Kind connectivity verified**, not production ingress |
| Trivy | CI scanner steps; previous E2E not fully verified for every persistence/dashboard state | **Not fully accepted**: RabbitMQ → Java → DB → Angular, retries, DLQ, HIGH/CRITICAL classification |
| kube-bench / Kubesec | Prior scanner integration plus CI checks | **Not fully accepted**: readable reports, warning/evidence integrity, PDF, Linux node coverage |
| Falco | Source integration and rules API; global rule write restrictions in PR #12 | **Pending**: live Falcosidekick → API → DB → Angular, denial tests |
| Auth and tenancy | PR #11 merged header-key default; PR #12 adds inactive/deleted scanner user denial, global Falco mutation restriction, group write boundary | **Pending**: two-tenant live matrix, key rotation/revocation, scope across every API |
| Container build | Angular standalone production build passed CI for PR #12 pre-Docker fix; full CI at 9046870 failed Docker image/runtime integration because plain npm ci conflicts with Flex Layout legacy peer | **Pending**: CI re-run after Dockerfile fix 592fdfc |
| Helm lifecycle / recovery | Isolated staging Helm probe and TLS tested | **Pending**: clean install, upgrade, rollback, real PostgreSQL backup+restore, restore evidence |
| Frontend/Backend modernization | Angular 17 legacy AJSF and NestJS source still in use | **Pending**: planned framework and deprecated dependency migration without feature regression |
| Documentation, attribution, release | Documentation and licensing attribution retained in source | **Pending**: Linux/Kubernetes end-user README, versioned artifacts, acceptance sign-off |

## Prioritized work (do not skip a failed gate)

1. **P0: Deliverable integrity.** Full PR #12 CI green at latest commit, including Docker image, runtime integration, Angular, backend, helm, scanner jobs. Do not merge while red.
2. **P0: Security correctness.** Verify missing/invalid/revoked keys, inactive user, header-only behavior, explicit scanner cluster grant; two-tenant isolation for list/read/report/policy writes; deny unauthorized DB writes.
3. **P0: End-to-end product functionality.** Verify fresh scanner findings, queue ack/retry/DLQ, Postgres row and cluster association, Angular page, failure presentation; protect existing working kube-hunter config.
4. **P0: Deployment reliability.** Linux Kind cluster clean install/upgrade/rollback, connection persistence, Helm uninstall cleanup and Postgres restore; no Windows product instructions.
5. **P1: Feature parity & modernization.** Falco runtime event stream, native admission policy parity, vulnerability scoring trends, upgraded Angular/NestJS/Java APIs and dependency replacements; exact source feature checklist before final release.
6. **Release sign-off.** Publish Linux/Kubernetes installation guide, configuration examples, upgrade/rollback/backup instructions, security limitations, attribution, and tagged tested container images and Helm chart. Mark each acceptance row with commit, run link and live evidence.

## Operator rules

- Operator's workstation is Windows PowerShell for **testing**; product documentation targets Linux/Kubernetes.
- Do not recreate Dash without preserving the Compose and Kind Docker networks; do not delete Postgres volumes or scanner history.
- Never publish scanner API keys or use insecure URL query-token dispatch as the default.
- After each source fix, provide exact PowerShell commands to pull, build and test.
- A green GitHub check proves automated coverage only. Live Kind/real Kubernetes and DB acceptance remains separate.

## Consolidated product stabilization commit (2026-11-09)

- Fixed the real runtime integration Falco negative-auth fixture to match the actual typed webhook schema, so invalid credentials are rejected as unauthorized instead of a malformed-body 400. Requires live CI confirmation.
- Reject authenticated kube-hunter reports lacking valid report sections, never treating malformed/empty reports as successful scans.
- Kube-hunter persistence now takes only nodes/services/vulnerabilities from scanner input, generating UUID and cluster identity server-side. A scanner cannot inject id/createdAt/other database fields into a stored report.
- Added regression tests for malformed payloads and client-supplied report metadata. Existing kube-hunter staging scanner values and Helm release remain unchanged.

Still outstanding before final production release: explicit secure-probe DB/dashboard report verification, two-tenant scanner authorization and revocation E2E, Trivy RabbitMQ->Java->PostgreSQL->Angular real acceptance and DLQ, live Falco event to dashboard, Helm rollback/restore, modern framework and admission policies. CI passing is not release signoff.

## Java scanner failure aggregation fix

The Java ScanRunner now makes scanner failures sticky across every enabled scanner for a policy. A successful scanner after a failed scanner cannot reset `encounterError` to false. Policies with zero enabled scanners produce an explicit failed result, and requests with zero enabled policies throw instead of uploading an empty successful scan. The compliance check continues to treat HIGH/CRITICAL findings as noncompliant. These are source-level fixes pending full CI and live Trivy queue/DB/browser confirmation.

## Disposable CI webhook positive integration evidence

The full runtime smoke test now exercises an isolated test cluster in the ephemeral CI PostgreSQL database, posts a header-authenticated kube-hunter report and Falco event to the actual NestJS endpoints, and verifies exactly one new report row per scanner associated with that cluster. The same run already checks that unauthenticated/invalid requests cannot add reports. Test credentials are loaded from CI's generated private .env and never printed. Passing this check still does **not** prove live Kind Falco kernel event forwarding, the Java RabbitMQ worker's vulnerability scan, or Angular visual acceptance.

## Trivy scan lifecycle and recovery tranche

Added a cluster-scoped latest scan-run API, an Angular status/failure presentation and failed-run null safety. Added staging-only real RabbitMQ/Java Trivy orchestration, a read-only ledger/policy/CVE consistency checker, and a non-destructive PostgreSQL backup/scratch-restore drill. Automated unit/build/CI success is required before merge; the real staging workflow and browser inspection are separately required before declaring v1.0 production-ready. These tools never modify the existing Kind or Compose deployment unless explicitly launched on it; use a disposable staging host only.
