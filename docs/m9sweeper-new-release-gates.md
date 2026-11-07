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
