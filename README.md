# m9sweeper-modern

### Kubernetes Security for Everyone

[![Release](https://img.shields.io/github/v/release/sm-joe/m9sweeper-modern?include_prereleases&label=release)](https://github.com/sm-joe/m9sweeper-modern/releases)
[![License](https://img.shields.io/badge/Apache--2.0-blue)](platform/LICENSE)

**m9sweeper-modern** is a free, open-source Kubernetes security platform. Scan container images for vulnerabilities, review cluster security, manage security policies and track findings from a single dashboard.

[Installation guide](docs/mvp-public-beta-install.md) · [Releases](https://github.com/sm-joe/m9sweeper-modern/releases) · [Issues](https://github.com/sm-joe/m9sweeper-modern/issues) · [Contributing](CONTRIBUTING.md)

## Features

- **CVE scanning** with Trivy
- **Kubernetes inventory** for clusters, namespaces, workloads and images
- **Policies, exceptions and security reports**
- **Historical vulnerability data and dashboards**
- **Additional integrations:** Kubesec, kube-bench, kube-hunter, Falco and Gatekeeper (additional setup may be required)

## Tech stack

| Component | Technology |
| --- | --- |
| Dashboard | Angular 22, TypeScript, Angular Material |
| Backend | NestJS 11, Node.js |
| Scanner | Java 21, Trivy |
| Database | PostgreSQL 17 |
| Message queue | RabbitMQ 4.4 |
| Deployment | Kubernetes, Helm 3 |

## Architecture

```text
   Kubernetes clusters
           |
           v
  Angular Dashboard + NestJS API ------> PostgreSQL
           |
           v
        RabbitMQ
           |
           v
      Java Trawler ---> Trivy ---> API ---> PostgreSQL
```

## Installation

**Requirements:** Kubernetes 1.35, Helm 3, `kubectl`, an accessible PostgreSQL 17 database and RabbitMQ 4.4 server. The current chart requires you to configure those two services separately.

### 1. Download

```bash
mkdir m9sweeper && cd m9sweeper
gh release download v0.1.0-beta.1 --repo sm-joe/m9sweeper-modern --pattern '*.tgz'
```

### 2. Configure

Prepare three private environment files for the database, message queue and administrator credentials, as shown in the [installation guide](docs/mvp-public-beta-install.md).

```bash
kubectl create namespace m9sweeper-system

kubectl -n m9sweeper-system create secret generic m9-dash-env --from-env-file=/secure/dash-runtime.env
kubectl -n m9sweeper-system create secret generic m9-init-env --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9sweeper-system create secret generic m9-trawler-env --from-env-file=/secure/trawler-runtime.env
```

Create `/secure/m9sweeper-values.yaml`:

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

### 3. Install

```bash
helm upgrade --install m9sweeper ./m9sweeper-0.1.0-rc9.tgz \
  --namespace m9sweeper-system \
  --values /secure/m9sweeper-values.yaml \
  --timeout 15m

kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
```

### 4. Open dashboard

```bash
kubectl -n m9sweeper-system port-forward svc/m9sweeper-dash 13000:3000
```

Open **http://localhost:13000** and sign in with the administrator account you configured.

See the [installation guide](docs/mvp-public-beta-install.md) for all required environment variables and troubleshooting.

## Contributing

We welcome pull requests and bug reports. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[Apache 2.0](platform/LICENSE). Based on the original [m9sweeper](https://github.com/m9sweeper/m9sweeper); see [attribution](ATTRIBUTION.md).

The downloadable chart has been tested on Kubernetes 1.35. Verify security settings, backups and recovery processes before using it for important workloads.
