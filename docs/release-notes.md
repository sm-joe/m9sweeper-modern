# m9sweeper-modern v0.1.2

## Installation no longer fails because an existing cluster token expired

Before this release, the Helm post-install Job ran `cli:init:all`, which included `cli:cluster:sync-all`. An existing cluster with an expired or unauthorized stored service-account token (Kubernetes HTTP 401) would cause `m9sweeper-dash-init` to fail and Helm to report `failed post-install`, even when database migrations, administrator setup, and scanner initialization were successful.

This release decouples cluster inventory synchronization from the blocking bootstrap. The post-install Job still fails if required migrations, seeded accounts, registries, or namespace exceptions fail. **Cluster inventory synchronization still runs independently on the configured schedule and still reports and records failures. It never marks an unauthorized cluster's inventory as successfully scanned.** After installing, operators must replace an expired or unauthorized stored kubeconfig/token to resume inventory synchronization.

No existing database or broker PVC, Kubeconfig, service account, Kubernetes Secret or API key is replaced by this fix. The previous v0.1.1 release remains available.

## Upgrade

Follow `INSTALL.md`, preserving existing `m9-dash-env`, `m9-init-env`, `m9-trawler-env`, Helm values and database / RabbitMQ storage. **Do not rerun `create-install-secrets.py` on an existing deployment.** Existing Helm installations missing the saved `dash.existingSecret` value must specify the existing Secret name on upgrade. The chart includes the v0.1.1 original Trawler Secret name compatibility fix and persisted RabbitMQ cookie recovery.

The published chart and scanner charts are signed; release acceptance tests an actual downloaded Kind chart and upgrade/rollback. A live EKS cluster with an expired stored authentication token still requires operator credential repair. Native Falco-to-Dashboard and kube-hunter-to-Dashboard event delivery remain separately disclosed checks.
