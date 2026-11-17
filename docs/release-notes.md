# m9sweeper-modern v0.1.1

## Trawler Secret backward-compatibility fix

The v0.1.0 pre-install/pre-upgrade Helm check incorrectly rejected existing Trawler Secrets containing the RabbitMQ variable names from earlier installation instructions. Java Trawler also failed to read those values. This maintenance release restores compatibility **without changing credentials or requiring Secret recreation**.

Both Helm validation and the Java Trawler now support either set of names:

| Existing documented Secret key | Trawler-specific key |
| --- | --- |
| `RABBITMQ_HOST_NAME` | `RABBITMQ_HOSTNAME` |
| `RABBITMQ_USER_NAME` | `RABBITMQ_USERNAME` |
| `RABBITMQ_USER_PASSWORD` | `RABBITMQ_PASSWORD` |
| `MSG_QUEUE_NAME_IMAGE_SCANNER` | `RABBITMQ_QUEUE_NAME` |

The Helm preflight checks that matching aliases do not disagree and still rejects missing or placeholder values. Java does not silently substitute RabbitMQ's default `guest` credentials.

## Upgrade

Back up PostgreSQL. **Keep the original `m9-dash-env`, `m9-init-env`, and `m9-trawler-env` Secrets, RabbitMQ persistent volume, Helm values, and scanner API key.** Do not run `create-install-secrets.py` on an existing deployment.

Use the signed `m9sweeper-0.1.1.tgz` chart from this release and follow `INSTALL.md`. Independent downloaded-chart Kind acceptance checks a genuine Trawler Secret using the original documented names during upgrade and verifies that the worker restarts successfully.

Native Falco-to-dashboard and kube-hunter-to-dashboard delivery remain separately disclosed operator checks; passing Kind tests does not certify those EKS integrations.
