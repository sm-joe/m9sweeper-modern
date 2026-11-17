# m9sweeper-modern v0.1.0

## Installation and reliability

- The Dashboard, kube-bench and kube-hunter installation instructions discover the current published Helm chart without embedding release-specific archive URLs in the web application.
- The packaged Dash CLI npm commands use the actual deployed `./cli.js` executable, including cluster inventory synchronization.
- PostgreSQL initialization fails clearly on authentication, authorization or missing-database errors; transient connection retries are bounded.
- Bundled PostgreSQL and RabbitMQ retain their own persistent data; upgrades must reuse the original Kubernetes Secrets rather than regenerating passwords.
- EKS installation instructions identify the Trawler Pod Identity association and IAM ECR pull permissions required before attempting private ECR scans. These permissions must be provided by the cluster administrator.
- The Falco installation dialog uses the modern eBPF driver and an existing Falcosidekick webhook Secret. Webhook URL, API key and minimum priority are set in the Secret, not in publicly visible Helm flags.

## Security scanner integrations

The core scanner integrations remain Trivy, kube-bench, Kubesec, kube-hunter and Falco. Scanner Helm commands must refer to charts actually published alongside this release. kube-hunter requires a trusted HTTPS report endpoint and authenticated relay. Falco events are only considered ingested after validating the Falcosidekick webhook and Dash event persistence. Private ECR requires workload IAM identity and any applicable cross-account repository authorization.

## Install and upgrade

Follow `INSTALL.md` and the [EKS guide](https://github.com/sm-joe/m9sweeper-modern/blob/main/docs/eks-installation.md). Generate first-install credentials only for new persistent volumes. Existing installations must reuse the original `m9-dash-env`, `m9-init-env`, `m9-trawler-env`, and their PostgreSQL/RabbitMQ data.

## Release evidence

Publication requires successful exact-source Platform CI, signed immutable container and Helm artifacts, downloaded-chart Kubernetes acceptance, and independently reviewed kube-bench, kube-hunter, Trivy/private ECR and Falco end-to-end results. An installable chart or a started scanner Job alone is not evidence that scan reports reached the Dashboard.
