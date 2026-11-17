#!/usr/bin/env python3
"""Generate aligned first-install m9sweeper Secret env files.

For first installations only. Refuses to change existing files.
Credentials are never printed or put in Helm values.
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path


def write_new(path: Path, entries: dict[str, str]) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as target:
        for key, value in entries.items():
            if not value or "\n" in value or "\r" in value:
                raise ValueError(f"Invalid generated value for {key}")
            target.write(f"{key}={value}\n")


def create(destination: Path) -> None:
    if destination.is_symlink():
        raise RuntimeError("Refusing symbolic-link credentials directory")
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix":
        destination.chmod(0o700)
    files = [destination / name for name in (
        "dash-runtime.env", "dash-bootstrap.env", "trawler-runtime.env"
    )]
    if any(item.exists() or item.is_symlink() for item in files):
        raise FileExistsError("Existing installation credentials found; refusing overwrite")
    host = "m9sweeper-rabbitmq.m9sweeper-system.svc.cluster.local"
    db = "m9sweeper-postgresql.m9sweeper-system.svc.cluster.local"
    broker_user = "m9sweeper"
    broker_pass = secrets.token_hex(32)
    db_password = secrets.token_hex(32)
    scanner_key = secrets.token_hex(32)
    dash = {
        "SECURITY_JWT_SECRET": secrets.token_hex(32),
        "DATABASE_CONNECTION_HOST": db,
        "DATABASE_CONNECTION_PORT": "5432",
        "DATABASE_CONNECTION_DATABASE": "postgres",
        "DATABASE_CONNECTION_USERNAME": "postgres",
        "DATABASE_CONNECTION_PASSWORD": db_password,
        "RABBITMQ_HOST_NAME": host,
        "RABBITMQ_HOST_PORT": "5672",
        "RABBITMQ_PORT": "5672",
        "RABBITMQ_USER_NAME": broker_user,
        "RABBITMQ_USER_PASSWORD": broker_pass,
        "MSG_QUEUE_NAME_IMAGE_SCANNER": "trawler_queue",
    }
    init = {
        "CLUSTER_API_KEY": secrets.token_hex(32),
        "SUPER_ADMIN_EMAIL": "admin@example.invalid",
        "SUPER_ADMIN_PASSWORD": secrets.token_hex(24),
        "TRAWLER_API_KEY": scanner_key,
        "KUBE_HUNTER_API_KEY": secrets.token_hex(32),
        "KUBE_BENCH_API_KEY": secrets.token_hex(32),
        "FALCO_API_KEY": secrets.token_hex(32),
    }
    worker = {
        "RABBITMQ_HOSTNAME": host,
        "RABBITMQ_PORT": "5672",
        "RABBITMQ_USERNAME": broker_user,
        "RABBITMQ_PASSWORD": broker_pass,
        "RABBITMQ_QUEUE_NAME": "trawler_queue",
        "M9SWEEPER_API_KEY": scanner_key,
    }
    # The admin email must be real so the operator can recover their account.
    # The admin password is random and is saved only to the private file.
    admin_email = os.environ.get("M9_ADMIN_EMAIL", "").strip()
    if not admin_email or "@" not in admin_email or any(c in admin_email for c in "\r\n="):
        raise ValueError("Set M9_ADMIN_EMAIL to your administrator email address")
    if admin_email.lower().endswith(("@example.com", "@example.invalid", "@example.org")):
        raise ValueError("Replace the example administrator email with a real address")
    init["SUPER_ADMIN_EMAIL"] = admin_email
    try:
        for path, values in zip(files, (dash, init, worker)):
            write_new(path, values)
    except Exception:
        # Roll back only the new files made by this invocation; don't touch
        # any pre-existing files (the preflight above rejects their existence).
        for path in files:
            if path.is_file() and not path.is_symlink():
                path.unlink()
        raise
    print(f"PASS: created three private, matching first-install files in {destination}")
    print("Use /secure-style private paths; never commit files or print passwords")
    print("For upgrades, reuse the existing Secrets; do not run this generator")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        create(args.output_dir.expanduser().absolute())
        return 0
    except (ValueError, FileExistsError, RuntimeError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
