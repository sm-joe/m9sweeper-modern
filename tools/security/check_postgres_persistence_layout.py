#!/usr/bin/env python3
"""Ensure PostgreSQL data directory is on its persistent claim.

Validates Helm-rendered StatefulSet rather than trusting chart values. A PVC
mounted at PGDATA's sibling /data/userdata loses all DB data on Pod recreation.
"""
import os
import re
import sys
from pathlib import PurePosixPath, Path

def verify(rendered: str) -> None:
    documents = re.split(r"(?m)^---\s*$", rendered)
    matches = [d for d in documents if re.search(r"(?m)^kind:\s*StatefulSet\s*$", d)
               and "postgresql" in d.lower()]
    if len(matches) != 1:
        raise ValueError(f"Expected one PostgreSQL StatefulSet, found {len(matches)}")
    doc = matches[0]
    pg = re.search(r"(?m)^\s+- name:\s*PGDATA\s*$\n^\s+value:\s*['\"]?([^\s'\"]+)", doc)
    if not pg:
        raise ValueError("No explicit PostgreSQL PGDATA found")
    pgdata = pg.group(1)
    if not pgdata.startswith("/") or pgdata.endswith("/"):
        raise ValueError("PGDATA is not a valid absolute directory")
    mount_parent = str(PurePosixPath(pgdata).parent)
    mounts = re.findall(r"(?m)^\s+mountPath:\s*['\"]?([^\s'\"]+)", doc)
    # The PVC volume mount must include PGDATA or its parent; the last path
    # component of PGDATA should not be a sibling to the actual volume mount.
    if mount_parent not in mounts and pgdata not in mounts:
        raise ValueError("PostgreSQL PGDATA is outside its mounted PVC path")
    if any(mount.endswith("/data/userdata") for mount in mounts):
        raise ValueError("Legacy sibling mount may leave PGDATA ephemeral")
    if "volumeClaimTemplates:" not in doc and "persistentVolumeClaim:" not in doc:
        raise ValueError("No persistentVolumeClaim for PostgreSQL database")
    print(f"PASS: PostgreSQL {pgdata} is backed by a persistent mount at {mount_parent}")

def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: check_postgres_persistence_layout.py HELM_RENDER")
    try:
        verify(Path(sys.argv[1]).read_text())
    except ValueError as exc:
        raise SystemExit("FAIL: unsafe PostgreSQL Helm persistence: " + str(exc)) from exc

if __name__ == "__main__":
    main()
