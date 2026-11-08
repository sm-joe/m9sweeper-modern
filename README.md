# m9sweeper — Kubernetes security operations

**Status:** RC4 integration merged to `main` (2026-11-08). Validated in an operator-managed Kind environment; **not yet a supported production distribution**. This project modernizes the original [m9sweeper](https://github.com/m9sweeper/m9sweeper) application, preserving upstream source and Apache-2.0 notices. This is not an official CIS-certified compliance product.

m9sweeper provides Kubernetes cluster and image inventory, Trivy vulnerability assessments, policy and exception workflows, authenticated security reports, Falco runtime-event ingestion, kube-hunter assessments, Kubesec and optional kube-bench/cluster checks. The Angular interface, NestJS API, PostgreSQL, RabbitMQ and Java trawler are real integrated components, not a standalone scanner demo.

## Architecture

```text
Browser --HTTPS--> Angular + NestJS Dash API ----> PostgreSQL
                            |                          (inventory, policy, findings,
                            |                           scan-run UUIDs, Falco events)
                            +--> RabbitMQ --> Java trawler --> Trivy registry scanning
                            |         |            |
                            |         +--> trawler_queue.failed (quarantined deliveries)
                            +<-- Falcosidekick <-- Falco (node runtime detection)
                            +<-- Kubernetes scanner report jobs (kube-hunter / kube-bench)
                            +--> Kubernetes API (discovery, policies)
```

**Supported deployment intent:** Linux hosts and Linux-node Kubernetes clusters. Development instructions below use **Linux shell commands only**. Docker Compose is a single-host development/integration option; Kubernetes Helm manifests are supplied, but the umbrella chart still requires production lifecycle and security validation. The project does **not** claim Windows hosts, WSL2, every Kubernetes version, or all Kubernetes managed-control-plane variants as supported production targets.

## Requirements

- Linux x86_64 host with Docker Engine, Docker Compose v2 plugin, Git, Bash, OpenSSL and curl for local development.
- Access to container registries for Dash, Trivy, RabbitMQ, PostgreSQL and Kubesec images; internet/registry proxy as appropriate.
- For Kubernetes integration: Linux-node Kubernetes cluster, `kubectl`, Helm 3, admin-approved least-privilege Kubernetes credentials, cluster networking allowing scanner Pods to reach Dash, and appropriate runtime sensor capabilities for Falco.
- For production: dedicated PostgreSQL and RabbitMQ backups, TLS termination, trusted CA, managed Secrets, restricted network access, persistence, observability and disaster-recovery process.

## Install on Linux — Docker Compose development environment

This setup builds the source locally. The service ports are bound to **127.0.0.1**, not exposed directly to the public network. Use a TLS reverse proxy with trusted certificates before any remote user access.

```bash
git clone https://github.com/sm-joe/m9sweeper-modern.git
cd m9sweeper-modern
git switch main
cd platform/docker-compose

umask 077
cp .env.sample .env
chmod 600 .env
${EDITOR:-vi} .env
```

Provide **unique, nonempty values** for `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `TRAWLER_API_KEY`, `FALCO_API_KEY`, `KUBE_HUNTER_API_KEY`, `KUBE_BENCH_API_KEY`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`, `DATABASE_PASSWORD`, and `SECURITY_JWT_SECRET`. Generate high-entropy values using `openssl rand -hex 32`; store them in an approved secret manager for a real deployment. Never commit `.env`, print keys to CI logs, or reuse development credentials.

Configure `SERVER_BASE_URL` for the **browser-facing HTTPS origin** and `SCANNER_REPORT_INGESTION_URL` for the **Kubernetes-Pod-reachable** Dash API origin. These must be accessible from their respective networks; Kubernetes Pods must **not** call their own `localhost` as the report endpoint.

Start the integration stack:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

After Dash and its dependencies are healthy, confirm the one-time initialization/migration job completed:

```bash
docker compose logs --tail=100 dash-init
docker compose logs --tail=100 dash trawler
```

Open `http://127.0.0.1:3000` from the **same Linux development host**, log in with the configured initial administrator and rotate bootstrap credentials according to your security policy. If the init job fails, inspect logs and fix configuration before scanning. Do **not** delete volumes to resolve initialization errors.

**Existing database upgrades:** make and verify a PostgreSQL backup **before** replacing containers or running migrations. To snapshot the running development database without copying credentials to command output:

```bash
mkdir -p private-backups && chmod 700 private-backups
docker exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "private-backups/m9sweeper-$(date -u +%Y%m%dT%H%M%SZ).dump"
chmod 600 private-backups/*.dump
```

Restore only in a **separate test database**, validate counts and schema there, then run migrations using the supplied init job. Never run `docker compose down -v` against a deployment with findings or user data; never purge `trawler_queue.failed` to hide failed scans.

## Connect a Linux Kubernetes cluster

1. Register your target cluster in Dash using a trusted cluster CA and an appropriately restricted Kubernetes identity. **Do not** use `insecure-skip-tls-verify` or broad cluster-admin service-account tokens for production.
2. Ensure `SCANNER_REPORT_INGESTION_URL` is reachable **from Kubernetes Pods**; use private DNS/routing and HTTPS with a trusted CA outside isolated labs.
3. Configure policy/scanner mappings in Dash. At least one enabled Trivy scanner policy must apply to an image before a scan request can be queued; otherwise the API refuses to publish it.
4. Scan a single known image and verify its fresh UUID reaches `completed`, the image is no longer queued, findings persist to PostgreSQL, and the Angular result view shows the same assessment.
5. Deploy Falco with a **current supported chart using modern eBPF** where kernel features/permissions support it; provide Falcosidekick's webhook and `X-API-Key` header via a Kubernetes Secret. Confirm a real kernel event reaches both `project_falco_logs` and the Angular cluster view. See [Falco live procedure](docs/falco-rc3-live-acceptance.md).
6. For kube-hunter and kube-bench, supply Secret-backed scanner callback credentials, validate URL reachability from Pods and confirm persisted results rather than relying only on Job success.

### Scoped access and scanner credentials

RC4 stores explicit grants in `cluster_user_access`. The super-admin-only API supports:

- `GET /api/clusters/access/{clusterId}/users`
- `POST /api/clusters/access/{clusterId}/users/{userId}` with `{"canWrite":true}` or `{"canWrite":false}`
- `DELETE /api/clusters/access/{clusterId}/users/{userId}`

Only after assigning each active **trawler, Falco and kube-hunter** service identity an appropriate write grant for the target cluster, set `SCANNER_REQUIRE_CLUSTER_BINDINGS=true` and recreate Dash. Confirm authorized scanner ingestion still succeeds and cross-cluster requests fail. The default `false` is for legacy migration, **not** a recommended production setting.

`SCANNER_ALLOW_LEGACY_QUERY_KEYS` is compatibility-only. Set it to `false` **after** migrating all scanner senders to `X-API-Key` and testing report ingestion. `SCANNER_ALLOW_LEGACY_KEY_EXPORT` should remain `false`. Rotate any keys previously exposed in browser URLs, logs or chart values.

### Helm on Kubernetes (experimental packaging)

The source contains umbrella and component charts in `platform/manifests/charts/`. They are **not a hardened turn-key production installer**. Inspect the actual chart values, image availability, persistence, webhook TLS and security contexts before applying:

```bash
helm dependency update platform/manifests/charts/m9sweeper
helm lint platform/manifests/charts/m9sweeper --set-string global.jwtSecret="$(openssl rand -hex 32)" --set-string global.apiKey="$(openssl rand -hex 32)" --set-string dash.init.superAdminEmail="test@example.invalid" --set-string dash.init.superAdminPassword="$(openssl rand -hex 32)"
helm template m9sweeper platform/manifests/charts/m9sweeper --namespace m9sweeper-system --values /path/to/private/values.yaml > /tmp/m9sweeper-rendered.yaml
```

**Do not apply** rendered production manifests or use `--set` with real credentials until the chart's Secret handling, actual images, migration ordering, TLS and lifecycle are audited. Rendering to a file can expose credentials: protect and remove temporary manifest files. Use tested cluster-specific values and a staging install/upgrade/rollback before production rollout.

## Diagnostics on Linux

```bash
cd platform/docker-compose
docker compose ps
docker compose logs --since=15m --tail=100 dash trawler
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,image_id,status,failure_reason FROM image_scan_runs ORDER BY created_at DESC LIMIT 10;"'
```

A successful scan can be `Non-compliant` if actual vulnerabilities violate a policy. A `failed` scan is a **processing failure**, never an automatic compliance pass. Failed broker deliveries are retained in `trawler_queue.failed` after bounded retries; investigate root cause and use a new, authorized rescan. The existing implementation does **not** provide automatic safe DLQ replay.

See [RC4 integration acceptance](docs/rc4-final-acceptance.md), [security/release gates](docs/m9sweeper-new-release-gates.md), and [Linux/Kubernetes hardening backlog](docs/linux-k8s-release-readiness.md).

## Verified results and limitations

Operator-tested RC4 (November 2026): one real Trivy/Java trawler/RabbitMQ/Dash/PostgreSQL/Angular scan completed with a UUID, no duplicate policy result, and noncompliant findings; a Falco kernel event reached PostgreSQL and Angular. The operator reported successful cross-cluster RBAC, dead-letter recovery and release acceptance; detailed staged evidence for those additional claims must be retained with release records.

The full platform CI passed on integration commit `b97df4f0`, and PR #9 promoted the changes into `main` via merge commit `9b77f9d`. CI checks source, Node/Angular/Java builds, selected scanner integrations, Helm render and Kind inventory; this is **not equivalent to** production multi-cluster deployment certification.

**Still requires product hardening:** full route-by-route tenant authorization, scanner key retirement and lifecycle, operator-visible DLQ alerts/replay, resilient Kubernetes Helm lifecycle, production disaster recovery, admission-webhook outage/TLS behavior, supported Angular/NestJS migration, browser accessibility/E2E, scanner version/benchmark validation, signed release artifacts and dependency/license review. Do not present provisional benchmark coverage as a CIS compliance score.

## Licensing and attribution

Based on the original m9sweeper source at revision `2bc394b5db0d00e3a5784d388ba26be6451ff9c0`. Retain [Apache License 2.0](platform/LICENSE), source notices and [attribution](ATTRIBUTION.md). Third-party license and trademark clearance is required before public distribution under new branding. The modernization does not imply upstream endorsement.
