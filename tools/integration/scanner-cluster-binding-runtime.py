#!/usr/bin/env python3
"""Disposable integration: real scanner grants enforced by NestJS and PostgreSQL.

Run only after browser and scratch-restore acceptance, before Compose teardown.
Restarts ONLY the generated CI Dash service with grants enforcement enabled.
Never targets an existing operator deployment.
"""
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

if os.getenv("M9_SCANNER_BINDINGS_TEST") != "YES" or os.getenv("M9_COMPOSE_PROJECT") != "m9-runtime":
    sys.exit("Refusing scanner grant drill outside explicit disposable m9-runtime CI")
path = Path(".env")
marker = Path("../../tools/browser-e2e/.ci-cluster-id")
if not path.is_file() or not marker.is_file():
    sys.exit("Disposable CI dashboard fixture not initialized")
values = dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line)
cluster_a = int(marker.read_text().strip())
assert cluster_a > 0
key = values["FALCO_API_KEY"]
assert len(key) >= 32 and all(c in "0123456789abcdef" for c in key.lower())
def execute_sql(statement):
    p = subprocess.run(["docker", "compose", "-p", "m9-runtime", "exec", "-T",
        "postgres", "sh", "-c",
        'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        input=statement, text=True, capture_output=True, check=True)
    return p.stdout.strip()

suffix = uuid.uuid4().hex[:12]
cluster_b = int(execute_sql(
    "INSERT INTO clusters(name,ip_address,port,group_id,context) VALUES "
    f"('m9-scanner-denied-{suffix}','127.0.0.3','443',1,'ci') RETURNING id;"
).splitlines()[0])
identity = int(execute_sql(
    "SELECT id FROM users WHERE email='Falco' AND is_active=true LIMIT 1;"
))
execute_sql(
    "INSERT INTO cluster_user_access(cluster_id,user_id,can_write,created_at) "
    f"VALUES ({cluster_a},{identity},true,CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT)) "
    "ON CONFLICT (cluster_id,user_id) DO UPDATE SET can_write=true;"
)

environment = {**os.environ, "SCANNER_REQUIRE_CLUSTER_BINDINGS": "true"}
subprocess.run(
    ["docker", "compose", "-p", "m9-runtime", "up", "-d",
     "--no-deps", "--force-recreate", "dash"],
    env=environment, check=True, capture_output=True, text=True
)
effective = subprocess.run(
    ["docker", "compose", "-p", "m9-runtime", "exec", "-T",
     "dash", "printenv", "SCANNER_REQUIRE_CLUSTER_BINDINGS"],
    text=True, capture_output=True, check=True
).stdout.strip()
if effective != "true":
    raise AssertionError("Dash is not running enforced cluster-binding mode")
health = "http://127.0.0.1:3000/api/health"
for attempt in range(45):
    try:
        with urlopen(health, timeout=5) as response:
            status = json.load(response)
            if response.status == 200 and (status.get("data") or {}).get("postgres") == "OK":
                break
    except (HTTPError, URLError, TimeoutError, ConnectionResetError, ConnectionRefusedError, OSError):
        pass
    time.sleep(2)
else:
    raise AssertionError("Dash failed to restart in enforced scanner grant mode")

def count(cluster_id):
    return int(execute_sql(
        f"SELECT COUNT(*) FROM project_falco_logs WHERE cluster_id={cluster_id};"
    ))
def report(cluster_id, authorized=True):
    data = {
        "hostname": "ci-scanner.invalid",
        "output": "two-cluster scanner authorization probe",
        "priority": "Warning",
        "rule": "m9-ci-scanner-binding",
        "source": "syscall",
        "tags": [],
        "time": "2026-11-11T00:00:00Z",
        "output_fields": {}
    }
    request = Request(
        f"http://127.0.0.1:3000/api/falco/{cluster_id}/create",
        json.dumps(data).encode(),
        ({"Content-Type": "application/json", "X-API-Key": key} if authorized else
         {"Content-Type": "application/json"}), method="POST"
    )
    try:
        with urlopen(request, timeout=15) as response:
            return response.status
    except HTTPError as error:
        return error.code

before_a, before_b = count(cluster_a), count(cluster_b)
if report(cluster_a) not in (200, 201):
    raise AssertionError("Granted scanner refused cluster A")
if report(cluster_b) != 401:
    raise AssertionError("Scanner accepted or misclassified unauthorized cluster B")
if report(cluster_a, authorized=False) != 401:
    raise AssertionError("Anonymous scanner request to granted cluster was not rejected")
if count(cluster_a) != before_a + 1 or count(cluster_b) != before_b:
    raise AssertionError("Scanner grant isolation failed to preserve database boundaries")
print("PASS: scanner X-API-Key with explicit write grant ingested cluster A")
print("PASS: same scanner X-API-Key denied for cluster B with HTTP 401 and no database write")
print("PASS: anonymous scanner rejected even on allowed cluster")
print("PASS: real NestJS enforced SCANNER_REQUIRE_CLUSTER_BINDINGS=true")
