#!/usr/bin/env bash
# Disposable GitHub-hosted native Linux acceptance: install the exact signed
# Helm candidate with real PostgreSQL 17/RabbitMQ 4.4, then verify login and
# Helm lifecycle. Never run in a real operator namespace.
set -euo pipefail
[[ "${M9_MVP_KIND_CI:-}" == APPROVED_GITHUB_CI ]] || {
  echo 'Refusing non-CI Kind MVP installation' >&2; exit 2;
}
[[ "$(uname -s)" == Linux && "${GITHUB_ACTIONS:-}" == true ]] || {
  echo 'Linux GitHub Actions environment required' >&2; exit 2;
}
: "${M9_MVP_CHART:?Set M9_MVP_CHART to the downloaded verified Helm package}"
[[ -s "$M9_MVP_CHART" ]] || { echo 'Missing candidate chart archive' >&2; exit 2; }
for bin in kubectl helm openssl curl python3; do
  command -v "$bin" >/dev/null || { echo "Missing $bin" >&2; exit 2; }
done

namespace=m9-mvp-staging
release=m9-mvp
[[ "$(kubectl config current-context)" == kind-m9-mvp-ci ]] || {
  echo 'Refusing mismatched Kubernetes cluster context' >&2; exit 2;
}
kubectl create namespace "$namespace"
kubectl label namespace "$namespace" m9sweeper-staging=true
umask 077
scratch="$(mktemp -d)"
port_forward_pid=''
cleanup() {
  if [[ -n "$port_forward_pid" ]]; then kill "$port_forward_pid" 2>/dev/null || true; fi
  rm -rf "$scratch"
}
trap cleanup EXIT
secret() { openssl rand -hex 32; }
db_password="$(secret)"
broker_password="$(secret)"
jwt="$(secret)"
cluster_api_key="$(secret)"
trawler_api_key="$(secret)"
hunter_api_key="$(secret)"
bench_api_key="$(secret)"
falco_api_key="$(secret)"
admin_email='mvp-ci@example.com'
admin_password="$(secret)"
cat >"$scratch/dash.env" <<EOF
SECURITY_JWT_SECRET=$jwt
DATABASE_CONNECTION_HOST=ci-postgres
DATABASE_CONNECTION_PORT=5432
DATABASE_CONNECTION_DATABASE=postgres
DATABASE_CONNECTION_USERNAME=postgres
DATABASE_CONNECTION_PASSWORD=$db_password
RABBITMQ_HOST_NAME=ci-rabbitmq
RABBITMQ_HOST_PORT=5672
RABBITMQ_PORT=5672
RABBITMQ_USER_NAME=m9
RABBITMQ_USER_PASSWORD=$broker_password
MSG_QUEUE_NAME_IMAGE_SCANNER=trawler_queue
EOF
cat >"$scratch/init.env" <<EOF
CLUSTER_API_KEY=$cluster_api_key
SUPER_ADMIN_EMAIL=$admin_email
SUPER_ADMIN_PASSWORD=$admin_password
TRAWLER_API_KEY=$trawler_api_key
KUBE_HUNTER_API_KEY=$hunter_api_key
KUBE_BENCH_API_KEY=$bench_api_key
FALCO_API_KEY=$falco_api_key
EOF
cat >"$scratch/trawler.env" <<EOF
RABBITMQ_HOSTNAME=ci-rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=m9
RABBITMQ_PASSWORD=$broker_password
RABBITMQ_QUEUE_NAME=trawler_queue
M9SWEEPER_API_KEY=$trawler_api_key
EOF
kubectl -n "$namespace" create secret generic ci-postgres-secret --from-literal=password="$db_password" >/dev/null
kubectl -n "$namespace" create secret generic ci-rabbitmq-secret --from-literal=password="$broker_password" >/dev/null
kubectl -n "$namespace" create secret generic m9-dash-env --from-env-file="$scratch/dash.env" >/dev/null
kubectl -n "$namespace" create secret generic m9-init-env --from-env-file="$scratch/init.env" >/dev/null
kubectl -n "$namespace" create secret generic m9-trawler-env --from-env-file="$scratch/trawler.env" >/dev/null
# Isolated ephemeral test databases intentionally use emptyDir; production
# deployment must use supported persistence and backup/restore separately.
cat >"$scratch/deps.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ci-postgres
spec:
  replicas: 1
  selector:
    matchLabels: {app: ci-postgres}
  template:
    metadata:
      labels: {app: ci-postgres}
    spec:
      containers:
        - name: postgres
          image: postgres:17-alpine
          ports: [{containerPort: 5432}]
          env:
            - {name: POSTGRES_USER, value: postgres}
            - {name: POSTGRES_DB, value: postgres}
            - {name: PGDATA, value: /var/lib/postgresql/data/pgdata}
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef: {name: ci-postgres-secret, key: password}
          volumeMounts:
            - {name: pgdata, mountPath: /var/lib/postgresql/data}
          readinessProbe:
            exec:
              command: [sh, -c, "pg_isready -U postgres -d postgres"]
            periodSeconds: 5
      volumes:
        - name: pgdata
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: ci-postgres
spec:
  selector: {app: ci-postgres}
  ports: [{port: 5432, targetPort: 5432}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ci-rabbitmq
spec:
  replicas: 1
  selector:
    matchLabels: {app: ci-rabbitmq}
  template:
    metadata:
      labels: {app: ci-rabbitmq}
    spec:
      containers:
        - name: rabbitmq
          image: rabbitmq:4.4-management-alpine
          ports: [{containerPort: 5672}]
          env:
            - {name: RABBITMQ_DEFAULT_USER, value: m9}
            - name: RABBITMQ_DEFAULT_PASS
              valueFrom:
                secretKeyRef: {name: ci-rabbitmq-secret, key: password}
          readinessProbe:
            exec:
              command: [sh, -c, "rabbitmq-diagnostics -q check_running"]
            periodSeconds: 10
      volumes: []
---
apiVersion: v1
kind: Service
metadata:
  name: ci-rabbitmq
spec:
  selector: {app: ci-rabbitmq}
  ports: [{port: 5672, targetPort: 5672}]
EOF
kubectl -n "$namespace" apply -f "$scratch/deps.yaml" >/dev/null
kubectl -n "$namespace" rollout status deployment/ci-postgres --timeout=8m
kubectl -n "$namespace" rollout status deployment/ci-rabbitmq --timeout=8m

export M9_MVP_PREFLIGHT=YES M9_EXPECTED_KUBE_CONTEXT=kind-m9-mvp-ci
python3 tools/security/mvp_preinstall_secrets.py --namespace "$namespace"

values=(--set global.mvp.enabled=true
        --set global.postgres.enabled=false
        --set global.rabbitmq.enabled=false
        --set-string dash.existingSecret=m9-dash-env
        --set-string dash.init.existingSecret=m9-init-env
        --set-string trawler.existingSecret=m9-trawler-env
        --set-string global.baseUrl="http://m9-mvp-dash.$namespace.svc:3000"
        --set-string trawler.dashUrl="http://m9-mvp-dash.$namespace.svc:3000"
        --set dash.clusterScraping.scheduled.enabled=false
        --set dash.clusterScraping.history.enabled=false
        --set dash.clusterScraping.gatekeeperExceptionBlock.enabled=false
        --set dash.clusterScraping.updateExceptionStatus.enabled=false)
helm template "$release" "$M9_MVP_CHART" -n "$namespace" "${values[@]}" >"$scratch/render.yaml"
python3 - "$scratch/render.yaml" <<'PY'
from pathlib import Path
import sys
docs = Path(sys.argv[1]).read_text()
if 'kind: StatefulSet' in docs or 'ci-postgres-secret' in docs:
    raise SystemExit('MVP chart unexpectedly includes legacy database resources')
if 'kind: Deployment' not in docs:
    raise SystemExit('MVP chart has no Deployment')
print('PASS: downloaded Helm candidate renders using external dependencies')
PY

echo 'Installing actual signed candidate to disposable native Linux Kind'
helm upgrade --install "$release" "$M9_MVP_CHART" -n "$namespace" "${values[@]}" \
  --wait --timeout 15m
kubectl -n "$namespace" rollout status deployment/m9-mvp-dash --timeout=5m
kubectl -n "$namespace" rollout status deployment/m9-mvp-trawler --timeout=5m
kubectl -n "$namespace" get pods -o wide
kubectl -n "$namespace" get jobs
kubectl -n "$namespace" port-forward service/m9-mvp-dash 13000:3000 >"$scratch/port-forward.log" 2>&1 &
port_forward_pid="$!"
healthy=0
for attempt in {1..60}; do
  if curl -fsS --max-time 3 http://127.0.0.1:13000/api/health >"$scratch/health.json" 2>/dev/null; then
    if python3 - "$scratch/health.json" <<'PY'
import json,sys
payload=json.load(open(sys.argv[1]))
assert payload.get("success") is True
assert payload.get("data",{}).get("postgres") == "OK"
PY
    then healthy=1;break;fi
  fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { echo 'FAIL: postinstall Dash health unavailable or DB unhealthy' >&2; exit 1; }
echo 'PASS: signed candidate Dash API and PostgreSQL health'

# A seeded real admin must be able to obtain an access token. Never expose
# the token or its raw JSON response in public GitHub Actions logs.
login_ok=0
for attempt in {1..20}; do
  if curl -fsS --max-time 8 -H 'Content-Type: application/json' \
    -d "{\"username\":\"$admin_email\",\"password\":\"$admin_password\"}" \
    http://127.0.0.1:13000/auth/non-redirectable-login/local >"$scratch/login.json" 2>/dev/null; then
    if python3 - "$scratch/login.json" <<'PY'
import json,sys
payload=json.load(open(sys.argv[1]))
assert isinstance(payload.get('data',{}).get('accessToken'),str)
assert len(payload['data']['accessToken'])>20
PY
    then login_ok=1;break;fi
  fi
  sleep 3
done
[[ "$login_ok" == 1 ]] || { echo 'FAIL: seeded admin unable to log in to signed candidate Dash' >&2; exit 1; }
echo 'PASS: signed candidate seeded administrator authentication'

# Prove a real scanned image survives the full signed Helm installation,
# not just the prior Compose scanner acceptance. Secrets stay in memory only.
M9_MVP_ADMIN_EMAIL="$admin_email" M9_MVP_ADMIN_PASSWORD="$admin_password" \
  python3 tools/integration/mvp_helm_trivy_acceptance.py


# Confirm resource reconciliation across upgrade and rollback without
# interpreting Helm success as a database schema downgrade guarantee.
helm upgrade "$release" "$M9_MVP_CHART" -n "$namespace" "${values[@]}" --wait --timeout 15m
helm rollback "$release" 1 -n "$namespace" --wait --timeout 15m
kubectl -n "$namespace" rollout status deployment/m9-mvp-dash --timeout=5m
kubectl -n "$namespace" rollout status deployment/m9-mvp-trawler --timeout=5m
echo 'PASS: signed candidate clean installation, login, upgrade and rollback on disposable Linux Kind'
echo 'LIMITATIONS: native Falco, persistence migration recovery and scanner results require separate evidence'
