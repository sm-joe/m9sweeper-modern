# Read-only m9sweeper native Kind acceptance for Helm-managed pods.
# Run on Windows PowerShell 5.1+; never prints API tokens or Secrets.
[CmdletBinding()]
param(
    [int]$ClusterId = 3,
    [string]$Namespace = 'm9sweeper-system',
    [string]$Context = 'kind-kind'
)
$ErrorActionPreference = 'Stop'
if ($ClusterId -le 0) { throw 'ClusterId must be positive' }
$actualContext = (kubectl config current-context).Trim()
if ($LASTEXITCODE -ne 0 -or $actualContext -ne $Context) {
    throw "Wrong Kubernetes context '$actualContext'; expected '$Context'. No changes made."
}
function Check-Kubectl {
    param([string[]]$Arguments)
    $result = & kubectl @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "kubectl check failed: $($Arguments -join ' '): $result" }
    return $result
}
function Read-Database {
    param([string]$Sql)
    # Reuses the configured bundled PostgreSQL container; does not echo env or Secrets.
    $result = $Sql | & kubectl -n $Namespace exec -i m9sweeper-postgresql-0 -c m9sweeper-postgresql -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -qAt -U "${POSTGRES_USER:-m9sweeper}" -d "${POSTGRES_DB:-postgres}" -f -' 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Read-only PostgreSQL query failed: $result" }
    return (($result | Out-String).Trim())
}
$pods = Check-Kubectl @('-n', $Namespace, 'get', 'pods', '-o', 'wide')
Write-Host '=== Kubernetes pod readiness ==='
$pods
Write-Host '=== Cluster and inventory ==='
$cluster = Read-Database "SELECT id || '|' || name FROM clusters WHERE id=$ClusterId AND deleted_at IS NULL;"
if (-not $cluster) { throw "Cluster $ClusterId not registered; refusing acceptance" }
Write-Host "Cluster: $cluster"
$inv = Read-Database "SELECT (SELECT count(*) FROM kubernetes_namespaces WHERE cluster_id=$ClusterId) || '|' || (SELECT count(*) FROM kubernetes_pods WHERE cluster_id=$ClusterId) || '|' || (SELECT count(*) FROM kubernetes_images WHERE cluster_id=$ClusterId);"
Write-Host "Inventory namespaces|pods|images: $inv"
Write-Host '=== kube-bench ==='
$bench = Read-Database "SELECT count(*) || '|' || COALESCE(MAX(created_at)::text,'none') FROM kube_bench WHERE cluster_id=$ClusterId AND json_typeof(results_json)='object';"
Write-Host "Reports|last_created_at: $bench"
Write-Host '=== kube-hunter ==='
$hunter = Read-Database "SELECT count(*) || '|' || COALESCE(MAX(created_at)::text,'none') FROM kube_hunter WHERE cluster_id=$ClusterId AND json_typeof(vulnerabilities) IN ('array','object');"
Write-Host "Reports|last_created_at: $hunter"
Write-Host '=== Trivy scan-run pipeline ==='
$runs = Read-Database "SELECT status || '|' || count(*) FROM image_scan_runs WHERE cluster_id=$ClusterId GROUP BY status ORDER BY status;"
if (-not $runs) { $runs = 'NO_SCAN_RUNS' }
Write-Host $runs
$evidence = Read-Database "SELECT count(*) FROM image_scan_results r JOIN image_scan_runs s ON s.id=r.scan_run_id WHERE s.cluster_id=$ClusterId AND s.status='completed';"
Write-Host "Persisted completed scan policy results: $evidence"
Write-Host '=== RabbitMQ broker ==='
$connections = Check-Kubectl @('-n', $Namespace, 'exec', 'm9sweeper-rabbitmq-0', '--', 'rabbitmqctl', '-q', 'list_connections', 'name', 'state')
Write-Host $connections
$queues = Check-Kubectl @('-n', $Namespace, 'exec', 'm9sweeper-rabbitmq-0', '--', 'rabbitmqctl', '-q', 'list_queues', 'name', 'messages_ready', 'messages_unacknowledged', 'consumers')
Write-Host $queues
Write-Host '=== Falco evidence ==='
$falco = Read-Database "SELECT count(*) || '|' || COALESCE(MAX(creation_timestamp)::text,'none') FROM project_falco_logs WHERE cluster_id=$ClusterId;"
Write-Host "Falco events|last_timestamp: $falco"
Write-Host '=== Interpret results ==='
Write-Host 'A nonzero count proves persistence, not new scan execution or dashboard visibility.'
Write-Host 'Trivy requires a completed scan-run and persisted policy results. RabbitMQ needs a live consumer.'
Write-Host 'Falco needs a newly triggered real Linux detection; historical records are not sufficient.'
Write-Host 'kube-hunter requires an actual report for this cluster and dashboard visibility.'
