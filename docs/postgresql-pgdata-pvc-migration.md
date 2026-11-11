# PostgreSQL PGDATA persistence correction — upgrade safety

**Risk:** The original bundled PostgreSQL Helm StatefulSet mounted its PVC at `/var/lib/postgresql/data/userdata` while `PGDATA` defaulted to `/var/lib/postgresql/data/pgdata`. These are **sibling directories**. The data directory was not on the PVC, so Pod recreation could destroy database records even when Kubernetes retained the PVC.

## What changed

The StatefulSet now mounts the `data` claim at `/var/lib/postgresql/data`, the **parent** of its configured `PGDATA=/var/lib/postgresql/data/pgdata`. New installations place database files inside the PVC. CI renders the umbrella chart and asserts this property.

Existing deployments may have database data on the container writable layer rather than the old PVC. **Do not assume a retained PVC contains the running database.** Do not delete or restart the old Pod until its active database has been independently backed up and verified.

## Existing Helm releases — manual backup and isolated restore required

1. On a staging Linux Kubernetes cluster, identify the live PostgreSQL Pod, its `PGDATA` and its current mount table. Save a redacted inventory of Pod UID, namespace, StatefulSet name, PVC/PV and source PostgreSQL version.
2. While the **old Pod is still running**, use `pg_dump -Fc` with appropriate administrative credentials and write the dump directly to a secure operator backup destination (not the old PVC). Check the backup with `pg_restore --list`.
3. Restore the dump into an isolated, supported PostgreSQL staging database, verify the required m9sweeper table contents and report history using `scripts/verify-postgres-restore-linux.sh` where that disposable Compose topology applies. Protect secrets; do not paste database dumps into CI logs.
4. Only after verifying recovery and retaining a rollback-safe backup, perform a tested staging upgrade using `--set postgresql.persistence.acknowledgeDataMountMigration=true`, with a **separate** target volume as necessary. This value is deliberately not a default. Rollback of Helm manifests alone cannot recover database files lost from the previous writable layer.
5. Test Pod recreation, StatefulSet scale-down/up and table persistence in staging. Record database and Kubernetes versions, tested volume mapping, source SHA, backup checksum and restored table checksums. Do not promote to production without this evidence.

The existing `tools/integration/helm-kind-api-lifecycle.sh` exercises the fail-closed acknowledgment and Helm revision sequence on a disposable Kind cluster. That test checks Kubernetes API compatibility, **not** real PostgreSQL storage durability; the latter remains a separate staging release gate.

**Separate blocker:** The bundled database chart still carries PostgreSQL 11.10 and RabbitMQ 3.8.34, both unsupported. The PGDATA mount correction does not upgrade PostgreSQL or RabbitMQ binaries and cannot substitute for their separately tested migration paths.
