create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'availability_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.availability_status as enum ('available', 'late', 'unavailable');
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  gamer_tag text,
  email text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Copenhagen',
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.teams
  alter column created_by drop not null;

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.default_practice_days (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_availability (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.availability_status not null,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (team_id, user_id, practice_date)
);

create table if not exists public.extra_availability (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  available_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.team_matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  match_date date not null,
  start_at timestamptz not null,
  opponent text not null,
  note text,
  created_at timestamptz not null default now()
);

grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon;

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
grant select on tables to anon;
alter default privileges in schema public
grant execute on functions to authenticated;
alter default privileges in schema public
grant execute on functions to service_role;

create or replace function public.ensure_extra_ordinem_team_seed(
  p_owner_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id constant uuid := '78466703-d22e-4ecf-989c-4de14772d8fc'::uuid;
begin
  insert into public.teams (id, name, timezone, created_by)
  values (v_team_id, 'Extra Ordinem', 'Europe/Copenhagen', p_owner_user_id)
  on conflict (id) do update
  set
    name = excluded.name,
    timezone = excluded.timezone,
    created_by = coalesce(public.teams.created_by, excluded.created_by);

  insert into public.default_practice_days (team_id, weekday, start_time, end_time, is_active)
  select
    v_team_id,
    d.weekday,
    d.start_time,
    d.end_time,
    true
  from (
    values
      (1, '19:00'::time, '22:00'::time),
      (3, '19:00'::time, '22:00'::time),
      (0, '19:00'::time, '22:00'::time)
  ) as d(weekday, start_time, end_time)
  where not exists (
    select 1
    from public.default_practice_days dpd
    where dpd.team_id = v_team_id
      and dpd.weekday = d.weekday
  );

  return v_team_id;
end;
$$;

create or replace function public.user_belongs_to_team(
  p_team_id uuid
)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.ensure_default_availability_for_range(
  p_team_id uuid,
  p_start_date date,
  p_end_date date
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_timezone text;
  v_inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;

  if not public.user_belongs_to_team(p_team_id) then
    raise exception 'forbidden';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid date range';
  end if;

  select t.timezone
  into v_timezone
  from public.teams t
  where t.id = p_team_id;

  if v_timezone is null then
    raise exception 'team not found';
  end if;

  insert into public.weekly_availability (
    team_id,
    user_id,
    practice_date,
    start_at,
    end_at,
    status,
    source
  )
  select
    p_team_id,
    tm.user_id,
    d.practice_date,
    ((d.practice_date::text || ' ' || dpd.start_time::text)::timestamp at time zone v_timezone),
    ((d.practice_date::text || ' ' || dpd.end_time::text)::timestamp at time zone v_timezone),
    'available'::public.availability_status,
    'default'
  from generate_series(p_start_date, p_end_date, interval '1 day') as d(practice_date)
  join public.default_practice_days dpd
    on dpd.team_id = p_team_id
   and dpd.is_active = true
   and dpd.weekday = extract(dow from d.practice_date)::int
  join public.team_members tm
    on tm.team_id = p_team_id
  on conflict (team_id, user_id, practice_date) do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count;
end;
$$;

create or replace function public.ensure_user_membership_for_user(
  p_user_id uuid,
  p_email text,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  guessed_name text;
  selected_team_id uuid;
  selected_role text := 'player';
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

  guessed_name := coalesce(
    nullif(trim(p_full_name), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Player'
  );

  begin
    insert into public.profiles (id, display_name, gamer_tag, email)
    values (p_user_id, guessed_name, guessed_name, p_email)
    on conflict (id) do update
    set
      display_name = excluded.display_name,
      gamer_tag = excluded.gamer_tag,
      email = excluded.email;
  exception
    when unique_violation then
      -- Fallback for stale rows where email uniqueness blocks profile bootstrap.
      insert into public.profiles (id, display_name, gamer_tag, email)
      values (p_user_id, guessed_name, guessed_name, null)
      on conflict (id) do update
      set
        display_name = excluded.display_name,
        gamer_tag = excluded.gamer_tag,
        email = excluded.email;
  end;

  selected_team_id := public.ensure_extra_ordinem_team_seed(p_user_id);

  select tm.role
  into selected_role
  from public.team_members tm
  where tm.user_id = p_user_id
    and tm.team_id = selected_team_id
  limit 1;

  selected_role := coalesce(selected_role, 'player');

  delete from public.team_members
  where user_id = p_user_id
    and team_id <> selected_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (selected_team_id, p_user_id, selected_role)
  on conflict (team_id, user_id) do update
  set role = excluded.role;

  return jsonb_build_object('team_id', selected_team_id, 'role', selected_role);
end;
$$;

grant execute on function public.ensure_extra_ordinem_team_seed(uuid) to authenticated;
grant execute on function public.ensure_extra_ordinem_team_seed(uuid) to service_role;
grant execute on function public.user_belongs_to_team(uuid) to authenticated;
grant execute on function public.user_belongs_to_team(uuid) to service_role;
grant execute on function public.ensure_default_availability_for_range(uuid, date, date) to authenticated;
grant execute on function public.ensure_default_availability_for_range(uuid, date, date) to service_role;
grant execute on function public.ensure_user_membership_for_user(uuid, text, text) to authenticated;
grant execute on function public.ensure_user_membership_for_user(uuid, text, text) to service_role;

create or replace function public.handle_new_auth_user_assign_team()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.ensure_user_membership_for_user(
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_assign_team on auth.users;
create trigger on_auth_user_created_assign_team
after insert on auth.users
for each row execute function public.handle_new_auth_user_assign_team();

create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_default_practice_days_team_id on public.default_practice_days(team_id);
create index if not exists idx_weekly_availability_team_date on public.weekly_availability(team_id, practice_date);
create index if not exists idx_weekly_availability_user_id on public.weekly_availability(user_id);
create index if not exists idx_extra_availability_team_date on public.extra_availability(team_id, available_date);
create index if not exists idx_team_matches_team_date on public.team_matches(team_id, match_date);

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.default_practice_days enable row level security;
alter table public.weekly_availability enable row level security;
alter table public.extra_availability enable row level security;
alter table public.team_matches enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

do $$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'team_members'
  loop
    execute format('drop policy if exists %I on public.team_members', policy_name);
  end loop;
end;
$$;

drop policy if exists "team_members_select_if_member" on public.team_members;
create policy "team_members_select_if_member"
on public.team_members
for select
to authenticated
using (public.user_belongs_to_team(team_members.team_id));

drop policy if exists "team_members_insert_self_if_team_owner" on public.team_members;
create policy "team_members_insert_self_if_team_owner"
on public.team_members
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.teams t
    where t.id = team_members.team_id
      and t.created_by = (select auth.uid())
  )
);

drop policy if exists "team_members_update_self_if_team_owner" on public.team_members;
create policy "team_members_update_self_if_team_owner"
on public.team_members
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.teams t
    where t.id = team_members.team_id
      and t.created_by = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.teams t
    where t.id = team_members.team_id
      and t.created_by = (select auth.uid())
  )
);

drop policy if exists "teams_select_if_member" on public.teams;
create policy "teams_select_if_member"
on public.teams
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = teams.id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "teams_select_if_creator" on public.teams;
create policy "teams_select_if_creator"
on public.teams
for select
to authenticated
using ((select auth.uid()) = created_by);

drop policy if exists "teams_insert_if_creator" on public.teams;
create policy "teams_insert_if_creator"
on public.teams
for insert
to authenticated
with check ((select auth.uid()) = created_by);

drop policy if exists "default_practice_days_insert_if_creator" on public.default_practice_days;
create policy "default_practice_days_insert_if_creator"
on public.default_practice_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.teams t
    where t.id = default_practice_days.team_id
      and t.created_by = (select auth.uid())
  )
);

drop policy if exists "default_practice_days_select_if_member" on public.default_practice_days;
create policy "default_practice_days_select_if_member"
on public.default_practice_days
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = default_practice_days.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "default_practice_days_modify_if_member" on public.default_practice_days;
create policy "default_practice_days_modify_if_member"
on public.default_practice_days
for all
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = default_practice_days.team_id
      and tm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = default_practice_days.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "weekly_availability_select_if_member" on public.weekly_availability;
create policy "weekly_availability_select_if_member"
on public.weekly_availability
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = weekly_availability.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "weekly_availability_insert_own_if_member" on public.weekly_availability;
create policy "weekly_availability_insert_own_if_member"
on public.weekly_availability
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = weekly_availability.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "weekly_availability_update_own_if_member" on public.weekly_availability;
create policy "weekly_availability_update_own_if_member"
on public.weekly_availability
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = weekly_availability.team_id
      and tm.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = weekly_availability.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "extra_availability_select_if_member" on public.extra_availability;
create policy "extra_availability_select_if_member"
on public.extra_availability
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = extra_availability.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "extra_availability_modify_own_if_member" on public.extra_availability;
create policy "extra_availability_modify_own_if_member"
on public.extra_availability
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = extra_availability.team_id
      and tm.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = extra_availability.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "team_matches_select_if_member" on public.team_matches;
create policy "team_matches_select_if_member"
on public.team_matches
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.team_id = team_matches.team_id
      and tm.user_id = (select auth.uid())
  )
);

drop policy if exists "team_matches_modify_if_creator_member" on public.team_matches;
create policy "team_matches_modify_if_creator_member"
on public.team_matches
for all
to authenticated
using (
  (select auth.uid()) = created_by
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = team_matches.team_id
      and tm.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = created_by
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = team_matches.team_id
      and tm.user_id = (select auth.uid())
  )
);

