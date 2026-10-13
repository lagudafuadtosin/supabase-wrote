-- supabase-wrote: policies.sql
-- https://github.com/lagudafuadtosin/supabase-wrote
--
-- Paste into the Supabase SQL editor and run. It only reads. It changes nothing.
--
-- Lists every table where an UPDATE or DELETE through the API will silently change
-- nothing: 200, no error, an empty list. The two usual causes:
--   1. The role may update or delete, but no policy lets it do so.
--   2. A policy lets it update or delete, but no policy lets it SELECT the row.
--      Postgres has to read a row to find it, so with no SELECT policy every
--      update and delete matches zero rows.
-- service_role skips row level security, so it is never affected and not listed.
--
-- level: 1 = every update or delete here silently does nothing, 2 = check it is what you meant
-- Nothing in the "fix" column is run for you. Read it first.

with
roles(role) as (
  values ('anon'), ('authenticated')
),

-- Tables in public with row level security on.
tables as (
  select c.oid, format('%I.%I', n.nspname, c.relname) as name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relrowsecurity
    and not exists (select 1 from pg_depend dep where dep.objid = c.oid and dep.deptype = 'e')
),

-- Which permissive policies apply to which role for which command.
-- A policy with no roles listed (or PUBLIC) applies to every role.
-- polcmd: r = select, w = update, d = delete, a = insert, * = all.
applies as (
  select t.oid,
         r.role,
         bool_or(p.polcmd in ('r', '*')) as can_select,
         bool_or(p.polcmd in ('w', '*')) as can_update,
         bool_or(p.polcmd in ('d', '*')) as can_delete
  from tables t
  cross join roles r
  left join pg_policy p
    on p.polrelid = t.oid
   and p.polpermissive
   and (p.polroles = '{0}' or r.role::regrole::oid = any (p.polroles))
  group by t.oid, r.role
),

checks as (
  select t.name,
         a.role,
         -- any-column, because a grant on single columns is enough to update through the API
         has_any_column_privilege(a.role, t.oid, 'UPDATE') as granted_update,
         has_table_privilege(a.role, t.oid, 'DELETE') as granted_delete,
         coalesce(a.can_select, false) as can_select,
         coalesce(a.can_update, false) as can_update,
         coalesce(a.can_delete, false) as can_delete
  from tables t
  join applies a on a.oid = t.oid
),

findings(level, object, role, finding, fix) as (
  -- Allowed to update by policy, but no SELECT policy to find the row.
  select 1, c.name, c.role,
         'Every UPDATE by ' || c.role || ' silently changes nothing: a policy allows the update, but no SELECT policy lets it find the row.',
         'create policy "' || c.role || ' can read" on ' || c.name || ' for select to ' || c.role || ' using (...);  -- the same condition as the update policy'
  from checks c
  where c.granted_update and c.can_update and not c.can_select

  union all

  select 1, c.name, c.role,
         'Every DELETE by ' || c.role || ' silently changes nothing: a policy allows the delete, but no SELECT policy lets it find the row.',
         'create policy "' || c.role || ' can read" on ' || c.name || ' for select to ' || c.role || ' using (...);  -- the same condition as the delete policy'
  from checks c
  where c.granted_delete and c.can_delete and not c.can_select

  union all

  -- Granted, but no policy allows it at all.
  select 2, c.name, c.role,
         c.role || ' is granted UPDATE, but no policy allows it, so every update silently changes nothing. Fine if updates are not meant to happen, but then the grant is misleading.',
         'revoke update on ' || c.name || ' from ' || c.role || ';  -- or add an update policy if updates are meant to work'
  from checks c
  where c.granted_update and not c.can_update

  union all

  select 2, c.name, c.role,
         c.role || ' is granted DELETE, but no policy allows it, so every delete silently changes nothing. Fine if deletes are not meant to happen, but then the grant is misleading.',
         'revoke delete on ' || c.name || ' from ' || c.role || ';  -- or add a delete policy if deletes are meant to work'
  from checks c
  where c.granted_delete and not c.can_delete
)

select level, object, role, finding, fix
from findings
order by level, object, role, finding;
