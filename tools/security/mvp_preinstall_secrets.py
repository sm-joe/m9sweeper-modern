#!/usr/bin/env python3
"""Fail-closed read-only preinstall check for public MVP staging credentials.

Never prints, persists, hashes or logs Secret values. A PASS means only
that required Kubernetes Secret keys are present and internally consistent;
it does not prove external DB/Rabbit reachability or install readiness.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys

KEYS = {
    "dash": (
        "SECURITY_JWT_SECRET", "DATABASE_CONNECTION_HOST",
        "DATABASE_CONNECTION_PORT", "DATABASE_CONNECTION_DATABASE",
        "DATABASE_CONNECTION_USERNAME", "DATABASE_CONNECTION_PASSWORD",
        "RABBITMQ_HOST_NAME", "RABBITMQ_HOST_PORT", "RABBITMQ_USER_NAME",
        "RABBITMQ_USER_PASSWORD", "MSG_QUEUE_NAME_IMAGE_SCANNER",
    ),
    "init": (
        "CLUSTER_API_KEY", "SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD",
        "TRAWLER_API_KEY", "KUBE_HUNTER_API_KEY", "KUBE_BENCH_API_KEY",
        "FALCO_API_KEY",
    ),
    "trawler": (
        "RABBITMQ_HOSTNAME", "RABBITMQ_PORT", "RABBITMQ_USERNAME",
        "RABBITMQ_PASSWORD", "RABBITMQ_QUEUE_NAME", "M9SWEEPER_API_KEY",
    ),
}
# Only names are safe to include in error output. Never show Secret values.
BAD_VALUES = {"password", "changeme", "replace-me", "replace-with-private-secret", ""}
SENSITIVE_KEYS = {"SECURITY_JWT_SECRET", "DATABASE_CONNECTION_PASSWORD", "RABBITMQ_USER_PASSWORD", "RABBITMQ_PASSWORD", "SUPER_ADMIN_PASSWORD", "CLUSTER_API_KEY", "TRAWLER_API_KEY", "KUBE_HUNTER_API_KEY", "KUBE_BENCH_API_KEY", "FALCO_API_KEY", "M9SWEEPER_API_KEY"}


def validate_secret_data(objects: dict) -> list[str]:
    """Return safe diagnostics; values remain in memory only."""
    errors = []
    decoded = {}
    for role, required in KEYS.items():
        obj = objects.get(role) or {}
        data = obj.get("data") or {}
        decoded[role] = {}
        for key in required:
            if key not in data:
                errors.append(f"{role}: missing required key {key}")
                continue
            try:
                value = base64.b64decode(data[key], validate=True).decode("utf-8")
            except (ValueError, UnicodeError, TypeError):
                errors.append(f"{role}: key {key} must be valid UTF-8 base64 Secret data")
                continue
            decoded[role][key] = value
            if (not value.strip() or value.lower().startswith("generated-") or (key in SENSITIVE_KEYS and value.strip().lower() in BAD_VALUES) or (key in {"RABBITMQ_USER_NAME", "RABBITMQ_USERNAME"} and value.strip().lower() == "guest")):
                errors.append(f"{role}: key {key} is empty or uses a known placeholder")
    for role, key, minimum in [
        ("dash", "SECURITY_JWT_SECRET", 32),
        ("init", "SUPER_ADMIN_PASSWORD", 16),
        ("init", "TRAWLER_API_KEY", 24),
        ("trawler", "M9SWEEPER_API_KEY", 24),
    ]:
        value = decoded[role].get(key)
        if value is not None and len(value) < minimum:
            errors.append(f"{role}: key {key} is shorter than {minimum} characters")
    if decoded["init"].get("TRAWLER_API_KEY") and decoded["trawler"].get("M9SWEEPER_API_KEY") and (
        decoded["init"]["TRAWLER_API_KEY"] != decoded["trawler"]["M9SWEEPER_API_KEY"]
    ):
        errors.append("init/trawler: scanner API credentials do not match")
    for left, right in [
        (("dash", "RABBITMQ_HOST_NAME"), ("trawler", "RABBITMQ_HOSTNAME")),
        (("dash", "MSG_QUEUE_NAME_IMAGE_SCANNER"), ("trawler", "RABBITMQ_QUEUE_NAME")),
        (("dash", "RABBITMQ_USER_NAME"), ("trawler", "RABBITMQ_USERNAME")),
        (("dash", "RABBITMQ_USER_PASSWORD"), ("trawler", "RABBITMQ_PASSWORD")),
    ]:
        a = decoded[left[0]].get(left[1])
        b = decoded[right[0]].get(right[1])
        if a and b and a != b:
            errors.append(f"{left[0]}/{right[0]}: {left[1]} and {right[1]} disagree")
    if decoded["dash"].get("SECURITY_JWT_SECRET") == decoded["init"].get("TRAWLER_API_KEY"):
        errors.append("dash/init: JWT signing secret must be distinct from scanner API key")
    return errors


def kubectl(*args: str) -> dict | str:
    proc = subprocess.run(["kubectl", *args], capture_output=True, text=True, check=False)
    if proc.returncode:
        raise RuntimeError("kubectl operation failed; confirm context, namespace, access, and Secret names")
    if "-o" in args or any(arg.startswith("-o=") for arg in args):
        try:
            return json.loads(proc.stdout)
        except ValueError as exc:
            raise RuntimeError("kubectl returned invalid JSON") from exc
    return proc.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Kubernetes Secret preflight")
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--dash-secret", default="m9-dash-env")
    parser.add_argument("--init-secret", default="m9-init-env")
    parser.add_argument("--trawler-secret", default="m9-trawler-env")
    args = parser.parse_args()
    expected = os.environ.get("M9_EXPECTED_KUBE_CONTEXT", "")
    if os.environ.get("M9_MVP_PREFLIGHT") != "YES" or not expected:
        print("FAIL: explicit M9_MVP_PREFLIGHT=YES and M9_EXPECTED_KUBE_CONTEXT required", file=sys.stderr)
        return 2
    if args.namespace != "m9sweeper-system" and not re.fullmatch(r"m9-[a-z0-9-]*staging", args.namespace):
        print("FAIL: expected m9sweeper-system namespace or a dedicated test namespace", file=sys.stderr)
        return 2
    if any(not re.fullmatch(r"[a-z0-9]([-a-z0-9]*[a-z0-9])?", name)
           for name in (args.dash_secret, args.init_secret, args.trawler_secret)):
        print("FAIL: invalid Kubernetes Secret reference", file=sys.stderr)
        return 2
    try:
        if kubectl("config", "current-context") != expected:
            raise RuntimeError("Kubernetes context mismatch; refusing to inspect Secrets")
        namespace = kubectl("get", "namespace", args.namespace, "-o", "json")
        labels = namespace.get("metadata", {}).get("labels", {})
        if args.namespace != "m9sweeper-system" and labels.get("m9sweeper-staging") != "true":
            raise RuntimeError("test namespace lacks explicit m9sweeper-staging=true label")
        objects = {
            "dash": kubectl("-n", args.namespace, "get", "secret", args.dash_secret, "-o", "json"),
            "init": kubectl("-n", args.namespace, "get", "secret", args.init_secret, "-o", "json"),
            "trawler": kubectl("-n", args.namespace, "get", "secret", args.trawler_secret, "-o", "json"),
        }
        errors = validate_secret_data(objects)
    except RuntimeError as exc:
        print("FAIL: " + str(exc), file=sys.stderr)
        return 1
    for error in errors:
        print("FAIL: " + error, file=sys.stderr)
    if errors:
        return 1
    print("PASS: required Secret keys exist; credentials match across Dash/init/Trawler")
    print("LIMITATION: DB/broker connectivity, TLS and deployment readiness not verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
