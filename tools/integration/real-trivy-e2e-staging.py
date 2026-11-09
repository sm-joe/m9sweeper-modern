#!/usr/bin/env python3
"""Real RabbitMQ -> Java Trivy -> NestJS -> PostgreSQL staging acceptance.

Run ONLY on an isolated Linux Compose staging host with
M9_STAGING_E2E_TEST=YES python3 tools/integration/real-trivy-e2e-staging.py
No synthetic scanner result is ever inserted. Staging fixture is retained.
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

if os.getenv("M9_STAGING_E2E_TEST") != "YES":
    sys.exit("Set M9_STAGING_E2E_TEST=YES only on an isolated staging host")
root = Path(__file__).resolve().parents[2]
env_file = root / "platform/docker-compose/.env"
if not env_file.is_file():
    sys.exit("Missing staging Compose .env")
env = dict(line.split("=", 1) for line in env_file.read_text().splitlines()
           if "=" in line and not line.startswith("#"))

def command(*args, input_text=None):
    return subprocess.run(args, input=input_text, text=True, capture_output=True,
                          check=True).stdout.strip()

def query(statement):
    return command("docker", "exec", "-i", "postgres", "sh", "-c",
                   'psql -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
                   input_text=statement)

def insert_id(statement):
    result = query(statement)
    if not re.fullmatch(r"[1-9][0-9]*", result):
        sys.exit("Failed to insert staging test fixture")
    return int(result)

def api(route, token=None, method="GET", body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request("http://127.0.0.1:3000" + route,
                  json.dumps(body).encode() if body is not None else None,
                  headers, method=method)
    with urlopen(req, timeout=25) as response:
        return json.load(response)

# Real disposable fixture: never alter an existing cluster/image/policy.
name = "m9-trivy-e2e-" + str(int(time.time()))
if int(query("SELECT COUNT(*) FROM docker_registries WHERE hostname='docker.io' AND deleted_at IS NULL;")) < 1:
    sys.exit("Dockerhub registry missing; initialize Dash first")
group_id = insert_id(
    "INSERT INTO cluster_group(name,user_id) SELECT '" + name +
    "',id FROM users ORDER BY id LIMIT 1 RETURNING id;")
cluster_id = insert_id(
    "INSERT INTO clusters(name,ip_address,port,group_id,context) VALUES ('" +
    name + "','127.0.0.1','443'," + str(group_id) + ",'staging-e2e') RETURNING id;")
policy_id = insert_id(
    "INSERT INTO policies(name,enabled,enforcement,relevant_for_all_clusters) VALUES ('" +
    name + "',true,false,false) RETURNING id;")
query("INSERT INTO scanners(name,type,enabled,required,policy_id) VALUES ('" +
      name + "','TRIVY',true,true," + str(policy_id) + ");")
query("INSERT INTO policy_cluster(cluster_id,policy_id,active) VALUES (" +
      str(cluster_id) + "," + str(policy_id) + ",true);")
image_id = insert_id(
    "INSERT INTO images(url,name,tag,docker_image_id,summary,cluster_id,image) "
    "VALUES('docker.io','library/alpine','3.21','" + name + "','{}'," +
    str(cluster_id) + ",'docker.io/library/alpine:3.21') RETURNING id;")
query("INSERT INTO cluster_user_access(cluster_id,user_id,can_write,created_at) "
      "SELECT " + str(cluster_id) + ",id,true,"
      "CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT) "
      "FROM users WHERE email='Trawler' ON CONFLICT(cluster_id,user_id) "
      "DO UPDATE SET can_write=true;")
print(f"Staging fixture cluster={cluster_id} image={image_id} policy={policy_id}")
command("docker", "compose", "-f", str(root / "platform/docker-compose/docker-compose.yml"),
        "up", "-d", "trawler")
auth = api("/auth/non-redirectable-login/local", method="POST", body={
    "username": env["SUPER_ADMIN_EMAIL"], "password": env["SUPER_ADMIN_PASSWORD"]
})
token = (auth.get("data") or {}).get("accessToken")
if not token:
    sys.exit("Staging login failed; no scan queued")
queued = api(f"/api/clusters/{cluster_id}/images/scan", token, "POST",
             {"imageIds": [image_id]})
if queued.get("success") is False:
    sys.exit("NestJS rejected the scanner queue request")
print("PASS: queued a real image scan via authenticated NestJS")
for attempt in range(240):
    latest = api(f"/api/clusters/{cluster_id}/images/{image_id}/scan-run/latest", token)
    run = latest.get("data")
    if run and run.get("status") in ("completed", "failed"):
        if run["status"] == "failed":
            sys.exit("FAIL: actual Trivy run failed: " +
                     str(run.get("failure_reason") or "unknown"))
        print("PASS: Java/Trivy scanner committed durable run " + run["id"])
        break
    time.sleep(10)
else:
    sys.exit("FAIL: real queued scan did not complete within acceptance window")
test_env = dict(os.environ, CLUSTER_ID=str(cluster_id), IMAGE_ID=str(image_id))
subprocess.run(["bash", str(root / "scripts/verify-trivy-e2e-linux.sh")],
               env=test_env, check=True, cwd=root)
print(f"PASS: real queued Java Trivy -> NestJS -> PostgreSQL scan for {name}")
print("Review the same image in Angular for the final browser acceptance gate.")
