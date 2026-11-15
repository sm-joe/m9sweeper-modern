# Kind MVP scanner acceptance (Windows PowerShell operator)

This acceptance guide checks an existing `m9sweeper-modern` Helm installation without recreating the cluster, database, scanner keys or historical reports. The shipped product runs on Linux/Kubernetes; these commands are for a Windows test operator.

## Prerequisites

- Kind context `kind-kind`, deployment namespace `m9sweeper-system`
- Cluster already registered in Dash, e.g. `kind-local` database ID 3
- Kubernetes CLI and Helm installed
- Existing real scanner credentials scoped to the target cluster

Run:
```powershell
cd D:\AWS\repos\m9sweeper-modern
kubectl config current-context
.\scripts\verify-kind-scanners.ps1 -ClusterId 3 -Namespace m9sweeper-system -Context kind-kind
```

This script is read-only. It reports inventory counts, kube-bench and kube-hunter report counts, actual Trivy scan states and result rows, RabbitMQ live connections and queue consumers, and Falco event counts. **Do not interpret old report rows as proof of new scan execution.**

## kube-hunter (Cluster 3)

Check the installed scanner release before attempting an upgrade:

```powershell
helm list -n m9sweeper-system
helm get values kube-hunter -n m9sweeper-system
kubectl -n m9sweeper-system get jobs,cronjobs | Select-String kube-hunter
```

The kube-hunter chart's header-authenticated report relay requires a **full, TLS-verified HTTPS** endpoint under `reportRelay.targetUrl`, e.g. `https://dash.example.internal/api/kubehunter/hunter/3`; an HTTP URL or bare `/api/kubehunter/hunter/3` will be rejected by design. Configure a trusted ingress/certificate and a pre-existing Secret with the `apiKey` key, bound to Cluster 3. Do not put an API key in `dispatchUrl` or print it in logs.

To run the scanner chart *only after* those dependencies are ready:

```powershell
helm upgrade --install kube-hunter .\platform\manifests\charts\kube-hunter `
  -n m9sweeper-system `
  --set cronjob.enabled=false `
  --set reportRelay.enabled=true `
  --set-string reportRelay.existingSecret=m9sweeper-kube-hunter-relay-auth `
  --set-string reportRelay.targetUrl=https://YOUR-TRUSTED-DASH-HOST/api/kubehunter/hunter/3
```

Check the resulting Kubernetes Job and its logs, then run the read-only acceptance script again. Acceptance requires a **new persisted `kube_hunter` row for Cluster 3** and the matching dashboard detail view. The chart's one-shot Job runs as a Helm post-install/post-upgrade hook; CronJob schedules are optional.

## Trivy / Trawler

The Java Trawler scans images enqueued by Dash over RabbitMQ. Use the PowerShell acceptance script to inspect the queue consumer and completed `image_scan_runs` / `image_scan_results` evidence. A completed old kube-bench scan is unrelated to Trivy.

To isolate live connection failures:
```powershell
kubectl -n m9sweeper-system exec m9sweeper-rabbitmq-0 -- rabbitmqctl list_connections name state user
kubectl -n m9sweeper-system exec m9sweeper-rabbitmq-0 -- rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
kubectl -n m9sweeper-system logs deployment/m9sweeper-trawler --since=10m --tail=100
```

The correct end-to-end gate requires a real image scan to complete, persistent policy findings, and the image details / vulnerability results to render in Dash. Do not fabricate evidence by inserting rows.

## Falco

Falco is a separate real Linux sensor validation, not a synthetic event upload. Kind pods alone do not establish kernel-level detection. First deploy a supported Falco sensor and configure Falcosidekick forwarding, authenticated by a cluster-scoped Falco key. Confirm a *fresh* event for a benign, controlled test container and the matching ID in `project_falco_logs` and the Angular Falco view.

For Helm-managed PostgreSQL on a native Linux staging machine, use the newly added `scripts/verify-falco-kubernetes-linux.sh` after configuring and approving a disposable test environment:

```bash
export M9_FALCO_LIVE_TEST=YES M9_FALCO_LINUX_HOST=YES
export M9_EXPECTED_KUBE_CONTEXT=kind-kind CLUSTER_ID=3
export M9_FALCO_NAMESPACE=m9sweeper-system
bash scripts/verify-falco-kubernetes-linux.sh
```

It creates only a disposable test namespace, reads a benign container file to trigger the explicitly configured sensitive-file rule, and requires a **new** correlated event stored in Helm PostgreSQL. The original `verify-falco-live-linux.sh` remains Compose-only. Do not use either script if the sensor/rule or staging permissions are not already configured. Never claim Falco acceptance based solely on an old database row.

## Release candidate

v0.1.1 is already public and must remain immutable. The `release-build.yml` workflow has been prepared to accept `v0.1.2` on `workflow_dispatch` with confirmation `BUILD_RELEASE`. It builds signed Dash and Trawler OCI images, signs Helm archives, and dispatches the independent Kubernetes Kind acceptance workflow. A passing GitHub build alone is **not** proof of scanner runtime acceptance. Release publication remains gated on signed artifacts, full platform CI, and independent acceptance. Do not publish until kube-hunter, Trivy and Falco acceptance gates are satisfied for the intended release scope.
