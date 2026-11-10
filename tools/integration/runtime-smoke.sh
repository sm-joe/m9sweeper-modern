#!/usr/bin/env bash
# Full original application runtime smoke. No mock API or in-memory data.
set -euo pipefail
cd "$(dirname "$0")/../../platform/docker-compose"
python3 - <<'PY'
import secrets
from pathlib import Path
p=Path(".env")
s=Path(".env.sample").read_text()
values={
"SUPER_ADMIN_EMAIL":"runtime-ci@example.invalid",
"SUPER_ADMIN_PASSWORD":secrets.token_hex(24),
"DATABASE_PASSWORD":secrets.token_hex(24),
"SECURITY_JWT_SECRET":secrets.token_hex(48),
"TRAWLER_API_KEY":secrets.token_hex(32),
"FALCO_API_KEY":secrets.token_hex(32),
"KUBE_BENCH_API_KEY":secrets.token_hex(32),
"KUBE_HUNTER_API_KEY":secrets.token_hex(32),
"RABBITMQ_USERNAME":"m9runtime",
"RABBITMQ_PASSWORD":secrets.token_hex(24),
"NODE_CRON_ENABLED":"0",
}
p.write_text("\n".join((line.split("=",1)[0]+"="+values[line.split("=",1)[0]]) if line.split("=",1)[0] in values else line for line in s.splitlines())+"\n")
PY
# Compose uses full NestJS/Angular app and real PostgreSQL/RabbitMQ.
docker compose -p m9-runtime config --quiet
docker compose -p m9-runtime up --build -d postgres rabbitmq dash
echo "Waiting for real dashboard and database migrations"
ready=0
for attempt in $(seq 1 90); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health > /tmp/m9-health.json; then ready=1; break; fi
  sleep 5
done
if [[ "$ready" != 1 ]]; then
  echo "Dashboard never became healthy" >&2
  docker compose -p m9-runtime logs --tail=120 dash postgres rabbitmq >&2
  exit 1
fi
docker compose -p m9-runtime run --rm dash-init
curl -fsS --max-time 10 http://127.0.0.1:3000/public/login >/tmp/m9-login.html ||   curl -fsS --max-time 10 http://127.0.0.1:3000/ >/tmp/m9-login.html
python3 - <<'PY'
import json
d=json.load(open('/tmp/m9-health.json'))
print('Dashboard health:',d)
assert isinstance(d,dict)
PY
python3 - <<'PY'
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from pathlib import Path
import json
env=dict(line.split("=",1) for line in Path(".env").read_text().splitlines() if "=" in line)
body=json.dumps({"username":env["SUPER_ADMIN_EMAIL"],"password":env["SUPER_ADMIN_PASSWORD"]}).encode()
routes=["/auth/non-redirectable-login/local"]
for route in routes:
    try:
        req=Request("http://127.0.0.1:3000"+route,body,{"Content-Type":"application/json"},method="POST")
        with urlopen(req,timeout=15) as response: data=json.loads(response.read())
        assert (data.get("data") or {}).get("accessToken"), "Login did not return a JWT"
        print("PASS: seeded admin logs in through original NestJS authentication API at",route)
        break
    except HTTPError as exc:
        if exc.code==404: continue
        raise AssertionError("Admin login failed at "+route+": HTTP "+str(exc.code)) from exc
else:
    raise AssertionError("Admin login endpoint not found")
PY
docker compose -p m9-runtime exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose -p m9-runtime exec -T rabbitmq rabbitmq-diagnostics -q check_running
# Prove worker identities and their API keys exist after *real* database initialization.
# An empty user lookup must never be mistaken for a provisioned service account.
identities="$(docker compose -p m9-runtime exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(DISTINCT u.email) FROM users u JOIN api_keys a ON a.user_id=u.id AND a.is_active=true WHERE u.email IN ('"'"'Trawler'"'"','"'"'Kubebench'"'"','"'"'Kubehunter'"'"','"'"'Falco'"'"','"'"'Metrics'"'"');"' | tr -d '[:space:]')"
if [[ "$identities" != "5" ]]; then
  echo "FAIL: only $identities/5 service identities have active API keys" >&2
  exit 1
fi
echo "PASS: five original scanner/metrics service accounts have active persisted API keys"

# A report upload without a credential must fail with HTTP 401, not silently accept or persist it.
status="$(curl -s -o /tmp/m9-unauthorized-bench.json -w '%{http_code}' --max-time 15 -X POST \
  -H 'Content-Type: application/json' --data '{"Controls":[],"Totals":{"total_pass":0}}' \
  http://127.0.0.1:3000/api/kube-bench/1)"
if [[ "$status" != '401' ]]; then
  echo "FAIL: unauthenticated kube-bench ingestion returned HTTP $status instead of 401" >&2
  exit 1
fi
echo 'PASS: unauthenticated kube-bench upload rejected with 401'

# Exercise actual scanner controllers against running NestJS + PostgreSQL.
# Empty/invalid credentials must not create any report row, even when the
# original Compose install is running in transitional compatibility mode.
db_count() {
  docker compose -p m9-runtime exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -v ON_ERROR_STOP=1 -c "SELECT (SELECT COUNT(*) FROM kube_hunter) || '\''|'\'' || (SELECT COUNT(*) FROM project_falco_logs);"'
}
before="$(db_count | tr -d '[:space:]')"
for credential_case in missing invalid; do
  key_header=()
  if [[ "$credential_case" == invalid ]]; then
    key_header=(-H 'X-API-Key: m9-ci-intentionally-invalid-key-not-a-secret')
  fi
  hunter_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X POST \
    -H 'Content-Type: text/plain' "${key_header[@]}" --data '{}' \
    http://127.0.0.1:3000/api/kubehunter/hunter/1)"
  [[ "$hunter_code" == 401 || "$hunter_code" == 403 ]] || {
    echo "FAIL: kube-hunter $credential_case credential returned HTTP $hunter_code" >&2; exit 1;
  }
  falco_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X POST \
    -H 'Content-Type: application/json' "${key_header[@]}" \
    --data '{"hostname":"ci-host.invalid","output":"not-a-real-event","priority":"Warning","rule":"ci-negative","source":"syscall","tags":[],"time":"2026-11-09T00:00:00Z","output_fields":{}}' \
    http://127.0.0.1:3000/api/falco/1/create)"
  [[ "$falco_code" == 401 || "$falco_code" == 403 ]] || {
    echo "FAIL: Falco $credential_case credential returned HTTP $falco_code" >&2; exit 1;
  }
  echo "PASS: $credential_case scanner credentials denied for kube-hunter and Falco"
done
# A real scanner key supplied only in a URL must be rejected when the default
# header-only mode is active. This tests the actual NestJS auth path, not
# merely the value in docker compose config.
python3 - <<'PY'
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
env = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines() if '=' in line)
url = 'http://127.0.0.1:3000/api/falco/1/create?key=' + quote(env['FALCO_API_KEY'], safe='')
valid_event = {
    'hostname': 'ci-host.invalid', 'output': 'authentication-negative-test',
    'priority': 'Warning', 'rule': 'ci-query-key-denial', 'source': 'syscall',
    'tags': [], 'time': '2026-11-09T00:00:00Z', 'output_fields': {}
}
request = Request(url, json.dumps(valid_event).encode('utf8'),
                  {'Content-Type': 'application/json'}, method='POST')
try:
    with urlopen(request, timeout=15) as response:
        raise AssertionError('URL scanner key was accepted: HTTP ' + str(response.status))
except HTTPError as error:
    if error.code != 401:
        raise AssertionError('URL scanner key must fail authentication (401), got HTTP ' + str(error.code))
print('PASS: valid scanner credential in URL is rejected without X-API-Key header')
PY
after="$(db_count | tr -d '[:space:]')"
if [[ "$before" != "$after" ]]; then
  echo "FAIL: unauthorized scanner calls changed persisted report counts" >&2; exit 1;
fi
echo 'PASS: unauthorized scanner calls persisted no kube-hunter/Falco report rows'

# Fresh integration fixture lives only inside the disposable GitHub CI Compose
# database. Prove actual authenticated HTTP -> NestJS -> PostgreSQL persistence,
# not simply that the scanner process can run.
ci_cluster_id="$(docker compose -p m9-runtime exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -v ON_ERROR_STOP=1 \
  -c "INSERT INTO clusters(name,ip_address,port,group_id,context) VALUES ('\''m9-ci-collector-fixture'\'','\''127.0.0.1'\'','\''443'\'',1,'\''ci'\'') RETURNING id;"' | tr -d '[:space:]')"
[[ "$ci_cluster_id" =~ ^[1-9][0-9]*$ ]] || {
  echo "FAIL: no disposable cluster record to test scanner ingestion" >&2; exit 1;
}
# Expose only the disposable cluster ID (never a credential) to the Chromium
# acceptance suite running later in this same GitHub Actions checkout.
printf '%s\\n' "$ci_cluster_id" > ../../tools/browser-e2e/.ci-cluster-id
python3 - "$ci_cluster_id" <<'PY'
import json,sys
from pathlib import Path
from urllib.request import Request,urlopen
cluster_id=int(sys.argv[1])
env=dict(line.split('=',1) for line in Path('.env').read_text().splitlines() if '=' in line)
url='http://127.0.0.1:3000/api/'
test_cases=[
    ('kubehunter/hunter/', 'KUBE_HUNTER_API_KEY', {
        'nodes': {}, 'services': {}, 'vulnerabilities': {'value': []}
    }),
    ('falco/', 'FALCO_API_KEY', {
        'hostname': 'ci-host.invalid', 'output': 'ci-generated integration event',
        'priority': 'Warning', 'rule': 'm9-runtime-integration-ci',
        'source': 'syscall', 'tags': [], 'time': '2026-11-09T00:00:00Z',
        'output_fields': {'k8s.ns.name': 'm9-ci', 'k8s.pod.name':'ci-probe'}
    })
]
for route,keyname,body in test_cases:
    fullpath=(url+route+str(cluster_id)) if route.startswith('falco/') else (url+route+str(cluster_id))
    if route.startswith('falco/'): fullpath += '/create'
    req=Request(fullpath, json.dumps(body).encode('utf8'), {
        'Content-Type':'application/json',
        'X-API-Key':env[keyname]
    },method='POST')
    with urlopen(req,timeout=20) as resp:
        if resp.status not in (200,201):
            raise AssertionError(f'{route} unexpected response {resp.status}')
    print(f'PASS: authenticated {route} accepted using header-only test credential')
PY

hunter_records="$(docker compose -p m9-runtime exec -T postgres sh -c \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -qAt -v ON_ERROR_STOP=1 \
   -c 'SELECT COUNT(*) FROM kube_hunter WHERE cluster_id=$ci_cluster_id;'" | tr -d '[:space:]')"
falco_records="$(docker compose -p m9-runtime exec -T postgres sh -c \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -qAt -v ON_ERROR_STOP=1 \
   -c 'SELECT COUNT(*) FROM project_falco_logs WHERE cluster_id=$ci_cluster_id;'" | tr -d '[:space:]')"
[[ "$hunter_records" == "1" && "$falco_records" == "1" ]] || {
  echo "FAIL: expected one persisted kube-hunter and one Falco report for CI cluster" >&2; exit 1;
}
echo 'PASS: real kube-hunter and Falco webhook reports persisted to Postgres under the selected cluster'



echo 'PASS: original full app, Postgres, RabbitMQ, admin seed and authentication'
