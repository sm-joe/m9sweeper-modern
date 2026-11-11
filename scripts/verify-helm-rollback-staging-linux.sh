#!/usr/bin/env bash
# Helm upgrade/rollback lifecycle drill in an opt-in, labelled staging namespace.
# Requires existing release and a staging-only, credential-protected values file.
set -euo pipefail
[[ "${M9_STAGING_HELM_TEST:-}" == YES ]] || { echo 'Staging opt-in required' >&2; exit 2; }
: "${NAMESPACE:?NAMESPACE required}" "${RELEASE:?RELEASE required}" "${VALUES_FILE:?VALUES_FILE required}"
: "${M9_EXPECTED_KUBE_CONTEXT:?Explicit staging context is required}"
[[ "$NAMESPACE" != m9sweeper-system && "$NAMESPACE" =~ ^[a-z0-9-]+$ ]] || {
  echo 'Cannot run rollback against m9sweeper-system' >&2; exit 2;
}
[[ -s "$VALUES_FILE" ]] || { echo 'Private Helm values file missing' >&2; exit 2; }
for bin in helm kubectl python3; do command -v "$bin" >/dev/null || exit 2; done
actual_context="$(kubectl config current-context)"
[[ "$actual_context" == "$M9_EXPECTED_KUBE_CONTEXT" ]] || {
  echo "Refusing Helm lifecycle drill: Kubernetes context does not match explicitly approved staging context" >&2
  exit 2
}
# Refuse non-staging namespaces even when labels are accidentally copied.
[[ "$NAMESPACE" == m9-staging-* || "$NAMESPACE" == m9sweeper-staging* ]] || {
  echo 'Namespace must use the m9-staging- or m9sweeper-staging prefix' >&2
  exit 2
}
label="$(kubectl get namespace "$NAMESPACE" -o jsonpath='{.metadata.labels.m9sweeper-staging}')"
[[ "$label" == true ]] || { echo 'Namespace must be labelled m9sweeper-staging=true' >&2; exit 2; }
helm status "$RELEASE" --namespace "$NAMESPACE" >/dev/null
old_chart="$(helm status "$RELEASE" --namespace "$NAMESPACE" -o json |
  python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("chart", ""))')"
[[ -n "$old_chart" ]] || { echo 'Cannot record previous chart version' >&2; exit 2; }
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
upgrade_revision="$(helm history "$RELEASE" --namespace "$NAMESPACE" -o json |
  python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["revision"])')"
[[ "$upgrade_revision" =~ ^[1-9][0-9]*$ && "$upgrade_revision" -gt "$old_revision" ]] || {
  echo 'FAIL: helm upgrade did not create a later revision' >&2; exit 1
}
helm rollback "$RELEASE" "$old_revision" --namespace "$NAMESPACE" --wait --timeout 15m
rollback_revision="$(helm history "$RELEASE" --namespace "$NAMESPACE" -o json |
  python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["revision"])')"
[[ "$rollback_revision" =~ ^[1-9][0-9]*$ && "$rollback_revision" -gt "$upgrade_revision" ]] || {
  echo 'FAIL: Helm rollback did not record a new revision' >&2; exit 1
}
rollback_status="$(helm status "$RELEASE" --namespace "$NAMESPACE" -o json)"
printf '%s' "$rollback_status" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if d.get("info", {}).get("status") != "deployed":
    raise SystemExit("FAIL: rollback release is not deployed")
'
rollback_chart="$(printf '%s' "$rollback_status" |
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("chart", ""))')"
[[ "$rollback_chart" == "$old_chart" ]] || {
  echo 'FAIL: Helm rollback chart version differs from original revision' >&2; exit 1
}
after="$(kubectl get pvc -n "$NAMESPACE" -o json |
  python3 -c 'import json,sys; print(sorted((x["metadata"]["name"],x["spec"].get("volumeName","")) for x in json.load(sys.stdin)["items"]))')"
[[ "$before" == "$after" ]] || {
  echo 'FAIL: PVC names or persistent volume bindings changed during upgrade/rollback' >&2; exit 1;
}
kubectl get deployments,pods,pvc -n "$NAMESPACE"
echo "PASS: staging Helm upgrade revision $upgrade_revision rolled back as $rollback_revision"
echo 'PASS: deployed chart version restored and PVC identity preserved'
echo 'Record the source SHA, cluster versions, rendered image digests and redacted output for release sign-off'
echo 'VERIFY separately: Dash auth, scanner history, RabbitMQ worker and restored PostgreSQL rows.'
