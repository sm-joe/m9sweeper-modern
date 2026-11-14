# Release notes

## m9sweeper-modern v0.1.0

m9sweeper is packaged as a Helm installation with PostgreSQL 17, RabbitMQ 4.4, the Angular dashboard, NestJS backend and Java Trivy scanning worker.

### Highlights

- Automatic PostgreSQL and RabbitMQ provisioning with persistent volumes and Kubernetes Secret-backed credentials
- Release-scoped ClusterRole and ClusterRoleBinding names, avoiding collisions with existing resources
- Kubernetes container images retain exact OCI tag and manifest digest references; image inventory no longer treats the digest as a nonexistent tag
- Trivy scan failures remain visible and do not produce compliant assessments
- Kubernetes installation, admin login, live Trivy scan and Helm upgrade/rollback acceptance workflow

See [Installation](installation.md) and [ATTRIBUTION.md](../ATTRIBUTION.md).

### Existing installations

If an earlier deployment indexed digest-pinned images incorrectly, refresh cluster image inventory after installation so correct references are queued. Historical failed scan entries should not be interpreted as successful vulnerability scans. Back up PostgreSQL before replacing an existing release.
