# Persisted policy and exception testing (Windows PowerShell + Podman)

This update replaces the legacy /v1/compliance/evaluate **inline policy input** with a
database-backed policyId. Existing scan records remain intact.

## Upgrade local environment

1. Generate a third **distinct** 32-byte random hexadecimal key. Windows PowerShell 5.1:
   ```powershell
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $bytes = New-Object byte[] 32
   $rng.GetBytes($bytes)
   $adminKey = [BitConverter]::ToString($bytes).Replace('-', '')
   $rng.Dispose()
   Add-Content .env "M9_ADMIN_API_KEY=$adminKey"
   ```
2. Rebuild backend and dashboard:
   ```powershell
   podman compose up -d --build backend dash
   podman compose logs --tail=60 backend
   ```
   The backend applies the additive `002_policy_management.sql` migration at startup
   under a PostgreSQL advisory lock; **do not delete the postgres volume**.
3. To reach the API locally, add the temporary loopback-only Compose override:
   ```powershell
   @'
   services:
     backend:
       ports:
         - "127.0.0.1:8080:8080"
   '@ | Set-Content compose.override.yaml
   podman compose up -d --force-recreate backend
   ```

## Create and evaluate a persisted policy

Read the distinct agent and admin keys from the local `.env`. The trawler
key can ingest scans but cannot write managed policies; the admin key can
manage policies and read scan data but cannot ingest scans.

```powershell
$admin = (Get-Content .env | Where-Object { $_ -match '^M9_ADMIN_API_KEY=' } | Select-Object -First 1) -replace '^M9_ADMIN_API_KEY=', ''
$headers = @{ Authorization = "Bearer $admin" }
$scans = Invoke-RestMethod -Uri http://localhost:8080/v1/scans -Headers $headers
$scan = $scans.data | Select-Object -First 1
if (!$scan) { throw 'No scans available yet; check trawler logs' }
$limits = @{
 CRITICAL = @{fixable=0;unfixable=0}
 HIGH = @{fixable=0;unfixable=0}
 MEDIUM = @{fixable=-1;unfixable=-1}
 LOW = @{fixable=-1;unfixable=-1}
 NEGLIGIBLE = @{fixable=-1;unfixable=-1}
}
$policy = @{
 id='baseline'
 name='Baseline Trivy policy'
 enabled=$true
 enforcement=$true
 scanners=@(@{id='trivy';name='Trivy';enabled=$true;required=$true;limits=$limits})
}
$cluster = [uri]::EscapeDataString($scan.cluster_id)
Invoke-RestMethod -Uri "http://localhost:8080/v1/policies?clusterId=$cluster" -Method Put -Headers $headers -ContentType 'application/json' -Body ($policy | ConvertTo-Json -Depth 12)
$inputData = @{clusterId=$scan.cluster_id;scanId=$scan.scan_id;policyId='baseline'}
Invoke-RestMethod -Uri 'http://localhost:8080/v1/compliance/evaluate' -Method Post -Headers $headers -ContentType 'application/json' -Body ($inputData | ConvertTo-Json -Depth 6)
```

## Audit and authorization boundaries

- There is no user login, RBAC, or UI editing yet. Policies can only be written with the admin API key.
- Policies are cluster-scoped and require existing clusters; the API rejects unknown scanners.
- CVE exceptions require a specific identifier, written reason and a future expiration within 90 days.
- Evaluation only uses **unexpired** exceptions, but the exception history is retained in the database.
- Neither the policy writer nor evaluator deploys admission webhooks or enables enforcement.
- When finished, remove `compose.override.yaml` and recreate the backend to close the temporary port.
