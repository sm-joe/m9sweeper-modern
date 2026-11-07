#!/usr/bin/env python3
"""Checks that the new UI has real product routes and retained original application services."""
from pathlib import Path
root = Path("platform")
routes = (root/"dash/frontend/src/app/modules/private/private-routing.module.ts").read_text()
shell = (root/"dash/frontend/src/app/modules/private/private.component.html").read_text()
menu = (root/"dash/frontend/src/app/modules/private/menus/menu.component.ts").read_text()
requirements = {
    "dashboard":"path: 'dashboard'",
    "cluster overview":"path: 'clusters/:id'",
    "policy editor":"component: PolicyCreateComponent",
    "exceptions":"component: ExceptionCreateComponent",
    "kube-bench":"component: KubeBenchComponent",
    "kube-hunter":"component: KubeHunterComponent",
    "Falco":"component: FalcoEventsListComponent",
    "Kubesec":"component: KubesecComponent",
    "Gatekeeper":"component: GateKeeperComponent",
    "reports":"component: ReportsComponent",
    "users":"component: UserListComponent",
}
missing=[name for name,frag in requirements.items() if frag not in routes]
if missing:
    raise SystemExit("Missing functional Angular routes: "+", ".join(missing))
for link in ('routerLink="/private/dashboard"','routerLink="/private/policies"','routerLink="/private/exceptions"'):
    if link not in shell:
        raise SystemExit("Missing connected app-shell link "+link)
if 'element.name = contentTriggerName' in menu:
    raise SystemExit("Regression: original menu triggers were assigning instead of comparing")
webhook = (root/"manifests/charts/dash/templates/validatingwebhookconfiguration.yaml").read_text()
if "failurePolicy: {{ .Values.validatingWebhook.failurePolicy" not in webhook:
    raise SystemExit("Webhook must use explicitly configured failure policy")
print("PASS: all original product views retained and modernized navigation targets functional routes")
