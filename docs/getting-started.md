# Start here: install m9sweeper on Kubernetes

This guide is for people who know little or no Kubernetes. You do **not** need to write Kubernetes application code. Follow the steps in order, using a **Linux terminal** (Bash). Commands are intended to be copied a block at a time. This guide assumes you already have a Kubernetes cluster; it does not create a paid AWS/Azure/Google cluster for you.

**Use this page first**, then follow the [Amazon EKS instructions](eks-installation.md) if your cluster runs on AWS. The same application Helm installation applies to other clusters, but the storage and authentication setup depend on the provider. See [Cloud Kubernetes](cloud-kubernetes.md) for AKS, GKE and other clusters. EKS is the current verified cloud environment; AKS/GKE acceptance is on hold.

## Before you begin: five concepts in plain English

| Term | Meaning | What you will do |
| --- | --- | --- |
| **Cluster** | Computers running your Kubernetes workloads | Connect to the correct cluster |
| **Node** | One machine in that cluster | Check that at least one worker can run your Pods |
| **Pod** | A running application container or set of containers | Watch m9sweeper Pods become Ready |
| **Namespace** | A folder-like grouping for cluster resources | Install into `m9sweeper-system` |
| **StorageClass / PVC** | The disk type and an application's request for a disk | Ensure PostgreSQL and RabbitMQ can save data |
| **Secret** | A Kubernetes resource holding sensitive values | Create the three application credential resources |
| **Helm** | A tool that installs packaged Kubernetes applications | Install the `m9sweeper` chart |

**Where do I type these commands?** In a Linux shell on the computer where you installed `kubectl`, `helm` and `gh`. You do not need to log in to each EKS node. The `$HOME` and `/secure` directories refer to that local computer, not the Kubernetes cluster.

**What costs money?** EKS/AKS/GKE nodes, storage volumes, network load balancers, external ingress and cloud resources may incur provider charges. Deleting an application does not always remove retained volumes.

**Credentials:** Use the [installation guide's release-provided credential generator](installation.md#step-2--configure) for new installs. It creates matching Secrets for Dash, the Java Trawler, and RabbitMQ; never copy example passwords verbatim. On upgrades, preserve existing Secrets and PVCs.

**Safety rules:** Do not post kubeconfigs, bearer tokens, API keys or private `.env` files in GitHub issues. Don't delete a database PVC or run `helm uninstall m9sweeper` as a troubleshooting step. A command using `--context` or `kubectl config current-context` determines which cluster receives your changes.

## Step 1 — Check the required programs

Run:

```bash
kubectl version --client
helm version --short
gh --version
openssl version
```

You should see version information for every command. If you see `command not found`, install that tool first:

- `kubectl`: [official Kubernetes client installation](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/)
- `helm`: [official Helm installation](https://helm.sh/docs/intro/install/)
- `gh`: [GitHub CLI](https://cli.github.com/)
- `aws`: [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) — **EKS only**
- `az`: [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux) — **AKS only**
- `gcloud`: [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) — **GKE only**

To check an EKS cluster, run the following after `aws configure` or your organization's AWS SSO login:

```bash
aws sts get-caller-identity
aws eks list-clusters --region us-east-1
```

Expected: the current AWS account/role and a list of cluster names. If those commands fail with expired or missing credentials, resolve your AWS login first. **Do not store AWS keys in this project's environment files.**

## Step 2 — Connect to the correct Kubernetes cluster

For **EKS**, set the actual name and region, then import its connection:

```bash
export AWS_REGION=us-east-1
export EKS_CLUSTER=YOUR_CLUSTER_NAME
aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER"
```

For other providers, follow their `az aks get-credentials` or `gcloud container clusters get-credentials` commands in [Cloud Kubernetes](cloud-kubernetes.md).

**For every provider**, verify:

```bash
kubectl config current-context
kubectl cluster-info
kubectl get nodes -o wide
```

Expected: your intended cluster context and one or more nodes with status `Ready`. If there are no Ready nodes, do not proceed: your cluster administrator must repair node registration/capacity first.

**Two different kubeconfigs:** These commands configure *your local terminal*. A standard EKS/AKS/GKE cloud CLI kubeconfig usually has a credential `exec` plugin that the released m9sweeper backend does not execute. To register a target EKS cluster inside the Dashboard, follow the separate, tested, self-contained kubeconfig steps in [EKS installation — Add cluster](eks-installation.md).

## Step 3 — Verify disk storage **before** installing m9sweeper

PostgreSQL stores users, images and scan reports; RabbitMQ stores work waiting for the scanner. Both need persistent disks. Kubernetes cannot start them if their PVCs cannot obtain storage.

Run:

```bash
kubectl get storageclass
kubectl get csidriver
kubectl get nodes -L topology.kubernetes.io/zone
```

**What to look for:**

- A StorageClass with `(default)` after its name. A class without `(default)` may exist but will not automatically be selected when the application's PVC doesn't specify one.
- On normal EKS EC2 node groups, the EBS CSI driver is `ebs.csi.aws.com`. On EKS Auto Mode, it is **different**: `ebs.csi.eks.amazonaws.com`.
- Every worker node has a zone such as `us-east-1a` or `us-east-1b`.

### If you use standard EKS with EBS CSI, set up a default gp3 class

Only do this if you administer the cluster and the `ebs.csi.aws.com` driver exists. **Do not use this example for EKS Auto Mode.** Existing StorageClasses are preserved.

```bash
kubectl get csidriver ebs.csi.aws.com

kubectl apply -f - <<'YAML'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: m9sweeper-gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
YAML

kubectl get storageclass
```

If no StorageClass is currently marked `(default)` and your cluster administrator approves this choice:

```bash
kubectl annotate storageclass m9sweeper-gp3 \
  storageclass.kubernetes.io/is-default-class=true --overwrite
kubectl get storageclass
```

Expected: `m9sweeper-gp3 (default)`, provider `ebs.csi.aws.com`.

**Why mark a default?** The existing m9sweeper PostgreSQL chart does not specify `storageClassName` in its claim template, and RabbitMQ similarly uses the cluster default. Without a default, new PVCs can stay `Pending` with a blank `STORAGECLASS` column. A default can be assigned retroactively to eligible unbound PVCs that omitted `storageClassName` entirely. It **will not** repair an explicitly empty `storageClassName: ""` or an existing bound volume. <https://kubernetes.io/docs/concepts/storage/storage-classes/>

**If another StorageClass is already the default**, don't silently change cluster-wide policy; consult your administrator before switching. For EKS Auto Mode use AWS's documented storage class with `ebs.csi.eks.amazonaws.com`, not this one.

If `ebs.csi.aws.com` is missing, follow [AWS EBS CSI add-on installation](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) including its IAM permissions. **Do not merely create a StorageClass and assume the driver exists.**

### What if the PVCs are already Pending?

This is the failure observed during the EKS installation:

```text
0/2 nodes are available: pod has unbound immediate PersistentVolumeClaims
data-m9sweeper-postgresql-0          Pending   STORAGECLASS <blank>
rabbitmq-data-m9sweeper-rabbitmq-0   Pending   STORAGECLASS <blank>
```

Check:

```bash
kubectl -n m9sweeper-system get pvc -o wide
kubectl -n m9sweeper-system describe pvc data-m9sweeper-postgresql-0
kubectl -n m9sweeper-system describe pvc rabbitmq-data-m9sweeper-rabbitmq-0
```

If a StorageClass was missing, configuring a correct default **may** allow existing omitted-class PVCs to bind. Run `kubectl -n m9sweeper-system get pvc -w` to watch. Press **Ctrl+C** to stop watching. Do **not** delete either PVC, assume a patch succeeded, or reinstall the release. If the claim still stays Pending, its `Events` explain the real blocker (CSI IAM, defaulting, pod capacity, or AZ). Share **redacted** events when seeking support.

## Step 4 — Create private installation credentials

This is a new installation step only. **Existing installations:** skip resource creation and check Secrets with `kubectl -n m9sweeper-system get secret m9-dash-env m9-init-env m9-trawler-env`; never overwrite existing values casually.

The credentials are local private files, not YAML or text to commit to Git. Download the release helper (this is intentionally separate from creating existing Kubernetes Secrets):

```bash
umask 077
mkdir -p "$HOME/m9sweeper-install"
cd "$HOME/m9sweeper-install"
gh release download v0.1.2 --repo sm-joe/m9sweeper-modern --pattern 'create-install-secrets.py'
export M9_PRIVATE_DIR="$HOME/.config/m9sweeper"
export M9_ADMIN_EMAIL="your-real-admin-email@example.com"
python3 ./create-install-secrets.py --output-dir "$M9_PRIVATE_DIR"
```

Replace the email address before running. The helper creates **all three** correctly named, synchronized, 0600-protected files; it refuses to overwrite an existing installation. The random administrator password is in your locally protected bootstrap file.

Create the namespace and Secrets **only for a new installation**:

```bash
export NAMESPACE=m9sweeper-system
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NAMESPACE" create secret generic m9-dash-env --from-env-file="$M9_PRIVATE_DIR/dash-runtime.env"
kubectl -n "$NAMESPACE" create secret generic m9-init-env --from-env-file="$M9_PRIVATE_DIR/dash-bootstrap.env"
kubectl -n "$NAMESPACE" create secret generic m9-trawler-env --from-env-file="$M9_PRIVATE_DIR/trawler-runtime.env"
kubectl -n "$NAMESPACE" get secret m9-dash-env m9-init-env m9-trawler-env
```

Expected: three Kubernetes Secrets are listed. Their contents are not printed.

## Step 5 — Download and install the application

```bash
mkdir -p "$HOME/m9sweeper-install"
cd "$HOME/m9sweeper-install"
gh release download v0.1.2 --repo sm-joe/m9sweeper-modern --pattern 'm9sweeper-*.tgz'
ls -lh m9sweeper-*.tgz
```

Create `$M9_PRIVATE_DIR/m9sweeper-values.yaml`:

```bash
if [ -e "$M9_PRIVATE_DIR/m9sweeper-values.yaml" ]; then
  echo "Keeping existing private Helm values"
else
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
fi
```

If you already have a values file, **edit and preserve it** rather than replacing custom settings.

Install (do not pass `--wait` on the first installation because the initialization Job needs to run):

```bash
helm upgrade --install m9sweeper ./m9sweeper-0.1.2.tgz \
  --namespace m9sweeper-system \
  --values "$M9_PRIVATE_DIR/m9sweeper-values.yaml" --timeout 15m
```

Expected: Helm prints a release summary. **Helm success is not yet proof the database is initialized or the scanners work.**

## Step 6 — Check whether it actually started

```bash
kubectl -n m9sweeper-system get pods,jobs,pvc
kubectl -n m9sweeper-system get events --sort-by=.lastTimestamp | tail -40
```

What the output means:

| STATUS | What it tells you | What to do |
| --- | --- | --- |
| `Running` with containers `READY` | Pod started | Continue checking application |
| `Completed` Job | Job finished successfully | Verify the init Job and administrator |
| `Pending` Pod or PVC | Waiting for nodes/storage | Review Step 3 and `describe pvc` |
| `ImagePullBackOff` | Cannot pull image | Check registry access and image name |
| `CrashLoopBackOff` | Container repeatedly crashes | Read Pod logs; check Secrets and database |
| `0/2 nodes are available` | No eligible node | Check capacity, taints and volume AZ |

Then:

```bash
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n m9sweeper-system rollout status deployment/m9sweeper-trawler --timeout=5m
kubectl -n m9sweeper-system get jobs
```

Find the init Job and check it finished. If you have a `m9sweeper-dash-init` Job:

```bash
kubectl -n m9sweeper-system logs job/m9sweeper-dash-init --all-containers=true --tail=100
```

If admin login fails with 401 and no users were seeded, it is a bootstrap problem—not a reason to delete PostgreSQL. See [EKS installation — Verify initialization](eks-installation.md) for more detail.

## Step 7 — Open the web dashboard

From the same Linux terminal:

```bash
kubectl -n m9sweeper-system port-forward svc/m9sweeper-dash 13000:3000
```

Leave this terminal open. On the **same machine**, open `http://localhost:13000` in a browser. Sign in with the `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` you put in your private bootstrap file. Press **Ctrl+C** to stop the port-forward.

If your browser is on another computer, `localhost` does not refer to the Linux machine; use your organization's approved HTTPS ingress or secure remote access procedure. Do not make an unsecured public dashboard.

## Step 8 — Connect a cluster and run security scans

The operator kubeconfig in Step 2 and the kubeconfig used for unattended Dashboard scanning are **not interchangeable** in the published release. For EKS, follow [Add EKS using a self-contained kubeconfig](eks-installation.md#4-add-eks-using-a-self-contained-kubeconfig). That guide shows the currently working bootstrap flow and removal of temporary broad permissions.

After a registered cluster appears in Dashboard, use this order:

1. **Inventory:** check namespaces and actual pods populate.
2. **kube-bench (EKS EC2 nodes):** follow [the tested kube-bench command](eks-installation.md#5-run-kube-bench-and-see-its-eks-report). The v0.1.2 one-time kube-bench archive has a known invalid benchmark; use corrected source. The scanner key lives in existing Secret `m9-init-env`.
3. **Kubesec:** select a real pod or upload a Pod manifest. The namespace-selector fix requires updated application images, not only changed Helm values.
4. **kube-hunter:** enable the header-authenticated relay only with a reachable **trusted HTTPS** endpoint. Follow [the HTTPS setup](eks-installation.md#7-kube-hunter-configure-a-trusted-https-report-endpoint). Do not bypass certificate verification.
5. **Trivy/Falco:** follow the source integration acceptance documentation; do not assume a Job started means an end-to-end report was saved.

For a typical user, the first success milestone is **sign in + see a cluster + see actual kube-bench results**. The full EKS scanner acceptance includes the additional tools listed in the [EKS checklist](eks-installation.md#8-final-eks-checklist).

## If something fails: copy these safe diagnostics

```bash
kubectl config current-context
kubectl get storageclass
kubectl get csidriver
kubectl get nodes -L topology.kubernetes.io/zone
kubectl -n m9sweeper-system get pods,jobs,pvc -o wide
kubectl -n m9sweeper-system get events --sort-by=.lastTimestamp | tail -50
helm status m9sweeper -n m9sweeper-system
```

Share status output, relevant error messages, and **redacted** logs in a GitHub issue. Never paste `kubectl get secret -o yaml`, the kubeconfig token, or complete `.env` contents. See [Security policy](../SECURITY.md) for responsible disclosure.

## Important limitations

- The existing v0.1.2 release is immutable. Source fixes do not change a running application until new images and charts are built and installed.
- Successful EKS kube-bench results have been observed in the Dashboard. The other scanner integrations still need actual EKS runtime verification.
- AKS and GKE prerequisites are documented; their end-to-end acceptance is paused.
- Cloud IAM, Kubernetes RBAC, service-account token rotation, TLS certificates and private API networking still require cluster-specific decisions. The guide does not grant unrestricted access automatically.
