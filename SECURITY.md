# Security policy

## Supported security updates

| Version | Status |
| --- | --- |
| `v0.1.0-beta.1` | Public experimental beta; security fixes may require a new signed prerelease |
| Historical RC or development snapshots | Not supported as distributions |

This project provides **no production security certification or response-time SLA**. Operators are responsible for their cluster RBAC, HTTPS/TLS, credential rotation, network access, external PostgreSQL/RabbitMQ persistence and independent backups.

## Report a vulnerability privately

Use the repository's [GitHub Security page](https://github.com/sm-joe/m9sweeper-modern/security) and private vulnerability reporting where enabled. **Do not** disclose active credentials, kubeconfig contents, private infrastructure identifiers, weaponized proof-of-concept details or unpatched vulnerabilities in public GitHub issues.

Include a clear impact statement, affected release/version, sanitized reproduction conditions and what an attacker needs in order to exploit the problem. Avoid testing against systems you do not own or administer.

## Release integrity

Public prerelease assets are checked with SHA256 checksums and Sigstore identities from the signed GitHub Actions candidate workflow. Verify a chart and installer independently before use. Do not replace a signed asset with edited source code under the same filename or assume a source fix updates an already published immutable release.

Read the [public beta installation guide](docs/mvp-public-beta-install.md), including the beta.1 installer advisory, and validate deployment security in an isolated environment before connecting sensitive clusters.
