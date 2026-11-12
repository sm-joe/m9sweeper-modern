#!/usr/bin/env python3
"""Real post-login NestJS summary acceptance against disposable CI Compose only."""
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

fixture = Path("../../tools/browser-e2e/.ci-cluster-id")
if not Path(".env").is_file() or not fixture.is_file():
    raise SystemExit("Dashboard summary HTTP check requires disposable CI Compose fixtures")
cluster_id = fixture.read_text().strip()
if not cluster_id.isdigit() or int(cluster_id) <= 0:
    raise SystemExit("Invalid CI test cluster")
credentials = dict(line.split("=", 1) for line in Path(".env").read_text().splitlines()
                   if "=" in line)
login = Request("http://127.0.0.1:3000/auth/non-redirectable-login/local",
                json.dumps({"username": credentials["SUPER_ADMIN_EMAIL"],
                            "password": credentials["SUPER_ADMIN_PASSWORD"]}).encode(),
                headers={"Content-Type": "application/json"}, method="POST")
with urlopen(login, timeout=20) as response:
    token = json.load(response)["data"]["accessToken"]
if not isinstance(token, str) or len(token) < 16:
    raise AssertionError("Real admin JWT unavailable for authenticated dashboard test")

def check(path: str, name: str, expected: type):
    request = Request("http://127.0.0.1:3000" + path,
                      headers={"Authorization": "Bearer " + token})
    try:
        with urlopen(request, timeout=20) as response:
            if response.status != 200:
                raise AssertionError(f"{name}: expected HTTP 200, got {response.status}")
            result = json.load(response)
    except HTTPError as error:
        raise AssertionError(f"{name}: unexpected HTTP {error.code}") from error
    data = result.get("data")
    if not isinstance(data, expected):
        raise AssertionError(f"{name}: unexpected response data type")
    print(f"PASS: authenticated {name} returned HTTP 200")

# The first dashboard request can be sent before any cluster selection.
check("/api/clusters/images/summary/vulnerabilities?group_by=savedAtDate",
      "empty initial vulnerability chart", list)
check("/api/clusters/images/summary", "empty initial image count", (int, float, str))
# Angular HttpParams sends literal bracketed keys, not a nested filters object.
params = urlencode({
    "group_by": "savedAtDate",
    "filters[clusterId][0]": cluster_id,
    "filters[namespace][0]": "default",
    "filters[runningInCluster]": "true"
})
check("/api/clusters/images/summary/vulnerabilities?" + params,
      "Angular bracketed vulnerability filters", list)
print("PASS: real dashboard APIs survive login and parse Angular's current query format")
