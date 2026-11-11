#!/usr/bin/env python3
"""Guard against accidental production/other-project PostgreSQL restore."""
import os
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path("scripts/verify-postgres-restore-linux.sh")

def check(override, expected):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        writes = root / "dangerous-docker-exec"
        docker = root / "docker"
        docker.write_text(
            "#!/bin/sh\n"
            "if [ \"$1\" = inspect ]; then echo production; exit 0; fi\n"
            f"echo called > '{writes}'\nexit 40\n"
        )
        docker.chmod(0o755)
        env = {**os.environ, "M9_STAGING_RESTORE_TEST": "YES",
               "M9_EXPECTED_COMPOSE_PROJECT": "m9-runtime",
               "PATH": td + os.pathsep + os.environ.get("PATH", ""), **override}
        proc = subprocess.run(["bash", str(SCRIPT)], env=env,
                              text=True, capture_output=True, timeout=6)
        assert proc.returncode != 0, proc.stdout
        assert expected in proc.stderr, proc.stderr
        assert not writes.exists(), "Database backup/restore attempted before staging verification"

check({"M9_STAGING_RESTORE_TEST": "NO"}, "Explicit staging opt-in")
check({"M9_EXPECTED_COMPOSE_PROJECT": "production"}, "non-disposable Compose")
check({}, "belongs to a different Compose project")
check({"M9_EXPECTED_COMPOSE_PROJECT": ""}, "Expected disposable Compose project")
print("PASS: staging restore refuses wrong project, missing opt-in and wrong container before any writes")
