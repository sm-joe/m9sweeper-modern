#!/usr/bin/env bash
# Staging-only backup and restore to temporary DB. Live source remains unchanged.
set -euo pipefail
[[ "$M9_STAGING_RESTORE_TEST" == YES ]] || { echo 'Explicit staging opt-in required' >&2; exit 2; }
umask 077
mkdir -p private-backups
chmod 700 private-backups
scratch="m9_restore_verify_$$"
dump="private-backups/m9sweeper-$(date -u +%Y%m%dT%H%M%SZ).dump"
cleanup() { docker exec postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$scratch" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$dump"
[[ -s "$dump" ]] || { echo 'FAIL: empty dump' >&2; exit 1; }
docker exec postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$scratch"
docker exec -i postgres sh -c 'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$1"' sh "$scratch" < "$dump"
counts() {
  docker exec postgres sh -c 'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$1" -c "SELECT (SELECT COUNT(*) FROM clusters), (SELECT COUNT(*) FROM image_scan_runs), (SELECT COUNT(*) FROM image_scan_results), (SELECT COUNT(*) FROM image_scan_results_issues), (SELECT COUNT(*) FROM project_falco_logs), (SELECT COUNT(*) FROM kube_hunter);"' sh "$1"
}
source_db="$(docker exec postgres sh -c 'printf %s "$POSTGRES_DB"')"
before="$(counts "$source_db")"
after="$(counts "$scratch")"
echo "Source: $before"
echo "Restored: $after"
[[ "$before" == "$after" ]] || { echo 'FAIL: backup restore does not match source' >&2; exit 1; }
echo "PASS: isolated staging restore; retained backup $dump; scratch DB removed on exit"
