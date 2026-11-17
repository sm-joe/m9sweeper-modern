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

publish = (ROOT / ".github/workflows/release-build.yml").read_text(encoding="utf-8")
assert "gh release create" in publish
assert "dist/IMAGE-DIGESTS.txt" in publish
assert "dist/upgrade-release.ps1" in publish
assert "--target \"$GITHUB_SHA\"" in publish
eks = (ROOT / "docs/eks-installation.md").read_text(encoding="utf-8")
assert "kube-hunter" in eks and "Falco" in eks and "Pod Identity" in eks
assert "YOUR-TRUSTED-M9SWEEPER-HOST" not in eks
assert "```powershell" not in eks.lower()
for doc in ("README.md", "docs/getting-started.md", "docs/installation.md",
            "docs/eks-installation.md", "docs/cloud-kubernetes.md", "docs/kind-scanner-acceptance.md"):
    text = (ROOT / doc).read_text(encoding="utf-8")
    assert "```powershell" not in text.lower(), doc
    assert "v0.1.2" not in text, doc
assert not (ROOT / ".github/workflows/release-publish.yml").exists()
assert not (ROOT / ".github/workflows/release-acceptance.yml").exists()
print("PASS: scanner UI, packaged CLI and strict release gates validated")
