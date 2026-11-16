# Install m9sweeper on Amazon EKS

**New to Kubernetes?** Begin with the [step-by-step beginner guide](getting-started.md). It explains Nodes, Pods, PVCs, Secrets, Helm and what each command's output means. Return here for EKS-specific cluster registration and scanner setup.

**Start here for EKS.** This is the current priority and follows the installation and scanner problems found during an actual EKS rollout. The commands use a Linux shell. Other Kubernetes providers use the same Helm installation, but require their own CSI storage and credential configuration; see [Cloud Kubernetes](cloud-kubernetes.md). **AKS and GKE runtime certification is on hold.**

**What is verified on the test EKS cluster:** token-based kubeconfig enrollment, application login, kube-bench execution **and a report visible in Dashboard**. This does **not** yet certify Kubesec, kube-hunter, Trivy or Falco on EKS.

## 1. Prepare the EKS cluster

You need Linux, `aws` CLI v2, `kubectl`, Helm 3, `gh` CLI and an existing EKS cluster running a Kubernetes version in the chart's declared range (currently 1.35–1.37). Use EC2 worker nodes for kube-bench node scans; Fargate-only clusters cannot supply host paths.

```bash
set -euo pipefail
export AWS_REGION=us-east-1
export EKS_CLUSTER=YOUR_EKS_CLUSTER_NAME
export NAMESPACE=m9sweeper-system

aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER"
kubectl config current-context
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get storageclass
kubectl get csidriver
```

**Storage prerequisite:** PostgreSQL and RabbitMQ need working persistent volumes. On standard EKS EC2 nodes, ensure `ebs.csi.aws.com` is installed, has suitable IAM permissions and has a compatible default StorageClass. `kubectl get csidriver ebs.csi.aws.com` must succeed. A StorageClass alone does not install a CSI driver. EKS Auto Mode uses a different EBS provisioner; verify the cluster's actual mode before changing anything. Never delete existing PVCs to fix scheduling.

### Why your PostgreSQL and RabbitMQ PVCs may stay Pending

If you see `pod has unbound immediate PersistentVolumeClaims`, run:

```bash
kubectl get storageclass
kubectl get csidriver
kubectl -n m9sweeper-system get pvc -o wide
kubectl -n m9sweeper-system describe pvc data-m9sweeper-postgresql-0
kubectl -n m9sweeper-system describe pvc rabbitmq-data-m9sweeper-rabbitmq-0
```

**Example observed on EKS:** a `gp2` class existed, but no class was marked `(default)`; both application PVCs had an empty StorageClass column and stayed Pending. The legacy `kubernetes.io/aws-ebs` gp2 provisioner was present alongside the modern EBS CSI driver `ebs.csi.aws.com`. This is not, by itself, proof that CSI is broken: check the PVC events.

For standard EKS EC2 node groups with `ebs.csi.aws.com`, create the dedicated `m9sweeper-gp3` class in the [beginner storage instructions](getting-started.md#step-3--verify-disk-storage-before-installing-m9sweeper). If **no default exists**, and you have authorization to change the cluster's default storage policy, mark it default:

```bash
kubectl annotate storageclass m9sweeper-gp3 \
  storageclass.kubernetes.io/is-default-class=true --overwrite
kubectl get storageclass
kubectl -n m9sweeper-system get pvc -w
```

Expected: new claims choose `m9sweeper-gp3`; eligible already-created PVCs without a specified `storageClassName` can also acquire the new default. Press Ctrl+C to stop watching. **An explicitly empty `storageClassName: ""` is different and is not retroactively changed.** Existing bound volumes must not be migrated or deleted casually. For EKS Auto Mode the provisioner is `ebs.csi.eks.amazonaws.com` instead; do not use the standard EKS CSI class.

**Node capacity prerequisite:** Check the available pod slots and the AZ for each existing PV. An EBS volume created in `us-east-1a` cannot attach to a node in `us-east-1b`. If a Pod stays Pending with `Too many pods` and `volume node affinity conflict`, add schedulable node capacity **in the PV's zone**, or select correct topology *before* provisioning new volumes.

```bash
kubectl get nodes -o wide
kubectl get pv -o wide
kubectl get events -A --sort-by=.lastTimestamp | tail -40
```

## 2. Download and configure m9sweeper

Follow [the main installation guide](installation.md) to create three private environment files and the private Helm values file. **Use the same RabbitMQ password in Dash and Trawler, and the same scanner API keys in bootstrap and scanner configuration.** Use `umask 077` and unique passwords.

```bash
umask 077
mkdir -p "$HOME/m9sweeper-install"
cd "$HOME/m9sweeper-install"
gh release download v0.1.2 --repo sm-joe/m9sweeper-modern --pattern 'm9sweeper-*.tgz'
helm show chart ./m9sweeper-0.1.2.tgz

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NAMESPACE" create secret generic m9-dash-env \
  --from-env-file=/secure/dash-runtime.env
kubectl -n "$NAMESPACE" create secret generic m9-init-env \
  --from-env-file=/secure/dash-bootstrap.env
kubectl -n "$NAMESPACE" create secret generic m9-trawler-env \
  --from-env-file=/secure/trawler-runtime.env
```

On an existing installation, **do not rerun** `create secret` or overwrite credentials. Confirm the Secrets exist first:

```bash
kubectl -n "$NAMESPACE" get secret m9-dash-env m9-init-env m9-trawler-env
```

Your private `/secure/m9sweeper-values.yaml` must contain:

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

## 3. Install and verify database initialization

```bash
helm upgrade --install m9sweeper ./m9sweeper-0.1.2.tgz \
  -n "$NAMESPACE" -f /secure/m9sweeper-values.yaml --timeout 15m

kubectl -n "$NAMESPACE" get pods,jobs,pvc -o wide
kubectl -n "$NAMESPACE" rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n "$NAMESPACE" rollout status deployment/m9sweeper-trawler --timeout=5m
```

Do not add `--wait` to the initial Helm install: the bootstrap Job must finish before normal readiness. **An active database with zero administrator rows is not a successful installation.** Check the `m9sweeper-dash-init` Job status and logs:

```bash
kubectl -n "$NAMESPACE" get jobs
kubectl -n "$NAMESPACE" logs job/m9sweeper-dash-init --all-containers=true --tail=100
kubectl -n "$NAMESPACE" exec m9sweeper-postgresql-0 -- \
  psql -U m9sweeper -d postgres -tAc 'SELECT count(*) FROM users;'
```

If your PostgreSQL username/database differ from the example, use those values. **Do not rerun seeding against a different database or reset the database.** If initialization failed, inspect its logs and repair the bootstrap Secret/environment before running a controlled initialization recovery.

Open the Dashboard:

```bash
kubectl -n "$NAMESPACE" port-forward svc/m9sweeper-dash 13000:3000
```

Visit `http://localhost:13000` and sign in with `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from your private bootstrap configuration. Port-forwarding is for operator access; scanner Jobs must use a Pod-reachable in-cluster endpoint or trusted ingress.

## 4. Add EKS using a self-contained kubeconfig

**Do not upload the `aws eks update-kubeconfig` file to v0.1.2:** it normally uses an `exec: aws` credential helper and the backend intentionally does not execute it. Native unattended cloud identity is a separate P0 feature.

The EKS-tested approach is a bootstrap Kubernetes service-account kubeconfig with a trusted CA and embedded token. **The example below grants broad privileges only during automatic onboarding**; it is not a normal scanning identity. Use it only in an approved test environment or with explicit security approval. Remove it once the dedicated `m9sweeper` scanner identity has been created and confirmed to work. The backend's current automatic workflow creates a separate long-lived token Secret and Kubernetes RBAC; evaluate token rotation and permissions before using it in production.

```bash
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: ServiceAccount
metadata:
  name: m9sweeper-bootstrap
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: m9sweeper-bootstrap-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: m9sweeper-bootstrap
    namespace: kube-system
---
apiVersion: v1
kind: Secret
metadata:
  name: m9sweeper-bootstrap-token
  namespace: kube-system
  annotations:
    kubernetes.io/service-account.name: m9sweeper-bootstrap
type: kubernetes.io/service-account-token
YAML

# This file contains a sensitive bearer token. Keep it outside the repository.
umask 077
KUBE_SERVER=$(kubectl config view --raw --flatten --minify -o jsonpath='{.clusters[0].cluster.server}')
KUBE_CA=$(kubectl config view --raw --flatten --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
TOKEN_B64=$(kubectl -n kube-system get secret m9sweeper-bootstrap-token -o jsonpath='{.data.token}')
test -n "$TOKEN_B64" || { echo 'Service-account token not yet populated' >&2; exit 1; }
TOKEN=$(printf '%s' "$TOKEN_B64" | base64 --decode)
cat > "$HOME/m9sweeper-install/eks-onboarding-kubeconfig.yaml" <<YAML
apiVersion: v1
kind: Config
clusters:
- name: eks-target
  cluster:
    server: "$KUBE_SERVER"
    certificate-authority-data: "$KUBE_CA"
contexts:
- name: eks-target
  context:
    cluster: eks-target
    user: m9sweeper-bootstrap
current-context: eks-target
users:
- name: m9sweeper-bootstrap
  user:
    token: "$TOKEN"
YAML
chmod 600 "$HOME/m9sweeper-install/eks-onboarding-kubeconfig.yaml"
unset TOKEN TOKEN_B64
```

In Dashboard **Add Cluster → Select Kubeconfig → select `eks-target` → Install Automatically**. Verify its namespace/pod inventory populates and the backend stores its own dedicated service-account connection before revoking bootstrap access:

```bash
kubectl -n "$NAMESPACE" get sa m9sweeper
kubectl -n "$NAMESPACE" get secret m9sweeper
kubectl auth can-i list pods --all-namespaces \
  --as=system:serviceaccount:"$NAMESPACE":m9sweeper
```

**Only after the dashboard inventory works without the bootstrap credential**, revoke and clean up the temporary broad-access bootstrap identity:

```bash
kubectl delete clusterrolebinding m9sweeper-bootstrap-binding
kubectl -n kube-system delete secret m9sweeper-bootstrap-token
kubectl -n kube-system delete serviceaccount m9sweeper-bootstrap
rm -f "$HOME/m9sweeper-install/eks-onboarding-kubeconfig.yaml"
```

If the application is installed in a different cluster than the target EKS, use `kubectl --context ...` explicitly for all commands and check the target API endpoint is reachable from the Dashboard Pod. Do not disable TLS verification.

## 5. Run kube-bench and see its EKS report

**Verified on EKS:** the scan **and dashboard report** work after fixing two release issues:

- Published `kube-bench-0.1.2.tgz` has a one-shot EKS Job hardcoded to the invalid `eks-1.0` benchmark. Use the corrected **source chart from main** until a newly signed release includes the correction.
- The standalone chart does **not** automatically create `m9sweeper-kube-bench-api-key`. Reuse the *existing bootstrap* `m9-init-env` Secret directly. Its key is `KUBE_BENCH_API_KEY`, not `api-key` or `apiKey`.

```bash
git clone https://github.com/sm-joe/m9sweeper-modern.git "$HOME/m9sweeper-modern"
cd "$HOME/m9sweeper-modern"

# Replace 1 with the actual Dashboard cluster ID.
export CLUSTER_ID=1
kubectl -n "$NAMESPACE" get secret m9-init-env \
  -o go-template='{{if index .data "KUBE_BENCH_API_KEY"}}Scanner key present{{else}}Scanner key missing{{end}}{{"\n"}}'

helm template kube-bench platform/manifests/charts/kube-bench \
  --set provider=eks --set cronjob.enabled=false \
  | grep -- '--benchmark'

# This installs a one-time Job, not a scheduled CronJob.
helm upgrade --install kube-bench ./platform/manifests/charts/kube-bench \
  -n "$NAMESPACE" \
  --set-string provider=eks \
  --set cronjob.enabled=false \
  --set-string eks.benchmark=eks-1.2.0 \
  --set-string reportAuth.existingSecret=m9-init-env \
  --set-string reportAuth.keyName=KUBE_BENCH_API_KEY \
  --set-string "reportsurl=http://m9sweeper-dash.$NAMESPACE.svc.cluster.local:3000/api/kube-bench/$CLUSTER_ID"

kubectl -n "$NAMESPACE" get jobs,pods
kubectl -n "$NAMESPACE" logs job/kube-bench --all-containers=true --tail=100
```

If the `kube-bench` release has **no deployed revision**, inspect `helm list -a -n "$NAMESPACE"`; uninstall only a failed standalone `kube-bench` release if necessary. Do not uninstall the main m9sweeper chart, delete volumes, rotate keys or run a new bootstrap. Check that the report appears in the correct Dashboard cluster; a `Completed` Job alone is insufficient. This is worker-node assessment, not full managed EKS control-plane CIS coverage.

## 6. Kubesec: scan actual pods

**Problem observed:** namespaces appear in the selector, but selecting them shows "No pods." The backend/frontend source has been updated to pass `clusterId`, normalize namespace parameters and display real Kubernetes API errors instead of silently presenting an empty list. **The new frontend and backend images must be deployed for the UI fix to take effect**; changing Helm values alone does not update old application code.

```bash
kubectl --context "$(kubectl config current-context)" get pods -A
kubectl auth can-i list pods --all-namespaces \
  --as=system:serviceaccount:"$NAMESPACE":m9sweeper
kubectl -n "$NAMESPACE" logs deployment/m9sweeper-dash --since=10m --tail=100
```

If Kubernetes contains pods but the dashboard still says none, check that the connected **target cluster** is the one you just inspected, reload the Kubesec page, select one namespace with pods, and inspect any API error message. Pod-file upload is a separate scan path and does not prove cluster pod listing works.

## 7. kube-hunter: configure a trusted HTTPS report endpoint

**Problem observed:** `reportRelay.targetUrl must be HTTPS`. This is deliberate: the relay sends the scanner API key in the `X-API-Key` header and must not transmit it over ordinary HTTP. The local port-forward URL and `http://m9sweeper-dash...svc` are **not valid HTTPS relay destinations**. A bare `/api/kubehunter/hunter/1` path is not valid either.

**One-time prerequisite:** configure an existing ingress controller, a DNS name reachable from scanner Pods, and a trusted TLS certificate. For nginx Ingress with a pre-created TLS Secret, use this example (replace hostname and certificate paths):

```bash
export DASH_HOST=security.example.com
kubectl -n "$NAMESPACE" create secret tls m9sweeper-dash-tls \
  --cert=/secure/fullchain.pem --key=/secure/privkey.pem
```

Add to the same private `/secure/m9sweeper-values.yaml` used to install m9sweeper:

```yaml
dash:
  scannerReportIngestionUrl: https://security.example.com
  ingress:
    hosts:
      - security.example.com
    k8sIngress:
      enabled: true
      annotations:
        kubernetes.io/ingress.class: nginx
      tls:
        - hosts:
            - security.example.com
          secretName: m9sweeper-dash-tls
```

**Merge**, do not replace, your existing `dash.existingSecret` and `dash.init.existingSecret` values. An ingress controller and a real DNS record pointing to it must already exist. If your environment uses AWS ALB/ACM or another TLS gateway, configure that provider's ingress instead; the requirement is a reachable **trusted HTTPS** endpoint.

```bash
cd "$HOME/m9sweeper-install"
helm upgrade m9sweeper ./m9sweeper-0.1.2.tgz \
  -n "$NAMESPACE" -f /secure/m9sweeper-values.yaml --timeout 15m

# TLS must validate; do not use curl -k.
curl --fail --silent --show-error "https://$DASH_HOST/api/info"
```

Then use the existing bootstrap scanner key; no extra `m9sweeper-kube-hunter-relay-auth` Secret is necessary:

```bash
cd "$HOME/m9sweeper-modern"
kubectl -n "$NAMESPACE" get secret m9-init-env \
  -o go-template='{{if index .data "KUBE_HUNTER_API_KEY"}}Scanner key present{{else}}Scanner key missing{{end}}{{"\n"}}'

helm upgrade --install kube-hunter ./platform/manifests/charts/kube-hunter \
  -n "$NAMESPACE" \
  --set cronjob.enabled=false \
  --set reportRelay.enabled=true \
  --set-string reportRelay.existingSecret=m9-init-env \
  --set-string reportRelay.secretKey=KUBE_HUNTER_API_KEY \
  --set-string "reportRelay.targetUrl=https://$DASH_HOST/api/kubehunter/hunter/$CLUSTER_ID"

kubectl -n "$NAMESPACE" get jobs,pods
kubectl -n "$NAMESPACE" logs job/kube-hunter -c kube-hunter --tail=100
```

A successful kube-hunter acceptance requires a **new, authenticated report displayed under the correct EKS cluster**, not merely a running Job. Run active penetration scans only against clusters you administer. **Without trusted HTTPS, leave kube-hunter report relay disabled** rather than bypassing TLS checks.

## 8. Final EKS checklist

- [ ] PostgreSQL and RabbitMQ PVCs Bound, node capacity and PV AZs compatible
- [ ] Bootstrap Job successful; administrator can sign in
- [x] EKS registration works with self-contained service-account kubeconfig (test cluster)
- [x] kube-bench EKS scan and Dashboard report visible (test cluster)
- [ ] Kubesec Pod selector lists real pods and generates an assessment on the updated application images
- [ ] kube-hunter authenticated HTTPS report visible
- [ ] Trivy image scan works end-to-end (queue → Java Trawler → DB → Angular)
- [ ] Falco sensor produces a **new** event visible in Dashboard
- [ ] Credentials are scoped and rotated, cluster isolation confirmed, upgrades/recovery tested

The completed tests above are based on the operator's reported EKS results. Do not claim general EKS certification, or AKS/GKE acceptance, until corresponding automated tests and independently captured runtime evidence exist.
