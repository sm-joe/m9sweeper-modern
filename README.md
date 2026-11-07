# m9sweeper-new — product modernization (development)

> **Status: not released.** This repository is the source for a future standalone product, not a production-certified fork and not a simple rename of the original m9sweeper.

The complete original m9sweeper platform is preserved in `platform/` as a migration baseline; the legacy experimental implementation is in `archive/experimental-preview/`. The new product is being developed on `product/m9sweeper-new-foundation`, while `revamp/original-platform` retains the source-restoration baseline.

## What is actually different

- Real Angular login/navigation and cluster dashboard refinements (not yet a framework migration)
- Fixed NestJS policy decisions, fail-closed admission logic and more actionable cluster onboarding errors
- Improved startup/seed consistency, PostgreSQL and RabbitMQ integration
- Java trawler JVM packaging with pinned Trivy and real scanner acceptance checks
- Separate browser-facing URL (`SERVER_BASE_URL`) from **Kubernetes-Pod-reachable** callback URL (`SCANNER_REPORT_INGESTION_URL`), with fail-closed UI generation when it is absent
- Real CI for builds, integration smoke, Kind inventory, kube-bench, Kubesec, Trivy, Helm template checks

**Not yet delivered:** current-generation Angular architecture, broader NestJS dependency upgrade, end-to-end scanner persistence for every scanner, authenticated scanner callbacks without URL query keys, production Helm lifecycle, OIDC/RBAC assurance, benchmark compatibility verification, and comprehensive database backup/restore. Do not merge or publish as production-ready until acceptance gates pass.

## Local development

Use `platform/docker-compose/.env.sample` as a starting point and supply strong unique secrets. Build and run the actual original platform with Docker Compose from `platform/docker-compose/`.

Set `SERVER_BASE_URL=http://localhost:3000` only for browser access. When generating kube-bench jobs, configure `SCANNER_REPORT_INGESTION_URL` as an **address reachable from the scanner Pod**, such as a private in-cluster service URL for a Kubernetes deployment. Do not use `localhost` or assume Docker Compose service DNS is reachable from Kind. Enable authenticated TLS for a public or cross-network deployment.

See [product scope and release gates](docs/m9sweeper-new-release-gates.md) and [existing acceptance ledger](docs/integration-acceptance.md).

## Licensing and independence

This is a fork-based modernization and retains the original upstream source, license and attribution. Product naming, trademark review, separate distribution, scanner licensing and public release process remain open. Independent branding does not remove upstream attribution obligations.

---
## Earlier repository README (preserved below)

# m9sweeper Modern — Source-first Kubernetes security platform revamp

This repository is modernizing the **actual [m9sweeper](https://github.com/m9sweeper/m9sweeper) product**, not building a substitute scan-results demo.

**Canonical application source:** [`platform/`](platform/). Original commit pinned to `2bc394b5db0d00e3a5784d388ba26be6451ff9c0`. The complete upstream code and its Apache 2.0 licensing/attribution are retained.

## Product capabilities retained in source

- Authenticated Angular dashboard, SSO/local/LDAP login and user/role administration
- Kubernetes cluster/group onboarding, workloads, Pods, namespaces and image inventory
- Trivy vulnerability scanning through the Java trawler and asynchronous RabbitMQ worker
- Policies, scanner thresholds, namespace/cluster exceptions, admission webhook logic
- kube-bench CIS assessments, kube-hunter tests, Kubesec deployment security
- Falco security events, OPA Gatekeeper policy management
- Historical reports, risk comparisons, audits, database migrations, Helm deployment and cron schedules

These are the original application's real code paths. Their availability in source is **not** a claim that every integration has passed a 2026 Kubernetes deployment test.

## Implemented modernization on this branch

- Responsive actual Angular login and navigation, dashboard visual system, cluster group display.
- Fixed real menu callback assignment bug, empty cluster-group first-run handling, and original policy-compliance severity limit interpretation. Added regression tests.
- Corrected umbrella Helm dependencies to local original subcharts, required strong installation credentials, and updated admission API fields. Webhook remains opt-in.
- CI builds the **original Angular and NestJS projects**, exercises original Jest policy regressions, renders/lints Helm charts, verifies feature parity, and checks the Java trawler.

The earlier small prototype is archived in [`archive/experimental-preview/`](archive/experimental-preview/). It is not the deployment or application baseline.

## Architecture

```text
platform/
  dash/
    frontend/      Angular 17 application and real security workflows (upgrading)
    backend/       NestJS API, authentication, scheduling, persistence (upgrading)
  trawler/         Java 17 RabbitMQ/Trivy scanning agent (upgrading)
  manifests/charts/
    m9sweeper/     Umbrella Helm chart
    dash/          API + UI and Kubesec service
    trawler/       Worker deployment
    kube-bench/    CIS jobs
    kube-hunter/   Penetration testing jobs
    postgres/      Database
    rabbitmq/      Queue
  docker-compose/ Historical local integration environment
```

## Developer builds

Node.js 20, Java 17, Maven and Helm 3 are the build baseline while dependencies are being migrated.

```bash
# Original NestJS backend and policy suite
cd platform/dash/backend
npm ci --legacy-peer-deps
npm run build:api
npm test -- --runInBand

# Existing Angular UI uses some backend DTO imports; install backend packages first.
cd ../frontend
npm ci --legacy-peer-deps
npm run build:prod

# Original scanning agent
cd ../../trawler
mvn -B test

# Helm package validation
cd ../manifests/charts
helm dependency update m9sweeper
```

## Deployment status

**No production release has been approved.** Scanner images and the historical stack still require a full security and compatibility update and a cluster E2E acceptance run. Never expose the prior prototype, and do not deploy using the upstream README's example credentials. The Helm chart now rejects missing or weak admin/API secrets.

See [source and migration roadmap](docs/source-first-modernization.md), [actual implementation status](docs/actual-product-progress.md), and [PR #2](https://github.com/sm-joe/m9sweeper-modern/pull/2).

Licensed under Apache 2.0, subject to the original project notices in [`platform/LICENSE`](platform/LICENSE).
