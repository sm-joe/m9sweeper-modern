#!/usr/bin/env bash
# Verified candidate installer for an isolated Linux Kubernetes MVP staging namespace.
# It never creates the database, broker, credentials, namespace or Secrets.
# It cannot be used for production without separate release sign-off.
set -euo pipefail
[[ "${M9_MVP_INSTALL_CONFIRM:-}" == INSTALL_STAGING_ONLY ]] || {
  echo 'FAIL: set M9_MVP_INSTALL_CONFIRM=INSTALL_STAGING_ONLY explicitly' >&2; exit 2;
}
[[ "$(uname -s)" == Linux ]] || { echo 'FAIL: native Linux required' >&2; exit 2; }
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo 'FAIL: WSL is not approved as a native public beta acceptance host' >&2; exit 2
fi

: "${M9_EXPECTED_KUBE_CONTEXT:?M9_EXPECTED_KUBE_CONTEXT is required}"
: "${M9_MVP_CHART:?M9_MVP_CHART is required (signed .tgz)}"
: "${M9_MVP_VALUES:?M9_MVP_VALUES is required (private YAML file)}"
: "${M9_MVP_ARTIFACT_DIR:?M9_MVP_ARTIFACT_DIR is required}"
: "${M9_MVP_SECRET_CHECKER:?M9_MVP_SECRET_CHECKER is required (packaged Python preflight)}"
namespace="${M9_MVP_NAMESPACE:-m9-mvp-staging}"
release="${M9_MVP_RELEASE:-m9-mvp}"
[[ "$namespace" =~ ^m9-[a-z0-9-]*staging$ ]] || {
  echo 'FAIL: installer only accepts dedicated m9-*staging namespaces' >&2; exit 2;
}
[[ "$release" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || {
  echo 'FAIL: invalid Helm release name' >&2; exit 2;
}
[[ "$M9_MVP_CHART" == *.tgz && -s "$M9_MVP_CHART" &&
   -r "$M9_MVP_VALUES" && -d "$M9_MVP_ARTIFACT_DIR" &&
   -r "$M9_MVP_SECRET_CHECKER" ]] || {
  echo 'FAIL: chart, private values, artifact directory or preflight script missing' >&2; exit 2;
}
for bin in helm kubectl python3 sha256sum cosign; do
  command -v "$bin" >/dev/null || { echo "FAIL: missing $bin" >&2; exit 2; }
done
[[ "$(kubectl config current-context)" == "$M9_EXPECTED_KUBE_CONTEXT" ]] || {
  echo 'FAIL: kubectl current context does not match expected staging context' >&2; exit 2;
}
[[ "$(kubectl get namespace "$namespace" -o 'go-template={{index .metadata.labels "m9sweeper-staging"}}')" == true ]] || {
  echo 'FAIL: namespace does not carry m9sweeper-staging=true' >&2; exit 2;
}
# Exact source bundle: signature is tied to the approved CI identity, not a
# filename or a mutable registry tag. Never print Secret values.
artifact_dir="$(cd "$M9_MVP_ARTIFACT_DIR" && pwd -P)"
[[ -s "$artifact_dir/SHA256SUMS" && -s "$artifact_dir/chart.sigstore.json" &&
   -s "$artifact_dir/IMAGE-DIGESTS.txt" ]] || {
  echo 'FAIL: checksum, chart signature or immutable image manifest missing' >&2; exit 2;
}
(cd "$artifact_dir" && sha256sum -c SHA256SUMS >/dev/null) || {
  echo 'FAIL: published artifact checksum verification failed' >&2; exit 1;
}
identity='https://github.com/sm-joe/m9sweeper-modern/.github/workflows/signed-linux-candidate.yml@refs/heads/main'
issuer='https://token.actions.githubusercontent.com'
cosign verify-blob --bundle "$artifact_dir/chart.sigstore.json" \
  --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" \
  "$M9_MVP_CHART" >/dev/null || {
  echo 'FAIL: candidate chart signature verification failed' >&2; exit 1;
}
for component in dash trawler; do
  image="$(sed -n "s/^$component=//p" "$artifact_dir/IMAGE-DIGESTS.txt")"
  [[ "$image" =~ ^ghcr.io/sm-joe/m9sweeper-(dash|trawler)@sha256:[a-f0-9]{64}$ ]] || {
    echo "FAIL: missing digest for $component" >&2; exit 1;
  }
  cosign verify --certificate-identity "$identity" \
    --certificate-oidc-issuer "$issuer" "$image" >/dev/null || {
    echo "FAIL: $component image signature invalid" >&2; exit 1;
  }
done
export M9_MVP_PREFLIGHT=YES
python3 "$M9_MVP_SECRET_CHECKER" --namespace "$namespace"
helm lint "$M9_MVP_CHART" -f "$M9_MVP_VALUES" >/dev/null
helm template "$release" "$M9_MVP_CHART" -n "$namespace" \
  -f "$M9_MVP_VALUES" >/dev/null
echo 'PASS: verified immutable release package and safe staging Secret preflight'
helm upgrade --install "$release" "$M9_MVP_CHART" -n "$namespace" \
  -f "$M9_MVP_VALUES" --wait --timeout 15m
kubectl -n "$namespace" rollout status "deployment/$release-dash" --timeout=5m
kubectl -n "$namespace" rollout status "deployment/$release-trawler" --timeout=5m
echo 'PASS: staging Helm installation and core deployment rollout completed'
echo 'NEXT: explicitly verify real Trivy scan, Angular findings, backup/restore and upgrade/rollback before public beta publication'
