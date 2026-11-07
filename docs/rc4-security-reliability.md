# RC4 security hardening and first verification gate

**Status: development, not production-ready.** RC4 starts from RC3 commit `2fb7ce5c`, which passed source CI and whose Trivy/kube-hunter paths were tested by the operator in Kind. Do not delete existing Docker volumes or modify the working kube-hunter Secret until planned migration.

## Implemented first-pass security controls

- AuthGuard rejects missing/invalid user IDs and explicitly inactive users.
- AuthorityGuard denies missing identity, absent/malformed authority lists, and missing route authority requirements.
- Falco and kube-hunter ingestion prefer `X-API-Key` over legacy query-string keys. Credentials containing line breaks, NUL bytes or excessive length are rejected.
- `SCANNER_ALLOW_LEGACY_QUERY_KEYS=false` disables insecure `?key=` ingestion after **all clients have migrated to header authentication**. Default is legacy-compatible to preserve the working Kind kube-hunter collector.
- `GET /api/falco/apiKey` and `GET /api/kubehunter/apiKey` no longer expose API keys by default and are restricted to SUPER_ADMIN even when legacy export is explicitly enabled. For temporary migration only, `SCANNER_ALLOW_LEGACY_KEY_EXPORT=true` enables these sensitive endpoints; never enable outside a controlled maintenance window.
- External webhook cluster ID must be a strictly positive safe integer; invalid IDs are rejected before persistence.
- Falco webhook rejects malformed event bodies before persistence; once an event is saved, email-delivery errors are logged but cannot turn the webhook into a failure response, preventing a duplicate retry caused solely by notification failure.
- New unit tests cover both security guards, credential selection, export restrictions, invalid cluster IDs, webhook validation and notification failure semantics.

These are **not** a replacement for cluster-scoped RBAC, credential rotation, payload schema validation, or operational monitoring. A scanner-specific key still needs documented cluster binding and revocation.

## Pull and test on Windows PowerShell

```powershell
cd "D:\Suks Repos\m9sweeper-modern"
git fetch origin
git switch release/m9sweeper-new-rc4-security-reliability
git pull --ff-only origin release/m9sweeper-new-rc4-security-reliability

cd platform\dash\backend
npm ci --legacy-peer-deps
npx jest auth.guard.spec.ts authority.guard.spec.ts scanner-ingest-auth.spec.ts falco.controller.spec.ts falco.service.spec.ts kube-hunter.controller.spec.ts --runInBand --no-cache
npm run build:api
```

Expect all tests to pass and the NestJS build to succeed. CI runs the full original-backend suite, Java scanner, frontend, Helm and Kind checks on the RC4 branch.

## Rebuild Dash only (preserve healthy scanners and database)

```powershell
cd ..\..\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build dash
docker compose -f docker-compose.yml -f docker-compose.kind.yml ps
Invoke-WebRequest http://localhost:3000/api/health
```

Keep `SCANNER_ALLOW_LEGACY_QUERY_KEYS` **unset or true** until kube-hunter's installed URL-token collector is migrated. With a header-capable Falcosidekick/collector, the server can reject legacy keys by setting `SCANNER_ALLOW_LEGACY_QUERY_KEYS=false` and recreating Dash. Confirm header-based ingestion works **before** enforcing header-only mode.

## Verify negative authentication responses

- With no valid user credentials, requests to protected scan/report routes must be rejected.
- Invalid scanner keys, invalid cluster IDs or malformed Falco webhook bodies must fail without creating a DB row.
- Trigger an authorized Falco event and verify a new record in PostgreSQL and the Angular Falco page. A notification failure must not cause the already-saved event to be retried; a DB insertion failure must remain an error.
- Direct calls to the legacy raw-key export routes must return HTTP 410 for a SUPER_ADMIN when `SCANNER_ALLOW_LEGACY_KEY_EXPORT` is unset; less privileged users must be denied by the guard.
- Confirm the existing CoreDNS Trivy scan remains attached to the requested image ID with correct HIGH findings; confirm kube-hunter reports remain visible after Dash rebuild.
- Do **not** paste or log the key value in test output.

## Next RC4 gates (not yet closed)

1. Remove remaining query-string collectors with a tested header-capable kube-hunter reporter.
2. Add per-cluster scanner identity permissions, cross-cluster read isolation and API-key rotation/revocation.
3. Introduce idempotent scan-run IDs and automated terminal error/dead-letter queue reconciliation.
4. Demonstrate live Falco event → Falcosidekick → NestJS → PostgreSQL → Angular, including denied and failed delivery tests. See [Falco live acceptance](falco-rc3-live-acceptance.md).
5. Validate Helm install, upgrade and rollback, backup/restore, runtime alerting and modern-framework migration.

No change may be declared production-ready without live evidence and a green CI run **at the latest branch commit**.
