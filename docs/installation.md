# Installation

**First Kubernetes installation?** Follow [Start here: install m9sweeper on Kubernetes](getting-started.md), a beginner-friendly Linux walkthrough covering the terminology, tools, storage, setup, login and troubleshooting. Use the detailed sections below as a configuration reference.

**Installing on Amazon EKS?** Start with the [complete EKS installation and scanner guide](eks-installation.md). It covers EBS CSI, node availability zones, initial administrator setup, cluster kubeconfig registration, kube-bench reports, Kubesec pods and kube-hunter HTTPS.

For other Kubernetes providers, check [provider storage and identity prerequisites](cloud-kubernetes.md); AKS and GKE runtime acceptance remains on hold.

[Back to README](../README.md) · [Cloud Kubernetes (EKS / AKS / GKE)](cloud-kubernetes.md) · [Releases](https://github.com/sm-joe/m9sweeper-modern/releases)

## Requirements

Kubernetes 1.35–1.37 (chart declared range; validate each environment), Helm 3, kubectl, GitHub CLI and a working default CSI-backed persistent StorageClass with sufficient node pod capacity in each volume's availability zone. The chart includes PostgreSQL 17 and RabbitMQ 4.4; existing external services are optional.

## Step 1 — Download

```bash
mkdir -p m9sweeper && cd m9sweeper
gh release download v0.1.0 --repo sm-joe/m9sweeper-modern --pattern '*.tgz' --pattern 'create-install-secrets.py'
```

## Step 2 — Configure

**New installation:** Download the signed release and its credential setup helper. Generate all three synchronized credential files once. The helper generates cryptographically random passwords and scanner API keys, sets file permissions to 0600, and refuses to overwrite any existing installation files.

```bash
umask 077
export M9_PRIVATE_DIR="$HOME/.config/m9sweeper"
export M9_ADMIN_EMAIL="your-real-admin-email@example.com"
python3 ./create-install-secrets.py --output-dir "$M9_PRIVATE_DIR"
```

Replace the example administrator email with an address you control **before** running the helper. The random administrator password is stored only in the private `dash-bootstrap.env` file; retrieve it on your workstation when first signing in. Do not log or commit that file.

The generated files contain the exact names consumed by Dash, Trawler, PostgreSQL and RabbitMQ:

| Dashboard or bootstrap Secret | Trawler Secret | Requirement |
| --- | --- | --- |
| `m9-dash-env:RABBITMQ_USER_NAME` | `m9-trawler-env:RABBITMQ_USERNAME` | Identical broker username |
| `m9-dash-env:RABBITMQ_USER_PASSWORD` | `m9-trawler-env:RABBITMQ_PASSWORD` | Identical broker password |
| `m9-dash-env:RABBITMQ_HOST_NAME` | `m9-trawler-env:RABBITMQ_HOSTNAME` | Same broker Service address |
| `m9-dash-env:MSG_QUEUE_NAME_IMAGE_SCANNER` | `m9-trawler-env:RABBITMQ_QUEUE_NAME` | Same queue |
| `m9-init-env:TRAWLER_API_KEY` | `m9-trawler-env:M9SWEEPER_API_KEY` | Identical authorized Trawler identity |

**Existing installation or upgrade:** Do not rerun the generator, recreate Secrets, change broker credentials, reset registered scanner API keys, remove the RabbitMQ PVC, or re-run administrator bootstrap. Preserve your existing Helm values and Secrets. Before upgrading, verify Secret key names against the table above and fix any mismatch without changing the underlying authorized values. The Helm pre-install/pre-upgrade hook now rejects missing/mismatched names or known placeholder values *before* application workloads are changed.

A persisted RabbitMQ account can retain its original password independently of Kubernetes Secret data. Matching Secrets alone do not prove authentication; verify the broker with `rabbitmqctl authenticate_user` after RabbitMQ is running. The Erlang cookie must remain owner-only (0600) across upgrades; the bundled RabbitMQ startup hook repairs that permission without replacing the cookie.

Create the Kubernetes namespace and Secrets:

```bash
kubectl create namespace m9sweeper-system
kubectl -n m9sweeper-system create secret generic m9-dash-env --from-env-file="$M9_PRIVATE_DIR/dash-runtime.env"
kubectl -n m9sweeper-system create secret generic m9-init-env --from-env-file="$M9_PRIVATE_DIR/dash-bootstrap.env"
kubectl -n m9sweeper-system create secret generic m9-trawler-env --from-env-file="$M9_PRIVATE_DIR/trawler-runtime.env"
```

Create **`$M9_PRIVATE_DIR/m9sweeper-values.yaml`** with the following command. Do not put passwords in Helm values:

```bash
cat > "$M9_PRIVATE_DIR/m9sweeper-values.yaml" <<'YAML'
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
chmod 600 "$M9_PRIVATE_DIR/m9sweeper-values.yaml"
```

The chart includes its application image references. For bundled PostgreSQL and RabbitMQ, the chart injects the release-local Service hostnames automatically. Keep the passwords and usernames consistent across the Dash and Trawler Secrets.

## Step 3 — Install

From the directory where you downloaded the release:

```bash
helm upgrade --install m9sweeper ./m9sweeper-0.1.0.tgz \
  --namespace m9sweeper-system --values "$M9_PRIVATE_DIR/m9sweeper-values.yaml" --timeout 15m

kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
```

**Do not use `--wait` for the first install.** The database initialization job must run before deployment readiness is checked. Verify it *actually completed*, and verify the bootstrap administrator exists in the persistent database before calling the install healthy. A ready Dashboard Pod alone does not prove the install succeeded.

## Step 4 — Open m9sweeper

```bash
kubectl -n m9sweeper-system port-forward svc/m9sweeper-dash 13000:3000
```

Open [http://localhost:13000](http://localhost:13000) on the same workstation and sign in using the account from `dash-bootstrap.env`. Register a cluster only with credentials the backend can actually refresh and validate; the uploaded cloud CLI `exec` kubeconfig workflow is **not yet implemented in the published release**. See [EKS / AKS / GKE requirements and acceptance](cloud-kubernetes.md). Configure a Trivy policy and scan a test image to view findings.

## Troubleshooting

If Helm reports that a cluster-wide `ClusterRole` already exists, inspect the existing role and its bindings with `kubectl get clusterrole m9sweeper -o yaml` and `kubectl get clusterrolebindings`. The current chart creates a unique role named `m9sweeper-m9sweeper-system` instead of taking ownership of another installation's role. Do not delete existing cluster-scoped resources without first checking which service accounts depend on them.


```bash
kubectl -n m9sweeper-system get pods,jobs,pvc -o wide
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get csidriver
kubectl get storageclass
kubectl -n m9sweeper-system get events --sort-by=.metadata.creationTimestamp
helm status m9sweeper -n m9sweeper-system
```

If pods do not start, check their events and make sure the database, message queue, credentials and registry access are correct. Keep the dashboard local unless you have configured a trusted HTTPS ingress. Back up PostgreSQL before upgrades; a Helm rollback does not reverse database schema changes.

For problems, [open an issue](https://github.com/sm-joe/m9sweeper-modern/issues) with redacted logs. See [Security](../SECURITY.md) for private vulnerability reporting.

## Scanner reports and standalone Helm charts

The Dash Helm deployment automatically sets `SCANNER_REPORT_INGESTION_URL` to its own
cluster-local Service origin, such as
`http://m9sweeper-dash.m9sweeper-system.svc.cluster.local:3000`.
This endpoint is reachable from Kubernetes Jobs in the same cluster; a local
browser URL or port-forward (`localhost`) is not a scanner callback.

To install kube-bench, use the existing initialization Secret `m9-init-env` with key `KUBE_BENCH_API_KEY`. Do not create or rotate another scanner key unless you intentionally manage scanner identities separately.
The key must have permission to submit reports for the selected cluster. Avoid exposing it in Helm values or logs.
Then run, for example:

```bash
helm upgrade --install kube-bench \
  https://github.com/sm-joe/m9sweeper-modern/releases/download/v0.1.0/kube-bench-0.1.0.tgz \
  -n m9sweeper-system \
  --set-string provider=commonjob \
  --set-string reportsurl=http://m9sweeper-dash.m9sweeper-system.svc.cluster.local:3000/api/kube-bench/1 \
  --set-string reportAuth.existingSecret=m9-init-env \
  --set-string reportAuth.keyName=KUBE_BENCH_API_KEY \
  --set cronjob.enabled=false
```

Use `kubectl -n m9sweeper-system get jobs,pods` and
`kubectl -n m9sweeper-system logs job/<job-name>` to inspect actual execution.
Closing the wizard alone does not launch a scan.

**kube-hunter differs:** the header-authenticated report relay requires trusted HTTPS. Reuse `m9-init-env` key `KUBE_HUNTER_API_KEY` with `reportRelay.existingSecret=m9-init-env` and `reportRelay.secretKey=KUBE_HUNTER_API_KEY`; no extra relay Secret is needed.
Configure a real ingress or TLS gateway that routes to Dash and is reachable from
Kubernetes Pods. Set `dash.scannerReportIngestionUrl` to that HTTPS origin
in your private values file, then upgrade the umbrella Helm release.
Use a trusted certificate or `reportRelay.caSecret` for your private CA.
The kube-hunter chart is independently available at:

```text
https://github.com/sm-joe/m9sweeper-modern/releases/download/v0.1.0/kube-hunter-0.1.0.tgz
```

Do not use a bare `/api/kubehunter/hunter/<cluster-id>` path or a
browser-only localhost URL as `reportRelay.targetUrl`; it must be a full
trusted HTTPS URL. Generate the exact target via the UI after setting the HTTPS
origin. Both scanner charts are included as versioned release assets, not
inside the umbrella Helm chart or an operator's current working directory.

## Amazon EKS: validated path and scanner fixes

Follow the [step-by-step EKS installation guide](eks-installation.md) for **the tested kubeconfig connection**, EBS CSI storage, database initialization, kube-bench, Kubesec pod listing, and kube-hunter HTTPS. Avoid using the published `kube-bench-0.1.0.tgz` archive for one-time EKS Jobs: it contains the invalid `eks-1.0` benchmark. The EKS guide uses the corrected source chart and **reuses scanner keys from the existing `m9-init-env` Secret** rather than instructing users to create missing arbitrary Secrets.

On the real test EKS cluster, kube-bench execution **and its dashboard report** were confirmed by the operator. Kubesec and kube-hunter fixes still require deployment and runtime acceptance. Trivy and Falco EKS acceptance also remain open. These conditions do not block installing the core application, but do block claiming complete production-ready cloud scanner certification.

For other providers, use [the cloud requirements guide](cloud-kubernetes.md) and select your cluster's compatible CSI driver, node topology, identity and networking configuration. AKS and GKE runtime acceptance is currently on hold.
