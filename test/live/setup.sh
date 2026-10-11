#!/usr/bin/env bash
# Builds the live test database and starts PostgREST on port 3000. Run as root in a
# throwaway Linux with PostgreSQL installed. PostgREST is downloaded once from its
# GitHub releases.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ver=v12.2.3
if [ ! -x /usr/local/bin/postgrest ]; then
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/$ver/postgrest-$ver-linux-static-x64.tar.xz" | tar -xJ -C /usr/local/bin
fi
service postgresql start >/dev/null
# Stop the old server first: Postgres will not drop a database that still has connections.
pkill -x postgrest || true
su postgres -c "psql -q -c 'drop database if exists wrote_live with (force)'" 
for r in authenticator authenticated anon; do su postgres -c "psql -q -c 'drop role if exists $r'" 2>/dev/null || true; done
su postgres -c "psql -q -c 'create database wrote_live'"
su postgres -c "psql -q -d wrote_live -f $here/setup.sql"
cat > /tmp/wrote-live.conf <<CONF
db-uri = "postgres://authenticator:wrote-live@127.0.0.1:5432/wrote_live"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "a-test-secret-that-is-at-least-32-characters-long"
server-port = 3000
CONF
pkill -x postgrest || true
nohup postgrest /tmp/wrote-live.conf >/tmp/postgrest.log 2>&1 &
sleep 2
postgrest --version
