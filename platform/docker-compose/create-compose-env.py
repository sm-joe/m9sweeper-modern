#!/usr/bin/env python3
"""Create one private, consistent Docker Compose environment (first install only)."""
import argparse
import os
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
KEYS = {
    "SUPER_ADMIN_PASSWORD": 24,
    "DATABASE_PASSWORD": 24,
    "SECURITY_JWT_SECRET": 48,
    "TRAWLER_API_KEY": 32,
    "FALCO_API_KEY": 32,
    "KUBE_HUNTER_API_KEY": 32,
    "KUBE_BENCH_API_KEY": 32,
    "RABBITMQ_PASSWORD": 24,
}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-email", required=True, help="Real administrator email")
    parser.add_argument("--output", type=Path, default=ROOT / ".env")
    args = parser.parse_args()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", args.admin_email):
        parser.error("Provide a valid administrator email, not an example placeholder")
    if args.admin_email.lower().endswith((".example", ".invalid", "@example.com")):
        parser.error("Use an address you control, not a documentation placeholder")
    template = (ROOT / ".env.sample").read_text(encoding="utf-8")
    replacements = {key: secrets.token_hex(size) for key, size in KEYS.items()}
    replacements.update({
        "SUPER_ADMIN_EMAIL": args.admin_email,
        "RABBITMQ_USERNAME": "m9sweeper",
        "CLUSTER_SCRAPE_SCHEDULE": '"*/5 * * * *"',
    })
    lines = []
    seen = set()
    for line in template.splitlines():
        if line.startswith("#") or "=" not in line:
            lines.append(line)
            continue
        key, sep, value = line.partition("=")
        if key in replacements:
            lines.append(f"{key}={replacements[key]}")
            seen.add(key)
        else:
            lines.append(line)
    missing = replacements.keys() - seen
    if missing:
        raise RuntimeError("Missing template variables: " + ", ".join(sorted(missing)))
    output = args.output.expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation: never overwrite live database/RabbitMQ/admin identities.
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    try:
        fd = os.open(output, flags, 0o600)
    except FileExistsError:
        print(f"Refusing to overwrite existing {output}; preserve all credentials.", file=sys.stderr)
        return 1
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    os.chmod(output, 0o600)
    print(f"Created {output} (mode 0600). Secrets were not printed.")
    print("Back up this file securely and do not regenerate it for an existing stack.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
