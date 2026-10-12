-- Teli crews: each member's backup lives in one row per crew they're in.
-- Run this once in the Supabase SQL editor, then turn on
-- Authentication → Sign In / Providers → "Allow anonymous sign-ins".
-- Every device signs in anonymously; its auth uid is its member id.

create table if not exists public.crew_members (
  crew_code  text        not null check (crew_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  member_id  uuid        not null default auth.uid() references auth.users on delete cascade,
  name       text        not null default '' check (char_length(name) <= 40),
  data       jsonb       not null check (pg_column_size(data) < 256000),
  updated_at timestamptz not null default now(),
  primary key (crew_code, member_id)
);

alter table public.crew_members enable row level security;

-- Whether the caller has joined this crew. Security definer so the select policy below
-- can look at the same table without recursing into itself.
create or replace function public.in_crew(code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_members where crew_code = code and member_id = (select auth.uid())
  );
$$;

-- How many people are in a crew, so joining can tell a real code from a typo
-- without revealing anything else about it.
create or replace function public.crew_size(code text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.crew_members where crew_code = upper(code);
$$;

revoke execute on function public.in_crew(text), public.crew_size(text) from public, anon;
grant execute on function public.in_crew(text), public.crew_size(text) to authenticated;

-- Members see everyone in crews they're in; each person only writes their own row.
drop policy if exists "read your crews" on public.crew_members;
create policy "read your crews" on public.crew_members
  for select to authenticated using ((select public.in_crew(crew_code)));

drop policy if exists "join as yourself" on public.crew_members;
create policy "join as yourself" on public.crew_members
  for insert to authenticated with check (member_id = (select auth.uid()));

drop policy if exists "update yourself" on public.crew_members;
create policy "update yourself" on public.crew_members
  for update to authenticated using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

drop policy if exists "leave" on public.crew_members;
create policy "leave" on public.crew_members
  for delete to authenticated using (member_id = (select auth.uid()));

-- The server stamps every change, so polling clients can compare times without trusting device clocks.
create or replace function public.crew_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crew_touch on public.crew_members;
create trigger crew_touch before insert or update on public.crew_members
  for each row execute function public.crew_touch();
