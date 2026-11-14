# Release notes

## m9sweeper-modern v0.1.1

### Scanner setup and report ingestion

- Dash now advertises an in-cluster Pod-reachable report callback automatically, using the release-local `m9sweeper-dash` Kubernetes Service. The browser's `localhost` address is never used for scanner Jobs.
- The kube-bench configuration wizard can generate runnable Jobs and CronJobs after this callback is available, rather than disabling its completion button by default.
- Standalone `kube-bench` and `kube-hunter` Helm charts are published as versioned, checksum-verified, signed release assets. The wizard references the downloadable charts instead of assuming the operator has checked out the source tree.
- The kube-hunter report relay continues to require a trusted HTTPS report-ingestion origin and header-based API-key authentication. To enable it, configure `dash.scannerReportIngestionUrl` with an HTTPS ingress origin reachable from scanner Pods. A private CA can be supplied with `reportRelay.caSecret`.
- No change to scanner authorization, per-cluster access controls, or fail-closed handling of failed scans.

### Upgrade notes

Upgrade Dash using `v0.1.1` and your existing private Helm values and Secrets. The default scanner callback becomes `http://m9sweeper-dash.<namespace>.svc.cluster.local:3000` when no explicit scanner callback override is set. Keep kube-hunter on trusted HTTPS. Create the dedicated scanner report authentication Secrets before running scanner Jobs. A wizard's Done/Close action only closes the instructions; executing the shown Helm command creates the actual Job.

See [Installation](installation.md) for Kubernetes-based setup and troubleshooting.

## m9sweeper-modern v0.1.0

Initial consolidated public release of the actively maintained Kubernetes security scanner.

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
