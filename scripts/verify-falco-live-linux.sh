#!/usr/bin/env bash
# Native-Linux/Kubernetes real sensor acceptance; never a synthetic webhook fixture.
# Requires a disposable cluster and a locally named PostgreSQL Compose container.
# Creates and removes ONLY a unique test namespace of its own.
set -euo pipefail
[[ "${M9_FALCO_LIVE_TEST:-}" == YES ]] || {
  echo 'Explicit M9_FALCO_LIVE_TEST=YES opt-in required' >&2; exit 2;
}
[[ "${CLUSTER_ID:-}" =~ ^[1-9][0-9]*$ ]] || {
  echo 'CLUSTER_ID must be an existing positive database cluster identifier' >&2; exit 2;
}
[[ "${M9_FALCO_LINUX_HOST:-}" == YES ]] || {
  echo 'Set M9_FALCO_LINUX_HOST=YES only on tested native Linux nodes' >&2; exit 2;
}
for tool in kubectl docker date sleep; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }
done
namespace="m9-falco-accept-$(date -u +%s)-$$"
[[ "$namespace" =~ ^m9-falco-accept-[0-9]+-[0-9]+$ ]] || exit 2
test_namespace_created=false
cleanup() {
  if [[ "$test_namespace_created" == true ]]; then
    kubectl delete namespace "$namespace" --wait=false --ignore-not-found >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
db_query() {
  docker exec -i postgres sh -c 'psql -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<<"$1"
}
# Prevent a stale event from passing this test.
before="$(db_query "SELECT COALESCE(MAX(id), 0) FROM project_falco_logs WHERE cluster_id=$CLUSTER_ID;")"
[[ "$before" =~ ^[0-9]+$ ]] || { echo 'Cannot read Falco baseline' >&2; exit 1; }
# Do not use a pre-existing namespace or modify another workload.
kubectl create namespace "$namespace" >/dev/null
test_namespace_created=true
kubectl label namespace "$namespace" m9sweeper-staging=true --overwrite >/dev/null
kubectl -n "$namespace" run live-falco-probe --image=busybox:1.36 --restart=Never --command -- sleep 600 >/dev/null
kubectl -n "$namespace" wait --for=condition=Ready pod/live-falco-probe --timeout=150s >/dev/null
# Reading the test container's local shadow file is benign, but requires a
# configured Falco detection rule (e.g. 'Read sensitive file untrusted').
kubectl -n "$namespace" exec live-falco-probe -- sh -c 'cat /etc/shadow >/dev/null'
found=''
for attempt in $(seq 1 40); do
  found="$(db_query "SELECT id || '|' || COALESCE(rule,'') || '|' || COALESCE(container,'')
      FROM project_falco_logs WHERE cluster_id=$CLUSTER_ID
      AND id > $before AND namespace='$namespace'
      AND container='live-falco-probe'
      ORDER BY id DESC LIMIT 1;")"
  if [[ -n "$found" ]]; then break; fi
  sleep 3
done
if [[ -z "$found" ]]; then
  echo 'FAIL: no matching native Falco event persisted for this staging pod' >&2
  echo 'Check Linux eBPF probe, enabled rules, Falcosidekick forwarding and X-API-Key grants' >&2
  exit 1
fi
echo "PASS: kernel-triggered Falco event correlated to cluster $CLUSTER_ID and staging pod"
echo "Recorded event id/rule/pod: $found"
echo 'PASS: new event persisted in PostgreSQL; no webhook fixture was posted'
echo 'MANUAL FINAL GATE: open the Angular Falco page and verify this same event ID and rule'
