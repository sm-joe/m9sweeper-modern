#!/usr/bin/env python3
"""Verify Helm staging lifecycle fail-closed preconditions without a real cluster."""
import os
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/verify-helm-rollback-staging-linux.sh"

def probe(overrides):
    with tempfile.TemporaryDirectory() as root:
        folder = Path(root)
        marker = folder / "helm-called"
        values = folder / "staging-values.yaml"
        values.write_text("dash:\n  enabled: true\n")
        for name, body in {
            "helm": f'#!/bin/sh\necho reached > "{marker}"\nexit 0\n',
            "kubectl": '#!/bin/sh\nif [ "$1" = config ] && [ "$2" = current-context ]; then echo production-cluster; exit 0; fi\necho unexpected kubectl invocation >&2; exit 19\n'
        }.items():
            target = folder / name
            target.write_text(body)
            target.chmod(0o755)
        env = {**os.environ,
            "PATH": str(folder) + os.pathsep + os.environ.get("PATH", ""),
            "M9_STAGING_HELM_TEST": "YES",
            "NAMESPACE": "m9-staging-ci",
            "RELEASE": "m9-ci",
            "VALUES_FILE": str(values),
            "M9_EXPECTED_KUBE_CONTEXT": "approved-disposable-staging",
            **overrides
        }
        result = subprocess.run(["bash", str(SCRIPT)], env=env,
                                text=True, capture_output=True, timeout=8)
        assert result.returncode != 0, result.stdout
        assert not marker.exists(), "Helm invoked despite failed safety precondition"
        return result.stderr

assert "Staging opt-in required" in probe({"M9_STAGING_HELM_TEST": "NO"})
assert "context does not match" in probe({})
assert "Namespace must use" in probe({"M9_EXPECTED_KUBE_CONTEXT": "production-cluster",
                                      "NAMESPACE": "production"})
assert "Explicit staging context" in probe({"M9_EXPECTED_KUBE_CONTEXT": ""})
print("PASS: Helm lifecycle refuses missing opt-in, mismatched context, non-staging namespace and missing context")
