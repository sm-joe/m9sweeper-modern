#!/usr/bin/env bash
# Verify Kubernetes API accepts real umbrella chart install/upgrade/rollback in
# an isolated disposable KIND context. Deliberately --no-hooks / --wait=false:
# this is chart API/revision compatibility, NOT full application readiness.
set -euo pipefail
[[ "${M9_KIND_HELM_API_TEST:-}" == YES ]] || { echo 'CI-only opt-in required' >&2; exit 2; }
[[ "$(kubectl config current-context)" == kind-m9-inventory ]] || {
  echo 'Refusing Helm API drill outside disposable kind-m9-inventory' >&2; exit 2;
}
for tool in helm kubectl python3 openssl; do command -v "$tool" >/dev/null || exit 2; done
ns=m9-staging-kind-helm
release=m9-kind-api
chart=platform/manifests/charts/m9sweeper
created=false
cleanup() {
  if [[ "$created" == true ]]; then
    kubectl delete namespace "$ns" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
kubectl create namespace "$ns"
created=true
kubectl label namespace "$ns" m9sweeper-staging=true --overwrite >/dev/null
helm dependency update "$chart" >/dev/null
jwt="$(openssl rand -hex 32)"
api="$(openssl rand -hex 32)"
# Do not emit generated temporary secrets in actions logs.
values=(--set-string "global.jwtSecret=$jwt" --set-string "global.apiKey=$api"
        --set-string "dash.init.superAdminEmail=kind-ci@example.invalid"
        --set-string "dash.init.superAdminPassword=$jwt")
helm install "$release" "$chart" --namespace "$ns" --no-hooks --wait=false "${values[@]}" >/dev/null
helm status "$release" -n "$ns" >/dev/null
revision() {
  helm history "$release" -n "$ns" -o json |
    python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["revision"])'
}
r1="$(revision)"
[[ "$r1" == 1 ]] || { echo 'FAIL: expected Helm install revision 1' >&2; exit 1; }
pvc_before="$(kubectl get pvc -n "$ns" -o json |
  python3 -c 'import json,sys; print(sorted(x["metadata"]["name"] for x in json.load(sys.stdin)["items"]))')"
helm upgrade "$release" "$chart" -n "$ns" --no-hooks --wait=false "${values[@]}" \
  --set-string "dash.email.senderEmail=staging-change@example.invalid" >/dev/null
r2="$(revision)"
[[ "$r2" == 2 ]] || { echo 'FAIL: expected Helm upgrade revision 2' >&2; exit 1; }
helm rollback "$release" 1 -n "$ns" --no-hooks --wait=false >/dev/null
r3="$(revision)"
[[ "$r3" == 3 ]] || { echo 'FAIL: expected Helm rollback revision 3' >&2; exit 1; }
pvc_after="$(kubectl get pvc -n "$ns" -o json |
  python3 -c 'import json,sys; print(sorted(x["metadata"]["name"] for x in json.load(sys.stdin)["items"]))')"
[[ "$pvc_before" == "$pvc_after" ]] || {
  echo 'FAIL: PVC resources changed across chart upgrade/rollback' >&2; exit 1;
}
helm get values "$release" -n "$ns" -o json |
  python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d.get("dash", {}).get("email", {}).get("senderEmail") != "staging-change@example.invalid", "rollback failed to remove upgraded value"
'
echo 'PASS: real Kind Kubernetes API accepted Helm install, upgrade and rollback'
echo 'PASS: Helm revisions 1 -> 2 -> 3 and PVC resource names retained'
echo 'LIMITATION: no readiness, bootstrap/migrations, live Falco or data recovery were certified'
