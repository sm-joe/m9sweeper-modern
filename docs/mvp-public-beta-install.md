# Installation

[Back to README](../README.md) · [Download](https://github.com/sm-joe/m9sweeper-modern/releases)

m9sweeper-modern runs in Kubernetes and is installed with Helm.

## Requirements

- Kubernetes 1.35 cluster (the version tested with the downloadable package)
- Helm 3 and kubectl
- PostgreSQL 17 and RabbitMQ 4.4, reachable from the cluster
- Python 3, GitHub CLI (`gh`), Cosign and `sha256sum` on your installation workstation

The current release uses an existing database and queue; it does not install these services for you.

## Step 1 — Download

```bash
mkdir -p m9sweeper && cd m9sweeper
gh release download v0.1.0-beta.1 --repo sm-joe/m9sweeper-modern
sha256sum -c SHA256SUMS

cosign verify-blob m9sweeper-0.1.0-rc9.tgz \
  --bundle chart.sigstore.json \
  --certificate-identity "https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

Use the downloaded chart `m9sweeper-0.1.0-rc9.tgz`. Stop if verification fails.

## Step 2 — Configure

Create three files in a private directory, such as `/secure/`, and replace the examples with your own credentials and real server addresses. Use `umask 077` when creating them. Never commit these files.

**`/secure/dash-runtime.env`** — database and message queue:

```dotenv
SECURITY_JWT_SECRET=replace-with-a-long-random-secret
DATABASE_CONNECTION_HOST=postgres.example.internal
DATABASE_CONNECTION_PORT=5432
DATABASE_CONNECTION_DATABASE=postgres
DATABASE_CONNECTION_USERNAME=m9sweeper
DATABASE_CONNECTION_PASSWORD=replace-with-database-password
RABBITMQ_HOST_NAME=rabbitmq.example.internal
RABBITMQ_HOST_PORT=5672
RABBITMQ_PORT=5672
RABBITMQ_USER_NAME=m9sweeper
RABBITMQ_USER_PASSWORD=replace-with-rabbitmq-password
MSG_QUEUE_NAME_IMAGE_SCANNER=trawler_queue
```

**`/secure/dash-bootstrap.env`** — initial account and scanner credentials:

```dotenv
CLUSTER_API_KEY=replace-with-unique-random-key
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=replace-with-strong-password
TRAWLER_API_KEY=replace-with-unique-trawler-key
KUBE_HUNTER_API_KEY=replace-with-unique-hunter-key
KUBE_BENCH_API_KEY=replace-with-unique-bench-key
FALCO_API_KEY=replace-with-unique-falco-key
```

**`/secure/trawler-runtime.env`** — scanner connection:

```dotenv
RABBITMQ_HOSTNAME=rabbitmq.example.internal
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=m9sweeper
RABBITMQ_PASSWORD=replace-with-rabbitmq-password
RABBITMQ_QUEUE_NAME=trawler_queue
M9SWEEPER_API_KEY=replace-with-unique-trawler-key
```

The RabbitMQ username/password must match in both files. `M9SWEEPER_API_KEY` must be **exactly the same value** as `TRAWLER_API_KEY`. Generate unique random keys (for example, with `openssl rand -hex 32`); never use these example passwords.

Create the Kubernetes namespace and Secrets:

```bash
kubectl create namespace m9-mvp-staging
kubectl label namespace m9-mvp-staging m9sweeper-staging=true --overwrite
kubectl -n m9-mvp-staging create secret generic m9-dash-env --from-env-file=/secure/dash-runtime.env
kubectl -n m9-mvp-staging create secret generic m9-init-env --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9-mvp-staging create secret generic m9-trawler-env --from-env-file=/secure/trawler-runtime.env
```

Create **`/secure/m9-mvp-values.yaml`**:

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

The chart already contains the signed image references. Don't replace them with unverified image tags.

## Step 3 — Install

From the directory where you downloaded the release:

```bash
export M9_MVP_PREFLIGHT=YES
export M9_EXPECTED_KUBE_CONTEXT="$(kubectl config current-context)"
python3 mvp_preinstall_secrets.py --namespace m9-mvp-staging

helm upgrade --install m9-mvp ./m9sweeper-0.1.0-rc9.tgz \
  --namespace m9-mvp-staging --values /secure/m9-mvp-values.yaml --timeout 15m

kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-dash --timeout=5m
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-trawler --timeout=5m
```

**Do not add `--wait` to the initial Helm command.** It can prevent the database initialization hook from running. The release's separate `install-mvp-staging-linux.sh` script still uses that older sequence; use the Helm command above.

## Step 4 — Open m9sweeper

```bash
kubectl -n m9-mvp-staging port-forward svc/m9-mvp-dash 13000:3000
```

Open [http://localhost:13000](http://localhost:13000) on the same workstation and sign in using the account from `dash-bootstrap.env`. Add a cluster with trusted Kubernetes credentials, configure a Trivy policy and scan a test image to view findings.

## Troubleshooting

```bash
kubectl -n m9-mvp-staging get pods,jobs
kubectl -n m9-mvp-staging get events --sort-by=.metadata.creationTimestamp
helm status m9-mvp -n m9-mvp-staging
```

If pods do not start, check their events and make sure the database, message queue, credentials and registry access are correct. Keep the dashboard local unless you have configured a trusted HTTPS ingress. Back up PostgreSQL before upgrades; a Helm rollback does not reverse database schema changes.

For problems, [open an issue](https://github.com/sm-joe/m9sweeper-modern/issues) with redacted logs. See [Security](../SECURITY.md) for private vulnerability reporting.
