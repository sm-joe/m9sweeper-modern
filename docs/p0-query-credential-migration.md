# P0 scanner credential retirement — migration and verification

**Status: staged security change, not yet production approved.** This branch disables query-string scanner credentials by default. Do not deploy it to an existing kube-hunter installation until every sender supports header authentication. RC4 Kind acceptance does not prove that a historic kube-hunter URL-token reporter will keep functioning.

## Server behavior

- `X-API-Key` is the supported scanner ingestion credential transport.
- `SCANNER_ALLOW_LEGACY_QUERY_KEYS` is **false by default**. Only the exact value `true` enables the deprecated query-key path.
- A supplied but invalid `X-API-Key` does not fall back to `?key=` even during compatibility mode.
- `SCANNER_ALLOW_LEGACY_KEY_EXPORT` must remain false; rotate every key previously exposed through query strings, browser history, proxy access logs, Helm values, or dashboards.
- `SCANNER_REQUIRE_CLUSTER_BINDINGS=true` is required for strict per-cluster scanner authorization after each scanner account receives its explicit grant.

## Mandatory migration sequence

1. Inventory all report callbacks: Falcosidekick, kube-hunter, kube-bench and any custom scanners. Search their actual running Pod specs, Secrets and configs for query-string credentials **without printing Secret values**.
2. Configure each sender to transmit `X-API-Key` over a trusted HTTPS endpoint. The existing kube-hunter 0.6.8 HTTP dispatcher is **not yet proven header-capable**; use a tested trusted reporting adapter or replace its reporter before disabling compatibility.
3. Deploy and test the new sender in a staging namespace against the existing Dash. Confirm one valid report persisted, an absent or invalid header returned 401, and a credential belonging to another cluster was denied.
4. Disable `SCANNER_ALLOW_LEGACY_QUERY_KEYS`, keep `SCANNER_ALLOW_LEGACY_KEY_EXPORT=false`, and enable cluster bindings once all expected grants exist.
5. Rotate previously URL-exposed credentials, invalidate retired credentials, and verify reporter failures alert without data loss.
6. Roll back to temporary legacy compatibility **only** as a time-boxed emergency migration measure; log approval and re-rotation. Never silently re-enable query credentials.

## Acceptance evidence

Capture commit SHA, deployed image digest, Kubernetes version, chart version, redacted HTTP status tests, scan report ID, persisted DB row, scanner Pod logs with secrets redacted, and a negative cross-cluster test. No report credentials should appear in URLs or logs. An authenticated GET to a report must not be interpreted as proof that the reporter authenticated securely.

## Remaining P0 work

- Inventory every backend endpoint and verify resource-level ownership, including IDs in path/query/body, nested references, aggregates and exports.
- Replace the existing kube-hunter URL dispatcher with a verified header-auth reporter, then remove the remaining server compatibility mode and query parameters.
- Perform a real Linux Kubernetes Helm install, upgrade, failed rollout/rollback and PostgreSQL restore drill. Helm lint/template alone cannot close this gate.
