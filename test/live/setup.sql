-- A small stand-in for a Supabase project, for the live test: the API roles,
-- a login role PostgREST connects as, and three tables.
create role anon nologin;
create role authenticated nologin;
create role authenticator login password 'wrote-live' noinherit;
grant anon, authenticated to authenticator;

create function public.me() returns text language sql stable as
  $$ select current_setting('request.jwt.claims', true)::json->>'sub' $$;

-- notes: you may read, change and delete your own rows only.
create table public.notes (id serial primary key, owner text not null, title text);
alter table public.notes enable row level security;
create policy read_own on public.notes for select to authenticated using (owner = public.me());
create policy change_own on public.notes for update to authenticated using (owner = public.me());
create policy delete_own on public.notes for delete to authenticated using (owner = public.me());
grant select, update, delete on public.notes to authenticated;

-- drafts: you may change any row, but you may not read any row back.
create table public.drafts (id serial primary key, body text);
alter table public.drafts enable row level security;
create policy change_any on public.drafts for update to authenticated using (true);
grant select, update on public.drafts to authenticated;

-- locked: no grant at all, so the database refuses outright.
create table public.locked (id serial primary key, body text);

insert into public.notes (owner, title) values ('alice', 'alice note'), ('bob', 'bob note');
insert into public.drafts (body) values ('first draft');
insert into public.locked (body) values ('locked row');

-- checked: you may find and change any row, but WITH CHECK refuses a title of 'bad'.
create table public.checked (id serial primary key, title text);
alter table public.checked enable row level security;
create policy read_any on public.checked for select to authenticated using (true);
create policy change_unless_bad on public.checked for update to authenticated using (true) with check (title <> 'bad');
grant select, update on public.checked to authenticated;
insert into public.checked (title) values ('good');
