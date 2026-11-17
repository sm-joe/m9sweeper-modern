# Release notes

## m9sweeper-modern v0.1.0

### Installation and upgrade reliability

- Rebuilt the public installation from the maintained Angular, NestJS, Java Trawler, PostgreSQL 17 and RabbitMQ 4.4 stack, with Trivy and the separately packaged kube-bench and kube-hunter scanner charts.
- Java Trawler now fails clearly if any RabbitMQ hostname, username, password or queue setting is absent or invalid; it never silently falls back to the default `guest` account.
- The Helm chart validates pre-existing Dash, bootstrap and Trawler Secret names and required values with a read-only, namespace-scoped **pre-install and pre-upgrade Job**. Mismatches or example placeholders stop installation before application Deployments or StatefulSets change. No credential values are included in logs.
- The release includes `create-install-secrets.py`, a non-overwriting, local first-install credential generator that creates aligned Kubernetes env files with 0600 permissions. Upgrades preserve all existing Secrets and identities.
- RabbitMQ's persisted Erlang cookie permissions are repaired to owner-only (0600) at startup without deleting or replacing the cookie or RabbitMQ's data volume.
- Release acceptance covers a signed/downloaded Helm chart, PostgreSQL/RabbitMQ readiness, seeded admin login, Trivy image scan ingestion, and Helm lifecycle; it now also exercises a deliberately broadened Erlang cookie on an *existing* RabbitMQ PVC and verifies non-destructive recovery across restart and upgrade.

### Download and upgrade

Use the files in this release, including `INSTALL.md` and `create-install-secrets.py`. The helper is **only for a fresh installation**; do not run it for an existing deployment. Back up PostgreSQL, preserve your existing RabbitMQ PVC, installation values and scanner Secrets, and test rollback before upgrading.

### Integration status

Falcosidekick event-to-Dashboard delivery and a live kube-hunter report-to-Dashboard scan remain operator acceptance items. Provider-native unattended EKS, AKS and GKE CLI-exec kubeconfig token renewal is not claimed as implemented. Core Kind install and Trivy checks do not independently prove those integrations.
