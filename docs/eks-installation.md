# Amazon EKS installation and scanner acceptance

Deploy m9sweeper-modern on **Amazon EKS**, connect a cluster, and verify its integrated scanners. This guide uses **Linux/bash** throughout. Start with [Installation](installation.md) for shared Helm setup and Secret generation.

**Acceptance:** On **17 November 2026**, the project operator confirmed that EKS installation, cluster inventory, Trivy/ECR, kube-bench, Kubesec, Falco and kube-hunter report display were working on the tested EKS setup. This is operator-provided acceptance, **not** a claim that every EKS configuration has been independently certified.

## 1. Connect to EKS and check storage

Prerequisites: AWS CLI v2, `kubectl`, Helm 3, `gh`, `openssl`, Python 3 and authorized AWS/EKS access.

```bash
set -euo pipefail
export AWS_REGION=us-east-1
read -r -p 'EKS cluster name: ' EKS_CLUSTER
export NAMESPACE=m9sweeper-system

aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER"
kubectl config current-context
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get storageclass
kubectl get csidriver ebs.csi.aws.com
```

The bundled PostgreSQL and RabbitMQ services require persistent volumes. For ordinary EC2-backed EKS clusters, verify that the EBS CSI driver is installed, correctly authorized and associated with a compatible default StorageClass. EKS Auto Mode has a different EBS provisioner and must be configured accordingly.

If PVCs are Pending, inspect `kubectl describe pvc` and node availability zones. **Do not delete bound PVCs or regenerate database credentials to solve storage placement.** EBS-backed volumes are availability-zone-bound.

## 2. Install the core platform

Complete the [first-time installation steps](installation.md#fresh-installation). Use `m9sweeper-system` for the namespace. Afterwards verify:

```bash
helm status m9sweeper -n "$NAMESPACE"
kubectl -n "$NAMESPACE" get pods,jobs,pvc -o wide
kubectl -n "$NAMESPACE" rollout status deployment/m9sweeper-dash --timeout=5m
kubectl -n "$NAMESPACE" rollout status deployment/m9sweeper-trawler --timeout=5m
kubectl -n "$NAMESPACE" get cronjobs
```

Sign in through a local port-forward, register the EKS cluster in Dashboard using authorized backend-compatible credentials, and verify automatic inventory synchronization. The default inventory schedule is every five minutes; do not rely on manual CLI sync as normal operation.

```bash
kubectl -n "$NAMESPACE" port-forward svc/m9sweeper-dash 13000:3000
```

Visit `http://localhost:13000` in your browser. A workstation `aws eks get-token` exec kubeconfig is **not** automatically executed by the backend. Use valid credentials intended for backend use, with the appropriate Kubernetes authorization and token-lifecycle management; never upload local AWS CLI secrets.

## 3. Verify RabbitMQ and Trivy

```bash
kubectl -n "$NAMESPACE" exec m9sweeper-rabbitmq-0 -c rabbitmq -- \
  rabbitmq-diagnostics check_running
kubectl -n "$NAMESPACE" exec m9sweeper-rabbitmq-0 -c rabbitmq -- \
  rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
kubectl -n "$NAMESPACE" logs deployment/m9sweeper-trawler --since=20m --tail=150
```

A connected Trawler typically leaves one consumer on `trawler_queue`. The **real acceptance criterion** is a new scan job processed with Trivy, a persisted result, and vulnerabilities visible in the appropriate Dashboard cluster. Empty queues alone do not prove scanner success.

### Private ECR: Trawler Pod Identity

For ECR-hosted images, use a dedicated IAM role associated with the actual Trawler Kubernetes service account. Do not put permanent AWS keys into a chart or Secret.

```bash
TRAWLER_SA="$(kubectl -n "$NAMESPACE" get deployment m9sweeper-trawler \
  -o jsonpath='{.spec.template.spec.serviceAccountName}')"
printf 'Trawler service account: %s\n' "$TRAWLER_SA"
aws eks list-pod-identity-associations \
  --cluster-name "$EKS_CLUSTER" --region "$AWS_REGION" \
  --namespace "$NAMESPACE" --service-account "$TRAWLER_SA"
```

Configure a role that trusts `pods.eks.amazonaws.com` and permits `sts:AssumeRole` and `sts:TagSession`, scoped to this workload. Give it **read-only** ECR access (`ecr:GetAuthorizationToken`, image manifest and layer reads) to authorized repositories; a cross-account registry may additionally require repository-owner permissions. Configure the EKS Pod Identity association through your organization's IAM process. Once it is active:

```bash
kubectl -n "$NAMESPACE" rollout restart deployment/m9sweeper-trawler
kubectl -n "$NAMESPACE" rollout status deployment/m9sweeper-trawler --timeout=5m
kubectl -n "$NAMESPACE" logs deployment/m9sweeper-trawler --since=15m
```

Pod readiness does not prove ECR access: scan a real authorized private image and verify the report.

## 4. kube-bench: EKS node checks

Download the standalone chart:

```bash
cd "$HOME/m9sweeper-install"
gh release download v0.1.0 --repo sm-joe/m9sweeper-modern \
  --pattern 'kube-bench-0.1.0.tgz' --clobber
read -r -p 'Dashboard cluster ID: ' CLUSTER_ID
[[ "$CLUSTER_ID" =~ ^[1-9][0-9]*$ ]] || exit 1
```

Confirm the existing scanner key name exists without printing its value:

```bash
kubectl -n "$NAMESPACE" get secret m9-init-env \
  -o json | python3 -c 'import sys,json; assert "KUBE_BENCH_API_KEY" in json.load(sys.stdin)["data"]; print("PASS: kube-bench key exists")'
```

Install a one-time assessment:

```bash
helm upgrade --install kube-bench ./kube-bench-0.1.0.tgz -n "$NAMESPACE" \
  --set-string provider=eks \
  --set-string eks.benchmark=eks-1.2.0 \
  --set cronjob.enabled=false \
  --set-string reportAuth.existingSecret=m9-init-env \
  --set-string reportAuth.keyName=KUBE_BENCH_API_KEY \
  --set-string "reportsurl=http://m9sweeper-dash.$NAMESPACE.svc.cluster.local:3000/api/kube-bench/$CLUSTER_ID"
```

Check the generated scan Job and its logs, then verify a *new* kube-bench report in the Dashboard. This benchmark assesses eligible EKS worker nodes; it does **not** by itself establish complete CIS compliance for the managed control plane.

## 5. Kubesec: workload configuration assessment

After cluster inventory completes, use the Dashboard Kubesec view to select an actual namespace and Pod/deployment. Run a configuration scan and verify the recommendations and score. Confirm Kubernetes API permissions if the workload list is empty; do not diagnose an empty list as a scanner failure before inventory and RBAC checks.

## 6. kube-hunter: private HTTPS without a public domain

kube-hunter's report relay transmits an API key and deliberately requires **trusted HTTPS**. A private Kubernetes Service and certificate are sufficient; public DNS and a public Load Balancer are not required. The following example creates a dedicated internal NGINX gateway in `m9sweeper-system`. It forwards only the kube-hunter ingestion path to Dash over the cluster network.

### 6.1 Generate a private CA and service certificate

```bash
mkdir -p "$HOME/.config/m9sweeper/kube-hunter-tls"
cd "$HOME/.config/m9sweeper/kube-hunter-tls"
umask 077
export INGEST_HOST="m9sweeper-ingest.$NAMESPACE.svc.cluster.local"

openssl genrsa -out ca.key 3072
openssl req -new -x509 -sha256 -days 825 -key ca.key -out ca.crt \
  -subj '/CN=m9sweeper-private-ca' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
openssl genrsa -out tls.key 3072
openssl req -new -key tls.key -out tls.csr -subj "/CN=$INGEST_HOST"
cat > tls.ext <<EOF
subjectAltName=DNS:$INGEST_HOST
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -in tls.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out tls.crt -days 365 -sha256 -extfile tls.ext
openssl verify -CAfile ca.crt tls.crt

kubectl -n "$NAMESPACE" create secret tls m9sweeper-ingest-tls \
  --cert=tls.crt --key=tls.key
kubectl -n "$NAMESPACE" create secret generic m9sweeper-kubehunter-ca \
  --from-file=ca.crt=ca.crt
```

Store private keys securely, never commit them, and renew the gateway certificate before expiry.

### 6.2 Create the private gateway

```bash
cat > gateway.yaml <<'YAML'
apiVersion: v1
kind: ConfigMap
metadata:
  name: m9sweeper-ingest-nginx
  namespace: m9sweeper-system
data:
  default.conf: |
    server {
      listen 443 ssl;
      server_name m9sweeper-ingest.m9sweeper-system.svc.cluster.local;
      ssl_certificate /etc/nginx/tls/tls.crt;
      ssl_certificate_key /etc/nginx/tls/tls.key;
      ssl_protocols TLSv1.2 TLSv1.3;
      client_max_body_size 10m;
      location /api/kubehunter/hunter/ {
        proxy_pass http://m9sweeper-dash.m9sweeper-system.svc.cluster.local:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
      }
      location / { return 404; }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: m9sweeper-ingest
  namespace: m9sweeper-system
spec:
  replicas: 1
  selector:
    matchLabels: {app: m9sweeper-ingest}
  template:
    metadata:
      labels: {app: m9sweeper-ingest}
    spec:
      containers:
        - name: nginx
          image: nginx:stable-alpine
          ports:
            - {name: https, containerPort: 443}
          volumeMounts:
            - {name: config, mountPath: /etc/nginx/conf.d/default.conf, subPath: default.conf, readOnly: true}
            - {name: tls, mountPath: /etc/nginx/tls, readOnly: true}
          readinessProbe:
            tcpSocket: {port: 443}
      volumes:
        - name: config
          configMap: {name: m9sweeper-ingest-nginx}
        - name: tls
          secret: {secretName: m9sweeper-ingest-tls}
---
apiVersion: v1
kind: Service
metadata:
  name: m9sweeper-ingest
  namespace: m9sweeper-system
spec:
  type: ClusterIP
  selector: {app: m9sweeper-ingest}
  ports:
    - {name: https, port: 443, targetPort: https}
YAML

kubectl apply -f gateway.yaml
kubectl -n "$NAMESPACE" rollout status deployment/m9sweeper-ingest --timeout=3m
kubectl -n "$NAMESPACE" get svc m9sweeper-ingest
```

Restrict internal network access to this Service through your organization's network policies if enforced. The gateway terminates TLS and forwards to Dash via internal HTTP; clusters requiring end-to-end encryption must secure that backend hop separately.

### 6.3 Install kube-hunter with trusted CA and existing key

```bash
cd "$HOME/m9sweeper-install"
gh release download v0.1.0 --repo sm-joe/m9sweeper-modern \
  --pattern 'kube-hunter-0.1.0.tgz' --clobber
kubectl -n "$NAMESPACE" get secret m9-init-env -o json |
  python3 -c 'import sys,json; assert "KUBE_HUNTER_API_KEY" in json.load(sys.stdin)["data"]; print("PASS: kube-hunter key exists")'

INGEST_HOST="m9sweeper-ingest.$NAMESPACE.svc.cluster.local"
helm upgrade --install kube-hunter ./kube-hunter-0.1.0.tgz -n "$NAMESPACE" \
  --set cronjob.enabled=false \
  --set reportRelay.enabled=true \
  --set-string reportRelay.existingSecret=m9-init-env \
  --set-string reportRelay.secretKey=KUBE_HUNTER_API_KEY \
  --set-string reportRelay.caSecret=m9sweeper-kubehunter-ca \
  --set-string reportRelay.caSecretKey=ca.crt \
  --set-string "reportRelay.targetUrl=https://$INGEST_HOST/api/kubehunter/hunter/$CLUSTER_ID" \
  --timeout 10m

kubectl -n "$NAMESPACE" get jobs,pods
kubectl -n "$NAMESPACE" logs job/kube-hunter -c kube-hunter --tail=100
```

A passing kube-hunter result requires an **authenticated, newly persisted report** visible in Dashboard under the correct cluster. A completed Job or healthy relay alone is not sufficient. Do not disable TLS validation or place API keys in URLs. Only scan clusters you are authorized to assess.

After one-time acceptance, configure a schedule deliberately:

```bash
helm upgrade kube-hunter ./kube-hunter-0.1.0.tgz -n "$NAMESPACE" \
  --reuse-values --set cronjob.enabled=true \
  --set-string 'cronjob.schedule=0 2 * * *'
```

## 7. Falco: runtime events

Install Falco using its official Helm chart and the **modern eBPF** driver on compatible Linux nodes. Use the version and chart configuration documented in the Dashboard's Falco installation dialog (tested combination: chart `9.2.2`, Falco `0.45.2`). Configure Falcosidekick's **existing Secret** with `WEBHOOK_ADDRESS`, `WEBHOOK_CUSTOMHEADERS` (scoped `X-API-Key`) and `WEBHOOK_MINIMUMPRIORITY`. Set the webhook to a real, reachable Dashboard report endpoint for the actual cluster ID; never leave example hostnames or cluster IDs.

Inspect:

```bash
kubectl -n falco get pods
kubectl -n falco logs deployment/falco-falcosidekick --since=20m --tail=100
kubectl -n "$NAMESPACE" logs deployment/m9sweeper-dash --since=20m --tail=100 -c dash
```

Generate a controlled test event on an authorized test workload and confirm the event reaches the correct cluster in Dashboard. No `YOUR-TRUSTED-...` placeholder URLs should remain in the live Sidekick configuration.

## Acceptance checklist

The EKS operator reported all of these checks complete on the tested installation on **17 November 2026**. New installations must repeat the actual end-to-end checks rather than copying that acceptance status.

| Gate | Evidence required |
| --- | --- |
| EKS connectivity and storage | Ready nodes, CSI provisioning, bound PostgreSQL/RabbitMQ PVCs |
| Dashboard | Bootstrap Job complete; login; working NestJS/Angular routes |
| Authentication | Authorized cluster enrollment and stable API access |
| Inventory | Scheduled cluster sync populates workloads and images |
| RabbitMQ/Trawler | Consumer connected and actual queue jobs processed |
| Trivy | Fresh CVE scan persisted and visible in Dashboard |
| Private ECR | Trawler IAM Pod Identity permits authorized private scans |
| kube-bench | Fresh EKS worker-node report ingested and displayed |
| Kubesec | Selected workload assessment produces findings |
| kube-hunter | Trusted HTTPS relay, scanner key and a rendered fresh report |
| Falco | Fresh security event delivered through Sidekick and displayed |
| Recovery/security | Authorization boundaries and restart/recovery checks show no data or credentials loss |

**Operator confirmation is not a substitute for automated CI**, and CI is not a substitute for a live EKS scan. See [release notes](release-notes.md) for the distinction between build evidence and deployment acceptance.

[Back to README](../README.md) · [Installation](installation.md) · [Other managed Kubernetes](cloud-kubernetes.md)
