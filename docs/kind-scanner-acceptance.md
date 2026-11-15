# Kind scanner acceptance (Linux)

This is a **local integration gate**, not certification for managed cloud Kubernetes. Cloud provider release gates are defined in [Cloud Kubernetes acceptance](cloud-kubernetes.md). Preserve existing PVCs, credentials, scanner keys and historical evidence.

## Preflight

Use a Linux shell with `kubectl`, Helm 3, and a Kind cluster. Replace the cluster ID with the actual Dashboard-assigned ID.

```bash
set -euo pipefail
export NAMESPACE=m9sweeper-system
export CLUSTER_ID=3
kubectl config current-context
kubectl get nodes -o wide
kubectl -n "$NAMESPACE" get pods,jobs,cronjobs,pvc -o wide
helm list -n "$NAMESPACE"
```

### kube-hunter

The report relay requires a complete trusted HTTPS URL, a reachable Dashboard ingress and a pre-existing scanner credential Secret. Do not put keys in URLs or logs.

```bash
helm get values kube-hunter -n "$NAMESPACE"
kubectl -n "$NAMESPACE" get jobs,cronjobs | grep -E 'kube-hunter|NAME' || true

helm upgrade --install kube-hunter ./platform/manifests/charts/kube-hunter \
  -n "$NAMESPACE" \
  --set cronjob.enabled=false \
  --set reportRelay.enabled=true \
  --set-string reportRelay.existingSecret=m9sweeper-kube-hunter-relay-auth \
  --set-string "reportRelay.targetUrl=https://YOUR-TRUSTED-DASH-HOST/api/kubehunter/hunter/$CLUSTER_ID"
```

Run the command from a checked-out source tree; for a downloaded release, use the signed standalone kube-hunter Helm archive instead of a source directory. The chart's one-shot Job is a Helm hook. Inspect actual Job and relay logs. Acceptance requires a *new* persisted report associated with the selected cluster, not an old row.

### Trivy and Trawler

```bash
kubectl -n "$NAMESPACE" exec m9sweeper-rabbitmq-0 -- rabbitmqctl list_connections name state user
kubectl -n "$NAMESPACE" exec m9sweeper-rabbitmq-0 -- rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
kubectl -n "$NAMESPACE" logs deployment/m9sweeper-trawler --since=10m --tail=100
```

Trigger a real authorized image scan in Dashboard. Confirm queue consumption, persisted image scan runs/results, correct tenant association and results visible in Angular. A completed kube-bench report is not evidence of Trivy success.

### Falco live Linux sensor

A Kind run without a real Linux kernel sensor does not prove Falco runtime protection. After configuring an approved disposable test namespace, Falco sensor, Falcosidekick and scoped collector key, run:

```bash
export M9_FALCO_LIVE_TEST=YES M9_FALCO_LINUX_HOST=YES
export M9_EXPECTED_KUBE_CONTEXT=kind-kind CLUSTER_ID=3
export M9_FALCO_NAMESPACE=m9sweeper-system
bash scripts/verify-falco-kubernetes-linux.sh
```

Require a fresh correlated event in PostgreSQL and Dashboard. Do not publish stale rows as proof.

## Release rule

Kind is an early test stage. EKS, AKS and GKE require independent live installation, authentication, PVC/zone, inventory, scanner and upgrade/recovery acceptance. Do not mark a managed-cloud provider as passing until its own evidence exists. The published v0.1.2 artifacts remain immutable; new source changes require a separately signed release.
