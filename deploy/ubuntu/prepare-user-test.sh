#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
APP_DIR=${APP_DIR:-$ROOT_DIR}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env}
BACKUP_DIR=${BACKUP_DIR:-$APP_DIR/backups}
INPUT_FILE=${INPUT_FILE:-$APP_DIR/backend/prisma/coffee-shop-directory.json}
: "${ADMIN_EMAIL:?Set ADMIN_EMAIL to the existing administrator to preserve}"

apply=false
case ${1:-} in
  '') ;;
  --apply) apply=true ;;
  *) echo "Usage: ADMIN_EMAIL=... bash deploy/ubuntu/prepare-user-test.sh [--apply]" >&2; exit 1 ;;
esac
[[ $# -le 1 ]] || { echo "Unexpected arguments." >&2; exit 1; }
[[ -f "$ENV_FILE" && -f "$INPUT_FILE" ]] || { echo "Environment file or coffee shop directory is missing." >&2; exit 1; }
INPUT_FILE=$(realpath "$INPUT_FILE")
compose=(docker compose --project-name "${COMPOSE_PROJECT_NAME:-lrt}" --env-file "$ENV_FILE" --file "$APP_DIR/compose.yaml")
"${compose[@]}" config --quiet
prepare=(run --rm --no-deps -T --volume "$INPUT_FILE:/app/backend/user-test-directory.json:ro" -e "ADMIN_EMAIL=$ADMIN_EMAIL" --entrypoint node api prisma/prepare-user-test.cjs --input /app/backend/user-test-directory.json)

if [[ $apply == false ]]; then
  "${compose[@]}" "${prepare[@]}"
  echo "Preview only. No data changed. Add --apply to back up and prepare the database once."
  exit 0
fi

"${compose[@]}" run --rm --no-deps -T --volume "$INPUT_FILE:/app/backend/user-test-directory.json:ro" -e "ADMIN_EMAIL=$ADMIN_EMAIL" -e CONFIRM_USER_TEST_RESET=lrt.scr-tech.ru --entrypoint node api prisma/prepare-user-test.cjs --input /app/backend/user-test-directory.json --require-ready

services_stopped=false
resume_services() {
  result=$?
  trap - EXIT
  if [[ $services_stopped == true ]]; then
    if ! "${compose[@]}" up -d api web; then
      echo "Could not restart api/web. Check Docker Compose logs." >&2
      [[ $result -ne 0 ]] || result=1
    fi
  fi
  exit "$result"
}
trap resume_services EXIT
services_stopped=true
"${compose[@]}" stop web api

mkdir -p "$BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump="$BACKUP_DIR/lrt-before-user-test-$timestamp.dump"
partial="$dump.partial"
"${compose[@]}" exec -T db sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$partial"
test -s "$partial"
"${compose[@]}" exec -T db pg_restore --list < "$partial" > /dev/null
mv "$partial" "$dump"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$dump")" > "$(basename "$dump").sha256")
echo "Backup created: $dump"

"${compose[@]}" run --rm --no-deps -T --volume "$INPUT_FILE:/app/backend/user-test-directory.json:ro" -e "ADMIN_EMAIL=$ADMIN_EMAIL" -e CONFIRM_USER_TEST_RESET=lrt.scr-tech.ru --entrypoint node api prisma/prepare-user-test.cjs --input /app/backend/user-test-directory.json --apply
"${compose[@]}" up -d api web
services_stopped=false
echo "Database prepared. Administrator and configuration preserved; real cities and coffee shops loaded."
