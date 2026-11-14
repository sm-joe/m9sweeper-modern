# m9sweeper-modern

**Kubernetes Security for Everyone**

[![Release](https://img.shields.io/github/v/release/sm-joe/m9sweeper-modern?label=release)](https://github.com/sm-joe/m9sweeper-modern/releases)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](platform/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/sm-joe/m9sweeper-modern)](https://github.com/sm-joe/m9sweeper-modern/issues)

**m9sweeper-modern** is an open-source Kubernetes security platform that brings container vulnerability scanning, cluster security insights, policies and reporting into one dashboard. It continues the original [m9sweeper](https://github.com/m9sweeper/m9sweeper) project with a modern application stack and actively maintained Kubernetes integration.

[**Installation**](docs/installation.md) · [**Releases**](https://github.com/sm-joe/m9sweeper-modern/releases) · [**Report an issue**](https://github.com/sm-joe/m9sweeper-modern/issues) · [**Contribute**](CONTRIBUTING.md)

## What you can do

- **Discover clusters and workloads** — view Kubernetes clusters, namespaces, deployments, pods and images.
- **Scan container images** — identify CVEs with Trivy, review severity and track results over time.
- **Manage security policies** — configure scanning rules, decisions and exceptions.
- **Understand your security posture** — use dashboards, vulnerability trends and reports.
- **Connect additional security tools** — Kubesec, kube-bench, kube-hunter, Falco and Gatekeeper integrations are available, with configuration depending on your cluster.

## Security tools

| Tool | Purpose |
| --- | --- |
| [Trivy](https://github.com/aquasecurity/trivy) | Container image vulnerability scanning |
| [Kubesec](https://github.com/controlplaneio/kubesec) | Kubernetes manifest security analysis |
| [kube-bench](https://github.com/aquasecurity/kube-bench) | CIS benchmark assessments |
| [kube-hunter](https://github.com/aquasecurity/kube-hunter) | Kubernetes penetration testing |
| [Falco](https://falco.org/) | Runtime security events |
| [OPA Gatekeeper](https://github.com/open-policy-agent/gatekeeper) | Kubernetes security policies |

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | Angular 22, TypeScript, Angular Material, RxJS |
| Backend | NestJS 11, Node.js, TypeScript |
| Image scanner | Java 21, Maven, Trivy |
| Persistence | PostgreSQL 17 |
| Messaging | RabbitMQ 4.4 |
| Deployment | Kubernetes, Helm 3 |
| Testing & automation | Jest, Playwright, GitHub Actions, Kind |

## Architecture

```mermaid
flowchart LR
    Browser["Web browser"] --> Dashboard["Angular dashboard"]
    Dashboard --> API["NestJS API"]
    API <--> DB[("PostgreSQL")]
    API --> Queue["RabbitMQ scan queue"]
    Queue --> Worker["Java Trawler"]
    Worker --> Trivy["Trivy"]
    Trivy --> Worker
    Worker --> API
    API <--> Cluster["Kubernetes API"]
    API --> Optional["Kubesec · kube-bench · kube-hunter · Falco"]
```

The NestJS API maintains cluster inventory, policies and scan history. Trawler processes image-scan jobs from RabbitMQ and sends Trivy results back to the API for persistence and display.

## Installation

### Requirements

- A Kubernetes cluster and `kubectl` (Kubernetes 1.35 is the tested reference environment)
- Helm 3 and [GitHub CLI](https://cli.github.com/)
- An existing **PostgreSQL 17** database and **RabbitMQ 4.4** broker accessible from your cluster

### 1. Download

```bash
mkdir -p m9sweeper && cd m9sweeper
gh release download v0.1.1 --repo sm-joe/m9sweeper-modern --pattern 'm9sweeper-*.tgz'
```

### 2. Configure

Prepare the three credential files described in the [installation guide](docs/installation.md). Then create the namespace and Secrets:

```bash
kubectl create namespace m9sweeper-system
kubectl -n m9sweeper-system create secret generic m9-dash-env --from-env-file=/secure/dash-runtime.env
kubectl -n m9sweeper-system create secret generic m9-init-env --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9sweeper-system create secret generic m9-trawler-env --from-env-file=/secure/trawler-runtime.env
```

### 3. Install with Helm

Create a `values.yaml` file:

```yaml
global:
  installation:
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

Install m9sweeper:

```bash
helm upgrade --install m9sweeper ./m9sweeper-0.1.0.tgz \
  --namespace m9sweeper-system \
  --values values.yaml --timeout 15m

kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
```

### 4. Open the dashboard

```bash
kubectl -n m9sweeper-system port-forward service/m9sweeper-dash 13000:3000
```

Visit **http://localhost:13000** and sign in with your configured administrator account.

See **[Installation & configuration](docs/installation.md)** for the required environment variables, connectivity setup and troubleshooting.

## Development

```text
platform/dash/frontend/     Angular application
platform/dash/backend/      NestJS API and migrations
platform/trawler/           Java scanner
platform/manifests/charts/  Helm charts
platform/docker-compose/    Local development dependencies
tools/                      Automated tests
.github/workflows/          CI and release workflows
```

For contributions, see [CONTRIBUTING.md](CONTRIBUTING.md). Please report security vulnerabilities through [SECURITY.md](SECURITY.md), not public issues.

## License and acknowledgements

Licensed under [Apache 2.0](platform/LICENSE). m9sweeper-modern builds on the original [m9sweeper](https://github.com/m9sweeper/m9sweeper) project. See [ATTRIBUTION.md](ATTRIBUTION.md) for author and license notices.
