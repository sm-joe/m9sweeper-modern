# Functional policy management UI (local preview)

Go to **http://localhost:3000/policies** after rebuilding the latest feature branch.

The page is no longer a read-only placeholder. It connects to PostgreSQL via the
backend API, using narrow server-side proxy routes that do not expose the trawler key
in browser JavaScript.

## Verify

1. Run `git pull origin feat/local-mvp-compose`.
2. Ensure `.env` has distinct `M9_AGENT_API_KEY` and `M9_ADMIN_API_KEY`
   secrets (each at least 32 characters). Do not commit `.env`.
3. Run `podman compose up -d --build backend dash`.
4. Open `http://localhost:3000/policies`.
5. Enter the admin key from your local `.env` into the password field.
   It stays only in this page's React memory and is sent over the localhost origin
   to the backend for writes; do not expose the dashboard on a public network.
6. Select the real cluster produced by your trawler. If none exists, **Register
   a cluster record** creates a DB record, but does NOT connect to Kubernetes.
7. Create a policy, set Trivy limits (0 blocks, -1 unlimited), save, and refresh.
   The policy must survive refresh, proving it was stored.
8. Select the policy, add a CVE-specific expiring exception, then remove it.
9. Select a real scan and press **Evaluate compliance**. With zero critical/high
   limits, matching findings should fail unless an applicable unexpired exception
   exists. The decision has explicit evaluated/excepted counts.
10. Edit or delete the policy and refresh to verify persistence.

The runtime has real CRUD APIs:
- `PUT /v1/clusters` (record registration only)
- `GET|PUT|DELETE /v1/policies`
- `GET|PUT|DELETE /v1/policy-exceptions`
- `POST /v1/compliance/evaluate` (evaluation only)

CI includes a PostgreSQL integration test that exercises policy CRUD, distinct
admin/agent authorization, failure on critical findings, exception-induced passing,
exception deletion, and policy deletion. The Next.js build is checked separately.

## Known limits

This is still **not** a production replacement for the original m9sweeper:
- No administrator login, multi-user sessions, tenant isolation, or role-based UI auth.
- Admin key manually entered for each browser page lifetime, never persisted.
- Dashboard binds to `127.0.0.1` only. It must not be publicly exposed.
- No image/namespace-scoped exceptions, bulk scanners, or policy admission webhook.
- A registered cluster is a local DB record, not a live Kubernetes connection.
- Scan evaluation uses stored Trivy evidence; policies do not block deployments.
