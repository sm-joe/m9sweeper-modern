# Cloud Kubernetes deployment and acceptance

**EKS is the active validation priority:** see [the full EKS installation and scanner walkthrough](eks-installation.md). AKS/GKE acceptance is intentionally deferred; the provider sections below are infrastructure preparation guidance, not completed runtime tests.

[Main installation](installation.md) · [Project README](../README.md)

This guide targets **Linux** administration environments. The Helm release deploys on Kubernetes, not on the administration host. The installation is **not certified** on Amazon EKS, Azure AKS, or Google GKE until a real cluster completes all acceptance steps below. A successful Helm upgrade, green CI job, or Kind scan is not sufficient.

## Supported infrastructure and identity boundaries

| Provider | Kubernetes control plane | Storage for bundled PostgreSQL/RabbitMQ | Operator kubeconfig | Current m9sweeper cluster onboarding |
| --- | --- | --- | --- | --- |
| Amazon EKS (EC2 nodes) | AWS-managed | EBS CSI, same-zone node capacity | `aws eks update-kubeconfig` | EKS exec credentials require a provider workload-identity adapter; do **not** execute uploaded commands |
| Azure AKS | Azure-managed | Azure Disk CSI and supported StorageClass | `az aks get-credentials` | Azure CLI/kubelogin exec credentials require a provider identity adapter |
| Google GKE (Standard) | Google-managed | Compute Engine persistent disk CSI | `gcloud container clusters get-credentials` | GKE exec credentials require a provider identity adapter |
| Generic Kubernetes | Operator-managed | Any tested CSI RWO class | Kubeconfig with embedded CA and supported credentials | Static token/certificate kubeconfigs supported; do not disable TLS verification |

**Important:** Current published v0.1.2 supports kubeconfig-based automatic service-account provisioning only when the supplied kubeconfig contains working credentials directly usable by the backend. Ordinary workstation cloud CLI kubeconfigs are **not** end-to-end supported in that release. Do not upload arbitrary executable kubeconfig plugins to the server and do not bundle cloud CLI tools and workstation credentials into the container. Native short-lived cloud workload identity is a release-blocking development item, not a configuration workaround. Never claim success based solely on client-side `kubectl` access.

For each provider, separate (1) the credentials used by the operator to administer the cluster from (2) the workload identity used by the m9sweeper backend to access the Kubernetes API. An identity authorized for cloud APIs does not automatically have Kubernetes RBAC. Scope cluster permissions to the inventory/scan operations actually required; admission webhook installation and Gatekeeper policy management require explicit additional approval.

## Shared installation requirements

1. Check a supported Kubernetes version against `helm show chart m9sweeper-*.tgz` (the chart currently declares `>=1.35.0-0 <1.38.0-0`).
2. Confirm you have enough schedulable worker-node pod slots **in the availability zones selected for stateful EBS/Azure Disk/PD volumes**. A second node in the wrong zone does not resolve existing PV affinity.
3. Install/enable the provider CSI driver, verify a default `ReadWriteOnce` StorageClass, and verify the provisioner is healthy.
4. Use a trusted Kubernetes API CA. Control-plane access from the administration host does **not** prove the dashboard Pod can reach the API endpoint.
5. Provide matching secrets for PostgreSQL, RabbitMQ, scanner credentials and the bootstrap administrator as documented in [installation.md](installation.md).
6. Run the bundled database initialization Job, verify persisted administrator and scanner accounts, and confirm the scan/report path with a real test cluster.

Common Linux shell preflight:

```bash
set -euo pipefail
kubectl version --client
kubectl cluster-info
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get storageclass
kubectl get csidriver
kubectl get pods -A -o wide
```

Do not uninstall a failed release or delete existing PersistentVolumeClaims as an initial troubleshooting step. Stateful volumes may contain production data.

## Amazon EKS (EC2 managed node groups)

The detailed, step-by-step installation and known-issue fixes are in [EKS installation](eks-installation.md). On the test cluster, kube-bench reports are confirmed visible in Dashboard; Kubesec and kube-hunter are still under repair/acceptance.

Prerequisites: an EKS cluster, authorized IAM identity, `aws` CLI v2, `kubectl`, Helm 3, nodes of sufficient size, and Amazon EBS CSI with its recommended least-privilege IAM configuration.

```bash
export AWS_REGION=us-east-1
export EKS_CLUSTER=replace-with-cluster-name
aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER"
aws eks describe-cluster --name "$EKS_CLUSTER" --region "$AWS_REGION" \
  --query 'cluster.{status:status,version:version,endpoint:endpoint,computeConfig:computeConfig}'
aws eks describe-addon --cluster-name "$EKS_CLUSTER" \
  --addon-name aws-ebs-csi-driver --region "$AWS_REGION"
kubectl get csidriver ebs.csi.aws.com
kubectl get storageclass
kubectl get nodes -L topology.kubernetes.io/zone
```

If the EBS CSI add-on does not exist, configure its IAM role through EKS Pod Identity or IRSA, then install the managed `aws-ebs-csi-driver` add-on. A StorageClass referencing `ebs.csi.aws.com` does not install the CSI controller. EKS Auto Mode instead uses `ebs.csi.eks.amazonaws.com`; never mix the drivers/provisioners. EBS volumes cannot move across availability zones.

```bash
kubectl -n m9sweeper-system get pvc -o wide
kubectl -n m9sweeper-system describe pod m9sweeper-postgresql-0
kubectl -n m9sweeper-system describe pod m9sweeper-rabbitmq-0
```

For real EKS node CIS assessment use `provider=eks` with the standalone kube-bench chart as described in [installation.md](installation.md). EKS Fargate cannot expose EC2 worker host paths. A kube-bench worker scan does **not** assess the managed control plane or establish full CIS compliance.

**Identity:** The `exec: aws eks get-token` block generated by the AWS CLI is intended for an operator with AWS credentials. The released backend does not implement automatic EKS exec credential acquisition. The target architecture is a backend IAM workload identity (IRSA or Pod Identity) plus audited EKS token signing/refresh and Kubernetes RBAC checks. Do not put long-lived AWS keys into uploaded kubeconfigs.

## Azure AKS

Prerequisites: an AKS cluster, authorized `az` CLI identity, `kubectl`, Helm and Azure Disk CSI driver. Azure identity-aware kubeconfigs may rely on `kubelogin`; that is a workstation plugin, not a container authentication strategy.

```bash
export AZ_SUBSCRIPTION=replace-with-subscription-id
export AKS_RESOURCE_GROUP=replace-with-resource-group
export AKS_CLUSTER=replace-with-cluster-name
az account set --subscription "$AZ_SUBSCRIPTION"
az aks get-credentials --resource-group "$AKS_RESOURCE_GROUP" \
  --name "$AKS_CLUSTER"
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get csidriver
kubectl get storageclass
kubectl get pods -A
```

For bundled stateful workloads, use a working Azure Disk CSI-backed RWO class with suitable topology and enough node pod capacity. Validate that provisioned PV affinity matches a node with available capacity. Network-restricted AKS clusters require explicit control-plane connectivity from the m9sweeper Pods.

**Identity:** AKS Entra ID/kubelogin tokens need a refreshing Azure workload identity adapter and Kubernetes authorization. This is not yet implemented in the published release; do not bypass the identity boundary by uploading a developer's cloud credentials. Host-level kube-bench controls may not apply to managed nodes or restricted node pools.

## Google GKE (Standard)

Prerequisites: a GKE Standard cluster, `gcloud`, `gke-gcloud-auth-plugin`, `kubectl`, Helm and the Compute Engine persistent disk CSI driver.

```bash
export GOOGLE_CLOUD_PROJECT=replace-with-project-id
export GKE_CLUSTER=replace-with-cluster-name
export GKE_LOCATION=us-central1
gcloud config set project "$GOOGLE_CLOUD_PROJECT"
gcloud container clusters get-credentials "$GKE_CLUSTER" \
  --location "$GKE_LOCATION" --project "$GOOGLE_CLOUD_PROJECT"
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get csidriver
kubectl get storageclass
kubectl get pods -A
```

Verify the GCE PD CSI provisioner (typically `pd.csi.storage.gke.io`) and default StorageClass; for regional/zonal persistent disks ensure a compatible node placement. GKE Autopilot has stronger workload/host-access restrictions; do not assume host-mounted security scanners or privileged DaemonSets can run there.

**Identity:** Kubeconfig auth plugins require a Workload Identity Federation for GKE / Google credentials adapter plus Kubernetes RBAC. The released backend does not yet acquire and refresh Google cloud access tokens natively.

## Acceptance before public promotion

```bash
helm status m9sweeper -n m9sweeper-system
kubectl -n m9sweeper-system get jobs,pods,pvc -o wide
kubectl -n m9sweeper-system get events --sort-by=.lastTimestamp
kubectl -n m9sweeper-system rollout status statefulset/m9sweeper-postgresql --timeout=5m
kubectl -n m9sweeper-system rollout status statefulset/m9sweeper-rabbitmq --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
```

Then verify, and record redacted evidence of:

- The administrator exists in PostgreSQL and can sign in, and the initialization Job has **completed successfully**.
- A provider-native kubeconfig can be uploaded without copying token values or running arbitrary client commands inside the server.
- Tokens renew after expiration, least-privilege Kubernetes RBAC is enforced, and 401/403/TLS/DNS errors are reported precisely.
- An actual target cluster is enrolled; namespaces, pods and images sync across the correct tenant boundary.
- Trivy results traverse queue → worker → PostgreSQL → dashboard, including failure/retry cases.
- Cloud-appropriate node CIS scans run where supported and their report appears on the correct cluster; unsupported managed control-plane controls are reported as not assessed.
- Install, upgrade, rollback and PostgreSQL recovery are tested without losing persisted findings.

Track EKS, AKS and GKE evidence independently; a single green Kind job must not mark all providers as passed.
