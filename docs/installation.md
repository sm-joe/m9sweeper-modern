# Installation and upgrades

Deploy m9sweeper-modern on a Kubernetes cluster with Helm. All commands in this document use **bash on Linux**. For EKS-specific instructions, see [Amazon EKS](eks-installation.md); for a shorter introduction, see [Quick start](getting-started.md).

## Requirements

- Kubernetes 1.35–1.37, `kubectl` and Helm 3
- GitHub CLI (`gh`), Python 3, `sha256sum` and a shell with `bash`
- A working default persistent StorageClass for PostgreSQL and RabbitMQ, or operator-provided external dependencies
- Authorization to create namespace-scoped Secrets, Helm resources and the scanner service accounts

Check your target cluster before continuing:

```bash
set -euo pipefail
kubectl config current-context
kubectl get nodes
kubectl get storageclass
kubectl get csidriver
```

## Fresh installation

### 1. Download the published package

```bash
mkdir -p "$HOME/m9sweeper-install"
cd "$HOME/m9sweeper-install"
gh release download v0.1.0 --repo sm-joe/m9sweeper-modern \
  --pattern 'm9sweeper-0.1.0.tgz' \
  --pattern 'create-install-secrets.py' \
  --pattern 'SHA256SUMS' \
  --clobber
helm show chart ./m9sweeper-0.1.0.tgz
```

The release also contains optional standalone `kube-bench-0.1.0.tgz` and `kube-hunter-0.1.0.tgz` packages. To verify every listed SHA256 checksum, download the other files referenced by `SHA256SUMS` and run `sha256sum -c SHA256SUMS`. Do not combine files from different refreshes of the release.

### 2. Generate matching credentials once

```bash
umask 077
export M9_PRIVATE_DIR="$HOME/.config/m9sweeper"
read -r -p 'Administrator email: ' M9_ADMIN_EMAIL
export M9_ADMIN_EMAIL
python3 ./create-install-secrets.py --output-dir "$M9_PRIVATE_DIR"
chmod 700 "$M9_PRIVATE_DIR"
```

The generator writes three matching, private files:

| File | Kubernetes Secret | Purpose |
| --- | --- | --- |
| `dash-runtime.env` | `m9-dash-env` | API, PostgreSQL and RabbitMQ settings |
| `dash-bootstrap.env` | `m9-init-env` | First administrator and scanner accounts |
| `trawler-runtime.env` | `m9-trawler-env` | Worker queue and API credentials |

Do not publish these files. In particular, `m9-init-env` contains API keys for Trivy, kube-bench, kube-hunter and Falco integrations.

```bash
kubectl create namespace m9sweeper-system
kubectl -n m9sweeper-system create secret generic m9-dash-env \
  --from-env-file="$M9_PRIVATE_DIR/dash-runtime.env"
kubectl -n m9sweeper-system create secret generic m9-init-env \
  --from-env-file="$M9_PRIVATE_DIR/dash-bootstrap.env"
kubectl -n m9sweeper-system create secret generic m9-trawler-env \
  --from-env-file="$M9_PRIVATE_DIR/trawler-runtime.env"
kubectl -n m9sweeper-system get secrets m9-dash-env m9-init-env m9-trawler-env
```

### 3. Supply Helm values

```bash
cat > "$M9_PRIVATE_DIR/values.yaml" <<'YAML'
global:
  installation:
    enabled: true
  postgres:
    enabled: true
  rabbitmq:
    enabled: true
dash:
  existingSecret: m9-dash-env
  init:
    existingSecret: m9-init-env
trawler:
  existingSecret: m9-trawler-env
YAML
chmod 600 "$M9_PRIVATE_DIR/values.yaml"
```

The application chart provisions the bundled PostgreSQL 17 and RabbitMQ 4.4 services in this mode. Existing installations must preserve their selected bundled/external dependency configuration.

### 4. Install and check the platform

```bash
helm lint ./m9sweeper-0.1.0.tgz -f "$M9_PRIVATE_DIR/values.yaml"
helm upgrade --install m9sweeper ./m9sweeper-0.1.0.tgz \
  --namespace m9sweeper-system \
  --values "$M9_PRIVATE_DIR/values.yaml" \
  --timeout 15m

kubectl -n m9sweeper-system get pods,jobs,pvc -o wide
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
helm status m9sweeper -n m9sweeper-system
```

Verify the first-install bootstrap Job completed; confirm PostgreSQL and RabbitMQ PVCs are `Bound` and both deployments Ready. Do **not** regenerate Secrets to fix a stateful volume scheduling problem. On EKS, check the EBS CSI driver and volume availability zones first.

### 5. Log in and enroll your cluster

```bash
kubectl -n m9sweeper-system port-forward service/m9sweeper-dash 13000:3000
```

Visit **http://localhost:13000**. Sign in with the configured administrator email and the password from `$M9_PRIVATE_DIR/dash-bootstrap.env`. Register a cluster using a backend-compatible, authorized kubeconfig; check inventory and automatic image synchronization without manually running the cluster-sync CLI.

For EKS, follow the [cluster registration and scanner instructions](eks-installation.md). Automatic sync uses a five-minute CronJob; successful scans require RabbitMQ consumers, scanner access, and the reports arriving in the dashboard.

## Upgrading an existing installation

**Keep your current Secrets, PostgreSQL and RabbitMQ PVCs, API keys and cluster registrations.** Never rerun `create-install-secrets.py` during an upgrade.

The published Helm chart pins **Dash and Trawler to immutable image digests**. A plain `helm upgrade --reuse-values` can retain old digests and silently leave an older Angular UI running. Download the chart and matching `IMAGE-DIGESTS.txt` together and override both image tags.

```bash
set -euo pipefail
cd "$HOME/m9sweeper-install"
gh release download v0.1.0 --repo sm-joe/m9sweeper-modern \
  --pattern 'm9sweeper-0.1.0.tgz' \
  --pattern 'IMAGE-DIGESTS.txt' \
  --clobber

kubectl -n m9sweeper-system get secret m9-dash-env m9-init-env m9-trawler-env
helm get values m9sweeper -n m9sweeper-system -o yaml > m9sweeper-values-backup.yaml
helm history m9sweeper -n m9sweeper-system

dash_digest="$(sed -n 's|^dash=ghcr.io/sm-joe/m9sweeper-dash@||p' IMAGE-DIGESTS.txt)"
trawler_digest="$(sed -n 's|^trawler=ghcr.io/sm-joe/m9sweeper-trawler@||p' IMAGE-DIGESTS.txt)"
[[ "$dash_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
[[ "$trawler_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1

helm upgrade m9sweeper ./m9sweeper-0.1.0.tgz \
  --namespace m9sweeper-system \
  --reuse-values \
  --set-string dash.image.registry=ghcr.io \
  --set-string dash.image.repository=sm-joe/m9sweeper-dash \
  --set-string "dash.image.tag=v0.1.0@$dash_digest" \
  --set-string trawler.image.registry=ghcr.io \
  --set-string trawler.image.repository=sm-joe/m9sweeper-trawler \
  --set-string "trawler.image.tag=v0.1.0@$trawler_digest" \
  --timeout 15m

kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
kubectl -n m9sweeper-system get deploy m9sweeper-dash m9sweeper-trawler -o wide
```

Review the actual container images against `IMAGE-DIGESTS.txt` using `kubectl get deployment -o json`. If the current release used different Secret names, preserve those names via the saved Helm values; **do not** introduce new credentials to make an upgrade pass.

Back up PostgreSQL before upgrades. Helm rollback restores Kubernetes manifests, **not** database migrations.

## Troubleshooting

| Symptom | Check | Correct approach |
| --- | --- | --- |
| PostgreSQL/RabbitMQ Pods Pending | `kubectl get pvc`, `kubectl describe pod` | CSI driver, StorageClass, available node/volume zone |
| Trawler cannot connect to broker | RabbitMQ diagnostics and queue consumers | Verify startup recovery, Service DNS and matching existing credentials |
| Inventory is empty | `kubectl get cronjob,jobs -n m9sweeper-system` | Verify scheduled sync and stored cluster authorization |
| Private ECR images fail to scan | Trawler logs and Pod Identity association | Configure ECR permissions for the Trawler service account |
| kube-hunter report won't load | Dash image digest, browser Network/Console, report API | Deploy matching digest and investigate API response; do not delete reports |
| Falco forwarding fails | Falcosidekick logs and webhook Secret | Use a real reachable endpoint and correct authenticated header |

Read [EKS installation](eks-installation.md) for concrete scanner installation, private HTTPS, ECR identity and runtime acceptance. Read [SECURITY.md](../SECURITY.md) before exposing the dashboard beyond a local port-forward.
