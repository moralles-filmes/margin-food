#!/bin/sh
set -eu
# The dump must contain the public schema BEFORE the multiunit migrations.
# All writes are restricted to a NEW named database on the local test cluster.
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  printf '%s\n' 'Usage: scripts/test-multiunit-db.sh /absolute/path/public-before.sql' >&2
  exit 2
fi
schema_file="$1"
test_port="${MULTIUNIT_TEST_PORT:-55439}"
test_database="${MULTIUNIT_TEST_DATABASE:-moralles_multiunit_test}"
case "$test_database" in moralles_multiunit_test*) ;; *) printf '%s\n' 'Database name must start with moralles_multiunit_test' >&2; exit 2;; esac
case "$test_port" in ''|*[!0-9]*) exit 2;; esac
project_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
createdb -h /tmp -p "$test_port" -U postgres "$test_database"
run_sql() { psql -X -q -h /tmp -p "$test_port" -U postgres -d "$test_database" -v ON_ERROR_STOP=1 -f "$1"; }
run_sql supabase/tests/fixtures/multiunit_postgres_prerequisites.sql
# O dump declara CREATE SCHEMA public, mas o banco novo já nasce com ele e as
# extensões dos prerequisites moram lá — as extensões têm que vir antes porque
# immutable_unaccent resolve 'public.unaccent'::regdictionary já no CREATE.
grep -vFx -e 'CREATE SCHEMA public;' -e 'ALTER SCHEMA public OWNER TO postgres;' "$schema_file" |
  psql -X -q -h /tmp -p "$test_port" -U postgres -d "$test_database" -v ON_ERROR_STOP=1 -f -
run_sql supabase/tests/fixtures/multiunit_before.sql
for migration in \
  20260909192644_company_memberships \
  20260909192839_company_scope_authorization \
  20260909193057_company_scope_legacy_consumers \
  20260909193257_company_membership_administration \
  20260909195048_company_scope_security_backstops \
  20260909195238_company_scope_validation \
  20260910003448_fix_membership_legacy_admin_delegation \
  20260915120000_restore_admin_delegation_guard_pos_rbac_granular; do
  run_sql "supabase/migrations/$migration.sql"
done
run_sql supabase/tests/database/multiunit_security.sql
run_sql supabase/tests/database/multiunit_admin_delegation.sql
run_sql supabase/tests/database/multiunit_rollback.sql
printf 'Security and rollback checks passed in local database %s.\n' "$test_database"
