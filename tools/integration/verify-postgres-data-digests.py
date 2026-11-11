#!/usr/bin/env python3
"""Compare sensitive evidence table contents across live and restored staging DBs.

Runs only after a scratch restore, hashes canonical PostgreSQL JSONB rows in
stable order, streams the result, and never prints findings, credentials or PII.
The caller must quiesce writes to its disposable source while capturing evidence.
"""
import hashlib
import os
import re
import subprocess
import sys

TABLES = (
    "clusters",
    "image_scan_runs",
    "image_scan_results",
    "image_scan_results_issues",
    "project_falco_logs",
    "kube_hunter",
)

def digest(database: str, table: str) -> tuple[int, str]:
    # DB is passed as a shell positional parameter, never interpolated into SQL.
    cmd = [
        "docker", "exec", "-i", "postgres", "sh", "-c",
        'psql -X -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$1"',
        "sh", database,
    ]
    # JSONB has a canonical text representation in the same PostgreSQL server.
    # Sorting per-row digests is independent of physical row order and primary keys.
    sql = (
        f'SELECT md5(to_jsonb(t)::text) FROM public."{table}" AS t '
        f'ORDER BY md5(to_jsonb(t)::text);\n'
    )
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, bufsize=1)
    assert proc.stdin is not None and proc.stdout is not None
    proc.stdin.write(sql)
    proc.stdin.close()
    sha = hashlib.sha256()
    rows = 0
    for line in proc.stdout:
        value = line.strip()
        if not re.fullmatch(r"[0-9a-f]{32}", value):
            proc.kill()
            raise RuntimeError(f"Invalid PostgreSQL digest stream in {table}")
        sha.update(value.encode("ascii"))
        sha.update(b"\n")
        rows += 1
    proc.stdout.close()
    error = proc.stderr.read() if proc.stderr else ""
    rc = proc.wait()
    if rc != 0:
        # Do not show raw PostgreSQL failure text because it can include values.
        raise RuntimeError(f"PostgreSQL evidence hashing failed for {table} (exit {rc})")
    return rows, sha.hexdigest()

def main() -> int:
    if os.environ.get("M9_STAGING_RESTORE_TEST") != "YES":
        raise SystemExit("Explicit staging restore opt-in required")
    if len(sys.argv) != 3:
        raise SystemExit("Usage: verify-postgres-data-digests.py SOURCE_DB SCRATCH_DB")
    source, restored = sys.argv[1:]
    if source == restored or not all(
        re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,62}", name) for name in (source, restored)
    ):
        raise SystemExit("Expected two distinct safe database identifiers")
    for table in TABLES:
        before = digest(source, table)
        after = digest(restored, table)
        if before != after:
            raise AssertionError(
                f"FAIL: {table} restored content mismatch "
                f"(source rows={before[0]}, restored rows={after[0]})"
            )
        print(f"PASS: {table} content SHA-256 matches across {before[0]} rows")
    print("PASS: critical security evidence restored byte-equivalently at JSONB level")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
