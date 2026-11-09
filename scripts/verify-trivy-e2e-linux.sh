#!/usr/bin/env bash
# Read-only inspection of a real queued Trivy scan, PostgreSQL evidence and web reachability.
set -euo pipefail
: "$CLUSTER_ID" "$IMAGE_ID"
[[ "$CLUSTER_ID" =~ ^[1-9][0-9]*$ && "$IMAGE_ID" =~ ^[1-9][0-9]*$ ]] || exit 2
query() { docker exec -i postgres sh -c 'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<<"$1"; }
row="$(query "SELECT r.id || '|' || r.status || '|' || COALESCE(r.compliant::text,'null') || '|' || i.scan_queued::text FROM image_scan_runs r JOIN images i ON i.id=r.image_id AND i.cluster_id=r.cluster_id WHERE r.cluster_id=$CLUSTER_ID AND r.image_id=$IMAGE_ID ORDER BY r.created_at DESC LIMIT 1;")"
[[ -n "$row" ]] || { echo 'FAIL: no scan-run found' >&2; exit 1; }
IFS='|' read -r run status compliant queued <<<"$row"
[[ "$status" == completed && "$queued" == false ]] || { echo "FAIL: $status; queued=$queued" >&2; exit 1; }
policies="$(query "SELECT COUNT(*) FROM image_scan_results WHERE scan_run_id='$run' AND image_id=$IMAGE_ID;")"
[[ "$policies" =~ ^[1-9][0-9]*$ ]] || { echo 'FAIL: no policy evidence' >&2; exit 1; }
bad="$(query "SELECT COUNT(*) FROM image_scan_results WHERE scan_run_id='$run' AND (encounter_error=true OR ((major_issues>0 OR critical_issues>0) AND policy_status=true));")"
[[ "$bad" == 0 ]] || { echo 'FAIL: scanner failure or blocking findings marked compliant' >&2; exit 1; }
high="$(query "SELECT COALESCE(SUM(critical_issues+major_issues),0) FROM image_scan_results WHERE scan_run_id='$run';")"
[[ "$high" -eq 0 || "$compliant" != true ]] || { echo 'FAIL: high/critical findings marked compliant' >&2; exit 1; }
issues="$(query "SELECT COUNT(*) FROM image_scan_results_issues i JOIN image_scan_results r ON r.id=i.image_results_id WHERE r.scan_run_id='$run';")"
[[ "$high" -eq 0 || "$issues" -gt 0 ]] || { echo 'FAIL: missing vulnerability evidence' >&2; exit 1; }
docker exec rabbitmq rabbitmqctl -q list_queues name messages_ready messages_unacknowledged consumers
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health >/dev/null
curl -fsS --max-time 15 http://127.0.0.1:3000/ >/dev/null
echo "PASS: run $run; policies=$policies; issues=$issues; high+critical=$high; Angular served"
echo 'Browser inspection of this scan is still required for final acceptance'
