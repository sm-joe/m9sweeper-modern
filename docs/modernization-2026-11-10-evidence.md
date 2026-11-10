# m9sweeper modernization evidence — 10 November 2026

This document distinguishes **merged implementation**, **CI integration evidence**, and **remaining live release acceptance**. m9sweeper is still an integration/release candidate; do not advertise supported production Kubernetes coverage until the gates below are closed.

## Verified on main after Angular 22 / esbuild

| Change | PR | Evidence and boundaries |
| --- | --- | --- |
| Angular 22 esbuild application builder, NestJS static SPA output, ESLint | [#20](https://github.com/sm-joe/m9sweeper-modern/pull/20) | 14 platform checks plus Chromium regression; `backend/dist/public/index.html` contract retained |
| Backend bootstrap failures and single HTTP response observation | [#21](https://github.com/sm-joe/m9sweeper-modern/pull/21) | 14 green checks, dedicated source-contract test |
| Header-only scanner authentication defaults for new Compose installs | [#22](https://github.com/sm-joe/m9sweeper-modern/pull/22) | 14 green checks, real invalid URL-credential authentication test; existing `.env` overrides unchanged |
| Stable NestJS public module imports | [#23](https://github.com/sm-joe/m9sweeper-modern/pull/23) | 14 green checks, current NestJS major unchanged |
| Complete reproducible Linux source archive with deployment/test scripts | [#24](https://github.com/sm-joe/m9sweeper-modern/pull/24) | 14 green checks; deterministic bytes and required-file presence |
| Disposable real RabbitMQ → Java Trivy → NestJS → PostgreSQL scan | [#25](https://github.com/sm-joe/m9sweeper-modern/pull/25) | [Real queued scanner workflow](https://github.com/sm-joe/m9sweeper-modern/actions/runs/42835189613) passed; scan UI inspection remains separate |
| Least-privilege nonroot Dash/initialization/trawler Helm container contexts | [#26](https://github.com/sm-joe/m9sweeper-modern/pull/26) | 14 green checks, rendered Helm restrictions and full-stack regression; Kubesec sidecar not changed |

## Open release gates

1. **NestJS runtime modernization:** lockfile-controlled major upgrade with full Docker image, login, API, Playwright and backup/restore regression on the exact final SHA. Do not infer upgrade success from unit compilation alone.
2. **Scanner correctness:** verify failed registry scans, retry budget, durable quarantine/DLQ, red failure state, independent CVE/score evidence, operator-authorized scanning, and visual Angular findings on the same real scan UUID. Positive Trivy CI does not cover every failure mode.
3. **Native Falco:** capture an actual kernel/eBPF-generated event on a supported Linux Kubernetes node, trace Falcosidekick HTTP, authentication, cluster binding, PostgreSQL row and Angular event. CI webhook fixtures prove ingestion only, not kernel capture.
4. **Kubernetes acceptance:** verify clean install, upgrade, rollback, admission-policy denial, credential rotation, TLS, PVC retention, PostgreSQL scratch restore and RabbitMQ recovery on declared supported versions. Never perform destructive drills on the user's existing Kind or Compose volumes.
5. **Public production sign-off:** publish tested container digests/Helm chart, supply SBOM and provenance for the shipped artifacts, independent signature verification, support matrix, licenses/attribution, and redacted acceptance evidence. Reproducible source archive is not a signed production binary.
6. **Security isolation:** exercise two independent cluster/tenant identities across nested resource IDs, reports, policies and scanner API keys; preserve DENY semantics for unauthorized writes and reads.

## Operating rules

- Source and installation instructions target Linux/Linux-node Kubernetes; operator testing may be performed from Windows PowerShell.
- Preserve verified kube-hunter behavior, existing Compose ↔ Kind network connectivity, database/report history and upstream Apache-2.0 attribution.
- No CI assertion or scan summary should claim compliant/clean when scanner execution fails or HIGH/CRITICAL findings violate policy.
- All subsequent upgrades require an isolated branch/PR and matching full-stack CI on the final head.
