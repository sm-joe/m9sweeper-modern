# Install m9sweeper-modern v0.1.0-beta.1 on Linux Kubernetes

[← Project README](../README.md) · [Public release assets](https://github.com/sm-joe/m9sweeper-modern/releases/tag/v0.1.0-beta.1) · [Release notes](mvp-beta-release-notes.md)

**Status: public beta published.** The release's signed Helm package was independently accepted on native Linux Kubernetes 1.35 with PostgreSQL 17, RabbitMQ 4.4, Dash login, real Trivy scanning and Helm upgrade/rollback. This guide is for an **isolated staging cluster**. It is not a production HA or disaster-recovery guarantee.

> **Important beta.1 installer advisory:** The published `install-mvp-staging-linux.sh` asset was signed before a source-only correction to the Helm initial-install sequence. It still uses `--wait`, which can stall Dash's post-install initialization hook. **Do not execute that downloaded beta.1 helper.** Verify and install the **signed Helm chart directly without `--wait`**, then verify rollouts. Do not modify or replace the immutable signed assets in place.

## Prerequisites

On a **native Linux** operator workstation install `kubectl`, Helm 3, Python 3, `gh` (GitHub CLI for download), `cosign`, `sha256sum`, Bash and OpenSSL.

Have access to:

- A disposable, approved Kubernetes **v1.35** cluster with Linux nodes. The signed chart declares v1.35–v1.37 compatibility; independent beta.1 downloaded-chart acceptance was on v1.35.
- An existing **PostgreSQL 17** database and **RabbitMQ 4.4** broker reachable from Pods. The beta **does not deploy** these dependencies and must not enable the legacy bundled charts.
- Secure storage for credentials; a dedicated namespace; an appropriate kubeconfig with CA verification; and public registry access for the signed images.
- A private network connection from Dash to DB/broker, and from scanner workers to Dash. Production-like remote browser access requires a trusted HTTPS ingress.

## 1. Download and verify the release

```bash
mkdir -p "$HOME/m9sweeper-beta"
cd "$HOME/m9sweeper-beta"
gh release download v0.1.0-beta.1 \
  --repo sm-joe/m9sweeper-modern --dir . --clobber
sha256sum -c SHA256SUMS

identity='https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main'
issuer='https://token.actions.githubusercontent.com'
cosign verify-blob --bundle chart.sigstore.json \
  --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" \
  m9sweeper-0.1.0-rc9.tgz

for name in dash trawler; do
  image="$(sed -n "s/^$name=//p" IMAGE-DIGESTS.txt)"
  test -n "$image"
  cosign verify --certificate-identity "$identity" \
    --certificate-oidc-issuer "$issuer" "$image" >/dev/null
done
```

The published beta tag is `v0.1.0-beta.1` and its attached signed chart file is `m9sweeper-0.1.0-rc9.tgz`. These exact names matter. If signature or checksum verification fails, **stop**; never skip or bypass it.

## 2. Create credentials and Kubernetes Secrets

On your operator workstation, create three **private env files outside the repository**. Use `umask 077` and replace every example value with a unique generated secret, e.g. `openssl rand -hex 32`. Use actual private DNS hostnames. All three files must be protected (`chmod 600`) and removed from unencrypted shared locations.

`/secure/dash-runtime.env`:

```dotenv
SECURITY_JWT_SECRET=<unique-32-plus-character-secret>
DATABASE_CONNECTION_HOST=<postgres-private-host>
DATABASE_CONNECTION_PORT=5432
DATABASE_CONNECTION_DATABASE=postgres
DATABASE_CONNECTION_USERNAME=<database-user>
DATABASE_CONNECTION_PASSWORD=<database-password>
RABBITMQ_HOST_NAME=<rabbitmq-private-host>
RABBITMQ_HOST_PORT=5672
RABBITMQ_PORT=5672
RABBITMQ_USER_NAME=<rabbitmq-user>
RABBITMQ_USER_PASSWORD=<rabbitmq-password>
MSG_QUEUE_NAME_IMAGE_SCANNER=trawler_queue
```

`/secure/dash-bootstrap.env`:

```dotenv
CLUSTER_API_KEY=<unique-cluster-key>
SUPER_ADMIN_EMAIL=<your-admin-email>
SUPER_ADMIN_PASSWORD=<unique-admin-password>
TRAWLER_API_KEY=<unique-trawler-key>
KUBE_HUNTER_API_KEY=<unique-hunter-key>
KUBE_BENCH_API_KEY=<unique-bench-key>
FALCO_API_KEY=<unique-falco-key>
```

`/secure/trawler-runtime.env`:

```dotenv
RABBITMQ_HOSTNAME=<same-rabbitmq-private-host>
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=<same-rabbitmq-user>
RABBITMQ_PASSWORD=<same-rabbitmq-password>
RABBITMQ_QUEUE_NAME=trawler_queue
M9SWEEPER_API_KEY=<exact-value-of-TRAWLER_API_KEY-above>
```

Use secure credentials supported by your infrastructure; placeholder values above are **not** valid. The Dash RabbitMQ credentials must match Trawler's. Do not publish Secret values or place passwords on command lines.

```bash
kubectl config current-context
kubectl create namespace m9-mvp-staging
kubectl label namespace m9-mvp-staging m9sweeper-staging=true --overwrite

kubectl -n m9-mvp-staging create secret generic m9-dash-env \
  --from-env-file=/secure/dash-runtime.env
kubectl -n m9-mvp-staging create secret generic m9-init-env \
  --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9-mvp-staging create secret generic m9-trawler-env \
  --from-env-file=/secure/trawler-runtime.env

export M9_MVP_PREFLIGHT=YES
export M9_EXPECTED_KUBE_CONTEXT="$(kubectl config current-context)"
python3 "$HOME/m9sweeper-beta/mvp_preinstall_secrets.py" \
  --namespace m9-mvp-staging
```

Preflight checks Secret references, required keys, matching identities and namespace labels. It **does not** prove DB/broker TLS, network connectivity, backups or workload readiness.

## 3. Install the verified chart

Create `/secure/m9-mvp-values.yaml` (nonsecret, file access restricted):

```yaml
global:
  mvp:
    enabled: true
  postgres:
    enabled: false
  rabbitmq:
    enabled: false
dash:
  existingSecret: m9-dash-env
  init:
    existingSecret: m9-init-env
trawler:
  existingSecret: m9-trawler-env
```

Do **not** override the chart's signed OCI image references. With the signed beta.1 package:

```bash
cd "$HOME/m9sweeper-beta"
kubectl get --raw /version # Check the Kubernetes server is a supported version

# Initial install: do NOT add --wait (Dash post-install DB bootstrap hook).
helm upgrade --install m9-mvp ./m9sweeper-0.1.0-rc9.tgz \
  --namespace m9-mvp-staging \
  --values /secure/m9-mvp-values.yaml \
  --timeout 15m

# Post-install readiness is explicitly checked after the hook has run.
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-dash --timeout=5m
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-trawler --timeout=5m
kubectl -n m9-mvp-staging get pods,jobs
```

The Helm package must be the one you verified in step 1. No separate source checkout is needed for this workflow.

## 4. Log in and verify scanning

```bash
kubectl -n m9-mvp-staging port-forward svc/m9-mvp-dash 13000:3000
```

Open `http://127.0.0.1:13000` from the **same workstation**, log in with `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`, configure a **test** cluster using CA-verified Kubernetes credentials, configure a matching Trivy scanner policy, and trigger an image scan. Verify the scan transitions from queued to completed, vulnerability details persist, and policy-compliant/noncompliant outcomes reflect the findings. Failed scans must be displayed as failures. Do not expose this HTTP port-forward to other networks.

## Troubleshooting and limitations

```bash
helm status m9-mvp -n m9-mvp-staging
kubectl -n m9-mvp-staging get deployments,pods,jobs -o wide
kubectl -n m9-mvp-staging get events --sort-by=.metadata.creationTimestamp
kubectl -n m9-mvp-staging describe deployment/m9-mvp-dash
kubectl -n m9-mvp-staging describe deployment/m9-mvp-trawler
```

If Helm hangs at initial installation, check that **`--wait` was not added** and that the external DB is reachable for the post-install bootstrap Job. A Trawler container with `exec: "trawler": executable file not found` indicates the wrong (pre-fix) chart; verify the published rc9 chart, not an earlier candidate.

If a workload is unready, inspect its pod conditions and sanitized logs locally. Avoid posting tokens, kubeconfig contents or raw Secrets in public issues. Never delete database volumes or retry destructive migrations as a troubleshooting shortcut.

**Not included in beta.1 guarantees:** in-cluster managed PostgreSQL/RabbitMQ, production HA, full database disaster recovery, native Falco/eBPF compatibility on all kernels, production admission enforcement, complete CIS benchmark assessment, or automatic remediation. Backup and restore PostgreSQL separately before any upgrade; a Helm rollback cannot reverse a database migration.

[Report installation issues](https://github.com/sm-joe/m9sweeper-modern/issues) with sanitized steps, cluster version, chart filename, pod states and events. See [release notes](mvp-beta-release-notes.md) and [attribution](../ATTRIBUTION.md).
