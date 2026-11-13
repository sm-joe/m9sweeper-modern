# Release notes

## m9sweeper-modern v0.1.0

m9sweeper-modern brings container and Kubernetes security scanning into a single web dashboard. The release packages the Angular and NestJS application, Java Trawler scanner, and Helm charts for Kubernetes installation.

### Highlights

- Angular 22 dashboard and NestJS 11 API with authentication, cluster inventory, policies and vulnerability reporting
- Java 21 Trawler with queued Trivy scanning through RabbitMQ
- PostgreSQL-backed findings, historical scans and compliance decisions
- Integrations for Kubesec, kube-bench, kube-hunter, Falco and policy management
- Helm installation under `m9sweeper-system` using pre-created Kubernetes Secrets
- A clean `global.installation.enabled` chart configuration and digest-pinned application images
- Simplified [README](../README.md), [installation guide](installation.md) and CI/security/release workflows

### Installation requirements

Kubernetes, Helm 3, PostgreSQL 17 and RabbitMQ 4.4. Follow the [installation guide](installation.md) to configure credentials and install the release chart.

### Upgrade notes

- The installation namespace is `m9sweeper-system` and the Helm release name is `m9sweeper`.
- The configuration key is `global.installation.enabled`; older `global.mvp.enabled` values are no longer used for the newly packaged chart.
- Back up PostgreSQL and test restoration before upgrading; Helm rollback does not undo database changes.
- Enable optional Kubernetes security integrations deliberately for your cluster.

### Project origin

This project continues the original [m9sweeper](https://github.com/m9sweeper/m9sweeper). See [ATTRIBUTION.md](../ATTRIBUTION.md) and [Apache License 2.0](../platform/LICENSE).
