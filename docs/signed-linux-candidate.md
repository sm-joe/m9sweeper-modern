# Signed candidate artifacts (Linux/Kubernetes)

**Status:** nonproduction release-candidate distribution only. This workflow never creates a GitHub release and never overrides the [production acceptance decision](modernization-2026-11-11-release-decision.md).

The manually dispatched `signed-linux-candidate.yml` workflow is restricted to `main`, requires `CANDIDATE_ONLY` confirmation, and accepts only `vMAJOR.MINOR.PATCH-rcN` versions. It builds the *actual* Dockerfiles for Dash and Java trawler as linux/amd64 images, publishes OCI provenance and build-generated SBOM metadata, signs image digests keylessly using GitHub Actions OIDC, verifies those signatures, and packages the existing Helm umbrella chart with the candidate version **and bakes in the two signed image digests** so it cannot silently deploy the obsolete upstream image repositories. The Helm tarball receives a Sigstore bundle; a separate source SPDX JSON SBOM and SHA256 hashes are uploaded as retained workflow artifacts.

## Candidate dispatch

From an authorized workstation (GitHub CLI), after reviewing the exact main SHA:

```bash
gh workflow run signed-linux-candidate.yml --ref main \
  -f version=v0.1.0-rc6 \
  -f confirmation=CANDIDATE_ONLY
gh run list --workflow signed-linux-candidate.yml --limit 5
```

The job requires `packages:write` permission to GHCR and `id-token:write` for Sigstore. The repository or organization may restrict package publishing or artifact attestations; a failed signing/publishing step is a **failed gate**, not a reason to publish unsigned images.

## Artifact verification

Use the exact digest references in `IMAGE-DIGESTS.txt` from the successful candidate workflow; never substitute a mutable image tag. On a separate Linux machine with `cosign`, verify both OCI digests:

```bash
identity='https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main'
issuer='https://token.actions.githubusercontent.com'
cosign verify --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" 'ghcr.io/sm-joe/m9sweeper-dash@sha256:REPLACE_WITH_ACTUAL_DIGEST'
cosign verify --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" 'ghcr.io/sm-joe/m9sweeper-trawler@sha256:REPLACE_WITH_ACTUAL_DIGEST'
```

For a downloaded artifact bundle containing `m9sweeper-0.1.0-rc6.tgz`, `chart.sigstore.json`, and `SHA256SUMS`:

```bash
sha256sum -c SHA256SUMS
cosign verify-blob --bundle chart.sigstore.json \
  --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" \
  m9sweeper-0.1.0-rc6.tgz
```

A successful candidate artifact build does **not** mean the Helm chart is production deployable; its dependency chart versions, service image references, permissions, migration ordering, ingress/TLS, Secret handling, PVC policies and rollback remain independently audited release gates. The candidate package's umbrella values embed the exact signed Dash/trawler digests as `v...-rcN@sha256:...` references. Confirm the rendered Kubernetes images match `IMAGE-DIGESTS.txt` before any staging-only install; do not override them with mutable tags.

## Initial compatibility target, not certified support

| Surface | Target to validate | Evidence needed before support |
| --- | --- | --- |
| Host OS | maintained Linux x86_64 | exact distro, kernel and container runtime |
| Kubernetes | upstream-supported 1.35, 1.36 and 1.37 only (November 2026 compatibility range) | 1.35 real Kind CI; 1.36/1.37 template/API/runtime evidence outstanding |
| Helm | Helm 3 | install/upgrade/rollback and PVC preservation |
| Falco | modern eBPF on supported native Linux kernel | real kernel event, Sidekick delivery, database and Angular correlation |
| Database | PostgreSQL from actual chart/Compose | verified isolated restore and migration lifecycle |
| Broker | RabbitMQ from actual chart/Compose | retry, durable DLQ, restart/recovery |
| Trivy | Java trawler image's pinned Trivy | real CVE results, failure reconciliation and no false compliance |

Only versions with documented reproducible positive evidence may be listed as supported. Keep historical upstream attribution, Kubernetes node-security caveats and confidentiality of secret-bearing Helm values.

The umbrella chart declares `kubeVersion: >=1.35.0-0 <1.38.0-0`; Helm rejects older and untested newer minors. Version acceptance by Helm is **not** live runtime certification. Update this window as upstream support changes, after compatible CI and staging evidence exists.
