# m9sweeper-modern v0.1.0 public beta — Helm installation profile

**Stage: development / acceptance, NOT publicly released yet.** The source
umbrella chart still contains **legacy PostgreSQL 11 and RabbitMQ 3.8**
development components. The opt-in `global.mvp.enabled=true` guard refuses
those bundled components, requires existing Secrets, and insists on
digest-pinned image references. It does not itself provide external databases,
validate Secret contents, or prove a complete end-user installation.

## Prerequisites (native Linux operator workstation)

- A supported Linux Kubernetes staging cluster, Helm 3, kubectl, a dedicated
  namespace, approved kubeconfig/role and persistent storage.
- An independently managed, **supported PostgreSQL 17** instance and RabbitMQ
  instance reachable from Pods on private DNS. Validate backups, TLS, auth,
  readiness and operations independently before production use.
- A **successful signed Linux release-candidate workflow** and its verified
  immutable Dash and Trawler image digests, plus a corresponding Helm chart.
- Existing cluster-local Kubernetes Secrets holding runtime/init credentials
  (never `--set` raw secret values or commit values with passwords).
- Working internal callback/network routes, trusted Kubernetes CA and
  least-privilege scanner accounts.

## Secret contract

Create three private local env files **outside this repository** and protect
them with `umask 077`. Mandatory keys include:

`m9-dash-env` (Dash runtime, use the actual external DB and broker names):
```text
SECURITY_JWT_SECRET=generated-random-unique-min-32
DATABASE_CONNECTION_HOST=your-db-private-dns
DATABASE_CONNECTION_PORT=5432
DATABASE_CONNECTION_DATABASE=postgres
DATABASE_CONNECTION_USERNAME=your-db-user
DATABASE_CONNECTION_PASSWORD=replace-with-private-secret
RABBITMQ_HOST_NAME=your-rabbit-private-dns
RABBITMQ_HOST_PORT=5672
RABBITMQ_PORT=5672
RABBITMQ_USER_NAME=your-rabbit-user
RABBITMQ_USER_PASSWORD=replace-with-private-secret
MSG_QUEUE_NAME_IMAGE_SCANNER=trawler_queue
```

`m9-init-env` (one-time bootstrap; all values must be independently generated
and safely stored, with the trawler key matching the Trawler Secret):
```text
CLUSTER_API_KEY=generated-unique-key
SUPER_ADMIN_EMAIL=operator@example.invalid
SUPER_ADMIN_PASSWORD=unique-long-password
TRAWLER_API_KEY=generated-trawler-key
KUBE_HUNTER_API_KEY=generated-kubehunter-key
KUBE_BENCH_API_KEY=generated-kubebench-key
FALCO_API_KEY=generated-falco-key
```

`m9-trawler-env` (scanner worker):
```text
RABBITMQ_HOSTNAME=your-rabbit-private-dns
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=your-rabbit-user
RABBITMQ_PASSWORD=replace-with-private-secret
RABBITMQ_QUEUE_NAME=trawler_queue
M9SWEEPER_API_KEY=generated-trawler-key
```

These snippets are templates, **not valid credentials**. Do not use literal
placeholder strings, and do not pass Secret values through shell history.
The Helm preflight only verifies references. It does not check whether Secrets
exist, are correctly populated, or match the actual DB/RabbitMQ identities.

After securely creating private local env files, create the Kubernetes
Secrets in your *isolated staging namespace*:

```bash
kubectl create namespace m9-mvp-staging
kubectl label namespace m9-mvp-staging m9sweeper-staging=true --overwrite
kubectl -n m9-mvp-staging create secret generic m9-dash-env \
  --from-env-file=/secure/dash-runtime.env
kubectl -n m9-mvp-staging create secret generic m9-init-env \
  --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9-mvp-staging create secret generic m9-trawler-env \
  --from-env-file=/secure/trawler-runtime.env
```

Before attempting Helm installation, verify the actual installed staging
Secret keys and cross-component scanner/broker identity consistency **without
printing Secret values**:

```bash
export M9_MVP_PREFLIGHT=YES
export M9_EXPECTED_KUBE_CONTEXT="$(kubectl config current-context)"
python3 tools/security/mvp_preinstall_secrets.py --namespace m9-mvp-staging
```

The checker refuses unlabelled or non-staging namespaces and mismatched
Kubernetes contexts. It does not test database or broker connectivity and
must not be presented as complete production security validation.

Restrict access to the files and Secrets. Rotate any accidental disclosures.

## Prepare an immutable installation candidate

From the repository root, use
`platform/manifests/charts/m9sweeper/values-mvp.example.yaml` as a **template**.
Copy to an excluded private location and replace both
`REPLACE_WITH_VERIFIED_64_HEX_DIGEST` placeholders with verified signed OCI
image digests from the same release candidate. Ensure the release chart's
version, values and image digests match the original verified artifact.

```bash
helm dependency update platform/manifests/charts/m9sweeper
helm lint platform/manifests/charts/m9sweeper \
  -f /secure/m9-mvp-values.yaml
helm template m9-mvp platform/manifests/charts/m9sweeper \
  -n m9-mvp-staging -f /secure/m9-mvp-values.yaml \
  --kube-version 1.35.0 >/secure/m9-mvp-render.yaml
```

The source-tree chart is for staging and development; a public download
should install the independently verified **published signed Helm package**
rather than `main` or mutable tags.

## Verified staging-only installation helper

The signed Linux candidate artifact bundle contains
`install-mvp-staging-linux.sh`, `mvp_preinstall_secrets.py`,
`mvp-installer.sigstore.json`, `chart.sigstore.json`,
`IMAGE-DIGESTS.txt`, `SHA256SUMS` and `MVP-INSTALL.md`.

**Before executing any downloaded script**, independently verify the installer
blob signature using `cosign` on a trusted Linux workstation:

```bash
identity='https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main'
issuer='https://token.actions.githubusercontent.com'
cosign verify-blob --bundle /secure/candidate/mvp-installer.sigstore.json \
  --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" \
  /secure/candidate/install-mvp-staging-linux.sh
```

Once the chart digest, Secret files, and labelled staging namespace are ready,
the helper verifies chart/image signing, artifact checksums, Kubernetes context
and Secret keys **before calling Helm**:

```bash
export M9_MVP_INSTALL_CONFIRM=INSTALL_STAGING_ONLY
export M9_EXPECTED_KUBE_CONTEXT="$(kubectl config current-context)"
export M9_MVP_NAMESPACE=m9-mvp-staging
export M9_MVP_RELEASE=m9-mvp
export M9_MVP_ARTIFACT_DIR=/secure/candidate
export M9_MVP_CHART=/secure/candidate/m9sweeper-0.1.0-rc1.tgz
export M9_MVP_VALUES=/secure/m9-mvp-values.yaml
export M9_MVP_SECRET_CHECKER=/secure/candidate/mvp_preinstall_secrets.py
bash /secure/candidate/install-mvp-staging-linux.sh
```

Adjust the chart file to the actual signed candidate version. This helper is
restricted to isolated staging namespaces and is **not** a production
installer. It cannot create or manage external PostgreSQL, RabbitMQ, Secrets,
trusted ingress, backup schedules or scanner RBAC automatically.

## Staging install acceptance — not yet confirmed

Do **not** install into an existing production namespace. Once private DB,
broker, Secret content and verified images are ready, run on a disposable
staging cluster with a trusted kubeconfig:

```bash
helm upgrade --install m9-mvp platform/manifests/charts/m9sweeper \
  --namespace m9-mvp-staging -f /secure/m9-mvp-values.yaml \
  --wait --timeout 15m
kubectl -n m9-mvp-staging get pods
kubectl -n m9-mvp-staging get jobs
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-dash
kubectl -n m9-mvp-staging rollout status deployment/m9-mvp-trawler
kubectl -n m9-mvp-staging port-forward svc/m9-mvp-dash 3000:3000
```

Open `http://127.0.0.1:3000` from the same isolated Linux workstation.
Verify admin login, healthy PostgreSQL/RabbitMQ workers, connection to a
second *fresh* test cluster using CA-verified Kubernetes credentials, real
Trivy HIGH/CRITICAL findings and the Angular results, and no false compliant
outcomes for failed scans. Follow the
[full Linux acceptance plan](native-linux-final-acceptance.md).
Verify migrations, PVC data retention, upgrade and rollback before
publishing any installation commands as a production guarantee.

**Current limitations:** a supported external PostgreSQL/RabbitMQ operator is
required; the source repository does not yet offer a one-command bundled
database/broker installation for public beta, and a successful
`helm template` is not runtime acceptance. Advanced scanners including
Falco, Gatekeeper and kube-hunter require separate environment-specific
validation and may be designated experimental.
