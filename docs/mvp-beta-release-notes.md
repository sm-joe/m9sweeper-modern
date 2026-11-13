# m9sweeper-modern v0.1.0-beta.1

> **Installer advisory for beta.1 (2026-11-14):** The already-signed downloadable staging helper in this release uses `helm --wait` on initial installation, which can block the post-install database bootstrap. Do not run that beta.1 helper. Verify the signed `m9sweeper-0.1.0-rc9.tgz` and follow the [manual, staging-only installation sequence](mvp-public-beta-install.md#3-install-the-verified-chart) without initial `--wait`. Source-side helper fixes will require a separately signed later release; this advisory does not alter immutable beta.1 assets.

**Public beta — Linux/Kubernetes self-hosted security scanner. NOT a production-certified security appliance.**

This first public beta contains a real Angular/NestJS dashboard, PostgreSQL
inventory and historical evidence, RabbitMQ/Java Trawler/Trivy image
vulnerability assessment, authenticated scanning and cluster integration,
with optional Kubesec, kube-bench, kube-hunter, Falco and Gatekeeper modules.
Advanced modules are experimental unless separately confirmed on your
environment. This project is an independently maintained modernization of
the original m9sweeper; see [upstream attribution](ATTRIBUTION.md) and the
repository's license material.

## Requirements and limitations

- Supported beta test environment: native Linux nodes, Kubernetes 1.35
  (additional 1.36/1.37 compatibility is exercised in CI but needs independent
  distribution acceptance), Helm 3 and a storage class for your applications.
- Operators **must supply** supported external PostgreSQL 17 and RabbitMQ
  4.4, plus private Kubernetes Secrets for Dash, init/bootstrap and Trawler.
  The obsolete bundled database/broker charts are intentionally disallowed in
  the public-beta Helm profile.
- The chart's secure profile requires **signed OCI image digests** and
  an explicitly labelled staging namespace. The included
  `install-mvp-staging-linux.sh` performs verified **staging-only** install
  checks; it is not an unattended production installer.
- Do not expose HTTP port-forward or Dash on a public network. Configure
  trusted HTTPS ingress, least-privilege Kubernetes access, rotating keys,
  network policies and backups for a real multiuser deployment.
- PostgreSQL backup/restore, production HA, every node OS, every managed
  cluster, native Falco eBPF, Gatekeeper admission and full CIS benchmark
  completeness are **not** certified by the beta CI. Never treat missing
  findings, unsupported controls or scanner failure as security compliance.

## Download and install

Download the attached signed candidate chart `m9sweeper-0.1.0-rcN.tgz`,
`IMAGE-DIGESTS.txt`, `SHA256SUMS`, Sigstore bundles,
`install-mvp-staging-linux.sh`, `mvp_preinstall_secrets.py` and
`MVP-INSTALL.md`. The attached Helm package retains its signed release
candidate build version even though it is distributed as the public
`v0.1.0-beta.1` pre-release. **Do not substitute mutable latest tags.**

Verify signatures, configure the external PostgreSQL/RabbitMQ and pre-created
Secrets, then follow `MVP-INSTALL.md` or the repository's
[public beta installation guide](docs/mvp-public-beta-install.md).
The staging installer explicitly checks namespace, trusted source workflow
signature, digests, Secret identities and Helm readiness before installation.
New users should first exercise this in their own **disposable** Kubernetes
namespace and verify a genuine Trivy report and visible vulnerability details.

## Security and support

This is beta software. Avoid production admission enforcement, broadly
privileged scan identities or unreviewed automatic remediation. Report
vulnerabilities through repository GitHub security reporting rather than
public issues containing secrets. Share only sanitized logs and reproduction
steps. Release assets are bound to an immutable source SHA and signed via
GitHub Actions OIDC/Sigstore; verify the identity documented in
[Signed Candidate Instructions](docs/signed-linux-candidate.md).

For data protection, retain independent encrypted PostgreSQL backups, apply
upgrade/rollback procedures in staging first, and do not delete PVCs during
troubleshooting. Existing cluster scan history and policy evidence should be
preserved during upgrades.

**Go/no-go:** This release is published only after the signed candidate
workflow, full source CI and a *separate* native Linux Kind install from the
downloaded package pass, including seeded admin login, actual queued Trivy
through the Java worker/DB/API, and Helm upgrade/rollback. The beta does not
make a general production-ready or CIS-certified claim.
