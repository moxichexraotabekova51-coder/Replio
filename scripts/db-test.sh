#!/usr/bin/env bash
# Migratsiyalarni toza lokal Postgres bazasida sinaydi va RLS testlarini ishga tushiradi.
# Foydalanish: scripts/db-test.sh   (PGHOST/PGUSER muhit o'zgaruvchilari bilan)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-replio_test}"
PSQL="psql -v ON_ERROR_STOP=1 -q"
dropdb --if-exists "$DB"
createdb "$DB"
$PSQL -d "$DB" -f supabase/sql-tests/00_local_stubs.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  $PSQL -d "$DB" -f "$f"
done
for f in supabase/sql-tests/[1-9]*.sql; do
  echo "→ test $f"
  $PSQL -d "$DB" -f "$f"
done
echo "✓ Hammasi o'tdi"
