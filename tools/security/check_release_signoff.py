#!/usr/bin/env python3
"""Validate completeness of independently collected Linux release evidence.

This validates *evidence metadata*, not the truth of test outcomes. The release
owner must inspect the linked logs and screenshots before approval. Does not
publish artifacts, connect to Kubernetes, or modify files.
"""
import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_GATES = (
    "trivy_end_to_end",
    "scanner_tenant_isolation",
    "linux_falco_kubebench_kubesec_kubehunter",
    "helm_upgrade_rollback",
    "postgres_backup_restore",
    "signed_images_chart_sbom",
    "linux_docs_and_license_review",
)

SHA = re.compile(r"[0-9a-f]{40}")
VERSION = re.compile(r"v[0-9]+\.[0-9]+\.[0-9]+")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")


def check(document, expected_sha):
    errors = []
    if not isinstance(document, dict):
        return ["Evidence document must be a JSON object"]
    if document.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    version = document.get("releaseVersion", "")
    if not isinstance(version, str) or not VERSION.fullmatch(version):
        errors.append("releaseVersion must be a final vMAJOR.MINOR.PATCH")
    actual_sha = document.get("sourceCommit", "")
    if not isinstance(actual_sha, str) or not SHA.fullmatch(actual_sha):
        errors.append("sourceCommit must be a 40-character lowercase Git SHA")
    elif actual_sha != expected_sha:
        errors.append("sourceCommit does not match the exact proposed release commit")
    environment = document.get("environment")
    for key in ("linuxDistribution", "kernel", "kubernetesVersion", "helmVersion"):
        if not isinstance(environment, dict) or not isinstance(environment.get(key), str) or not environment[key].strip():
            errors.append(f"environment.{key} is required")
    artifacts = document.get("artifacts")
    for name in ("dashDigest", "trawlerDigest"):
        value = artifacts.get(name, "") if isinstance(artifacts, dict) else ""
        if not isinstance(value, str) or not DIGEST.fullmatch(value):
            errors.append(f"artifacts.{name} must be a sha256 digest")
    gates = document.get("gates")
    for gate in REQUIRED_GATES:
        record = gates.get(gate) if isinstance(gates, dict) else None
        if not isinstance(record, dict) or record.get("status") != "passed":
            errors.append(f"gates.{gate}.status must be passed")
            continue
        evidence = record.get("evidence")
        if not isinstance(evidence, list) or not evidence or any(
            not isinstance(ref, str) or not ref.strip() or
            ref.strip().lower() in ("todo", "pending", "n/a", "none") for ref in evidence
        ):
            errors.append(f"gates.{gate}.evidence must contain nonplaceholder references")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence_json", type=Path)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args(argv)
    if not SHA.fullmatch(args.source_sha):
        parser.error("--source-sha must be a lowercase 40-character commit SHA")
    try:
        doc = json.loads(args.evidence_json.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        print(f"FAIL: cannot parse evidence JSON ({type(err).__name__})", file=sys.stderr)
        return 2
    failures = check(doc, args.source_sha)
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print("PASS: release evidence manifest is complete for the specified commit")
    print("NOTE: verify each referenced artifact independently before approving release")
    return 0


if __name__ == "__main__":
    sys.exit(main())
