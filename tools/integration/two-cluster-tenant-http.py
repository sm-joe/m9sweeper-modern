#!/usr/bin/env python3
"""Disposable two-cluster HTTP tenant isolation acceptance.

Runs within the existing m9-runtime CI Compose stack after runtime-smoke.sh.
Creates two isolated clusters and a temporary ADMIN API-key identity with a
read-only grant for cluster A only. Tests real NestJS guards, HTTP responses,
and PostgreSQL state, not only mocked service methods.
"""
import json
import secrets
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

if not Path(".env").is_file() or not Path("../../tools/browser-e2e/.ci-cluster-id").is_file():
    sys.exit("Refusing to run outside initialized disposable m9-runtime CI stack")
env = dict(line.split("=", 1) for line in Path(".env").read_text().splitlines() if "=" in line)
cluster_a = int(Path("../../tools/browser-e2e/.ci-cluster-id").read_text().strip())
if cluster_a < 1:
    sys.exit("Invalid CI fixture cluster")
prefix = "m9-tenant-e2e-" + uuid.uuid4().hex[:12]
token = secrets.token_hex(32)

def sql(statement):
    result = subprocess.run(
        ["docker", "compose", "-p", "m9-runtime", "exec", "-T", "postgres",
         "sh", "-c", 'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        input=statement, text=True, capture_output=True, check=True
    )
    return result.stdout.strip()

# Every dynamic SQL string is generated locally from hex / numeric fixtures,
# not input from a request or an external user.
cluster_b = int(sql(
    f"INSERT INTO clusters(name,ip_address,port,group_id,context) "
    f"VALUES ('{prefix}','127.0.0.2','443',1,'ci') RETURNING id;"
).splitlines()[0])
email = prefix + "@example.invalid"
user_id = int(sql(
    "INSERT INTO users(first_name,last_name,email,source_system_id,"
    "source_system_type,source_system_user_id,is_active) VALUES "
    f"('CI','Tenant','{email}','local','local','{prefix}',true) RETURNING id;"
).splitlines()[0])
sql(
    f"INSERT INTO user_authorities(user_id,authority_id,active) VALUES ({user_id},2,true);"
    f"INSERT INTO api_keys(user_id,name,api,is_active) VALUES "
    f"({user_id},'CI Tenant Acceptance','{token}',true);"
    "INSERT INTO cluster_user_access(cluster_id,user_id,can_write,created_at) VALUES "
    f"({cluster_a},{user_id},false,CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT));"
)

def call(method, url, body=None):
    req = Request("http://127.0.0.1:3000" + url,
                  None if body is None else json.dumps(body).encode(),
                  {"X-API-Key": token, "Content-Type": "application/json"}, method=method)
    try:
        with urlopen(req, timeout=20) as response:
            return response.status
    except HTTPError as error:
        return error.code

def require(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {actual}")
    print(f"PASS: {label} (HTTP {expected})")

# An ADMIN role grants visibility only on explicitly authorized cluster A.
require(call("GET", "/api/falco?" + urlencode({"cluster-id": cluster_a})), 200,
        "granted cluster A Falco inventory")
require(call("GET", "/api/falco?" + urlencode({"cluster-id": cluster_b})), 403,
        "foreign cluster B Falco inventory denied")
require(call("GET", f"/api/policies/by-cluster/{cluster_a}"), 200,
        "granted cluster A policy read")
require(call("GET", f"/api/policies/by-cluster/{cluster_b}"), 403,
        "foreign cluster B policy read denied")

# Real policy read isolation: separate policy A, foreign policy B, mixed A+B,
# and one legitimate global policy. No user input enters these SQL fixtures.
policy_rows = sql(
    "INSERT INTO policies(name,enabled,enforcement,relevant_for_all_clusters) VALUES "
    f"('{prefix}-a',true,true,false),"
    f"('{prefix}-b',true,true,false),"
    f"('{prefix}-mixed',true,true,false),"
    f"('{prefix}-global',true,true,true) RETURNING id;"
)
policy_ids = [int(value) for value in policy_rows.splitlines() if value.strip().isdigit()]
if len(policy_ids) != 4:
    raise AssertionError("Expected four isolated policies for tenant read acceptance")
policy_a, policy_b, policy_mixed, policy_global = policy_ids
sql(
    "INSERT INTO policy_cluster(policy_id,cluster_id,active) VALUES "
    f"({policy_a},{cluster_a},true),"
    f"({policy_b},{cluster_b},true),"
    f"({policy_mixed},{cluster_a},true),"
    f"({policy_mixed},{cluster_b},true);"
)
for policy_id, expected, label in (
    (policy_a, 200, "single-cluster authorized policy"),
    (policy_b, 403, "foreign-cluster policy"),
    (policy_mixed, 403, "policy spanning authorized and foreign clusters"),
    (policy_global, 200, "global policy read-only visibility")
):
    require(call("GET", f"/api/policies/{policy_id}"), expected, label + " detail")
    require(call("GET", f"/api/policies/{policy_id}/clusters"), expected, label + " cluster map")

def policy_page(params):
    req = Request("http://127.0.0.1:3000/api/policies?" + urlencode(params),
                  headers={"X-API-Key": token})
    with urlopen(req, timeout=20) as response:
        return json.load(response)

page = policy_page({"page": 0, "limit": 100})
body = page.get("data", page)
visible = {int(item["id"]) for item in body["list"]}
if policy_a not in visible or policy_global not in visible:
    raise AssertionError("Authorized policy inventory omitted expected visible policies")
if policy_b in visible or policy_mixed in visible:
    raise AssertionError("Paginated policy inventory leaked foreign or mixed-tenant resources")
if int(body["totalCount"]) < len(visible):
    raise AssertionError("Authorized policy inventory returned inconsistent totalCount")
require(call("GET", "/api/policies?limit=101"), 400, "reject oversized policy pagination")
require(call("GET", "/api/policies?page=-1"), 400, "reject negative policy pagination")
print("PASS: real policy inventory and counts are tenant filtered before pagination")

before = sql(f"SELECT COUNT(*) FROM falco_settings WHERE cluster_id IN ({cluster_a},{cluster_b});")
# Role ADMIN without a write grant is insufficient even for cluster A.
for cluster in (cluster_a, cluster_b):
    require(call("POST", f"/api/falco/{cluster}/settings", {}), 403,
            f"write without cluster grant denied on cluster {cluster}")
after = sql(f"SELECT COUNT(*) FROM falco_settings WHERE cluster_id IN ({cluster_a},{cluster_b});")
if before != after:
    raise AssertionError("Denied cross-tenant HTTP requests changed Falco setting rows")
print("PASS: two-cluster authorization denied writes without persistence")
print("PASS: disposable ADMIN identity was not granted access to foreign cluster")
