#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/lrt/current}
ENV_FILE=${ENV_FILE:-/opt/lrt/shared/.env}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/lrt}
dump=${1:-$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'lrt-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)}
[[ -n $dump && -f $dump && -f "$dump.sha256" ]] || { echo "No verified backup found." >&2; exit 1; }
(cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256")
compose=(docker compose --project-name lrt --env-file "$ENV_FILE" --file "$APP_DIR/compose.yaml")
cleanup() { "${compose[@]}" exec -T db sh -ec 'dropdb -U "$POSTGRES_USER" --if-exists lrt_restore_check' >/dev/null; }
trap cleanup EXIT
"${compose[@]}" exec -T db sh -ec 'createdb -U "$POSTGRES_USER" lrt_restore_check'
"${compose[@]}" exec -T db sh -ec 'pg_restore -U "$POSTGRES_USER" -d lrt_restore_check --no-owner --exit-on-error' < "$dump"
"${compose[@]}" exec -T db sh -ec 'users=$(psql -U "$POSTGRES_USER" -d lrt_restore_check -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM users"); reports=$(psql -U "$POSTGRES_USER" -d lrt_restore_check -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM monthly_reports"); printf "Restored database: users=%s reports=%s\n" "$users" "$reports"; test "$users" -gt 0'
echo "Restore check passed: $dump"
