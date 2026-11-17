#!/usr/bin/env python3
"""Fail-closed in-cluster Helm pre-install/pre-upgrade Secret contract.

Read-only Kubernetes API. No credential values are logged, written or hashed.
"""
import base64
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

REQUIRED = {
    "dash": ("SECURITY_JWT_SECRET", "DATABASE_CONNECTION_HOST",
             "DATABASE_CONNECTION_PORT", "DATABASE_CONNECTION_DATABASE",
             "DATABASE_CONNECTION_USERNAME", "DATABASE_CONNECTION_PASSWORD",
             "RABBITMQ_HOST_NAME", "RABBITMQ_HOST_PORT",
             "RABBITMQ_USER_NAME", "RABBITMQ_USER_PASSWORD",
             "MSG_QUEUE_NAME_IMAGE_SCANNER"),
    "init": ("CLUSTER_API_KEY", "SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD",
             "TRAWLER_API_KEY", "KUBE_HUNTER_API_KEY", "KUBE_BENCH_API_KEY",
             "FALCO_API_KEY"),
    "trawler": ("RABBITMQ_HOSTNAME", "RABBITMQ_PORT", "RABBITMQ_USERNAME",
               "RABBITMQ_PASSWORD", "RABBITMQ_QUEUE_NAME", "M9SWEEPER_API_KEY"),
}
PAIRS = (
    ("dash", "RABBITMQ_HOST_NAME", "trawler", "RABBITMQ_HOSTNAME"),
    ("dash", "RABBITMQ_USER_NAME", "trawler", "RABBITMQ_USERNAME"),
    ("dash", "RABBITMQ_USER_PASSWORD", "trawler", "RABBITMQ_PASSWORD"),
    ("dash", "MSG_QUEUE_NAME_IMAGE_SCANNER", "trawler", "RABBITMQ_QUEUE_NAME"),
    ("dash", "RABBITMQ_HOST_PORT", "trawler", "RABBITMQ_PORT"),
    ("init", "TRAWLER_API_KEY", "trawler", "M9SWEEPER_API_KEY"),
)


def validate(objects):
    errors = []
    decoded = {}
    for role, keys in REQUIRED.items():
        data = (objects.get(role) or {}).get("data") or {}
        decoded[role] = {}
        for key in keys:
            raw = data.get(key)
            if not isinstance(raw, str):
                errors.append(f"{role}: missing required key {key}")
                continue
            try:
                value = base64.b64decode(raw, validate=True).decode("utf-8")
            except (ValueError, UnicodeError):
                errors.append(f"{role}: invalid encoded key {key}")
                continue
            if (not value.strip() or value.strip().lower().startswith(
                    ("replace-with-", "generated-", "changeme", "placeholder"))):
                errors.append(f"{role}: empty/placeholder key {key}")
            elif (key in ("RABBITMQ_USER_NAME", "RABBITMQ_USERNAME") and
                  value.strip().lower() == "guest"):
                errors.append(f"{role}: insecure guest account {key}")
            else:
                decoded[role][key] = value
    for left, leftkey, right, rightkey in PAIRS:
        a, b = decoded[left].get(leftkey), decoded[right].get(rightkey)
        if a is not None and b is not None and a != b:
            errors.append(f"{left}/{right}: {leftkey} must match {rightkey}")
    for role, key, size in (
        ("dash", "SECURITY_JWT_SECRET", 32),
        ("init", "TRAWLER_API_KEY", 24),
        ("trawler", "M9SWEEPER_API_KEY", 24),
    ):
        value = decoded[role].get(key)
        if value is not None and len(value) < size:
            errors.append(f"{role}: {key} is too short")
    return errors


def load_secret(namespace, name, token, ca):
    host = os.environ["KUBERNETES_SERVICE_HOST"]
    port = os.environ.get("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    path = "/api/v1/namespaces/{}/secrets/{}".format(
        urllib.parse.quote(namespace, safe=""),
        urllib.parse.quote(name, safe=""))
    url = f"https://{host}:{port}{path}"
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(request, timeout=15, context=ca) as response:
        return json.load(response)


def main():
    namespace = os.environ["POD_NAMESPACE"]
    names = {role: os.environ["SECRET_" + role.upper()] for role in REQUIRED}
    if len(set(names.values())) != 3:
        print("FAIL: Dash, initialization and Trawler must use distinct Secret references")
        return 1
    with open("/var/run/secrets/kubernetes.io/serviceaccount/token", encoding="utf-8") as handle:
        token = handle.read().strip()
    ca = ssl.create_default_context(cafile="/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
    objects = {}
    for role, name in names.items():
        try:
            objects[role] = load_secret(namespace, name, token, ca)
        except (urllib.error.URLError, OSError, ValueError):
            # Deliberately never print K8s API error bodies, which can contain secrets.
            print(f"FAIL: cannot read {role} Secret {name} in {namespace}")
            return 1
    errors = validate(objects)
    for message in errors:
        print("FAIL: " + message)
    if errors:
        return 1
    print("PASS: existing Dash, bootstrap and Trawler Secret names/keys/credentials match")
    print("NOTE: broker account persistence and live connections are checked separately")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("FAIL: credential preflight cannot reach Kubernetes API or load its credentials")
        sys.exit(1)
