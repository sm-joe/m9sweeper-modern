#!/usr/bin/env python3
"""Product-preservation gate: stop accidental removal of original modules."""
from pathlib import Path
import sys
root = Path("platform")
critical = {
    "authentication": "dash/backend/src/modules/auth/auth.module.ts",
    "users": "dash/backend/src/modules/user/user.module.ts",
    "clusters": "dash/backend/src/modules/cluster/cluster.module.ts",
    "images": "dash/backend/src/modules/image/image.module.ts",
    "policies": "dash/backend/src/modules/policy/policy.module.ts",
    "exceptions": "dash/backend/src/modules/exceptions/exceptions.module.ts",
    "reports": "dash/backend/src/modules/reports/reports.module.ts",
    "admission": "dash/backend/src/modules/cluster-validation/services/cluster-validation.service.ts",
    "gatekeeper": "dash/backend/src/modules/gatekeeper/gatekeeper.module.ts",
    "falco": "dash/backend/src/modules/falco/falco.module.ts",
    "kube-bench": "dash/backend/src/modules/kube-bench/kube-bench.module.ts",
    "kube-hunter": "dash/backend/src/modules/kube-hunter/kube-hunter.module.ts",
    "kubesec": "dash/backend/src/modules/kubesec/kubesec.module.ts",
    "frontend routing": "dash/frontend/src/app/modules/private/private-routing.module.ts",
    "trawler": "trawler/src/main/java/io/m9sweeper/trawler/scanners/Trivy.java",
    "helm": "manifests/charts/dash/Chart.yaml",
}
missing = [name for name,path in critical.items() if not (root/path).is_file()]
if missing:
    sys.exit("MISSING upstream platform modules: " + ", ".join(missing))
source_files = sum(1 for p in root.rglob("*") if p.is_file())
if source_files < 1500:
    sys.exit(f"Incomplete platform source import: only {source_files} files")
print(f"PASS: preserved {len(critical)} core product capabilities and {source_files} upstream files")
