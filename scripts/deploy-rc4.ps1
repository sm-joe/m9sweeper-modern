# Guarded, non-destructive RC4 Compose + Kind deployment on Windows PowerShell.
# Run from any directory; requires Docker Desktop and an existing RC3 installation.
[CmdletBinding()]
param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$composeDir = Join-Path $root 'platform/docker-compose'
$base = Join-Path $composeDir 'docker-compose.yml'
$kind = Join-Path $composeDir 'docker-compose.kind.yml'
$envFile = Join-Path $composeDir '.env'
if (-not (Test-Path $base) -or -not (Test-Path $kind) -or -not (Test-Path $envFile)) {
    throw 'Compose files or existing .env not found; refusing to modify deployment.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required' }
& docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker daemon is not running' }
$files = @('-f', $base, '-f', $kind)
$rev = & git -C $root rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0 -or $rev.Trim() -ne 'release/m9sweeper-new-rc4-security-reliability') {
    throw 'Check out the RC4 release branch before applying migrations.'
}
if (-not $SkipTests) {
    Push-Location (Join-Path $root 'platform/dash/backend')
    try {
        & npx jest image.service.spec.ts image.controller.spec.ts cluster-access.guard.spec.ts falco.controller.spec.ts --runInBand
        if ($LASTEXITCODE -ne 0) { throw 'Backend regression tests failed' }
        & npm run build:api
        if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
    } finally { Pop-Location }
}

# Back up inside Linux Postgres to preserve raw custom-format bytes on Windows.
$backupDir = Join-Path $root 'private-backups'
New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest = Join-Path $backupDir "m9sweeper-before-rc4-$stamp.dump"
& docker exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --file=/tmp/m9sweeper-pre-rc4.dump'
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed; no deployment attempted' }
& docker cp postgres:/tmp/m9sweeper-pre-rc4.dump $dest
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dest)) {
    throw 'Database backup copy failed; no deployment attempted'
}
Write-Host "Database backup saved locally. Store it securely and test recovery: $dest"

# Run migrations using the existing init service before updating the running API.
& docker compose @files up -d --build --force-recreate dash-init
if ($LASTEXITCODE -ne 0) { throw 'Migration service failed to start' }
$initId = (& docker compose @files ps -aq dash-init | Select-Object -First 1)
if (-not $initId) { throw 'Migration container not found' }
$initExit = (& docker wait $initId | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or $initExit.Trim() -ne '0') {
    & docker compose @files logs --tail=80 dash-init
    throw 'RC4 initialization failed; do not start the updated API'
}
$schema = @'
SELECT (
 to_regclass('public.image_scan_runs') IS NOT NULL
 AND to_regclass('public.cluster_user_access') IS NOT NULL
 AND EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'image_scan_results' AND column_name = 'scan_run_id'
 )
)::text;
'@ | docker exec -i postgres sh -c 'psql -v ON_ERROR_STOP=1 -A -t -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
if ($LASTEXITCODE -ne 0 -or ($schema | Select-Object -Last 1).Trim() -ne 'true') {
    throw 'RC4 schema verification failed. Existing application has not been replaced.'
}

& docker compose @files up -d --build --no-deps --force-recreate dash trawler
if ($LASTEXITCODE -ne 0) { throw 'RC4 service replacement failed' }
& docker compose @files ps
if ($LASTEXITCODE -ne 0) { throw 'Cannot read RC4 service status' }
try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -TimeoutSec 20
    if ([int]$response.StatusCode -ne 200) { throw 'Unexpected HTTP health status' }
} catch {
    throw 'Dash did not pass the HTTP health check. Inspect Docker logs; do not reset volumes.'
}
Write-Host 'RC4 deployed and Dash health endpoint passed.'
Write-Host 'Next: run scripts/verify-rc4.ps1 after one real Kind image scan and Falco event.'
Write-Host 'Do not enable strict scanner cluster bindings until service-user grants are configured.'
