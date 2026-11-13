# m9sweeper-modern

**Open-source Kubernetes and container security scanning, with a web dashboard.**

[![Release](https://img.shields.io/github/v/release/sm-joe/m9sweeper-modern?include_prereleases&label=release)](https://github.com/sm-joe/m9sweeper-modern/releases)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](platform/LICENSE)

m9sweeper-modern is a modernization of the original [m9sweeper](https://github.com/m9sweeper/m9sweeper). It helps Kubernetes operators discover cluster workloads, scan images with **Trivy**, review vulnerabilities and policy results, and manage security findings from an **Angular** dashboard.

**[Latest release](https://github.com/sm-joe/m9sweeper-modern/releases)** · **[Installation guide](docs/mvp-public-beta-install.md)** · **[Report a bug](https://github.com/sm-joe/m9sweeper-modern/issues)** · **[Security policy](SECURITY.md)**

> **Public beta:** `v0.1.0-beta.1` is a self-hosted, staging-oriented release, **not a production-certified appliance or a CIS-certified auditor**. Its signed chart was verified on native Linux Kubernetes 1.35 Kind, including actual Trivy scan, authentication, installation and Helm lifecycle tests. Native Falco, all CIS controls, HA and database disaster recovery require separate validation.

## Features

- **Kubernetes inventory:** clusters, namespaces, workloads and container images.
- **Vulnerability management:** asynchronous Trivy image scans, CVE findings, severity and scan history.
- **Policies and reporting:** compliance decisions, policy management, exceptions and security dashboards.
- **Additional integrations:** Kubesec, kube-bench, kube-hunter, Falco and admission/policy capabilities (optional; environment-specific testing required).
- **Security controls:** authenticated UI/API, scanner credentials and cluster-scoped access support.

A failed scan is shown as a failure—not as proof of compliance.

## Technology stack

| Layer | Technology |
| --- | --- |
| Web UI | **Angular 22**, TypeScript, Angular Material, RxJS; esbuild application builder |
| API | **NestJS 11**, Node.js, TypeScript |
| Scanner worker | **Java 21**, Maven, Trivy |
| Database | **PostgreSQL 17** (external for the public beta) |
| Queue | **RabbitMQ 4.4** (external for the public beta) |
| Kubernetes deployment | **Helm 3**, Linux Kubernetes 1.35; 1.36/1.37 chart compatibility requires further independent acceptance |
| CI / security | GitHub Actions, Kind, Playwright, image/chart signatures with Sigstore/Cosign, SPDX SBOM |

## Architecture

```text
                              Kubernetes cluster(s)
                                 |           |
                              inventory   images to scan
                                 |           |
                                 v           v
 Browser ----> Angular dashboard + NestJS API ----> RabbitMQ
                        |                              |
                        |                              v
                        |                       Java 21 Trawler
                        |                              |
                        |                            Trivy
                        |                              |
                        v                              |
                    PostgreSQL <----- scan results ----+
                (clusters, policies,
                 CVEs, history, events)

 Optional: Kubesec / kube-bench / kube-hunter / Falco
```

The dashboard and API are served together. Trawler consumes queued image-scan jobs, executes Trivy and returns results to the authenticated backend, which stores findings in PostgreSQL.

## Quick start — Linux + Kubernetes

**Requirements:** native Linux, `kubectl`, `helm`, `gh` (GitHub CLI), `cosign`, Python 3, Bash, an isolated **Kubernetes 1.35** cluster, and reachable **PostgreSQL 17** and **RabbitMQ 4.4** instances. The current public beta deliberately does not provision its own database or broker.

### 1. Download and verify the signed release

```bash
mkdir -p ~/m9sweeper-beta && cd ~/m9sweeper-beta
gh release download v0.1.0-beta.1 \
  --repo sm-joe/m9sweeper-modern --dir .
sha256sum -c SHA256SUMS

identity='https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main'
issuer='https://token.actions.githubusercontent.com'
cosign verify-blob --bundle chart.sigstore.json \
  --certificate-identity "$identity" \
  --certificate-oidc-issuer "$issuer" \
  m9sweeper-0.1.0-rc9.tgz
```

The beta tag is `v0.1.0-beta.1`; the signed chart bundled with it is `m9sweeper-0.1.0-rc9.tgz`. Stop if checksum or signature verification fails.

### 2. Configure external services and Secrets

Create a **dedicated test namespace** and three Kubernetes Secrets containing the connection details and bootstrap credentials:

```bash
kubectl create namespace m9-mvp-staging
kubectl label namespace m9-mvp-staging m9sweeper-staging=true --overwrite

kubectl -n m9-mvp-staging create secret generic m9-dash-env \
  --from-env-file=/secure/dash-runtime.env
kubectl -n m9-mvp-staging create secret generic m9-init-env \
  --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9-mvp-staging create secret generic m9-trawler-env \
  --from-env-file=/secure/trawler-runtime.env
```

The three private env files must be prepared **before** these commands. See the [installation guide](docs/mvp-public-beta-install.md) for their exact keys, safe credential generation and connectivity requirements. Never commit the env files.

### 3. Install the signed chart

Create `/secure/m9-mvp-values.yaml`:

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

Then run:

```bash
export M9_MVP_PREFLIGHT=YES
export M9_EXPECTED_KUBE_CONTEXT="$(kubectl config current-context)"
python3 ./mvp_preinstall_secrets.py --namespace m9-mvp-staging

# Initial install deliberately omits --wait so the database bootstrap hook can run.
helm upgrade --install m9-mvp ./m9sweeper-0.1.0-rc9.tgz \
  -n m9-mvp-staging -f /secure/m9-mvp-values.yaml --timeout 15m

kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-dash --timeout=5m
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-trawler --timeout=5m
```

**Beta.1 note:** The separately downloaded `install-mvp-staging-linux.sh` contains an older `helm --wait` install sequence. **Do not run that beta.1 helper.** The signed chart and commands above avoid that known hook deadlock. A corrected helper will require a newly signed release.

### 4. Open the dashboard

```bash
kubectl -n m9-mvp-staging port-forward svc/m9-mvp-dash 13000:3000
```

Open **http://127.0.0.1:13000** on the same Linux workstation. Log in with the bootstrap administrator, add an authorized test Kubernetes cluster with a trusted CA, configure a Trivy scanning policy, then scan an image and confirm the findings appear in the UI. Never expose this HTTP port-forward publicly.

For setup detail, troubleshooting, and the complete Secret contract, see **[Linux installation](docs/mvp-public-beta-install.md)**.

## Project layout

```text
platform/
  dash/frontend/           Angular application
  dash/backend/            NestJS API and database migrations
  trawler/                 Java scanner worker
  manifests/charts/        Helm charts
  docker-compose/          Development/integration environment
scripts/                   Linux operator and CI helpers
tools/                     Automated security, integration and browser tests
docs/                      Public release installation + release notes
.github/workflows/         CI, signed builds and Kind acceptance
```

## Support, security and contributions

- [Open an issue](https://github.com/sm-joe/m9sweeper-modern/issues) for reproducible bugs and requests. Share redacted logs only.
- Read [SECURITY.md](SECURITY.md) before reporting vulnerabilities.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for pull request expectations.
- For upgrades, back up and test-restore PostgreSQL first; Helm rollback does **not** reverse database schema migrations.
- Falco, kube-bench, kube-hunter and other integrations are not certified for all distributions, kernels or managed Kubernetes environments.

## License and attribution

This independent modernization retains the original [Apache-2.0 license](platform/LICENSE), imported notices and [upstream attribution](ATTRIBUTION.md). It is not affiliated with, or endorsed by, the original maintainers.
