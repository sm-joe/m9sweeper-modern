#!/usr/bin/env python3
"""Fail-closed Falco release-evidence guard; no cluster or database needed."""
import os
import tempfile
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
with tempfile.TemporaryDirectory() as work:
    fake = Path(work) / "kubectl"
    marker = Path(work) / "kubectl-writes"
    fake.write_text(
        "#!/bin/sh\n"
        'if [ "$1" = config ] && [ "$2" = current-context ]; then echo production; exit 0; fi\n'
        f"echo unexpected-write > '{marker}'\nexit 90\n"
    )
    fake.chmod(0o755)
    safe = {**env, "M9_FALCO_EXPECTED_RULE": "Read sensitive file untrusted",
            "M9_EXPECTED_KUBE_CONTEXT": "disposable-staging",
            "PATH": work + os.pathsep + os.environ.get("PATH", "")}
    result = subprocess.run(["bash", str(script)], env=safe,
                            capture_output=True, text=True, timeout=5)
    assert result.returncode == 2, "Mismatched staging context was accepted"
    assert "context does not match" in result.stderr
    assert not marker.exists(), "Falco test attempted Kubernetes writes with wrong context"
print("PASS: Falco requires exact rule, rejects unsafe values and refuses mismatched staging contexts")
