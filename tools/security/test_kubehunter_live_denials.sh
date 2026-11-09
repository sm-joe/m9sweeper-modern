#!/bin/sh
# Run from a Kubernetes Pod with trusted CA mounted; no real API keys used.
# Required: REPORT_URL=https://.../api/kubehunter/hunter/<cluster-id>
#           CA_FILE=/tls/ca.crt
set -eu
: "${REPORT_URL:?set a Kind-local HTTPS report endpoint}"
: "${CA_FILE:?set trusted CA certificate file path}"
case "$REPORT_URL" in
  https://*'/api/kubehunter/hunter/'*) ;;
  *) echo 'ERROR: HTTPS kube-hunter ingest URL required' >&2; exit 2 ;;
esac
[ -f "$CA_FILE" ] || { echo 'ERROR: CA file not found' >&2; exit 2; }
check() {
  description="$1"
  shift
  code="$(curl --silent --show-error --max-time 20 --cacert "$CA_FILE" \
    -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' -d '{}' "$@" "$REPORT_URL")"
  case "$code" in
    401|403) echo "PASS: $description rejected with HTTP $code" ;;
    *) echo "FAIL: $description returned HTTP $code (must reject)" >&2; exit 1 ;;
  esac
}
check "missing credential"
check "invalid X-API-Key" -H 'X-API-Key: deliberately-invalid-staging-probe-0f4cb4f2'
echo 'PASS: unauthenticated kube-hunter report submissions rejected'
