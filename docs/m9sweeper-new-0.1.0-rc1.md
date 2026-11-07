# m9sweeper-new v0.1.0-rc1 — developer preview

## What this RC means
This is a **source release candidate for integration testing**, not a production
security product and not a claim that the four modernization tracks are complete.
It is built only when the existing CI tests pass; the archive contains the entire
real source code, tests, documentation, original license and attribution.

## Changes available
- Docker Compose + Kubernetes scanner report endpoint boundary
- Standalone Angular Signals scanner readiness panel; existing Angular routes retained
- Hardened kube-bench credential checks with optional X-API-Key header
- Scoped kube-bench report counts and latest-result queries by cluster
- Unit, runtime, real Kind kube-bench, Kubesec, and Trivy validation
- Explicit product identification and upstream attribution

## Known release blockers
1. Full Angular framework and state architecture migration and UI accessibility E2E.
2. Supported backend upgrade and complete OIDC/RBAC, multi-tenant isolation assurance.
3. Trivy RabbitMQ-to-PostgreSQL-to-UI, Falco and kube-hunter full live scan acceptance.
4. Replace query-parameter scanner secrets with Kubernetes Secret-backed headers.
5. TLS CA verification for onboarded service-account credentials.
6. Full Helm deployment/rollback, actual webhook TLS, and database backup/restore.
7. Validate benchmark mappings for currently supported Kubernetes; legacy CIS labels
   must not be presented as official certification.
8. SBOM, image signatures, vulnerability review, scanner licenses and release security audit.

## Validation instructions
After downloading the workflow source artifact, verify `SHA256SUMS` before
extracting. Start the real stack from `platform/docker-compose/` with unique
credentials in a noncommitted `.env`. For local Kind, configure
`SCANNER_REPORT_INGESTION_URL` to a Pod-reachable address; never `localhost`.
Do not expose this development deployment to untrusted networks.

## Publication status
NOT APPROVED for stable or production release. Do not merge or publish as a
production-certified security platform until the blockers above have evidence.
