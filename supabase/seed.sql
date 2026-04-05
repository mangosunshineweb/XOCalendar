-- Idempotent bootstrap.
-- Step 1: ensure Extra Ordinem + default practice days exist even with zero users.
-- Step 2: if users exist, ensure all are assigned to that team.

insert into public.teams (id, name, timezone, created_by)
values (
  '78466703-d22e-4ecf-989c-4de14772d8fc'::uuid,
  'Extra Ordinem',
  'Europe/Copenhagen',
  null
)
on conflict (id) do update
set
  name = excluded.name,
  timezone = excluded.timezone;

insert into public.default_practice_days (team_id, weekday, start_time, end_time, is_active)
select
  '78466703-d22e-4ecf-989c-4de14772d8fc'::uuid,
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
  where dpd.team_id = '78466703-d22e-4ecf-989c-4de14772d8fc'::uuid
    and dpd.weekday = d.weekday
);

with existing_users as (
  select
    u.id,
    u.email,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Player'
    ) as full_name
  from auth.users u
)
select public.ensure_user_membership_for_user(eu.id, eu.email, eu.full_name)
from existing_users eu;
