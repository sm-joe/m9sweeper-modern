# Read-only Docker/Kind and Angular API connectivity diagnostics for Windows developers.
# Never prints kubeconfig contents, bearer tokens, PostgreSQL credentials,
# TLS certificates or scanner API keys. Does not mutate containers or networks.
param(
    [string]$DashContainer = 'm9sweeper-dash',
    [string]$KindControlPlane = 'kind-control-plane',
    [string]$KindNetwork = 'kind',
    [string]$DashboardUrl = 'http://127.0.0.1:3000'
)

$ErrorActionPreference = 'Stop'
function Write-Check([string]$Name, [bool]$Passed, [string]$Detail) {
    $status = if ($Passed) { 'PASS' } else { 'FAIL' }
    Write-Host ("{0}: {1} - {2}" -f $status, $Name, $Detail)
}
function Docker-Json([string[]]$Arguments) {
    $raw = & docker @Arguments 2>$null
    if ($LASTEXITCODE -ne 0 -or !$raw) { return $null }
    return ($raw | Out-String | ConvertFrom-Json)
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI was not found in PowerShell.'
}
$containers = @(& docker ps --format '{{.Names}}')
$dashFound = $containers -contains $DashContainer
$kindFound = $containers -contains $KindControlPlane
Write-Check 'Dash container' $dashFound $DashContainer
Write-Check 'Kind API container' $kindFound $KindControlPlane
if (-not $dashFound) { exit 2 }

$dash = Docker-Json -Arguments @('inspect', $DashContainer, '--format', '{{json .NetworkSettings.Networks}}')
$kind = if ($kindFound) { Docker-Json -Arguments @('inspect', $KindControlPlane, '--format', '{{json .NetworkSettings.Networks}}') } else { $null }
$dashNetworks = @($dash.PSObject.Properties.Name)
$kindNetworks = if ($kind) { @($kind.PSObject.Properties.Name) } else { @() }
$shared = @($dashNetworks | Where-Object { $kindNetworks -contains $_ })
Write-Check 'Dash on Kind network' ($dashNetworks -contains $KindNetwork) ("Dash networks: " + ($dashNetworks -join ', '))
Write-Check 'Containers share a network' ($shared.Count -gt 0) ("Shared: " + ($shared -join ', '))
$dnsCode = @'
const dns=require('node:dns');
const host=process.argv[1];
dns.lookup(host, (err, address) => {
  if(err){console.error('DNS '+err.code);process.exitCode=2;return;}
  console.log('DNS address '+address);
});
'@
$dnsOutput = & docker exec $DashContainer node -e $dnsCode $KindControlPlane 2>&1
$dnsOk = $LASTEXITCODE -eq 0
Write-Check 'Kind API hostname resolves within Dash' $dnsOk (($dnsOutput | Out-String).Trim())

if ($dnsOk) {
    $tcpCode = @'
const net=require('node:net');
const host=process.argv[1], port=Number(process.argv[2]);
const socket=net.connect({host,port});
socket.setTimeout(4000);
socket.once('connect',()=>{console.log('TCP connection established');socket.end();});
socket.once('timeout',()=>{console.error('TCP timeout');socket.destroy();process.exitCode=2;});
socket.once('error',err=>{console.error('TCP '+err.code);process.exitCode=2;});
'@
    # Internal Kind API uses 6443; external Windows mapped port is different.
    $tcpOutput = & docker exec $DashContainer node -e $tcpCode $KindControlPlane '6443' 2>&1
    Write-Check 'Kind API TCP 6443 accessible from Dash' ($LASTEXITCODE -eq 0) (($tcpOutput | Out-String).Trim())
}
try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri ($DashboardUrl.TrimEnd('/') + '/api/health') -TimeoutSec 8
    Write-Check 'Dash HTTP health' ($health.StatusCode -eq 200) ("HTTP " + $health.StatusCode)
} catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'no HTTP response' }
    Write-Check 'Dash HTTP health' $false ("Status: " + $code)
}
Write-Host ''
Write-Host 'Interpretation:'
Write-Host '- DNS failure: check shared Docker network and cluster 2 stored API hostname.'
Write-Host '- TCP failure: check Kind container lifecycle/network; do not disable TLS.'
Write-Host '- Dashboard healthy but pages empty: inspect authenticated /api requests in browser DevTools.'
Write-Host '- This tool cannot read cluster 2 stored kubeconfig or prove scanner/RBAC access.'
Write-Host 'No containers, Kubernetes resources, or secrets were modified.'
