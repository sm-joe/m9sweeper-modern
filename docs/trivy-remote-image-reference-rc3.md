# RC3 Trivy registry image-reference fix

## Symptom

Trivy fails with `MANIFEST_UNKNOWN` for a reference similar to:

```text
registry.k8s.io/coredns/coredns:v1.14.6@sha256:520212b8...
```

The m9sweeper image inventory stores a Kubernetes runtime image hash, but the legacy Java worker appended it to the registry name as though it were a registry **manifest** digest. These digest types are not interchangeable. The worker has no Docker/containerd/Podman socket, which is expected for a remote-registry scan; mounting the host socket is not required.

## Fix

The Java Trivy scanner now uses `--image-src remote` and the registry **tag** (for example, `registry.k8s.io/coredns/coredns:v1.14.6`), not `tag@sha256:<runtime image id>`. If the tag is gone or private authentication fails, the scan must report failure, not silently mark it clean. Tags are mutable: inspect the resolved digest in Trivy metadata and **do not claim the scan proves the precise runtime image digest** unless they match after appropriate manifest resolution.

## PowerShell reproduction and validation

Run from the repository root:

```powershell
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed

cd platform\trawler
mvn -B -ntp test
cd ..\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml build trawler
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --no-deps --force-recreate trawler
docker exec m9sweeper-trawler trivy --version
```

Check the exact registry tag before submitting new queued work:

```powershell
docker exec m9sweeper-trawler trivy image --image-src remote --timeout 10m --scanners vuln --format json registry.k8s.io/coredns/coredns:v1.14.6 > "$env:TEMP\coredns-trivy.json"
if ($LASTEXITCODE -ne 0) { throw 'Remote Trivy registry scan failed' }
$report = Get-Content "$env:TEMP\coredns-trivy.json" -Raw | ConvertFrom-Json
$report.ArtifactName
$report.Metadata.RepoDigests
$report.Results | ForEach-Object { $_.Vulnerabilities } | Group-Object Severity | Select-Object Name,Count
```

If this manual check succeeds, open Dash, select the correct cluster and its image, and request a rescan. Check:

```powershell
docker logs m9sweeper-trawler --tail 100
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT r.id,r.image_id,i.cluster_id,to_timestamp(r.created_at/1000.0) AS scanned_at FROM image_scan_results r JOIN images i ON i.id=r.image_id ORDER BY r.id DESC LIMIT 10;"'
```

**Acceptance:** a new correctly attributed result exists in PostgreSQL; the corresponding Angular view displays actual findings; scanner failures are not clean. If the exact tag no longer exists, do not replace it with an unrelated tag and claim the current runtime image was assessed.

No host Docker socket mount, database reset, or disabling of scanner-failure classification is necessary.
