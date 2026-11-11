# Supported stateful dependency compatibility — disposable CI

The original Helm charts still default to **PostgreSQL 11.10** and **RabbitMQ 3.8.34**, both end-of-community-support. The original Compose baseline separately runs PostgreSQL 15.3 and RabbitMQ 3.12. The project's public release must not claim production support for these versions.

This feature branch adds a separate **full NestJS runtime** CI job using a fresh-volume Compose override with PostgreSQL `17.11-alpine` and RabbitMQ `4.4.0-alpine`. It exercises actual authentication, migrated database, scanner HTTP ingestion and PostgreSQL evidence persistence. The job checks the running DB and broker versions and destroys only its own ephemeral CI volumes. The original Compose baseline is unchanged, so local operator databases are not implicitly upgraded.

The job is required by the aggregate RC source gate, so supported-stateful compatibility regressions cannot silently pass release CI.

**Important:** A successful fresh-install test is not an in-place migration! PostgreSQL 11/15 → 17 requires logical dump/restore or supported `pg_upgrade` preparation with durable backup, version-compatible extensions and rollback; RabbitMQ 3.8/3.12 → 4.4 requires a documented sequential upgrade path or a separate fresh broker and queue migration. Never point the override file at existing persistent volumes. The chart's legacy defaults must be replaced only once Helm install/upgrade/rollback plus migration safety is verified independently.

For an isolated Linux CI runner only:

```bash
export COMPOSE_FILE="$PWD/platform/docker-compose/docker-compose.yml:$PWD/tools/integration/modern-stateful.override.yml"
bash tools/integration/runtime-smoke.sh
docker compose -p m9-runtime down --volumes --remove-orphans
```

This is not a production installation procedure or a substitute for Linux/Kubernetes StatefulSet/PVC validation.
