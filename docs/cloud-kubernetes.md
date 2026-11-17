# Managed Kubernetes: EKS, AKS and GKE

The m9sweeper-modern Helm chart can deploy to compatible Kubernetes clusters. Each cloud platform has different **persistent storage, workload identity and Kubernetes API authentication** requirements. This guide uses Linux/bash commands and does not presume a workstation kubeconfig will work inside the Dashboard Pod.

**Tested integration:** The project operator confirmed EKS setup acceptance on 17 November 2026, including Trivy/ECR, kube-bench, Kubesec, Falco and kube-hunter report rendering. AKS and GKE require separate runtime verification.

## Shared preflight

```bash
set -euo pipefail
kubectl config current-context
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get csidriver
kubectl get storageclass
kubectl get pods -A -o wide
```

Use a supported Kubernetes version in the range declared by the **current published chart** (v0.1.0: 1.35–1.37), Helm 3, and persistent StorageClasses suitable for both the PostgreSQL and RabbitMQ workloads. Local `kubectl` access proves only that *your terminal* can reach the Kubernetes API, not that the Dashboard Pod has authorized, renewable credentials.

## Provider differences

| Provider | Persistent volumes | Operator access | Dashboard identity consideration |
| --- | --- | --- | --- |
| Amazon EKS | EBS CSI; same-zone node availability | `aws eks update-kubeconfig` | API credentials usable inside backend; Trawler Pod Identity for ECR |
| Azure AKS | Azure Disk CSI and topology | `az aks get-credentials` | Backend support for Azure identity/token refresh must be validated |
| Google GKE | Compute Engine persistent disk CSI | `gcloud container clusters get-credentials` | Backend support for GKE identity/token refresh must be validated |

Cloud-managed Kubernetes nodes may restrict privileged workloads or host mounts. In particular, kube-bench worker-node and Falco runtime checks require suitable node support and permissions.

## Amazon EKS

```bash
export AWS_REGION=us-east-1
read -r -p 'EKS cluster: ' EKS_CLUSTER
aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER"
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get csidriver ebs.csi.aws.com
kubectl get storageclass
```

The [EKS installation guide](eks-installation.md) includes detailed EBS storage checks, role separation, token-based enrollment, Trawler Pod Identity for private ECR, and scanner-specific report acceptance including private HTTPS kube-hunter.

EKS Auto Mode uses a separate EBS CSI provisioner. Verify the actual cluster architecture before installing or modifying the storage class. Keep the cluster API permissions scoped to inventory and scanner operations. An AWS IAM role that can read ECR does not automatically grant Kubernetes RBAC permissions.

## Azure AKS

```bash
read -r -p 'Azure subscription ID: ' AZ_SUBSCRIPTION
read -r -p 'AKS resource group: ' AKS_RESOURCE_GROUP
read -r -p 'AKS cluster: ' AKS_CLUSTER
az account set --subscription "$AZ_SUBSCRIPTION"
az aks get-credentials --resource-group "$AKS_RESOURCE_GROUP" --name "$AKS_CLUSTER"
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get csidriver
kubectl get storageclass
```

Confirm a working Azure Disk CSI-backed `ReadWriteOnce` class and node capacity in the PV availability zone. AKS clusters using Entra ID may include `kubelogin`/exec plugins in workstation kubeconfigs. Do not upload arbitrary command execution hooks or your local cloud credentials into the server. Native backend identity acquisition and refresh require their own verification.

## Google GKE

```bash
read -r -p 'Google Cloud project: ' GOOGLE_CLOUD_PROJECT
read -r -p 'GKE cluster: ' GKE_CLUSTER
read -r -p 'GKE location (region or zone): ' GKE_LOCATION
gcloud config set project "$GOOGLE_CLOUD_PROJECT"
gcloud container clusters get-credentials "$GKE_CLUSTER" \
  --location "$GKE_LOCATION" --project "$GOOGLE_CLOUD_PROJECT"
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get csidriver
kubectl get storageclass
```

Check the persistent-disk CSI provisioner and PV node affinity. GKE Auth Plugin credentials in a local kubeconfig do not automatically transfer to m9sweeper Pods; use an appropriate backend identity mechanism and confirm RBAC. Autopilot workload restrictions can prevent host-based scanners from running.

## Acceptance for a new cloud installation

Before recording acceptance, collect real runtime evidence of:

1. Bound persistent volumes, successful bootstrap and a working Dashboard login.
2. Authorized and persistent cluster inventory synchronization without manual CLI execution.
3. Queue consumer connectivity and real Trivy scan findings persisted in PostgreSQL and shown in the UI.
4. Successful cloud image registry authentication for any private images under test.
5. Applicable kube-bench, Kubesec, kube-hunter and Falco findings visible in the correct cluster.
6. Correct access control, failure handling and upgrade/recovery behavior without replacing retained credentials or state.

CI, a green Helm command and the EKS operator's confirmation do **not** establish AKS/GKE acceptance. Avoid blanket compatibility claims until each provider is verified with actual workloads and scanner results.

[Back to README](../README.md) · [Install](installation.md) · [EKS guide](eks-installation.md)
