#!/usr/bin/env python3
"""Run actual authenticated Java/Trivy scan against a freshly installed signed Helm MVP.
Only disposable native-Linux Kind on GitHub Actions. Never run against real users'
clusters, images or databases. Does not fabricate scanner result payloads.
"""
import json
import os
import re
import subprocess
import sys
import time
from urllib.request import Request, urlopen

if (os.getenv("M9_MVP_KIND_CI") != "APPROVED_GITHUB_CI"
        or os.getenv("GITHUB_ACTIONS") != "true"):
    sys.exit("Refusing Trivy acceptance outside disposable GitHub-hosted Kind")
namespace = "m9-mvp-staging"
if subprocess.check_output(["kubectl", "config", "current-context"], text=True).strip() != "kind-m9-mvp-ci":
    sys.exit("Refusing Trivy acceptance on unapproved Kubernetes context")
email = os.environ.get("M9_MVP_ADMIN_EMAIL")
password = os.environ.get("M9_MVP_ADMIN_PASSWORD")
if not email or not password:
    sys.exit("Missing private disposable admin credentials")


def sql(statement):
    result = subprocess.run(
        ["kubectl", "-n", namespace, "exec", "-i", "deployment/ci-postgres",
         "--", "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        input=statement, text=True, capture_output=True, check=False, timeout=40)
    if result.returncode:
        # Never echo arbitrary SQL errors: they can contain private data.
        sys.exit("Disposable PostgreSQL query failed (details withheld)")
    return result.stdout.strip()


def insert_id(statement):
    value = sql(statement)
    if not re.fullmatch(r"[1-9][0-9]*", value):
        sys.exit("Disposable scanner fixture ID not created")
    return int(value)


def api(route, token=None, method="GET", data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(
        "http://127.0.0.1:13000" + route,
        json.dumps(data).encode() if data is not None else None,
        headers,
        method=method
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except Exception:
        # Never echo auth tokens, kubeconfig URLs or raw API responses.
        sys.exit("Signed Helm Dash API request failed: " + route.split("?")[0])


name = "m9-helm-e2e-" + str(int(time.time()))
registry_count = int(sql(
    "SELECT COUNT(*) FROM docker_registries WHERE hostname='docker.io' AND deleted_at IS NULL;"
))
if registry_count < 1:
    sys.exit("Signed Helm initialization did not seed the Docker registry")

group_id = insert_id(
    "INSERT INTO cluster_group(name,user_id) SELECT '" + name +
    "',id FROM users ORDER BY id LIMIT 1 RETURNING id;"
)
cluster_id = insert_id(
    "INSERT INTO clusters(name,ip_address,port,group_id,context) VALUES ('" +
    name + "','127.0.0.1','443'," + str(group_id) +
    ",'helm-disposable-ci') RETURNING id;"
)
policy_id = insert_id(
    "INSERT INTO policies(name,enabled,enforcement,relevant_for_all_clusters) VALUES ('" +
    name + "',true,false,false) RETURNING id;"
)
sql("INSERT INTO scanners(name,type,enabled,required,policy_id) VALUES ('" +
    name + "','TRIVY',true,true," + str(policy_id) + ");")
sql("INSERT INTO policy_cluster(cluster_id,policy_id,active) VALUES (" +
    str(cluster_id) + "," + str(policy_id) + ",true);")
image_id = insert_id(
    "INSERT INTO images(url,name,tag,docker_image_id,summary,cluster_id,image) "
    "VALUES('docker.io','library/alpine','3.21','" + name + "','{}'," +
    str(cluster_id) + ",'docker.io/library/alpine:3.21') RETURNING id;"
)
sql(
    "INSERT INTO cluster_user_access(cluster_id,user_id,can_write,created_at) "
    "SELECT " + str(cluster_id) + ",id,true,"
    "CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT) "
    "FROM users WHERE email='Trawler' ON CONFLICT(cluster_id,user_id) "
    "DO UPDATE SET can_write=true;"
)
auth = api("/auth/non-redirectable-login/local", method="POST",
           data={"username": email, "password": password})
token = (auth.get("data") or {}).get("accessToken")
if not token:
    sys.exit("Signed Helm seeded admin failed to obtain access token")
queued = api(f"/api/clusters/{cluster_id}/images/scan", token, "POST",
             {"imageIds": [image_id]})
if queued.get("success") is False:
    sys.exit("Signed Helm application refused authenticated Trivy scan")
print("PASS: real Trivy request queued on signed Helm installation")

deadline = time.monotonic() + 900
while time.monotonic() < deadline:
    latest = api(f"/api/clusters/{cluster_id}/images/{image_id}/scan-run/latest", token)
    run = latest.get("data") or {}
    if run.get("status") == "failed":
        sys.exit("FAIL: Java/Trivy scanner recorded failed run")
    if run.get("status") == "completed":
        run_id = run.get("id", "")
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", str(run_id)):
            sys.exit("FAIL: completed scan lacks a valid run UUID")
        results = int(sql(
            "SELECT COUNT(*) FROM image_scan_results WHERE scan_run_id='" + run_id + "';"
        ))
        if results < 1:
            sys.exit("FAIL: scanner completed without persisted results")
        record = api(f"/api/clusters/{cluster_id}/images/{image_id}", token)
        if record.get("data", {}).get("id") != image_id:
            sys.exit("FAIL: scanned image not retrievable from signed Helm Dash")
        search = api(
            f"/api/clusters/{cluster_id}/images/search?"
            "q=&cve=&running=false&page=0&limit=10&"
            "sort%5Bfield%5D=id&sort%5Bdirection%5D=desc", token
        )
        images = (search.get("data") or {}).get("list") or []
        if not any(image.get("id") == image_id for image in images):
            sys.exit("FAIL: scan succeeded but image missing from signed Helm Images API")
        issues = sql(
            "SELECT COALESCE(i.critical_issues,0)::text || '|' || "
            "COALESCE(i.major_issues,0)::text FROM images i WHERE i.id=" + str(image_id) +
            " AND i.cluster_id=" + str(cluster_id) + ";"
        ).split("|")
        if (int(issues[0]) > 0 or int(issues[1]) > 0) and run.get("compliant") is True:
            sys.exit("FAIL: critical/high vulnerability scan incorrectly reported compliant")
        print("PASS: signed Helm install -> RabbitMQ -> Java/Trivy -> PostgreSQL -> Dash Images API")
        print("PASS: durable scan UUID and fail-closed HIGH/CRITICAL compliance check")
        break
    time.sleep(10)
else:
    sys.exit("FAIL: queued signed Helm Trivy scan did not complete within 15 minutes")
