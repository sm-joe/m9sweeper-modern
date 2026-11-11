#!/usr/bin/env python3
"""Fail-closed Falco release-evidence guard; no cluster or database needed."""
import os
from pathlib import Path
import subprocess

script = Path("scripts/verify-falco-live-linux.sh")
source = script.read_text()
assert "AND rule='$expected_rule'" in source, "A generic startup event could incorrectly pass acceptance"
assert "AND id > $before" in source, "Stale events must never pass"
env = {**os.environ, "M9_FALCO_LIVE_TEST": "YES", "M9_FALCO_LINUX_HOST": "YES",
       "CLUSTER_ID": "1", "M9_FALCO_EXPECTED_RULE": "unsafe'; SELECT pg_sleep(1); --"}
result = subprocess.run(["bash", str(script)], env=env, capture_output=True,
                        text=True, timeout=5)
assert result.returncode == 2, "Unsafe rule was not rejected before Kubernetes actions"
assert "safe characters" in result.stderr, "Rule precondition not reported"
print("PASS: live Falco acceptance rejects unsafe rule and requires matching event ID/rule")
