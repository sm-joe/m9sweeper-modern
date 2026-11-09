# Staged Trivy / Java / RabbitMQ / PostgreSQL / Angular acceptance

1. Deploy the release candidate on a disposable Linux staging Compose environment, with a real enabled Trivy policy and Java trawler worker.
2. In Angular, initiate a scan on an actual cluster/image. After completion execute `CLUSTER_ID=1 IMAGE_ID=2 bash scripts/verify-trivy-e2e-linux.sh`, replacing IDs with real ones. The script checks a durable completed run, correlated policy records and vulnerability evidence, fail-closed classifications, RabbitMQ availability and dashboard reachability.
3. In the Angular browser inspect the same image: current status, vulnerability count, CVE details, policy status and history. This browser inspection is not covered by the read-only SQL probe.
4. Test a deliberately failed image in staging, verify retry/DLQ retention and red failed-run UI; never mark a scanner failure compliant.
5. Run `M9_STAGING_RESTORE_TEST=YES bash scripts/verify-postgres-restore-linux.sh` on staging only. It writes a restrictive custom PostgreSQL backup to `private-backups/`, restores to a scratch database, verifies six table counts and removes only that scratch database. The original database is not modified.
6. In a disposable staging namespace verify Helm installation, upgrade and rollback with retained cluster data and Docker network reachability. Do not perform destructive testing on existing Kind/Compose data.

The scripts are real acceptance gates; they do not manufacture successful scans. Live operator and browser evidence is still required before claiming production readiness.
