# Architectural boundaries

- dash: Next.js React application, talks only to backend HTTPS API.
- backend: Node.js TypeScript API, ownership/authentication, policy decisions, audit and persistent queue. `legacy-salvage/` is pure domain logic with no NestJS/Knex imports.
- trawler: Go Kubernetes API watch/list agent, asynchronous scan execution through isolated Jobs/approved binaries, resumable upload with deduplication.
- PostgreSQL: immutable individual scan runs plus daily point-in-time cluster snapshots. Store original JSONB evidence; historical trend must use same algorithm version, population definition and coverage.
- Falco: preferred supported Falco output forwarder + authenticated ingestion, not a custom privileged syscall agent.
- Kube-bench: OS/provider-specific privileged runner, disabled by default. EKS managed control plane must be marked not-assessed, not passed.
- Kubesec: evaluates rendered workloads, report linked to manifest digest.
- Kube-hunter: explicit operator opt-in and scoped authorization only; never launch automatically.
- Policy: VAP for CEL-expressible object invariants, TLS-backed webhook for external scan lookups. Fail closed only after complete policy cache/readiness checks.

## Legacy source mapping (verified upstream main tree 2bc394b5db0d00e3a5784d388ba26be6451ff9c0)
- `trawler/src/main/java/io/m9sweeper/trawler/scanners/Trivy.java` -> `backend/src/processors/trivy-processor.ts` (vulnerability fields, severity and fixability semantics).
- `dash/backend/src/modules/image/dao/image.dao.ts` -> `backend/src/db/*` (historical counts grouped by saved_date).
- `dash/backend/src/modules/policy/services/image-compliance-service.ts` -> `backend/src/legacy-salvage/policy-thresholds.ts` (fixable/unfixable severity thresholds, -1 unbounded; separately test production behavior).
- `dash/backend/src/modules/cluster-validation/services/cluster-validation.service.ts` -> future `backend/src/admission/` (scan freshness, image exceptions and pod compliance).

**Risk formula provenance:** inspected source confirms raw severity aggregation and date-grouped history; it does NOT establish a canonical weighted CVE risk formula. `weightedRisk()` requires explicit, versioned weights. `null` means not verified; never backfill with guessed weights. Source archaeology and golden-fixture approval are required before using `legacy-verified-vN`.

**Security caveat:** upstream policies contain inconsistent comparisons and image scoping; clean port deliberately uses count > limit to enforce "at most N". Treat behavior changes as migrations, with regression fixtures and security sign-off.
