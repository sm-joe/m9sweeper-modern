# Legacy behavior mapping — source-to-target

Upstream reference: https://github.com/m9sweeper/m9sweeper (main branch, inspected 2026-11-06).
This is a code migration, not a rebranding exercise.

| Legacy behavior | Upstream source | Modern implementation |
|---|---|---|
| Per-severity fixable/unfixable limits | `dash/backend/src/modules/policy/services/image-compliance-service.ts` | `backend/src/legacy-salvage/image-compliance.ts` |
| Default critical/high zero; medium/low unrestricted | `dash/backend/src/modules/policy/services/policy-compliance-checker-service.ts` | Existing `policy-thresholds.ts` and legacy settings adapter |
| Exceptions by scanner and CVE | `image-compliance-service.ts` | `assessImageCompliance` |
| Enforcement checks required scanners | `image-compliance-service.ts` | `assessImageCompliance` |
| Admission denies unknown images | `dash/backend/src/modules/cluster-validation/services/cluster-validation.service.ts` | `assessPodImages` (pure decision, NOT yet an admission webhook) |
| Historical severity counts | `dash/backend/src/modules/image/dao/image.dao.ts` | Existing scan persistence; historical score formula unverified |

## Intentional differences and limitations

- Upstream has inconsistent boundary checks (`>=` for reason messages versus `<=` for pass/fail), an unsafe treatment of negative limits in some paths, and scanner grouping defects. This port uses a single unambiguous `count > limit` breach condition while preserving `-1` as unlimited.
- Scanner/CVE matching is explicit. Exception TTL, image patterns, policy-specific scope, namespace scope, and grace periods are **not implemented**.
- The pure admission decision cannot enforce Kubernetes admission without a production webhook, authenticated caller, fresh digest-matched scan data and TLS certificates.
- No historical risk-score weights have been verified. Scores remain withheld.
- Do not enable enforcement from this module alone.

## Next source migration

Port full `exceptions`, `policies`, `pod`, and `cluster` services including persistence and authorization, then integration-test their original fixtures before wiring them to webhook admission.
