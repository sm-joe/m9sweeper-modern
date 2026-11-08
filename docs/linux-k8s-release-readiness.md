# Linux and Kubernetes release readiness — post-RC4 hardening

**Baseline:** RC4 was merged into `main` via PR #9 (`9b77f9d`). Integration development was carried out against Kind and an operator-managed Docker deployment; production Linux/Kubernetes support is a **target**, not a certification. Do not use WSL2, desktop container runtime assumptions or PowerShell commands as public product installation requirements.

## Verified versus reported versus missing

| Area | Current evidence | Release decision |
| --- | --- | --- |
| Trivy RabbitMQ → trawler → Dash → PostgreSQL → Angular | Operator-provided UUID `2a00ae7c-3d55-4667-9d0e-9a7607b176f8`; completed, 1 policy report, Non-compliant; queues drained | Verified for that Kind configuration |
| Falco runtime detection → Sidekick → Dash → PostgreSQL → Angular | Operator provided real `Read sensitive file untrusted` event; cluster 1 rows and Angular display | Verified for that Kind configuration |
| Per-cluster grants, RBAC denials, DLQ recovery, Helm lifecycle | Operator reported tests passing; explicit grant rows known | Operator-reported; retain HTTP status audit, staged queue evidence, exact Helm rollout/rollback proof |
| Supported Linux/K8s production lifecycle | Multiple distributions/kernels, backup restore drill, operator runbooks, resource quotas/HA and upgrades not fully attested | Not generally approved |
| Signed distribution, SBOM, support policy | Release workflow/artifact provenance not yet certified | Not publicly released |

## Operational environment

- Linux x86_64 with maintained Docker Engine and Compose v2 for integration; Linux nodes for Kubernetes. Validate the actual kernel/eBPF support for Falco before deployment.
- Restrict network exposure: Dash only through authenticated HTTPS ingress; PostgreSQL/RabbitMQ private; scanner Pod callbacks through internal DNS and trusted TLS.
- Supply a pre-existing Secrets management mechanism, persistent database and broker volumes and off-host encrypted backups. Keep API keys out of shell history, URLs, charts and CI logs.
- Use image digests and a supported-version matrix for Kubernetes, PostgreSQL, RabbitMQ, Java, Trivy, Angular, NestJS, Falco and kube-hunter before public production endorsement.

## Mandatory test matrix before public production promotion

### A. Tenant security and scanner identity

- Enumerate every image, policy, exception, kube-hunter, kube-bench, Falco, dashboard, history, user and export endpoint; associate each with resource ownership and a global authority check. In particular, reject a scoped URL containing an image/event from another cluster even when the URL's cluster ID is authorized.
- Exercise two independent clusters with SUPER_ADMIN, ADMIN, READ_ONLY, ungranted user and each scanner identity: authorized 2xx responses, unauthorized 401/403, no cross-tenant data mutations or aggregate leaks.
- Enable `SCANNER_REQUIRE_CLUSTER_BINDINGS=true` only after granting scanner service accounts explicitly for the required clusters; verify valid trawler, Falco and kube-hunter ingest and denied cross-cluster sends.
- Migrate all kube-bench/kube-hunter and other scanner clients to header/short-lived credentials; after verification set `SCANNER_ALLOW_LEGACY_QUERY_KEYS=false`, keep `SCANNER_ALLOW_LEGACY_KEY_EXPORT=false`, rotate old keys. For production use workload identity or expiring scoped credentials rather than long-lived keys.

### B. Reliability and DLQ operations

- Control a registry failure in **isolated staging**: observe at most three retries, durable quarantined message, atomic failure status, cleared spinner and no fabricated compliance pass.
- Once the underlying fault is fixed, create a new authorized scan UUID; verify success without rewriting the historical failed record. Never silently auto-replay messages; replay is **not** implemented as an automatic feature.
- Instrument queue depth, age, retries, consumption gap, failed scan reconciliation, SMTP/email and Falcosidekick delivery errors, and alert on sustained lag or failure. Document incident ownership and retry safety.
- Record PostgreSQL restore to separate test DB, retention/immutability, RabbitMQ durability/recovery and backup integrity; never use `docker compose down -v` or queue purge as a recovery mechanism.

### C. Linux/Kubernetes lifecycle and dependencies

- For each supported Kubernetes version, run Helm installation, migration, rolling upgrade, failure rollback and uninstall **with explicit PVC retention policies**. Test DB schema rollback separately (Helm rollback does not reverse DB migrations).
- Test TLS issuance/rotation, admission-webhook failurePolicy and API outage, least privilege of SA/RBAC, resource limits and node scheduling. Check all charts for obsolete PodSecurityPolicy and historical APIs.
- Upgrade Angular, Material, NestJS and dependency toolchains with a lockfile-controlled migration; run full browser E2E, keyboard/accessibility and API compatibility tests. Do not mass-upgrade without this validation.
- Review kube-bench/CIS benchmark revision compatibility, kube-hunter maintenance risk, dependency CVEs, license/trademark notices and make no claims of official CIS certification.

### D. Artifact and release integrity

- CI must run on `main` and release branches at the exact SHA. Generate deterministic source archive, SHA256 checksums, dependency SBOM and attestations/signatures using approved signing identity. Verify signatures on an independent Linux host.
- Produce clean deployment guides, configuration reference, migration/rollback, incident response, known limitations and support matrix.
- Before public release, attach the operator acceptance logs (redacted), release checks, Helm lifecycle proofs and backup restore drill to the release record. In the absence of those artifacts the release remains a **developer/integration candidate**.

## Linux operator read-only acceptance

From repository root on a Linux integration host with access to the named Compose containers:

```bash
bash scripts/verify-linux-rc5.sh
CLUSTER_ID=1 IMAGE_ID=3 REQUIRE_FALCO_EVENT=true bash scripts/verify-linux-rc5.sh
```

This checks the schema, latest scan status and policy uniqueness, queue counters and Falco persistence. It is read-only and **does not** validate a browser, authenticate negative RBAC requests, deliver a real Falco kernel event or exercise Helm rollback.

## Release decision

The codebase is valuable and integration-tested, but no universal production-ready assertion should be made from a single Kind environment. Close each mandatory test with exact source SHA, Kubernetes version, kernel, Helm chart version, image digests, redacted results and operator approval. Keep remaining items visible rather than marking source-only checks complete.
