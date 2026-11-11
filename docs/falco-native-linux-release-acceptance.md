# Native Linux Falco acceptance (real kernel event)

This is an **explicit, staging-only** production release gate, not a synthetic Falcosidekick webhook. Execute only on a supported native Linux Kubernetes cluster whose Falco sensor is already configured with a detection rule for sensitive file reads. It intentionally does not install Falco, alter an existing cluster identity, or use `insecure-skip-tls-verify`.

## Prerequisites

- Native Linux/maintained kernel with operational Falco modern eBPF syscall capture and Falcosidekick webhook output. Evidence must include sensor version, kernel and deployment chart version.
- An isolated staging Kubernetes cluster, `kubectl` context pointing to that cluster, and namespace creation permission.
- An existing registered m9sweeper cluster ID, Falco scanner identity authorized for that ID, and the Dash endpoint reachable by Falcosidekick.
- PostgreSQL staging Compose container named `postgres` with the same DB as Dash, accessible to the Linux shell. This script covers that integration topology only; replace the DB query mechanism for remote PostgreSQL deployments.
- No production credentials, secrets or audit event bodies should be pasted into logs.

## Execute

```bash
export M9_FALCO_LIVE_TEST=YES
export M9_FALCO_LINUX_HOST=YES
export CLUSTER_ID=1  # use the real registered staging cluster ID
export M9_FALCO_EXPECTED_RULE="Read sensitive file untrusted"
bash scripts/verify-falco-live-linux.sh
```

The script takes a maximum-id baseline, creates a uniquely named disposable namespace, starts a BusyBox test Pod, reads that Pod's local `/etc/shadow` to trigger the configured Falco rule, and polls actual `project_falco_logs` for a **new** event matching the exact expected Falco rule, cluster ID, namespace and Pod. A generic Pod startup event is not sufficient evidence. It deletes only its newly created namespace on exit and retains PostgreSQL evidence. No synthetic event is sent to the NestJS API. On failure, inspect Falco's kernel driver, enabled rules and Falcosidekick delivery separately. A healthy DaemonSet alone is not evidence of capture.

Record the emitted event ID, rule and test Pod, then verify **the same event** in the Angular Falco view using a scoped read-only user. Capture redacted Playwright/browser evidence, `uname -r`, Kubernetes version, chart/image digests and observed authentication outcome. A matching DB row and browser correlation close only this environment's Falco gate, not universal kernel compatibility.

Keep production promotion blocked until independent test environments, TLS and key rotation, supported-version matrix and Helm lifecycle are also accepted.
