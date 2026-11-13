# Security policy

m9sweeper-modern welcomes responsible reports of security vulnerabilities.

## Reporting a vulnerability

Use the repository's [GitHub Security page](https://github.com/sm-joe/m9sweeper-modern/security) and private vulnerability reporting where enabled.

Do not publish active credentials, kubeconfigs, private infrastructure details, exploit chains or unpatched vulnerability reproductions in public issues.

A useful report includes the affected version, impact, required attacker access, reproduction conditions and sanitized logs or evidence. Test only on systems you are authorized to assess.

## Secure deployment

- Use dedicated Kubernetes identities and least-privilege permissions.
- Protect dashboard access with HTTPS when exposed beyond a local port-forward.
- Generate unique administrator and scanner credentials and store them in Kubernetes Secrets.
- Secure PostgreSQL and RabbitMQ network access and authentication.
- Back up PostgreSQL and test restoration before upgrading.
- Review optional security integrations for your cluster before enabling them.

For setup, see the [installation guide](docs/installation.md). Public release assets are produced by the repository's release workflows; build metadata, checksums and signature evidence are attached as part of the publishing process.
