#!/usr/bin/env bash
# Runs policies.sql against the fixture and compares with expected.txt. Needs a local
# Postgres you can reach as postgres, with the roles anon and authenticated.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db=wrote_policies_test
psql -q -U postgres -c "drop database if exists $db" -c "create database $db"
psql -q -U postgres -c "do \$\$ begin create role anon nologin; exception when duplicate_object then null; end \$\$" \
                    -c "do \$\$ begin create role authenticated nologin; exception when duplicate_object then null; end \$\$"
psql -q -U postgres -d $db -f "$here/fixture.sql"
psql -U postgres -d $db -At -F '|' -f "$here/../../policies.sql" | awk -F'|' '{ split($4, w, ":"); print $1"|"$2"|"$3"|"substr($4,1,length(w[1])) }' | sed -E 's/^(1\|[^|]*\|[^|]*\|Every (UPDATE|DELETE)).*/\1/; s/^(2\|[^|]*\|[^|]*\|[a-z]+ is granted (UPDATE|DELETE)).*/\1/' > /tmp/policies-actual.txt
cat /tmp/policies-actual.txt
diff -u "$here/expected.txt" /tmp/policies-actual.txt && echo "policies.sql: all good"
