# Product modernization status — real upstream application

This work deliberately uses `platform/` (the entire original m9sweeper repository,
pinned to 2bc394b5db0d00e3a5784d388ba26be6451ff9c0), not the small standalone
Trivy prototype in the repository root.

## Implemented in the original Angular application

- Responsive authenticated top navigation using existing Angular router links:
  Overview, Policies, Exceptions, Users (admin only). These links lead to original
  real backend-integrated forms rather than blank placeholder pages.
- Reworked header styling, shell layout, dashboard introduction and live cluster-group
  count from the existing `ClusterGroupService`.
- Reused the original Add Cluster wizard (it opens real underlying onboarding forms).
- Corrected a real menu callback bug: `find(element => element.name = input)`
  was assignment, now strict comparison and guard.
- Fixed empty cluster-group first-run handling instead of dereferencing `groups[0]`.
- Explicit opt-in validating webhook remains disabled by default; the configured
  failure policy defaults to `Fail` when enabled, with outage behavior documented.

## Retained actual product implementation

Original user/login administration, full cluster onboarding, Kubernetes data collection,
image inventory, Trivy scanning orchestrated by Java trawler, kube-bench, kube-hunter,
Kubesec, Falco ingestion, Gatekeeper, policies, exceptions, historical reports,
migrations and umbrella Helm charts are included as source. This is *not* a claim
that they work on current supported Kubernetes without further compatibility testing.

## Validation

The `Full m9sweeper platform source validation` workflow now compiles both original
Angular and NestJS projects and checks product route/source integrity. Java/maven,
Helm installation, Kubernetes real scanner E2E, and runtime UI have not yet been verified.

## Remaining work before declaring a revamped production release

- Upgrade Angular 17 + Angular Material and incompatible vendor packages in a managed
  migration; update NestJS, dependencies, auth/session management.
- Establish current compatible Java trawler and scanner images.
- Validate all scanner installations and reports against a real target cluster.
- Migrate database while preserving original data model and history.
- Migrate/deprecate unsupported Helm/Kubernetes APIs; install/upgrade tests.
- Implement regression tests for authentication, RBAC, policy/exception scopes,
  admission, reports and cluster discovery.
- Replace original insecure sample credentials with required secrets in deployment.
- Review and enforce namespace-specific security boundaries for API keys and scanners.

**Until these pass, the revamp branch is work in progress, not an installable
production release.**
