# RC4 read-only acceptance probe for the existing Docker Compose + Kind deployment.
# No secrets are printed, no data is deleted or changed.
[CmdletBinding()]
param(
    [int]$ClusterId,
    [int]$ImageId,
    [switch]$RequireFalcoEvent,
    [switch]$RequireStrictScannerBindings
)
$ErrorActionPreference = 'Stop'
if ($ClusterId -le 0 -or $ImageId -le 0) {
    throw 'Pass the actual -ClusterId and -ImageId of your scanned Kind image.'
}

function Invoke-Checked([string]$Name, [scriptblock]$Body) {
    Write-Host "Checking: $Name"
    & $Body
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit code $LASTEXITCODE)" }
}
function Query-Db([string]$Sql) {
    $result = $Sql | docker exec -i postgres sh -c 'psql -v ON_ERROR_STOP=1 -A -t -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL query failed' }
    # PowerShell unrolls singleton pipeline results into scalar strings.
    # Return the array as one object, even if PostgreSQL emits just one row.
    [string[]]$rows = @($result | Where-Object { $_ -and $_.Trim() } | ForEach-Object { [string]$_ })
    return ,$rows
}

$tables = Query-Db "SELECT to_regclass('public.image_scan_runs') IS NOT NULL AND to_regclass('public.cluster_user_access') IS NOT NULL;"
if ($tables[0] -ne 't') { throw 'RC4 migrations missing: image_scan_runs or cluster_user_access' }
Write-Host 'PASS: RC4 schema present'

$recent = Query-Db @"
SELECT id || '|' || status || '|' || COALESCE(compliant::text, 'unknown')
FROM image_scan_runs
WHERE cluster_id = $ClusterId AND image_id = $ImageId
ORDER BY created_at DESC LIMIT 1;
"@
if ($recent.Count -eq 0) { throw 'No RC4 scan run found for this image/cluster' }
$parts = ([string]$recent[0]).Split('|')
if ($parts[1] -ne 'completed') { throw "Latest scan has not completed: $($parts[1])" }
Write-Host "PASS: scan run $($parts[0]) completed"

$counts = Query-Db @"
SELECT COUNT(*) FROM (
 SELECT policy_id, COUNT(*) AS n
 FROM image_scan_results
 WHERE scan_run_id = '$($parts[0])'
 GROUP BY policy_id HAVING COUNT(*) <> 1
) AS invalid;
"@
if ($counts[0] -ne '0') { throw 'Duplicate per-policy results detected' }
$hasResult = Query-Db "SELECT COUNT(*) FROM image_scan_results WHERE scan_run_id = '$($parts[0])';"
if ([int]$hasResult[0] -lt 1) { throw 'Completed run has no saved findings report' }
Write-Host 'PASS: at least one per-policy report with no duplicate policies'

$image = Query-Db @"
SELECT scan_queued::text || '|' || scan_results || '|' ||
       COALESCE(major_issues, 0)::text || '|' || COALESCE(critical_issues,0)::text
FROM images WHERE id = $ImageId AND cluster_id = $ClusterId;
"@
if ($image.Count -ne 1) { throw 'Image row missing or cluster mismatch' }
$fields = ([string]$image[0]).Split('|')
if ($fields[0] -ne 'false' -and $fields[0] -ne 'f') { throw 'Image still queued after completion' }
if (([int]$fields[2] -gt 0 -or [int]$fields[3] -gt 0) -and $fields[1] -eq 'Compliant') {
    throw 'SECURITY FAILURE: HIGH/CRITICAL vulnerabilities marked compliant'
}
Write-Host "PASS: no stuck image spinner; status $($fields[1])"

Invoke-Checked 'RabbitMQ queues' {
    docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
}

$failed = Query-Db "SELECT COUNT(*) FROM image_scan_runs WHERE status = 'failed';"
Write-Host "Recorded failed scan runs: $($failed[0])"
$falco = Query-Db "SELECT COUNT(*) FROM project_falco_logs WHERE cluster_id=$ClusterId;"
Write-Host "Falco events for cluster $ClusterId : $($falco[0])"
if ($RequireFalcoEvent -and [int]$falco[0] -lt 1) {
    throw 'No Falco event persisted for target cluster'
}
if ($RequireStrictScannerBindings) {
    $strict = [string](docker exec m9sweeper-dash printenv SCANNER_REQUIRE_CLUSTER_BINDINGS)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect strict scanner cluster binding setting' }
    $strict = $strict.Trim()
    if ($strict -ne 'true') { throw 'Strict scanner-cluster bindings are not enabled' }
    Write-Host 'PASS: strict scanner-cluster binding configured'
}
Write-Host 'PASS: read-only RC4 checks complete.'
Write-Host 'Still required: real Falco kernel event correlation, browser UI inspection, cross-cluster denial tests and Helm lifecycle.'
