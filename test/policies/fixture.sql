-- One table for each thing policies.sql reports, and two that are fine.
-- Run in a throwaway database where the roles anon and authenticated exist.
create table public.fine (id int primary key, owner text);
alter table public.fine enable row level security;
create policy r on public.fine for select to authenticated using (true);
create policy w on public.fine for update to authenticated using (true);
create policy d on public.fine for delete to authenticated using (true);
grant select, update, delete on public.fine to authenticated;

create table public.no_read (id int primary key);          -- update and delete allowed, no select policy: level 1 twice
alter table public.no_read enable row level security;
create policy w on public.no_read for update to authenticated using (true);
create policy d on public.no_read for delete to authenticated using (true);
grant select, update, delete on public.no_read to authenticated;

create table public.no_policy (id int primary key);        -- update granted, no update policy: level 2
alter table public.no_policy enable row level security;
create policy r on public.no_policy for select to authenticated using (true);
grant select, update on public.no_policy to authenticated;

create table public.all_policy (id int primary key);       -- one FOR ALL policy covers everything: fine
alter table public.all_policy enable row level security;
create policy everything on public.all_policy to authenticated using (true);
grant select, update, delete on public.all_policy to authenticated;

create table public.public_policy (id int primary key);    -- policy with no role list applies to everyone: anon has update, no select: level 1
alter table public.public_policy enable row level security;
create policy w on public.public_policy for update using (true);
grant update on public.public_policy to anon;

create table public.no_rls (id int primary key);           -- row level security off: not this check's business
grant select, update on public.no_rls to anon;

create table public.column_grant (id int primary key, bio text);  -- update granted on one column only, no select policy: level 1
alter table public.column_grant enable row level security;
create policy w on public.column_grant for update to authenticated using (true);
grant update (bio) on public.column_grant to authenticated;
