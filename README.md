# m9sweeper-modern

### Kubernetes Security for Everyone

[![Release](https://img.shields.io/github/v/release/sm-joe/m9sweeper-modern?include_prereleases&label=release)](https://github.com/sm-joe/m9sweeper-modern/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](platform/LICENSE)

**m9sweeper-modern** is an open-source security dashboard for Kubernetes. It brings together image vulnerability scanning, cluster visibility, security policies, and reports in one place.

[**Download**](https://github.com/sm-joe/m9sweeper-modern/releases) · [**Installation**](docs/mvp-public-beta-install.md) · [**Report a bug**](https://github.com/sm-joe/m9sweeper-modern/issues) · [**Contribute**](CONTRIBUTING.md)

## Features

- **Vulnerability scanning:** Find container image vulnerabilities using [Trivy](https://github.com/aquasecurity/trivy).
- **Cluster security:** Discover Kubernetes resources and review their security posture.
- **Security policies:** Manage scanning rules, exceptions, and compliance decisions.
- **Reports:** Review findings, scan history, and trends in one dashboard.
- **Additional tools:** Integrations for [Kubesec](https://github.com/controlplaneio/kubesec), [kube-bench](https://github.com/aquasecurity/kube-bench), [kube-hunter](https://github.com/aquasecurity/kube-hunter), [Falco](https://falco.org/) and Gatekeeper. These require separate configuration and environment-specific testing.

## Technology

| Component | Technology |
| --- | --- |
| Dashboard | Angular 22, TypeScript, Angular Material |
| API | NestJS 11, Node.js |
| Image scanner | Java 21, Trivy |
| Database | PostgreSQL 17 |
| Message queue | RabbitMQ 4.4 |
| Deployment | Kubernetes, Helm 3 |
| Testing | Jest, Playwright, GitHub Actions |

## Architecture

```text
                    Kubernetes clusters
                           |
                           v
Browser ---> Angular Dashboard + NestJS API
                           |        |
                           |        v
                           |     RabbitMQ
                           |        |
                           v        v
                       PostgreSQL  Java Trawler
                           ^        |
                           +-- Trivy scan results
```

The API manages clusters, policies and results. RabbitMQ delivers image-scan jobs to Trawler; Trivy scans images and findings are saved to PostgreSQL.

## Installation

**You need:** a Kubernetes cluster (version 1.35 is the tested setup), Helm, kubectl, an existing PostgreSQL 17 database and RabbitMQ 4.4 server. Install the GitHub CLI (`gh`), Python 3 and Cosign to download and verify the release. Use a Unix-compatible shell on the host running these commands.

**1. Download m9sweeper**

```bash
mkdir -p m9sweeper && cd m9sweeper
gh release download v0.1.0-beta.1 --repo sm-joe/m9sweeper-modern
sha256sum -c SHA256SUMS

cosign verify-blob m9sweeper-0.1.0-rc9.tgz \
  --bundle chart.sigstore.json \
  --certificate-identity "https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

**2. Configure the database, RabbitMQ and administrator account**

Create three private configuration files using the examples in the [installation guide](docs/mvp-public-beta-install.md). Then create the Kubernetes namespace and Secrets:

```bash
kubectl create namespace m9-mvp-staging
kubectl label namespace m9-mvp-staging m9sweeper-staging=true

kubectl -n m9-mvp-staging create secret generic m9-dash-env --from-env-file=/secure/dash-runtime.env
kubectl -n m9-mvp-staging create secret generic m9-init-env --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9-mvp-staging create secret generic m9-trawler-env --from-env-file=/secure/trawler-runtime.env
```

**3. Install with Helm**

Create `/secure/m9-mvp-values.yaml` as shown in the [installation guide](docs/mvp-public-beta-install.md), then:

```bash
export M9_MVP_PREFLIGHT=YES
export M9_EXPECTED_KUBE_CONTEXT="$(kubectl config current-context)"
python3 mvp_preinstall_secrets.py --namespace m9-mvp-staging

helm upgrade --install m9-mvp ./m9sweeper-0.1.0-rc9.tgz \
  --namespace m9-mvp-staging --values /secure/m9-mvp-values.yaml --timeout 15m

kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-dash --timeout=5m
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-trawler --timeout=5m
```

**4. Open the dashboard**

```bash
kubectl -n m9-mvp-staging port-forward svc/m9-mvp-dash 13000:3000
```

Open **http://localhost:13000** and log in using the administrator account you configured.

For the full configuration examples and troubleshooting, see [Installation](docs/mvp-public-beta-install.md).

> The current download requires an existing database and message queue. Its bundled installation helper has a known first-install issue, so use the Helm commands above rather than the helper. The release is intended for evaluation; production backup, recovery and advanced scanner support are not yet independently certified.

## Contributing

Contributions and bug reports are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md), and use [GitHub Issues](https://github.com/sm-joe/m9sweeper-modern/issues) for requests.

## License

[Apache License 2.0](platform/LICENSE). This project modernizes the original [m9sweeper](https://github.com/m9sweeper/m9sweeper). Original authorship and notices are preserved in [ATTRIBUTION.md](ATTRIBUTION.md); this project is not endorsed by the original maintainers.
