# Upgrade an existing Helm installation using the actual release image digests.
[CmdletBinding()]
param(
  [string]$Namespace = "m9sweeper-system",
  [string]$Release = "m9sweeper",
  [string]$Version = "v0.1.0",
  [string]$Directory = (Get-Location).Path
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
function AssertExit([string]$operation) {
  if ($LASTEXITCODE -ne 0) { throw "$operation failed: exit code $LASTEXITCODE" }
}
if ($Version -ne "v0.1.0") { throw "This script accepts v0.1.0 only" }
New-Item -ItemType Directory -Force -Path $Directory | Out-Null
$chart = Join-Path $Directory "m9sweeper-0.1.0.tgz"
$manifestPath = Join-Path $Directory "IMAGE-DIGESTS.txt"
gh release download $Version --repo sm-joe/m9sweeper-modern --dir $Directory --pattern "m9sweeper-0.1.0.tgz" --pattern "IMAGE-DIGESTS.txt" --clobber
AssertExit "Download release"
if (-not (Test-Path $chart) -or -not (Test-Path $manifestPath)) {
  throw "Missing release chart or digest manifest"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw
$dash = [regex]::Match($manifest, '(?m)^dash=ghcr\.io/sm-joe/m9sweeper-dash@(sha256:[a-f0-9]{64})\s*$')
$trawler = [regex]::Match($manifest, '(?m)^trawler=ghcr\.io/sm-joe/m9sweeper-trawler@(sha256:[a-f0-9]{64})\s*$')
if (-not $dash.Success -or -not $trawler.Success) {
  throw "Invalid release image digests: refusing unpinned upgrade"
}
$dashTag = "v0.1.0@" + $dash.Groups[1].Value
$trawlerTag = "v0.1.0@" + $trawler.Groups[1].Value

helm status $Release --namespace $Namespace | Out-Null
AssertExit "Read existing release"
$backup = Join-Path $Directory "m9sweeper-values-before-image-upgrade.yaml"
$prior = helm get values $Release --namespace $Namespace -o yaml
AssertExit "Read existing values"
$prior | Set-Content -Path $backup -Encoding utf8

$helmArgs = @(
  "upgrade", $Release, $chart,
  "--namespace", $Namespace,
  "--reuse-values",
  "--set-string", "dash.image.registry=ghcr.io",
  "--set-string", "dash.image.repository=sm-joe/m9sweeper-dash",
  "--set-string", "dash.image.tag=$dashTag",
  "--set-string", "trawler.image.registry=ghcr.io",
  "--set-string", "trawler.image.repository=sm-joe/m9sweeper-trawler",
  "--set-string", "trawler.image.tag=$trawlerTag",
  "--timeout", "15m"
)
& helm @helmArgs
AssertExit "Upgrade Helm release"
kubectl -n $Namespace rollout status deployment/m9sweeper-dash --timeout=5m
AssertExit "Dash rollout"
kubectl -n $Namespace rollout status deployment/m9sweeper-trawler --timeout=5m
AssertExit "Trawler rollout"

$dashImage = "ghcr.io/sm-joe/m9sweeper-dash:$dashTag"
$trawlerImage = "ghcr.io/sm-joe/m9sweeper-trawler:$trawlerTag"
$liveDash = kubectl -n $Namespace get deployment m9sweeper-dash -o 'jsonpath={.spec.template.spec.containers[?(@.name=="dash")].image}'
AssertExit "Read Dash image"
$liveTrawler = kubectl -n $Namespace get deployment m9sweeper-trawler -o 'jsonpath={.spec.template.spec.containers[?(@.name=="trawler")].image}'
AssertExit "Read Trawler image"
if ($liveDash -ne $dashImage -or $liveTrawler -ne $trawlerImage) {
  throw "Deployed images differ from release digests. Dash=$liveDash Trawler=$liveTrawler"
}
Write-Host "PASS: Dash and Trawler deploy exact image digests published in $Version."
Write-Host "Existing credentials, PostgreSQL volumes, RabbitMQ volumes and scanner reports preserved."
