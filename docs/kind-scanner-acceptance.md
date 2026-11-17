# Local Kubernetes scanner verification with Kind

Use a Linux Kind cluster to exercise the report-ingestion and scanner contracts before testing managed Kubernetes. **Kind checks are not a replacement for live EKS/AKS/GKE validation.**

## Preflight

```bash
set -euo pipefail
export NAMESPACE=m9sweeper-system
read -r -p 'Dashboard cluster ID: ' CLUSTER_ID
[[ "$CLUSTER_ID" =~ ^[1-9][0-9]*$ ]] || exit 1
kubectl config current-context
kubectl get nodes -o wide
kubectl -n "$NAMESPACE" get pods,jobs,cronjobs,pvc -o wide
helm status m9sweeper -n "$NAMESPACE"
```

Confirm the context is the intended disposable test cluster; scanners should run only against authorized targets.

## Trivy and inventory

```bash
kubectl -n "$NAMESPACE" exec m9sweeper-rabbitmq-0 -c rabbitmq -- \
  rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
kubectl -n "$NAMESPACE" get jobs --sort-by=.metadata.creationTimestamp
kubectl -n "$NAMESPACE" logs deployment/m9sweeper-trawler --since=20m --tail=150
```

Verify inventory runs automatically, a real test image is scanned, the queue is acknowledged and the matching CVEs are stored and shown in Angular. Empty queues alone are not proof of successful scans.

## kube-bench

Use the published `kube-bench-0.1.0.tgz` archive and the authorized `KUBE_BENCH_API_KEY` from the existing bootstrap Secret, as described in [EKS installation](eks-installation.md#4-kube-bench-eks-node-checks). A Kind cluster uses the suitable Kind/node benchmark rather than the EKS worker profile. Confirm a *new* ingested report under the correct cluster.

## kube-hunter

Use the published `kube-hunter-0.1.0.tgz` archive, its header-authenticated report relay, an existing scanner key and a **valid HTTPS** endpoint with trusted CA. The [private-cluster HTTPS configuration](eks-installation.md#6-kube-hunter-private-https-without-a-public-domain) can be adapted to Kind. Inspect the actual Job and relay logs and require a fresh report displayed in Dashboard. Never disable TLS verification or put credentials in the URL.

## Falco

A Kind cluster without a functional Linux kernel sensor cannot certify runtime detection. With an appropriate Linux host, supported Falco sensor and an authorized test namespace, run the repository's live verification script from the source tree:

```bash
export M9_FALCO_LIVE_TEST=YES
export M9_FALCO_LINUX_HOST=YES
export M9_EXPECTED_KUBE_CONTEXT=kind-kind
export M9_FALCO_NAMESPACE=m9sweeper-system
bash scripts/verify-falco-kubernetes-linux.sh
```

Confirm a newly generated Falco event arrives through Falcosidekick, persists and appears in the dashboard. This evidence is separate from chart rendering or Pod readiness.

## Exit criteria

The local integration passes only with real authorized scan jobs, authenticated report ingestion and visible findings. The project operator confirmed **EKS acceptance** separately on 17 November 2026; that EKS evidence should not be attributed to a Kind run.

[README](../README.md) · [EKS](eks-installation.md) · [Installation](installation.md)
