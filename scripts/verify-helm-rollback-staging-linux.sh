#!/usr/bin/env bash
# Helm upgrade/rollback lifecycle drill in an opt-in, labelled staging namespace.
# Requires existing release and a staging-only, credential-protected values file.
set -euo pipefail
[[ "$M9_STAGING_HELM_TEST" == YES ]] || { echo 'Staging opt-in required' >&2; exit 2; }
: "$NAMESPACE" "$RELEASE" "$VALUES_FILE"
[[ "$NAMESPACE" != m9sweeper-system && "$NAMESPACE" =~ ^[a-z0-9-]+$ ]] || {
  echo 'Cannot run rollback against m9sweeper-system' >&2; exit 2;
}
[[ -s "$VALUES_FILE" ]] || { echo 'Private Helm values file missing' >&2; exit 2; }
for bin in helm kubectl python3; do command -v "$bin" >/dev/null || exit 2; done
label="$(kubectl get namespace "$NAMESPACE" -o jsonpath='{.metadata.labels.m9sweeper-staging}')"
[[ "$label" == true ]] || { echo 'Namespace must be labelled m9sweeper-staging=true' >&2; exit 2; }
helm status "$RELEASE" --namespace "$NAMESPACE" >/dev/null
old_revision="$(helm history "$RELEASE" --namespace "$NAMESPACE" -o json |
  python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["revision"])')"
[[ "$old_revision" =~ ^[1-9][0-9]*$ ]] || exit 2
root="$(cd "$(dirname "$0")/.." && pwd)"
chart="$root/platform/manifests/charts/m9sweeper"
before="$(kubectl get pvc -n "$NAMESPACE" -o json |
  python3 -c 'import json,sys; print(sorted((x["metadata"]["name"],x["spec"].get("volumeName","")) for x in json.load(sys.stdin)["items"]))')"
helm dependency update "$chart" >/dev/null
helm upgrade "$RELEASE" "$chart" --namespace "$NAMESPACE" \
  --values "$VALUES_FILE" --wait --timeout 15m
echo "PASS: staging upgrade of $RELEASE from revision $old_revision"
helm rollback "$RELEASE" "$old_revision" --namespace "$NAMESPACE" --wait --timeout 15m
after="$(kubectl get pvc -n "$NAMESPACE" -o json |
  python3 -c 'import json,sys; print(sorted((x["metadata"]["name"],x["spec"].get("volumeName","")) for x in json.load(sys.stdin)["items"]))')"
[[ "$before" == "$after" ]] || {
  echo 'FAIL: PVC names or persistent volume bindings changed during upgrade/rollback' >&2; exit 1;
}
kubectl get deployments,pods,pvc -n "$NAMESPACE"
echo 'PASS: staging Helm upgrade/rollback and PVC identity consistency'
echo 'VERIFY separately: Dash auth, scanner history, RabbitMQ worker and restored PostgreSQL rows.'
