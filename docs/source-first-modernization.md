# Original m9sweeper -> m9sweeper-modern: source-preserving revamp

## Product baseline

- Source: https://github.com/m9sweeper/m9sweeper
- Pinned original commit: `2bc394b5db0d00e3a5784d388ba26be6451ff9c0`
- Imported source location: `platform/` (full project, original Apache 2.0 license and notices intact)
- Modernization branch: `revamp/original-platform`
- **The root `dash/` + `backend/` + `trawler/` directories on the earlier prototype branch are NOT a feature-parity platform.** Do not replace the imported application with those minimal services.

## Why this baseline is materially different

The real original source contains Angular application routes/forms for users,
clusters, images, scan results, exceptions, Gatekeeper, CIS, kube-hunter, Kubesec,
Falco, reports and audit logs; NestJS modules with the matching services,
database migrations, and a Java trawler plus working Helm chart family.
The full product needs those actual components and data paths, not substitute pages.

## Release definition / gates

| Requirement | Acceptance test |
|---|---|
| Full application | Existing login, user management, dashboard and navigation work with real database |
| Trivy | Image scan executed, stored and shown with CVE details |
| kube-bench | Real Kubernetes job executed and result interpreted in UI |
| kube-hunter | Real job and report visible in UI |
| Kubesec | Real deployment analysis and findings visible |
| Falco | Alerts from Falco sent to and queried from platform |
| Policies/exception | Actual Angular forms, persisted rules, cluster/namespace scope |
| Kubernetes | Real cluster creation, scrape/discovery, schedules, and health |
| Helm | Install/upgrade/uninstall in supported current Kubernetes; RBAC least privilege |
| Production | Auth/session testing, DB upgrade/rollback, CI, Go/Java/TS tests, end-to-end scan |

## Verified vs not verified

Import workflow verifies source presence, not full operational compatibility.
The imported original stack contains historical Angular 17 / NestJS 10 / Java
components and deployment assumptions from 2024. These must be upgraded,
tested and hardened before production use; importing them is not a release.

### Explicit risks to address

- Original webhook chart uses `failurePolicy: Ignore`; admission enforcement
  must not be silently assumed. Replacement needs careful fail-closed design
  and operator-selectable outage behavior with rollout tests.
- Original readme illustrates insecure example credentials; replace with strong
  Kubernetes Secret inputs and guided setup.
- Legacy pods and security tools may have deprecated API versions/images.
- Major Angular and Nest dependencies must be upgraded in compatible steps
  rather than only changing package versions.
- Full data migrations must preserve policy, exception, and report history.

This document tracks the actual source-first path and avoids treating a
passing config test as functional acceptance.
