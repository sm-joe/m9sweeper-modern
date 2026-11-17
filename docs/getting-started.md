# Quick start: m9sweeper-modern

This walkthrough installs m9sweeper-modern for the first time on an existing Kubernetes cluster. Commands use **bash on Linux**. For all configuration and upgrade options see [Installation](installation.md); for AWS-specific identity and scanners see [Amazon EKS](eks-installation.md).

## What will be installed?

| Resource | Purpose |
| --- | --- |
| Dash | Angular security Dashboard and NestJS API |
| Trawler | Java worker that consumes queued Trivy image scans |
| PostgreSQL | Persistent scanner history, users and configuration |
| RabbitMQ | Scan-job queue for Trawler |
| Init Job | First administrator and scanner-service credentials |

Kubernetes Pods run the applications; Services give them stable network names; Secrets hold credentials; PersistentVolumeClaims retain database and RabbitMQ state. Helm installs and manages these Kubernetes resources as one release.

## 1. Confirm prerequisites

You need an existing cluster, `kubectl`, Helm 3, GitHub CLI (`gh`) and Python 3.

```bash
set -euo pipefail
kubectl config current-context
kubectl get nodes
kubectl get storageclass
kubectl get csidriver
helm version --short
gh --version
python3 --version
```

A default persistent StorageClass is required for the bundled database and queue. On EKS, verify the EBS CSI driver and volume availability zones *before* installing anything.

## 2. Download v0.1.0

```bash
mkdir -p "$HOME/m9sweeper-install"
cd "$HOME/m9sweeper-install"
gh release download v0.1.0 --repo sm-joe/m9sweeper-modern \
  --pattern 'm9sweeper-0.1.0.tgz' \
  --pattern 'create-install-secrets.py' \
  --clobber
helm show chart ./m9sweeper-0.1.0.tgz
```

## 3. Create private credentials (new installations only)

```bash
umask 077
export M9_PRIVATE_DIR="$HOME/.config/m9sweeper"
read -r -p 'Administrator email: ' M9_ADMIN_EMAIL
export M9_ADMIN_EMAIL
python3 ./create-install-secrets.py --output-dir "$M9_PRIVATE_DIR"
```

Keep `$M9_PRIVATE_DIR` private. This step generates the administrator password and synchronized application/scanner credentials. **Never rerun it for an existing installation.**

```bash
kubectl create namespace m9sweeper-system
kubectl -n m9sweeper-system create secret generic m9-dash-env \
  --from-env-file="$M9_PRIVATE_DIR/dash-runtime.env"
kubectl -n m9sweeper-system create secret generic m9-init-env \
  --from-env-file="$M9_PRIVATE_DIR/dash-bootstrap.env"
kubectl -n m9sweeper-system create secret generic m9-trawler-env \
  --from-env-file="$M9_PRIVATE_DIR/trawler-runtime.env"
```

## 4. Install with Helm

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

helm upgrade --install m9sweeper ./m9sweeper-0.1.0.tgz \
  --namespace m9sweeper-system \
  --values "$M9_PRIVATE_DIR/values.yaml" \
  --timeout 15m
```

## 5. Confirm it is running

```bash
kubectl -n m9sweeper-system get pods,jobs,pvc -o wide
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
kubectl -n m9sweeper-system get cronjobs
```

Expected: Init Job completed, database and broker volumes Bound, Dashboard and Trawler Ready, and automatic inventory CronJob present. On a slow first installation, check Pod events and Job logs before retrying anything. Do not delete a stateful volume to resolve a scheduling error.

## 6. Log in

```bash
kubectl -n m9sweeper-system port-forward svc/m9sweeper-dash 13000:3000
```

Open **http://localhost:13000**, sign in with your administrator email and the private bootstrap password.

Add a cluster in Dashboard using an authorized kubeconfig supported by the backend. Inventory refreshes automatically; new image scans are dispatched through RabbitMQ to the Java Trawler and displayed after results have been ingested.

## 7. Activate security integrations

The core platform includes Trivy, Kubesec and policy management. Other scanners are configured independently:

- [EKS guide](eks-installation.md): private ECR with Pod Identity, kube-bench, Kubesec, Falco and kube-hunter with private HTTPS.
- [Cloud Kubernetes](cloud-kubernetes.md): storage and identity prerequisites for EKS, AKS and GKE.
- [Installation and upgrades](installation.md#upgrading-an-existing-installation): safe preservation of credentials and persistent data.

**Acceptance means fresh scan findings appear in Dashboard.** A successfully installed Helm chart or ready Pod alone is not proof that a scanner delivered a report.

## Basic troubleshooting

```bash
kubectl -n m9sweeper-system get pods,jobs,pvc,cronjobs
kubectl -n m9sweeper-system get events --sort-by=.lastTimestamp
kubectl -n m9sweeper-system logs deployment/m9sweeper-trawler --tail=100
kubectl -n m9sweeper-system logs deployment/m9sweeper-dash -c dash --tail=100
```

Avoid publishing Secret contents or raw kubeconfig tokens when asking for help.

[Back to README](../README.md) · [Full installation](installation.md)
