# m9sweeper-modern NestJS API

The backend runs **NestJS 11 / Node.js / TypeScript**. It serves the Angular dashboard, manages authentication and per-cluster authorization, persists scan findings in PostgreSQL and dispatches image scan work through RabbitMQ to the Java Trawler. It also integrates with the Kubernetes API and provider-specific deployment configuration.

## Linux development

From a checked-out repository with Node.js and npm installed:

```bash
cd platform/dash/backend
npm ci
npm run build:api
npm test -- --runInBand
```

The backend requires configuration for PostgreSQL, RabbitMQ, JWT security and scanner report ingestion. Never commit actual secrets or print raw bearer tokens or kubeconfigs in build logs. For deployment use the versioned Helm chart and [installation guide](../../../docs/installation.md).

## Initialization

The Helm post-install Job is expected to run:

```bash
npm run cli:database:migrate
npm run cli:users:init
npm run cli:cluster:seed
npm run cli:registries:init
npm run cli:exceptions:init
npm run cli:cluster:sync-all
```

These are application commands to be executed **inside a correctly configured container**; running them against a production database without verifying the connection target and initialization state is unsafe. Cluster sync is not proof that scans completed. Confirm administrator and scoped scanner identities exist after installation.

## Managed Kubernetes authentication

Standard EKS, AKS and GKE kubeconfigs commonly include `exec` credential helpers; those helpers run on the **operator's** administration environment. A server must not execute arbitrary untrusted uploaded commands or assume it has the operator's cloud credentials.

The current backend rejects such kubeconfigs. Native cloud provider token acquisition and refresh, bound to explicit workload identities, must be implemented before calling this automatic flow supported. A Kubernetes API call also requires the relevant Kubernetes RBAC permissions, independent of cloud IAM.

See [Cloud Kubernetes deployment and acceptance](../../../docs/cloud-kubernetes.md).

## Testing and release conditions

- Jest: authorization, token validation, cluster isolation, queue failure handling and database behavior.
- Angular / Playwright: critical login, cluster inventory and scanner presentation.
- Helm/Kind: local install and integration tests.
- EKS, AKS and GKE: independent live-cluster storage, bootstrap, identity, inventory, scan and upgrade/recovery tests.

A successful package build or local Kind run does not certify cloud-provider operation.
