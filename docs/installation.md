# Installation

**Installing on Amazon EKS?** Start with the [complete EKS installation and scanner guide](eks-installation.md). It covers EBS CSI, node availability zones, initial administrator setup, cluster kubeconfig registration, kube-bench reports, Kubesec pods and kube-hunter HTTPS.

For other Kubernetes providers, check [provider storage and identity prerequisites](cloud-kubernetes.md); AKS and GKE runtime acceptance remains on hold.

[Back to README](../README.md) · [Cloud Kubernetes (EKS / AKS / GKE)](cloud-kubernetes.md) · [Releases](https://github.com/sm-joe/m9sweeper-modern/releases)

## Requirements

Kubernetes 1.35–1.37 (chart declared range; validate each environment), Helm 3, kubectl, GitHub CLI and a working default CSI-backed persistent StorageClass with sufficient node pod capacity in each volume's availability zone. The chart includes PostgreSQL 17 and RabbitMQ 4.4; existing external services are optional.

## Step 1 — Download

```bash
mkdir -p m9sweeper && cd m9sweeper
gh release download v0.1.2 --repo sm-joe/m9sweeper-modern --pattern '*.tgz'
```

## Step 2 — Configure

Create three files in a private directory, such as `/secure/`, and replace the example credentials. The bundled PostgreSQL and RabbitMQ Kubernetes addresses below match the standard release. Use `umask 077` when creating them. Never commit these files.

**`/secure/dash-runtime.env`** — database and message queue:

```dotenv
SECURITY_JWT_SECRET=replace-with-a-long-random-secret
DATABASE_CONNECTION_HOST=m9sweeper-postgresql.m9sweeper-system.svc.cluster.local
DATABASE_CONNECTION_PORT=5432
DATABASE_CONNECTION_DATABASE=postgres
DATABASE_CONNECTION_USERNAME=m9sweeper
DATABASE_CONNECTION_PASSWORD=replace-with-database-password
RABBITMQ_HOST_NAME=m9sweeper-rabbitmq.m9sweeper-system.svc.cluster.local
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
RABBITMQ_HOSTNAME=m9sweeper-rabbitmq.m9sweeper-system.svc.cluster.local
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=m9sweeper
RABBITMQ_PASSWORD=replace-with-rabbitmq-password
RABBITMQ_QUEUE_NAME=trawler_queue
M9SWEEPER_API_KEY=replace-with-unique-trawler-key
```

The RabbitMQ username/password must match in both files. `M9SWEEPER_API_KEY` must be **exactly the same value** as `TRAWLER_API_KEY`. Generate unique random keys (for example, with `openssl rand -hex 32`); never use these example passwords.

Create the Kubernetes namespace and Secrets:

```bash
kubectl create namespace m9sweeper-system
kubectl -n m9sweeper-system create secret generic m9-dash-env --from-env-file=/secure/dash-runtime.env
kubectl -n m9sweeper-system create secret generic m9-init-env --from-env-file=/secure/dash-bootstrap.env
kubectl -n m9sweeper-system create secret generic m9-trawler-env --from-env-file=/secure/trawler-runtime.env
```

Create **`/secure/m9sweeper-values.yaml`**:

```yaml
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
```

The chart includes its application image references. For bundled PostgreSQL and RabbitMQ, the chart injects the release-local Service hostnames automatically. Keep the passwords and usernames consistent across the Dash and Trawler Secrets.

## Step 3 — Install

From the directory where you downloaded the release:

```bash
helm upgrade --install m9sweeper ./m9sweeper-0.1.2.tgz \
  --namespace m9sweeper-system --values /secure/m9sweeper-values.yaml --timeout 15m

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
  https://github.com/sm-joe/m9sweeper-modern/releases/download/v0.1.2/kube-bench-0.1.2.tgz \
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
https://github.com/sm-joe/m9sweeper-modern/releases/download/v0.1.2/kube-hunter-0.1.2.tgz
```

Do not use a bare `/api/kubehunter/hunter/<cluster-id>` path or a
browser-only localhost URL as `reportRelay.targetUrl`; it must be a full
trusted HTTPS URL. Generate the exact target via the UI after setting the HTTPS
origin. Both scanner charts are included as versioned release assets, not
inside the umbrella Helm chart or an operator's current working directory.

## Amazon EKS: validated path and scanner fixes

Follow the [step-by-step EKS installation guide](eks-installation.md) for **the tested kubeconfig connection**, EBS CSI storage, database initialization, kube-bench, Kubesec pod listing, and kube-hunter HTTPS. Avoid using the published `kube-bench-0.1.2.tgz` archive for one-time EKS Jobs: it contains the invalid `eks-1.0` benchmark. The EKS guide uses the corrected source chart and **reuses scanner keys from the existing `m9-init-env` Secret** rather than instructing users to create missing arbitrary Secrets.

On the real test EKS cluster, kube-bench execution **and its dashboard report** were confirmed by the operator. Kubesec and kube-hunter fixes still require deployment and runtime acceptance. Trivy and Falco EKS acceptance also remain open. These conditions do not block installing the core application, but do block claiming complete production-ready cloud scanner certification.

For other providers, use [the cloud requirements guide](cloud-kubernetes.md) and select your cluster's compatible CSI driver, node topology, identity and networking configuration. AKS and GKE runtime acceptance is currently on hold.
