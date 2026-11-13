# Contributing to m9sweeper-modern

Contributions are welcome! m9sweeper-modern is an open-source Kubernetes security platform built with Angular, NestJS, Java and Helm.

## How to contribute

1. Search [existing issues](https://github.com/sm-joe/m9sweeper-modern/issues) and pull requests.
2. Open an issue explaining a bug or enhancement, or submit a focused pull request.
3. Include the relevant component, version, expected result and reproduction steps.
4. Run the appropriate automated tests and update the documentation when behavior changes.

## Repository guide

| Path | Contents |
| --- | --- |
| `platform/dash/frontend/` | Angular web dashboard |
| `platform/dash/backend/` | NestJS API and database migrations |
| `platform/trawler/` | Java image-scanning worker |
| `platform/manifests/charts/` | Helm charts |
| `tools/` | Unit, browser, integration and security tests |
| `docs/` | Installation and release notes |
| `.github/workflows/` | CI, security and release automation |

## Pull request checklist

- [ ] Change has a clear description and focused scope.
- [ ] Relevant tests or installation verification pass.
- [ ] No credentials, private kubeconfigs, environment secrets or sensitive logs are committed.
- [ ] API authentication, cluster authorization and scanner-failure behavior remain protected.
- [ ] Helm and Kubernetes changes are accompanied by rendering or runtime checks.
- [ ] Documentation and upstream licensing/attribution remain correct.

For vulnerabilities, read [SECURITY.md](SECURITY.md) and report privately rather than creating a public issue. This project retains upstream license notices; see [ATTRIBUTION.md](ATTRIBUTION.md).
