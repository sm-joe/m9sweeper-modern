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

echo 'PASS: original full app, Postgres, RabbitMQ, admin seed and authentication'
