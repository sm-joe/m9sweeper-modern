#!/usr/bin/env bash
# Read-only corroboration of real scanner records on an approved native Linux
# staging Compose stack. This does NOT generate findings or substitute for
# verifying the sensor, scanner Job, policy result, and Angular report.
set -euo pipefail
[[ "${M9_NATIVE_SCANNER_EVIDENCE:-}" == YES ]] || {
  echo "Explicit M9_NATIVE_SCANNER_EVIDENCE=YES required" >&2; exit 2;
}
[[ "$(uname -s)" == Linux ]] || { echo "Native Linux required" >&2; exit 2; }
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo "WSL is not an accepted native sensor release environment" >&2; exit 2
fi
[[ "${CLUSTER_ID:-}" =~ ^[1-9][0-9]*$ ]] || {
  echo "Existing positive CLUSTER_ID required" >&2; exit 2;
}
[[ "${SINCE_MS:-}" =~ ^[1-9][0-9]{12}$ ]] || {
  echo "SINCE_MS must be a 13-digit event baseline Unix millisecond timestamp" >&2; exit 2;
}
[[ "${M9_EXPECTED_COMPOSE_PROJECT:-}" == m9-staging-* ||
   "${M9_EXPECTED_COMPOSE_PROJECT:-}" == m9sweeper-staging-* ]] || {
  echo "Explicit disposable staging Compose project required" >&2; exit 2;
}
[[ "${POSTGRES_CONTAINER:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || {
  echo "POSTGRES_CONTAINER must be an explicit safe container name" >&2; exit 2;
}
for tool in docker kubectl psql; do
  if [[ "$tool" == psql ]]; then continue; fi
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }
done
: "${M9_EXPECTED_KUBE_CONTEXT:?Explicit approved staging context required}"
[[ "$(kubectl config current-context)" == "$M9_EXPECTED_KUBE_CONTEXT" ]] || {
  echo "Kubernetes context mismatch; refusing test" >&2; exit 2;
}
project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$POSTGRES_CONTAINER")"
[[ "$project" == "$M9_EXPECTED_COMPOSE_PROJECT" ]] || {
  echo "PostgreSQL container is not in the approved staging project" >&2; exit 2;
}
sql() {
  docker exec -i "$POSTGRES_CONTAINER" sh -c     'psql -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<<"$1"
}
cluster_exists="$(sql "SELECT count(*) FROM clusters WHERE id=$CLUSTER_ID AND deleted_at IS NULL;")"
[[ "$cluster_exists" == 1 ]] || { echo "Expected cluster missing" >&2; exit 1; }

# Freshness is essential: a historical report cannot certify this staging drill.
bench="$(sql "SELECT count(*) FROM kube_bench WHERE cluster_id=$CLUSTER_ID AND created_at >= $SINCE_MS AND results_json IS NOT NULL;")"
hunter="$(sql "SELECT count(*) FROM kube_hunter WHERE cluster_id=$CLUSTER_ID AND created_at >= $SINCE_MS AND vulnerabilities IS NOT NULL;")"
falco="$(sql "SELECT count(*) FROM project_falco_logs WHERE cluster_id=$CLUSTER_ID AND creation_timestamp >= $SINCE_MS AND rule IS NOT NULL;")"
trivy="$(sql "SELECT count(*) FROM image_scan_runs r
  WHERE r.cluster_id=$CLUSTER_ID AND r.created_at >= $SINCE_MS
  AND r.status='completed' AND EXISTS(
    SELECT 1 FROM image_scan_results s WHERE s.scan_run_id=r.id);")"
for name in bench hunter falco trivy; do
  value="${!name}"
  [[ "$value" =~ ^[0-9]+$ ]] || { echo "Non-numeric $name evidence count" >&2; exit 1; }
  if (( value < 1 )); then
    echo "FAIL: no fresh $name scanner evidence since $SINCE_MS for cluster $CLUSTER_ID" >&2
    exit 1
  fi
  echo "PASS: found $value fresh $name persisted report(s) for cluster $CLUSTER_ID"
done

# Scanner errors and high/critical vulnerabilities must not be certified clean.
false_clean="$(sql "SELECT count(*) FROM image_scan_runs r
 JOIN images i ON i.id=r.image_id AND i.cluster_id=r.cluster_id
 WHERE r.cluster_id=$CLUSTER_ID AND r.created_at >= $SINCE_MS
 AND r.status='completed' AND r.compliant IS TRUE
 AND (COALESCE(i.critical_issues,0)>0 OR COALESCE(i.major_issues,0)>0);")"
[[ "$false_clean" == 0 ]] || {
  echo "FAIL: completed Trivy run marked clean with high or critical findings" >&2; exit 1;
}
echo "PASS: no fresh completed Trivy scan marked compliant with high/critical findings"
echo "READ-ONLY DB GATE PASSED — separately validate real Falco sensor/Sidekick and matching rule, kube-bench warnings/PDF, kube-hunter and Kubesec UI evidence."
echo "No production release approval is implied."
