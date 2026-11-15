#!/usr/bin/env bash
# Real Falco Linux/Kubernetes acceptance against a disposable namespace.
# Requires configured Falco sensor + Falcosidekick ingestion. Never inserts
# synthetic events or prints scanner credentials.
set -euo pipefail
[[ "${M9_FALCO_LIVE_TEST:-}" == YES && "${M9_FALCO_LINUX_HOST:-}" == YES ]] || {
  echo 'Requires M9_FALCO_LIVE_TEST=YES and M9_FALCO_LINUX_HOST=YES on native Linux' >&2; exit 2;
}
[[ "$(uname -s)" == Linux ]] || { echo 'Native Linux host required' >&2; exit 2; }
[[ "${CLUSTER_ID:-}" =~ ^[1-9][0-9]*$ ]] || { echo 'Positive CLUSTER_ID required' >&2; exit 2; }
: "${M9_EXPECTED_KUBE_CONTEXT:?Set explicit staging Kubernetes context}"
actual="$(kubectl config current-context)"
[[ "$actual" == "$M9_EXPECTED_KUBE_CONTEXT" ]] || {
  echo "Context mismatch ($actual); refusing test" >&2; exit 2;
}
ns="${M9_FALCO_NAMESPACE:-m9sweeper-system}"
[[ "$ns" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || exit 2
expected_rule="${M9_FALCO_EXPECTED_RULE:-Read sensitive file untrusted}"
[[ "$expected_rule" =~ ^[A-Za-z0-9_][A-Za-z0-9_[:space:]-]{2,119}$ ]] || exit 2
for cmd in kubectl date sleep; do command -v "$cmd" >/dev/null || exit 2; done
# Read-only psql. The PostgreSQL pod supplies the bundled env credentials.
query() {
  printf '%s\n' "$1" | kubectl -n "$ns" exec -i m9sweeper-postgresql-0 -c m9sweeper-postgresql -- sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -qAt -U "${POSTGRES_USER:-m9sweeper}" -d "${POSTGRES_DB:-postgres}" -f -'
}
baseline="$(query "SELECT COALESCE(MAX(id),0) FROM project_falco_logs WHERE cluster_id=$CLUSTER_ID;")"
[[ "$baseline" =~ ^[0-9]+$ ]] || { echo 'Falco DB baseline unavailable' >&2; exit 1; }
test_ns="m9-falco-accept-$(date -u +%s)-$$"
created=0
cleanup() { if [[ "$created" == 1 ]]; then kubectl delete namespace "$test_ns" --wait=false --ignore-not-found >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
kubectl create namespace "$test_ns" >/dev/null
created=1
kubectl -n "$test_ns" run live-falco-probe --image=busybox:1.36 --restart=Never --command -- sleep 600 >/dev/null
kubectl -n "$test_ns" wait --for=condition=Ready pod/live-falco-probe --timeout=150s >/dev/null
# Benign read of an isolated test container file. Requires the configured rule.
kubectl -n "$test_ns" exec live-falco-probe -- sh -c 'cat /etc/shadow >/dev/null'
found=''
for i in $(seq 1 40); do
  found="$(query "SELECT id || '|' || COALESCE(rule,'') FROM project_falco_logs
    WHERE cluster_id=$CLUSTER_ID AND id>$baseline AND namespace='$test_ns'
      AND container='live-falco-probe' AND rule='$expected_rule'
    ORDER BY id DESC LIMIT 1;")"
  [[ -n "$found" ]] && break
  sleep 3
done
[[ -n "$found" ]] || {
  echo 'FAIL: no new matching Falco sensor event persisted for isolated test pod' >&2;
  echo 'Check Linux sensor, active rule, relay and cluster-specific API-key grant' >&2;
  exit 1;
}
echo "PASS: live Falco rule '$expected_rule' persisted for Cluster $CLUSTER_ID; event $found"
echo 'MANUAL GATE: confirm same event ID in Angular Falco page'
