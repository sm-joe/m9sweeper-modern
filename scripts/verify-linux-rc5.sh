#!/usr/bin/env bash
# Read-only Linux/Compose operational acceptance. Does not export credentials,
# purge queues, modify persisted findings or replay quarantined deliveries.
set -euo pipefail

CLUSTER_ID="${CLUSTER_ID:-1}"
IMAGE_ID="${IMAGE_ID:-}"
REQUIRE_FALCO_EVENT="${REQUIRE_FALCO_EVENT:-false}"

if [[ ! "$CLUSTER_ID" =~ ^[1-9][0-9]*$ ]]; then
  echo "CLUSTER_ID must be a positive integer" >&2; exit 2
fi
if [[ -n "$IMAGE_ID" && ! "$IMAGE_ID" =~ ^[1-9][0-9]*$ ]]; then
  echo "IMAGE_ID must be a positive integer" >&2; exit 2
fi
if [[ "$REQUIRE_FALCO_EVENT" != true && "$REQUIRE_FALCO_EVENT" != false ]]; then
  echo "REQUIRE_FALCO_EVENT must be true or false" >&2; exit 2
fi
for bin in docker grep; do
  command -v "$bin" >/dev/null || { echo "Missing $bin" >&2; exit 2; }
done

db_query() {
  docker exec -i postgres sh -c 'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<<"$1"
}
need_table() {
  local table="$1"
  local found
  found="$(db_query "SELECT to_regclass('public.$table');")"
  [[ "$found" == "$table" ]] || { echo "FAIL: missing table $table" >&2; exit 1; }
}
need_table image_scan_runs
need_table cluster_user_access
echo "PASS: RC4 scan-run and cluster-grant tables present"

column="$(db_query "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='image_scan_results' AND column_name='scan_run_id';")"
[[ "$column" == "1" ]] || { echo "FAIL: image_scan_results.scan_run_id missing" >&2; exit 1; }
echo "PASS: per-policy scan-run correlation column present"

if [[ -n "$IMAGE_ID" ]]; then
  # Only numeric IDs reach SQL, validated above.
  row="$(db_query "SELECT r.status || '|' || COALESCE(i.scan_results,'') || '|' || i.scan_queued::text
    FROM image_scan_runs r JOIN images i ON i.id=r.image_id
    WHERE r.cluster_id=$CLUSTER_ID AND r.image_id=$IMAGE_ID
    ORDER BY r.created_at DESC LIMIT 1;")"
  [[ -n "$row" ]] || { echo "FAIL: no scan run for image $IMAGE_ID" >&2; exit 1; }
  IFS='|' read -r status result queued <<<"$row"
  echo "Latest scan status: $status, image result: $result, queued: $queued"
  [[ "$status" == "completed" && "$queued" == "false" ]] || {
    echo "FAIL: newest scan is not completed or image queue flag is set" >&2; exit 1;
  }
  violations="$(db_query "SELECT count(*) FROM
    (SELECT policy_id FROM image_scan_results
     WHERE scan_run_id=(SELECT id FROM image_scan_runs WHERE cluster_id=$CLUSTER_ID AND image_id=$IMAGE_ID ORDER BY created_at DESC LIMIT 1)
     GROUP BY policy_id HAVING count(*)>1) p;")"
  [[ "$violations" == 0 ]] || { echo "FAIL: duplicate policy rows" >&2; exit 1; }
  echo "PASS: latest image scan complete; no duplicate policy rows"
fi

echo "RabbitMQ queue snapshot (read-only):"
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers

falco_events="$(db_query "SELECT count(*) FROM project_falco_logs WHERE cluster_id=$CLUSTER_ID;")"
echo "Falco events for cluster $CLUSTER_ID: $falco_events"
if [[ "$REQUIRE_FALCO_EVENT" == true && "$falco_events" -eq 0 ]]; then
  echo "FAIL: no persisted Falco events" >&2; exit 1
fi

failures="$(db_query "SELECT count(*) FROM image_scan_runs WHERE status='failed';")"
echo "Historical failed runs retained: $failures"
echo "PASS: read-only Linux RC5 operational checks complete"
echo "Still requires: browser review, RBAC HTTP negative tests, controlled staging DLQ recovery, and Helm lifecycle evidence."
