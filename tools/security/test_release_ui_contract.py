#!/usr/bin/env python3
"""Static release contract: scanner UI, packaged CLI and release safety gates."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]
DIALOGS = [
    ROOT / "platform/dash/frontend/src/app/modules/private/pages/cluster/kube-bench/kube-bench-dialog/kube-bench-dialog.component.html",
    ROOT / "platform/dash/frontend/src/app/modules/private/pages/cluster/kube-hunter/kube-hunter-dialog/kube-hunter-dialog.component.html",
]
for dialog in DIALOGS:
    source = dialog.read_text(encoding="utf-8")
    assert source.count("gh release download --repo sm-joe/m9sweeper-modern") == 2, dialog
    assert not re.search(r"releases/download/v\d+\.\d+\.\d+/", source), dialog

scripts = json.loads((ROOT / "platform/dash/backend/package.json").read_text(encoding="utf-8"))["scripts"]
cli_scripts = {name: cmd for name, cmd in scripts.items() if "CLI_PATH:=" in cmd}
assert cli_scripts, "No CLI scripts found"
for name, command in cli_scripts.items():
    assert "CLI_PATH:=./cli.js" in command, f"{name}: wrong packaged CLI path"
    assert "./dist/src/cli.js" not in command, f"{name}: obsolete CLI path"

falco = (ROOT / "platform/dash/frontend/src/app/modules/private/pages/falco/falco-dialog/falco-dialog.component.html").read_text(encoding="utf-8")
assert "falcosidekick.config.existingSecret=m9sweeper-falco-webhook" in falco
assert "WEBHOOK_MINIMUMPRIORITY" in falco
assert "--version 9.2.2" in falco
assert "--set-string falcosidekick.config.webhook.minimumpriority" not in falco

publish = (ROOT / ".github/workflows/release-publish.yml").read_text(encoding="utf-8")
assert "inputs.scanner_acceptance == 'KUBE_HUNTER_TRIVY_FALCO_VERIFIED'" in publish
assert "PENDING_DISCLOSED" not in publish
eks = (ROOT / "docs/eks-installation.md").read_text(encoding="utf-8")
assert "WEBHOOK_ADDRESS=https://YOUR-TRUSTED-M9SWEEPER-HOST/api/falco/YOUR-CLUSTER-ID/create" in eks
acceptance = (ROOT / ".github/workflows/release-acceptance.yml").read_text(encoding="utf-8")
assert "gh workflow run release-publish.yml" not in acceptance
upgrade = (ROOT / "scripts/upgrade-release.ps1").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/release-build.yml").read_text(encoding="utf-8")
install = (ROOT / "docs/installation.md").read_text(encoding="utf-8")
assert "IMAGE-DIGESTS.txt" in upgrade
assert "--reuse-values" in upgrade
assert all(f'--set-string", "{component}.image.{field}=' in upgrade
           for component in ("dash", "trawler")
           for field in ("registry", "repository", "tag"))
assert "deployment/m9sweeper-dash" in upgrade and "deployment/m9sweeper-trawler" in upgrade
assert "upgrade-release.ps1" in workflow
assert "dist/upgrade-release.ps1" in workflow
assert "upgrade-release.ps1 > SHA256SUMS" in workflow
assert "dash.image.tag=v0.1.0@$dash_digest" in install
assert "trawler.image.tag=v0.1.0@$trawler_digest" in install
print("PASS: scanner UI, packaged CLI and strict release gates validated")
