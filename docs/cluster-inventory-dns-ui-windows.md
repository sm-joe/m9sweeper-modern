# Cluster inventory DNS and blank Angular pages (Windows development)

This diagnostic is for a **Windows PowerShell developer** monitoring a Docker
Kind cluster. The supported **product** remains Linux/Kubernetes. Do not use
Windows commands in deployment manifests or production Linux installation docs.

## Root-cause boundaries

The event `Cluster N inventory sync blocked: Kubernetes API DNS failed`
is emitted by the real NestJS `KubernetesClusterService.testCoreAPI` after a
failed read-only `listNamespace` call. `Scraping was canceled` is the
subsequent `ClusterSyncCommand` failure event; it is **not a second scanner
fault**. DNS failure means the hostname from the **stored cluster kubeconfig**
cannot be resolved by the Dash process. A valid Windows-host `kubectl`
context proves neither Docker DNS nor the server hostname saved in Dash.

When the images, workloads, Gatekeeper or Kubesec pages are empty there are at
least three distinct possibilities:

1. The Kubernetes API is unreachable and inventory never refreshed (images and
   workloads can remain empty or stale).
2. Live Kubernetes API requests fail directly (Kubesec namespace/pod selection,
   Gatekeeper status), independently of historical PostgreSQL inventory.
3. Authenticated Dash API requests return errors or Angular fails to render.
   These are **not** automatically corrected by Docker network changes.

## Read-only Windows preflight

From the repository root in PowerShell:

```powershell
.\scripts\diagnose-kind-dash-windows.ps1
```

The script checks Dash and Kind containers, shared Docker network, Docker DNS
resolution, internal TCP/6443 and unauthenticated Dash health. It intentionally
does not read/save or print kubeconfig secrets and cannot verify the saved
cluster-2 server configuration.

If the Kind network exists and the current Kind control plane is named
`kind-control-plane`, and Dash is not connected to that network, run:

```powershell
cd platform\docker-compose
docker compose -f docker-compose.yml -f kind-network.override.yml config --quiet
docker compose -f docker-compose.yml -f kind-network.override.yml up -d --no-deps dash
docker exec m9sweeper-dash node -e "require('dns').lookup('kind-control-plane',(e,a)=>{console.log(e?e.code:a);process.exitCode=e?1:0})"
```

This recreates **only Dash**, leaving PostgreSQL and RabbitMQ volumes and the
Kind cluster intact. Use the override only on a developer machine whose Kind
network actually exists. DNS must resolve, and internal port 6443 must be
reachable before retrying cluster 2 sync.

A stored kubeconfig referencing a hostname that no longer exists (for example
an old Kind control-plane container after cluster recreation) still fails even
if the new Kind network is healthy. Update **only cluster 2's** kubeconfig
through the Angular Cluster Info -> Update Kubeconfig action. Preserve its
existing CA and RBAC credentials and choose a server address that resolves
**inside Dash** and matches the server's TLS certificate. Do not blindly
substitute `localhost`, change its CA, or disable TLS verification.
Changing kubeconfig `server:` without confirming certificate SAN and
identity will turn DNS problems into TLS errors.

## Distinguish UI failures from missing inventory

Open the browser's Developer Tools (F12 -> Network -> Fetch/XHR), reload each
affected route and inspect the request/status for the cluster ID. The expected
routes include:

- `/private/clusters/2/images`
- `/private/clusters/2/kubernetes-namespaces`
- `/private/clusters/2/gatekeeper`
- `/private/clusters/2/kubesec`

Use only authenticated browser responses and inspect the errors **locally**.
Do not paste bearer tokens, API keys or kubeconfigs in a support issue.

- `401`: browser session expired or credentials invalid; log in again.
- `403`: role/cluster grant denied; check authorization, never bypass guards.
- `404`: wrong cluster/route or resource absent; confirm the current route.
- `500`: application fault; capture URL, status and sanitized NestJS error log.
- `502/503/504`: reverse proxy or upstream failure; inspect Dash service.
- `200` with empty data: confirm the last successful inventory sync and
  whether the cluster actually contains objects.
- `200` with data but a blank component: collect browser Console stack and
  component selector/screenshot; this is likely a frontend rendering issue.

With this fix, Images and Gatekeeper show persistent API error + Retry
indicators instead of silently blank states; Kubesec surfaces its namespace
dependency and retains pod-file upload as an alternative.

Do not delete cluster 2 to recover a failed sync. Confirm PostgreSQL health,
re-sync with the corrected trusted kubeconfig, and verify newly ingested pod,
image and deployment counts by cluster ID before treating scanner screens as
complete. Historical evidence should remain available even if new inventory
is unavailable.

## Safety

Never run `docker compose down -v` or purge RabbitMQ DLQ to repair DNS.
Do not expose Kubernetes control-plane ports publicly, switch off TLS
verification, or grant `cluster-admin` merely to make pages load.
