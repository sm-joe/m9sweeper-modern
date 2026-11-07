# RC3 Falco → Falcosidekick → Dash end-to-end acceptance

This is a **nonproduction Kind integration** procedure, not a claim that the Falco kernel driver or chart works on all hosts. The pinned Falco Helm chart **3.5.0** depends on Falcosidekick **0.6.3**. Its deployment supports `falcosidekick.config.existingSecret`, with environment keys `WEBHOOK_ADDRESS` and `WEBHOOK_CUSTOMHEADERS`.

## 1. Prerequisites

- Deploy RC3 Dash and verify `http://localhost:3000/api/health` locally.
- Configure `SCANNER_REPORT_INGESTION_URL` to an origin reachable from **Kind pods**, not browser localhost.
- Rotate the Falco ingest key if it ever appeared in browser/Helm command histories. The new key must be the current, valid key held by Dash, not just an edited environment variable.
- Ensure the selected numeric cluster ID matches the registered Kind cluster; examples use 1 only as a placeholder.

## 2. Create private Falcosidekick configuration Secret

PowerShell (run from your development host):

```powershell
$clusterId = 1  # Replace with the registered cluster ID
$endpoint = (docker exec m9sweeper-dash printenv SCANNER_REPORT_INGESTION_URL).Trim().TrimEnd('/')
if (-not $endpoint -or $endpoint -match '^https?://(localhost|127\\.|\\[::1\\])') {
    throw 'Set a Pod-reachable SCANNER_REPORT_INGESTION_URL first'
}
kubectl create namespace falco --dry-run=client -o yaml | kubectl apply -f -
$secureKey = Read-Host 'Enter current, rotated Falco ingest API key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $manifest = @{
        apiVersion = 'v1'
        kind = 'Secret'
        metadata = @{name = 'm9sweeper-falco-webhook'; namespace = 'falco'}
        type = 'Opaque'
        stringData = @{
            WEBHOOK_ADDRESS = "$endpoint/api/falco/$clusterId/create"
            WEBHOOK_CUSTOMHEADERS = "X-API-Key:$key"
        }
    } | ConvertTo-Json -Depth 7
    $manifest | kubectl apply -f -
} finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    Remove-Variable key, manifest, secureKey -ErrorAction SilentlyContinue
}
```

**Never print or commit the Secret.** Kubernetes Secret data is not inherently encrypted at rest; restrict RBAC and enable encryption. Do not use public HTTP for real production credentials.

Verify key names only:

```powershell
$secret = kubectl get secret m9sweeper-falco-webhook -n falco -o json | ConvertFrom-Json
$secret.data.PSObject.Properties.Name
```

Expected keys: `WEBHOOK_ADDRESS` and `WEBHOOK_CUSTOMHEADERS`.

## 3. Install pinned Falco chart with no key in Helm values

```powershell
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update
helm upgrade --install falco falcosecurity/falco --version 3.5.0 -n falco --create-namespace --wait --timeout 10m `
  --set falcosidekick.enabled=true `
  --set-string falcosidekick.config.existingSecret=m9sweeper-falco-webhook `
  --set falco.json_output=true `
  --set falco.http_output.enabled=true `
  --set-string falco.http_output.url=http://falco-falcosidekick:2801/
kubectl -n falco get pods
```

This historical chart and Falco driver may require further compatibility work for your actual Kind node/kernel. No successful live Falco execution is claimed by source lint.

## 4. Verify event delivery and DB persistence

Before generating an event:

```powershell
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,cluster_id,creation_timestamp FROM project_falco_logs ORDER BY id DESC LIMIT 10;"'
```

In a disposable Kind test namespace, trigger a **benign, authorized** action expected to match a configured Falco rule. For example, if the default rules include sensitive-file reads, reading a container's own test `/etc/shadow` may trigger an event; rule coverage and driver support vary:

```powershell
kubectl create namespace falco-acceptance --dry-run=client -o yaml | kubectl apply -f -
kubectl -n falco-acceptance run falco-acceptance-pod --image=busybox:1.36 --restart=Never --command -- sleep 3600
kubectl -n falco-acceptance wait --for=condition=Ready pod/falco-acceptance-pod --timeout=120s
kubectl -n falco-acceptance exec falco-acceptance-pod -- sh -c 'cat /etc/shadow >/dev/null'
```

Check the Falco and sidekick logs using actual pod names from `kubectl -n falco get pods`. Do not paste credential-bearing logs. Re-run the SQL query, verify a **new** row with the proper cluster ID and event timestamp, and confirm the matching entry is present in Dash's Falco page.

If no event appears, distinguish: rule not triggered, Falco engine/driver failure, sidekick delivery failure, authentication rejection, or DB persistence failure. A green pod status is not proof of full ingestion.

## 5. Cleanup the test-only workload

```powershell
kubectl -n falco-acceptance delete pod falco-acceptance-pod --ignore-not-found
```

Do not uninstall working Falco or remove the existing database solely to repeat this test.

## Release blockers

Remove the legacy `?key=` acceptance path after header-based clients are migrated. Validate scoped tenant/cluster authorization, credential lifecycle, real alert persistence, current chart/version support and least-privileged runtime permissions before a production release.
