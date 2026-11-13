#!/usr/bin/env python3
"""Offline contract tests; never connects to GitHub, Docker or a cluster."""
from verify_candidate_workload_digests import verify

DASH = "sha256:" + "a" * 64
TRAWLER = "sha256:" + "b" * 64
VERSION = "v0.1.0"
dash = f"ghcr.io/sm-joe/m9sweeper-dash:{VERSION}@{DASH}"
trawler = f"ghcr.io/sm-joe/m9sweeper-trawler:{VERSION}@{TRAWLER}"
fixture = f"""
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      initContainers:
        - name: wait
          image: "{dash}"
      containers:
        - name: dash
          image: "{dash}"
        - name: kubesec
          image: kubesec/kubesec:latest
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: trawler
          image: "{trawler}"
"""

assert verify(fixture, VERSION, DASH, TRAWLER) == (2, 1)
for replacement in (
    "ghcr.io/m9sweeper/dash:0.0.0",
    f"ghcr.io/sm-joe/m9sweeper-dash:{VERSION}",
    f"ghcr.io/sm-joe/m9sweeper-dash:{VERSION}@{TRAWLER}",
    "docker.io/m9sweeper/dash:latest",
):
    try:
        verify(fixture.replace(dash, replacement), VERSION, DASH, TRAWLER)
    except ValueError:
        pass
    else:
        raise AssertionError(f"Invalid Dash image was accepted: {replacement}")
for bad in (fixture.replace(trawler, "busybox:latest"), "", fixture.replace(trawler, f"ghcr.io/m9sweeper/trawler:0.0.0")):
    try:
        verify(bad, VERSION, DASH, TRAWLER)
    except ValueError:
        pass
    else:
        raise AssertionError("Missing or legacy trawler was accepted")
print("PASS: rendered image contract rejects missing, upstream, mutable and mismatched OCI images")
