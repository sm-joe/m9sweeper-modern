# m9sweeper-modern

**Open-source Kubernetes security scanning and operations — public beta**

[![Public beta](https://img.shields.io/badge/release-v0.1.0--beta.1-blue)](https://github.com/sm-joe/m9sweeper-modern/releases/tag/v0.1.0-beta.1)
[![Source](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/sm-joe/m9sweeper-modern)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](platform/LICENSE)

m9sweeper-modern is a self-hosted platform for discovering Kubernetes workloads, scanning container images for vulnerabilities, and viewing findings and policy decisions in a web dashboard. It modernizes the original [m9sweeper](https://github.com/m9sweeper/m9sweeper) project with an Angular dashboard, NestJS API and Java-based image scanner.

**[Download the public beta](https://github.com/sm-joe/m9sweeper-modern/releases/tag/v0.1.0-beta.1)** · **[Installation guide](docs/mvp-public-beta-install.md)** · **[Release notes](docs/mvp-beta-release-notes.md)** · **[Report an issue](https://github.com/sm-joe/m9sweeper-modern/issues)**

> **Beta, not production certified.** The public `v0.1.0-beta.1` package passed signed-artifact verification and independent native Linux Kubernetes 1.35 Kind acceptance, including installation, login, an actual Trivy scan, upgrade and Helm rollback. It has **not** established production HA, database disaster recovery, comprehensive CIS compliance, or every scanner integration on every environment.

## Why m9sweeper-modern?

| Capability | Public beta scope |
| --- | --- |
| Image vulnerability scanning | Trivy scanning via RabbitMQ and Java Trawler, with findings stored in PostgreSQL |
| Kubernetes visibility | Cluster/workload/image inventory and Angular dashboard |
| Security policies | Scan-policy evaluation and historical results |
| Authentication | Dashboard login and scanner API credentials |
| Kubesec | Optional deployment-security analysis; test in your cluster |
| kube-bench / kube-hunter | Optional cluster assessment integrations; environment-specific validation required |
| Falco | Optional runtime-event ingestion; native eBPF deployment acceptance is separate |
| Gatekeeper / admission | Experimental; **do not enable enforcement for a production cluster without independent review** |

A failed scan is not a clean bill of health. Unsupported or manual CIS checks must not be reported as compliant.

## Architecture

```text
                      Linux Kubernetes cluster
              +-----------------------------------+
              | Dash (Angular + NestJS API)       |
Browser ----> |     |               |             |
              |     v               v             |
              | PostgreSQL       RabbitMQ         |
              | (inventory,       (scan queue)    |
              |  findings,           |            |
              |  history)            v            |
              |                Java Trawler       |
              |                     |             |
              |                    Trivy          |
              +-----------------------------------+
                   ^                 ^
                   |                 |
             Kubernetes API    Registry images

 Optional integrations: Kubesec, kube-bench, kube-hunter, Falco
```

## Get started on Linux (public beta)

The public download is a **signed Helm chart plus a staging-only installation helper**. It is intended for operators comfortable with Kubernetes, not a one-command production appliance.

### 1. Prerequisites

- Native Linux operator host (not Windows/WSL), with `kubectl`, Helm 3, `python3`, `sha256sum`, `cosign`, `bash`, and network access to registries.
- A disposable, authorized **Kubernetes 1.35** cluster with Linux nodes. Kubernetes 1.36/1.37 have CI coverage but are not independently qualified public-beta installation targets.
- Accessible **external PostgreSQL 17** and **RabbitMQ 4.4**, with separate credentials. Bundled legacy PostgreSQL/RabbitMQ charts are disabled by the public-beta profile.
- Namespace-local, pre-created Kubernetes Secrets for Dash, the first-run administrator and the Trawler worker. Use least-privilege access, trusted CA certificates and private networking.

### 2. Download the exact published release

On your Linux workstation:

```bash
mkdir -p "$HOME/m9sweeper-beta" && cd "$HOME/m9sweeper-beta"
# Download the immutable, published release assets (GitHub CLI required here).
gh release download v0.1.0-beta.1 \
  --repo sm-joe/m9sweeper-modern \
  --dir . --clobber
sha256sum -c SHA256SUMS
```

Check the signing identity **before running any downloaded installer**:

```bash
identity='https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main'
issuer='https://token.actions.githubusercontent.com'
cosign verify-blob --bundle chart.sigstore.json \
  --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" \
  m9sweeper-0.1.0-rc9.tgz
cosign verify-blob --bundle mvp-installer.sigstore.json \
  --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" \
  install-mvp-staging-linux.sh
```

The beta is tagged `v0.1.0-beta.1`; its exact signed chart build is `m9sweeper-0.1.0-rc9.tgz`. Do not replace it with a locally packaged chart or mutable `latest` image tags.

### 3. Prepare an isolated staging namespace and private Secrets

```bash
kubectl config current-context
kubectl create namespace m9-mvp-staging
kubectl label namespace m9-mvp-staging m9sweeper-staging=true --overwrite

# Prepare these three env files outside the Git repository first.
# See the linked installation guide for every required key.
kubectl -n m9-mvp-staging create secret generic m9-dash-env \
  --from-env-file=/secure/dash-runtime.env
kubectl -n m9-mvp-staging create secret generic m9-init-env \
  --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9-mvp-staging create secret generic m9-trawler-env \
  --from-env-file=/secure/trawler-runtime.env
```

**[Required Secret keys and secure templates](docs/mvp-public-beta-install.md#secret-contract)** — never use the documentation placeholders as credentials, put passwords in Helm `--set` flags, or commit private env files.

### 4. Install the signed chart

**Beta.1 installer notice:** the downloadable `install-mvp-staging-linux.sh` in this immutable beta.1 release still uses `helm --wait` on the initial install, which can delay its database bootstrap hook. **Do not execute that beta.1 helper.** Use the signed-chart installation below until a newer, independently signed release includes the corrected helper.

Create `/secure/m9-mvp-values.yaml` containing only nonsecret settings:

```yaml
global:
  mvp:
    enabled: true
  postgres:
    enabled: false
  rabbitmq:
    enabled: false
dash:
  existingSecret: m9-dash-env
  init:
    existingSecret: m9-init-env
trawler:
  existingSecret: m9-trawler-env
```

**Important:** the published chart already contains exact signed image-digest references. Do not override its `dash.image` or `trawler.image` unless validating a separately signed release.

For the verified chart, first check Secret keys using the bundled preflight, then install **without** Helm `--wait`, and check Deployment readiness separately:

```bash
cd "$HOME/m9sweeper-beta"
export M9_MVP_PREFLIGHT=YES
export M9_EXPECTED_KUBE_CONTEXT="$(kubectl config current-context)"
python3 ./mvp_preinstall_secrets.py --namespace m9-mvp-staging

kubectl get --raw /version  # Confirm supported Kubernetes version
helm upgrade --install m9-mvp ./m9sweeper-0.1.0-rc9.tgz \
  --namespace m9-mvp-staging \
  --values /secure/m9-mvp-values.yaml \
  --timeout 15m

kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-dash --timeout=5m
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-trawler --timeout=5m
```

The chart's post-install bootstrap hook runs before the explicit rollout checks. These commands are staging-only and assume the external database, broker and Secrets are already available. Follow the [operator installation guide](docs/mvp-public-beta-install.md) for troubleshooting and full configuration.


### 5. Open the dashboard and test a real scan

```bash
kubectl -n m9-mvp-staging get pods,jobs
kubectl -n m9-mvp-staging port-forward service/m9-mvp-dash 13000:3000
```

On the **same Linux workstation**, open **http://127.0.0.1:13000**, sign in with the administrator credentials from your private bootstrap Secret, connect a test Kubernetes cluster with CA-verified credentials, configure an applicable Trivy policy, and scan a known test image. Verify that findings appear in the dashboard and the scan is not falsely marked compliant. Port-forwarding is for local evaluation only; use an approved HTTPS ingress for remotely accessed deployments.

## Troubleshooting

```bash
kubectl -n m9-mvp-staging get deployments,pods,jobs -o wide
kubectl -n m9-mvp-staging get events --sort-by=.metadata.creationTimestamp
kubectl -n m9-mvp-staging describe deployment m9-mvp-dash
kubectl -n m9-mvp-staging describe deployment m9-mvp-trawler
helm status m9-mvp -n m9-mvp-staging
```

Common causes include mismatched DB/RabbitMQ credentials, unready external services, missing Secret keys, unreachable registry images, or scanner callback URLs unavailable from Kubernetes Pods. Don't delete database volumes to troubleshoot, and don't paste tokens, kubeconfigs or Secret values into public issues. **For initial installation, don't introduce Helm `--wait` before the post-install bootstrap hook**; the above initial-install sequence permits the bootstrap hook to run before readiness checks.

## Support, security and limitations

- **Supported beta test path:** native Linux/Kubernetes 1.35, Helm 3, external PostgreSQL 17 and RabbitMQ 4.4, isolated staging namespace.
- **Not yet qualified:** production HA, automated backup/restore guarantees, complete cluster tenant isolation on all routes, supported native Falco kernel coverage across platforms, all CIS controls, broad hosted Kubernetes support, or production admission enforcement.
- **Upgrades:** back up PostgreSQL independently and verify restoration on an isolated database. A Helm rollback does not undo database schema migrations.
- **Security issues:** use [GitHub private vulnerability reporting](https://github.com/sm-joe/m9sweeper-modern/security) where available; avoid posting credentials or exploit details in public issues.
- **Bugs and feature requests:** [GitHub Issues](https://github.com/sm-joe/m9sweeper-modern/issues).

The current public beta is a prerelease; regular production use requires your own security, network, persistence and recovery review.

## Developers and contributors

Source is organized under `platform/` (Angular/NestJS dashboard, Java Trawler and Helm charts); `tools/` holds integration and security tests; `scripts/` holds CI and operator helpers. The development integration environment is under `platform/docker-compose/`. Historical implementation notes remain in Git history; public user docs start here and in the [installation guide](docs/mvp-public-beta-install.md).

Contribution workflow: fork the repository, open a focused PR with relevant tests, and avoid including production credentials, private kubeconfigs or database dumps. The package is provided without a promise of CIS certification or upstream endorsement.

## License and origin

This is an independently maintained modernization of [the original m9sweeper project](https://github.com/m9sweeper/m9sweeper). The original [Apache 2.0 license](platform/LICENSE), source notices and [attribution](ATTRIBUTION.md) must be preserved. Trivy, Falco, Kubesec and other integrations have their own upstream licenses and operational requirements.
