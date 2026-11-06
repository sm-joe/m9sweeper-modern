# m9sweeper Modern — local MVP

**Status:** runnable *local development preview*, NOT production-ready Kubernetes security platform.
This increment includes PostgreSQL, authenticated Trivy ingestion API, Next.js read-only scan dashboard, and a Go agent that invokes Trivy against **configured container images**.
A Kubernetes service-account discovery mode is now available in the Go trawler, but the local Compose default only scans configured images and an end-to-end Kubernetes deployment has not been validated or implement the other original scanners, admission enforcement, user accounts, or full historical score equivalence.

## Local run (Windows PowerShell / Docker Desktop)

Prerequisites: Docker Desktop with Linux containers, Docker Compose v2, Git. Ports: localhost:3000.

```powershell
git clone https://github.com/sm-joe/m9sweeper-modern.git
cd m9sweeper-modern
Copy-Item .env.example .env
```

Edit `.env` to replace BOTH placeholder values with **different cryptographically random** secrets.
Example one-time generation (PowerShell 7):

```powershell
$b = [byte[]]::new(32); [System.Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToHexString($b)
```

Use a different output for each value. For `M9_SCAN_IMAGES`, supply a comma-separated list of images you are authorized to scan.

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f trawler
```

Open http://localhost:3000 to see scan history after the first successful cycle.

```powershell
docker compose logs -f backend
docker compose down
```

**Important:** the dashboard is unprotected in this MVP and listens only on loopback. Never expose via ingress or public port forwarding. Backend is accessible only on the internal Compose network and requires a bearer API key, but it currently shares the agent key for reads. Separate identities, TLS, authentication/RBAC, encryption and rate limiting are prerequisites for production.

## Managed policies (new)

Persisted cluster-scoped Trivy policies and time-limited CVE exceptions are available
through the authenticated admin API. Set a third independent random hexadecimal secret
`M9_ADMIN_API_KEY` in your local `.env` before starting the updated backend.
This is required even for local development; it is intentionally distinct from the agent key.

See [Policy API tests and Podman upgrade instructions](docs/policy-api-test.md).
The backend applies the additive `002_policy_management.sql` migration at startup.
The dashboard now includes an interactive **Policies** view: save/edit/delete policies, configure severity thresholds, create/revoke expiring CVE exceptions, register local cluster records, and evaluate persisted Trivy scans. For changes, enter your local admin API key in the dashboard; it is kept in page memory only. Admission enforcement,
identity-based RBAC, exception image-scoping and production administrator authentication are
not yet implemented.

## Development checks

```powershell
cd backend
npm install
npm run build
npm test
cd ..\trawler
go test ./...
```

`backend/src/db/migrations/001_initial.sql` runs automatically **only when the PostgreSQL data volume is initialized for the first time**. Use an explicit migration runner before schema upgrades. Do not drop volumes containing valuable data.

## API

- `GET /healthz` and `GET /readyz`: local health and readiness.
- `POST /v1/scans`: bearer-authenticated JSON array of {clusterId, scanId, image, scannedAt, report}; 8 MiB maximum.
- `GET /v1/clusters`, `GET /v1/scans`, `GET /v1/vulnerabilities?scanId=...`: bearer-authenticated read APIs.

Risk Score is intentionally NULL until the original weighted algorithm is independently verified, or a separately versioned custom model is chosen.

## Next milestones

1. Kubernetes in-cluster discovery and immutable image digest tracking.
2. Secure dashboard login and authorization, separate read/agent credentials.
3. Historical risk snapshot reconciliation and legacy parity tests.
4. Scanner workers for kube-bench, Kubesec, kube-hunter, Falco events.
5. Policy enforcement, audit trails, validated Helm deployment and CI.

Existing Helm chart in `deploy/helm/m9sweeper` is **not** validated for this local MVP and should not be deployed as-is. It targets future production images and secret wiring.
