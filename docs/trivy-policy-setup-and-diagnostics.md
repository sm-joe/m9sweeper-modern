# Trivy policy prerequisites and diagnostics (RC3)

The error `No enabled Trivy policy is assigned to cluster ...` occurs **before** a scan is queued. It means the selected cluster has no effective enabled policy with an enabled `TRIVY` scanner. The scanner is not broken merely because it cannot start without a policy.

## 1. Inspect existing configuration (read only)

Run from PowerShell; replace `1` with the cluster's actual ID (as shown in Dash):

```powershell
$clusterId = 1
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,name FROM clusters ORDER BY id;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT p.id,p.name,p.enabled,p.relevant_for_all_clusters,pc.cluster_id,pc.active AS cluster_mapping_active,s.id AS scanner_id,s.type,s.enabled AS scanner_enabled FROM policies p LEFT JOIN policy_cluster pc ON pc.policy_id=p.id LEFT JOIN scanners s ON s.policy_id=p.id AND s.deleted_at IS NULL WHERE p.deleted_at IS NULL ORDER BY p.id,pc.cluster_id,s.id;"'
```

Determine whether:
- There is no policy row at all.
- The policy exists but is disabled.
- The cluster is not mapped to the policy, or `policy_cluster.active` is false.
- A policy is mapped but no enabled scanner of type `TRIVY` exists.
- A global policy is enabled with an enabled Trivy scanner (it is eligible even without a cluster mapping).

Do not blindly modify database rows. The application must maintain its policy/scanner and audit metadata.

## 2. Configure a policy through Dash

Sign in as an administrator at `http://localhost:3000`. Use the **Policies** area to create a dedicated test policy (for example, `Kind Trivy baseline`) or edit an existing policy:
- Enable the policy.
- Add the **Trivy** scanner and enable that scanner.
- Assign the policy to the target cluster, or explicitly enable `Relevant for all clusters` only if that broad scope is intentional.
- Save and verify the policy appears in the target cluster's policy association.

If the existing policy appears disabled or has no active scanner, correct those settings rather than creating duplicate policies. An image such as `coredns/coredns:v1.14.6` does not need a separate policy per image; the cluster's effective policy controls whether it is scanned.

## 3. Build and test the corrected policy service

```powershell
cd D:\AWS\repos\m9sweeper-modern
git fetch origin
git switch fix/rc3-trivy-queue-fail-closed
git pull --ff-only origin fix/rc3-trivy-queue-fail-closed
cd platform\dash\backend
npm ci --legacy-peer-deps
npx jest policy-service.spec.ts image.service.spec.ts --runInBand
npm run build:api
cd ..\..\docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build
```

Do not delete the existing Postgres volume or use `down -v`.

## 4. Retry an image scan

Select your existing cluster's Images page in Dash and scan one image first. After requesting the scan:

```powershell
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker logs m9sweeper-trawler --tail 100
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT r.id,r.image_id,i.cluster_id,to_timestamp(r.created_at / 1000.0) AS scanned_at FROM image_scan_results r JOIN images i ON i.id=r.image_id ORDER BY r.id DESC LIMIT 10;"'
```

A true end-to-end pass means the request is queued, consumed by the worker, a **fresh** result persists for the correct image/cluster, and Angular displays it. If the request still fails, inspect the read-only policy/scanner/mapping rows again. A policy with no enabled scanner must never make a scan appear clean.
