# Contributing to m9sweeper-modern

Thanks for helping improve this open-source Kubernetes security project. The current public distribution is **v0.1.0-beta.1**, a staging-focused prerelease; production readiness, cross-cluster isolation and scanner compatibility must be demonstrated rather than assumed.

## Before opening a change

1. Search [existing issues](https://github.com/sm-joe/m9sweeper-modern/issues) and pull requests. For user-facing behavior, include the Linux/Kubernetes version and whether the issue reproduces using the [published signed beta](https://github.com/sm-joe/m9sweeper-modern/releases/tag/v0.1.0-beta.1).
2. For security vulnerabilities, **do not** create a public issue or post exploit details. Follow [SECURITY.md](SECURITY.md).
3. Keep changes focused. Explain the user-visible behavior, root cause, regression risk and how you verified it.
4. Preserve upstream license notices, original attribution and any third-party licensing obligations.

## Repository layout

- `platform/dash/`: Angular and NestJS dashboard / API.
- `platform/trawler/`: Java scanner worker and Trivy integration.
- `platform/manifests/charts/`: Helm charts and image deployment.
- `tools/`: integration and security checks.
- `scripts/`: operator and CI acceptance helpers.
- `docs/`: public beta guidance, feature verification and historical release evidence.

## Pull request checklist

- [ ] Describes the problem, intended change and supported environments.
- [ ] Includes relevant build/test or runtime evidence, and states what remains unverified.
- [ ] Avoids secrets, raw kubeconfigs, private IPs, credentials and personal data.
- [ ] Keeps scanner failures fail-closed; never changes missing findings into a compliant verdict.
- [ ] Keeps signed release/artifact checks, cluster authorization and database preservation protections intact.
- [ ] Updates public documentation when installation, configuration or behavior changes.
- [ ] Preserves `platform/LICENSE` and [ATTRIBUTION.md](ATTRIBUTION.md) obligations.

Run the relevant frontend/backend/Java tests and Helm lint/template checks for changed components. Do not use a passing compile step to claim a real Kubernetes scanner or install was validated. For releases, use the signed-chart and independent Linux Kind acceptance workflows.

## Issues and support

Please supply reproduction steps, sanitized logs, expected/actual behavior, component versions and the exact release chart filename or commit. Attach only artifacts that contain no credentials or private infrastructure data. This is a community beta; there is no committed production SLA.
