#!/usr/bin/env python3
"""Reject badly indented kube-hunter native sidecar resources in rendered Helm YAML."""
import pathlib
import re
import sys

for name in sys.argv[1:]:
    lines = pathlib.Path(name).read_text(encoding="utf-8").splitlines()
    start = next((i for i, line in enumerate(lines)
                  if re.match(r"^\s+- name: report-relay\s*$", line)), None)
    if start is None:
        raise SystemExit(f"{name}: missing report-relay container")
    init_indent = len(lines[start]) - len(lines[start].lstrip(" "))
    resources_i = next((i for i in range(start + 1, len(lines))
                        if re.match(r"^\s+resources:\s*$", lines[i])), None)
    if resources_i is None:
        raise SystemExit(f"{name}: missing report-relay resources")
    res_indent = len(lines[resources_i]) - len(lines[resources_i].lstrip(" "))
    if res_indent != init_indent + 2:
        raise SystemExit(f"{name}: resources must be on relay container, not pod")
    for key in ("limits", "requests"):
        expected = " " * (res_indent + 2) + key + ":"
        if expected not in lines[resources_i + 1:resources_i + 10]:
            raise SystemExit(f"{name}: {key} not nested under relay resources")
    print(f"PASS: {name} report-relay resources have container nesting")
if len(sys.argv) < 2:
    raise SystemExit("expected Helm-rendered YAML filenames")
