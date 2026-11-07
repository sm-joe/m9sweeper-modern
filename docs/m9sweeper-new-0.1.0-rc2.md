# m9sweeper-new v0.1.0-rc2 — security hardening / integration preview

This candidate extends RC1 and preserves all original m9sweeper Apache-2.0
notices and licensing attribution.

## Delta from RC1

1. Kubernetes API client refuses kubeconfigs configured with disabled TLS
   verification, refuses configs without a trusted CA, and embeds readable CA
   data when the originating file is available inside the backend container.
2. Initial service-account creation fails when the token Secret has not yet
   received a token, rather than persisting an unusable credential.
3. Token-only service-account onboarding now explicitly requires CA data in the
   UI/API; manually provided service-account kubeconfigs are also validated.
4. Legacy cluster-seeding credentials are no longer logged to stdout.
5. Optional `docker-compose.kind.yml` persists Kind network membership across
   container replacement; local dynamic IP addressing remains a limitation.

## Acceptance gates

- Angular and backend builds; Kubernetes TLS regression tests; Kind inventory;
  Helm templates; real Trivy/Kubesec standalone scans; Compose + database
  runtime, admin login; container build; JVM trawler build.
- CI package published only when every one of the above passes. Check the
  full workflow conclusion and artifact SHA256SUMS.
- No claim of completed Trivy queue→DB→UI, Falco/hunter ingestion or end-to-end
  TLS admission-webhook and Helm lifecycle acceptance.

## Local integration steps

1. Confirm the original RC1 has been backed up and local credentials stay in
   a noncommitted `.env`. No database volume deletion or destructive reset.
2. Run the Docker Compose stack using the local Kind overlay
   `docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build`.
3. Verify the dashboard is attached to both Docker Compose and `kind` networks.
4. Set `SCANNER_REPORT_INGESTION_URL` to a Pod-reachable endpoint and verify
   `/api/health` from a Kubernetes Pod. Do not assume browser localhost.
5. Test existing registered clusters, service-account wizard, kube-bench
   Secret-backed JSON ingestion, and regenerated PDF under a clean test tenant.

## Publication block

**Developer RC only; not production-ready.** Original upstream attribution
is retained at `platform/LICENSE` and `ATTRIBUTION.md`. Until complete scanner
workflow, security threat model, framework modernization, Helm lifecycle,
database restore and benchmark-version checks pass, do not market as a fully
modernized or certified security product.

## Additional Trivy data correctness fixes

- Corrected actual severity comparison (JSON value versus `IssueSeverity` enum) that previously caused HIGH and CRITICAL findings to be incorrectly marked compliant.
- Unknown vulnerability severity is retained for review rather than silently dropped, and missing JSON scan reports fail closed.
- Debug logging no longer prints shell commands potentially containing registry passwords or cloud access tokens.
- JUnit 5 scanner parsing regression tests exercise the real Java parser on representative Trivy JSON, including HIGH/CRITICAL/LOW, missing severity, and empty digests.
