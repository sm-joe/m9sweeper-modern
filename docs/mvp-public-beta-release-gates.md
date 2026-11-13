# m9sweeper-modern v0.1.0-beta — public release decision

**Decision: NOT YET PUBLISHABLE.** This checklist is the minimum for a
downloadable, explicitly **experimental** self-hosted Kubernetes security
scanning MVP. It is narrower than the independently audited production-v1.0
release contract in [release-evidence-signoff.md](release-evidence-signoff.md).
Experimental status does not waive basic installation, security or data safety.

## MVP contract (must work for an unrelated user)

1. **Install:** verify the exact signed chart/container candidate on a fresh
   supported *native Linux* Kubernetes cluster, using only its packaged public
   README and values. Never require a Windows developer, hard-coded Kind IP,
   interactive changes to source, cluster-admin in steady state or TLS bypass.
   Capture Helm namespace, versions, pod readiness and init/migration outcome.
2. **Connect:** add a second disposable cluster using a trusted CA and
   supported Kubernetes identity; verify the selected cluster ID remains
   correct and no cross-cluster access is granted.
3. **Scan:** choose one real Kubernetes image, run Trivy from queued →
   completed, inspect persisted CVE/severity and compliance decision,
   confirm Angular Images list/detail, and ensure HIGH/CRITICAL findings are
   never labelled clean under a policy forbidding them. Verify scanner errors
   are shown as failures and durable DLQ retains poison messages.
4. **Basic Kubernetes security:** for the beta, certify Kubesec and kube-bench
   only if the actual installed chart has been used to produce and display
   genuine results. Show manual/unsupported CIS controls and warnings.
   Otherwise list them as experimental. kube-hunter, Falco and Gatekeeper may
   remain optional and clearly documented as unqualified integrations.
5. **Security:** staging Secret key + identity preflight passes; all
   scanner/admin keys unique and rotated from bootstrap, TLS trusted, HTTPS
   ingress when exposed beyond localhost, cluster RBAC least-privileged,
   unauthenticated ingest denied, unauthorized cross-cluster reads/writes
   denied, and no raw credentials in rendered artifacts/logs.
6. **Persistence:** verify an isolated PostgreSQL backup, restore into scratch
   DB with matching row counts/digests; verify Helm upgrade and rollback
   without loss of scans, users or policies. No production database or queue
   can be used for acceptance.
7. **Distribute:** publish digest-pinned Linux OCI images and Helm package
   built from the *same* source SHA, checksums, signature/attestation and
   SBOM. Independently verify signatures on an unrelated Linux host, test a
   reinstall from the *downloaded* package, not a local checkout, then attach
   release notes, immutable assets, license/attribution, supported matrix,
   security disclosure and limitations to the release.

## Minimum public feature matrix

| Capability | Intended v0.1.0-beta status | Current release evidence |
| --- | --- | --- |
| Angular login and inventory | Required | Compose CI; clean signed Helm install pending |
| Trivy CVE scanning and scan history | Required | Real Java/RabbitMQ/Postgres/Angular CI; downloaded chart acceptance pending |
| Policy compliance decisions | Required | Real queue and failure tests; fresh-package verification pending |
| Kubesec deployment scoring | Conditional beta | CI Kubesec live scan; chart/UI runtime certification pending |
| kube-bench CIS reports/PDF | Conditional beta | Integration exists; fresh Linux evidence pending |
| kube-hunter | Experimental | Prior operator Kind results; beta packaging not independently verified |
| Falco/eBPF | Optional experimental | Webhook/browser tested; native supported Linux eBPF sign-off pending |
| Gatekeeper/admission | Optional experimental / disabled by default | Must not claim production-ready |
| HA, SSO, broad distribution support | Not required for first beta | Future releases |

Do not label any unsupported CIS benchmark or manual control as compliant.

## What the source has and what it still lacks

- [MVP Helm profile](mvp-public-beta-install.md): opt-in external supported
  PostgreSQL and RabbitMQ, Secret references and immutable images.
- Signed candidate workflow: builds actual Dash and Java Trawler images,
  signs digests and chart, uploads SBOM and checksums. This is not a public
  GitHub release.
- Real Trivy staging browser acceptance: includes queued image-detail scan,
  with further Images, Kubesec, Gatekeeper and Namespaces page smoke checks
  pending PR integration and CI.
- Staging operator scripts: backup/restore, Helm upgrade/rollback and native
  scanner corroboration; execution evidence is *not* established by having
  scripts in GitHub.

**Current blocker for easy adoption:** the safe MVP Helm profile requires
operators to supply supported external PostgreSQL and RabbitMQ. This is
acceptable only for an advanced self-hosted beta with clear prerequisites;
a true novice-friendly one-command chart needs a separately supported,
Secret-backed modern in-cluster dependency option and fresh Linux testing.

## Release owner sign-off record

Before publication record the exact source SHA, chart checksum, immutable OCI
image references, distro/kernel, Kubernetes/Helm versions, links to successful
end-to-end staging runs and restored-data digests, final approved README,
license and security review. Do not store raw Secrets, kubeconfigs or private
database dumps in public issue/CI artifacts.

Only after those facts are reviewed may the repository be tagged and
`v0.1.0-beta.1` be published. Do not call this v1.0.0 or promise supported
production deployment.
