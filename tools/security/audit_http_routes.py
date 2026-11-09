#!/usr/bin/env python3
"""Source-level HTTP route inventory for mandatory manual authorization review.

Decorator presence is not proof of tenant isolation. This script intentionally
reports suspicious handlers; it does not automatically certify their safety.
"""
import argparse
import csv
from pathlib import Path
import re
import sys

ROUTES = re.compile(r"@(Get|Post|Put|Patch|Delete|All)\s*\(([^\n]*)\)")
HANDLER = re.compile(r"\b(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(")
REQUIRED_CLUSTER_SCOPED = [
    ("kube-bench/controllers/kube-bench.controller.ts", "getBenchReportById"),
    ("kube-bench/controllers/kube-bench.controller.ts", "deleteBenchReportById"),
    ("kube-bench/controllers/kube-bench.controller.ts", "getAllBenchReportsByCluster"),
    ("kube-bench/controllers/kube-bench.controller.ts", "getLastBenchReportSummary"),
    ("cluster-event/controllers/cluster-event.controller.ts", "getClusterEvents"),
    ("cluster-event/controllers/cluster-event.controller.ts", "createClusterEvent"),
    ("reports/controllers/reports-download.controller.ts", "generatePrintableAuditReport"),
    ("reports/controllers/reports.controller.ts", "getVulnerabilityExport"),
    ("reports/controllers/reports.controller.ts", "downloadVulnerabilityExport"),
    ("namespace/controllers/namespace.controller.ts", "getAllNamespaces"),
]
ROOT = Path("platform/dash/backend/src/modules")


def audit(path):
    source = path.read_text()
    matches = list(ROUTES.finditer(source))
    class_guard = "@UseGuards(" in source.split("export class", 1)[0]
    result = []
    for i, match in enumerate(matches):
        after = source[match.end():matches[i + 1].start() if i + 1 < len(matches) else None]
        method = re.search(r"(?m)^\s*(?:public\s+|private\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(", after)
        if not method:
            # Extract a fallback handler label without asserting policy coverage.
            name = "<unresolved>"
            decorators = after[:500]
        else:
            name = method.group(1)
            decorators = after[:method.start()]
        guards = re.findall(r"@UseGuards\(([^)]*)\)", decorators)
        scope = "ClusterAccessGuard" in ",".join(guards)
        auth = bool(guards) or class_guard
        result.append({
            "file": str(path.relative_to(ROOT)),
            "verb": match.group(1),
            "route": match.group(2).strip(),
            "handler": name,
            "guard_decorator": str(auth),
            "cluster_scope_decorator": str(scope),
            "review_status": "MANUAL_REVIEW_REQUIRED",
        })
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="p0-http-route-inventory.csv")
    args = parser.parse_args()
    rows = []
    for path in sorted(ROOT.rglob("*controller.ts")):
        rows.extend(audit(path))
    if not rows:
        raise SystemExit("FAIL: no HTTP controller routes identified")
    with open(args.output, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    flagged = [r for r in rows if r["guard_decorator"] == "False"]
    print(f"Inventory: {len(rows)} HTTP endpoints; {len(flagged)} with no nearby method/class guard")
    for r in flagged:
        print(f"REVIEW: {r['file']} {r['verb']}({r['route']}) {r['handler']}")
    missing = []
    for file, name in REQUIRED_CLUSTER_SCOPED:
        found = [r for r in rows if r["file"] == file and r["handler"] == name]
        if len(found) != 1 or found[0]["cluster_scope_decorator"] != "True":
            missing.append(f"{file}::{name}")
    if missing:
        raise SystemExit("FAIL: P0 route-level cluster guard regression: " + ", ".join(missing))
    publisher = [r for r in rows
                 if r["file"] == "info/controllers/info.controller.ts"
                 and r["handler"] == "publishRabbitMQMessage"]
    if len(publisher) != 1 or publisher[0]["guard_decorator"] != "True":
        raise SystemExit("FAIL: RabbitMQ test publisher must require authentication")
    print("PASS: required P0 scoped routes retain explicit guard decorators")
    print("NOTE: all endpoints still require manual resource-level and nested-ID review")


if __name__ == "__main__":
    main()
