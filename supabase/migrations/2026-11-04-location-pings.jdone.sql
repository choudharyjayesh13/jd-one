-- JD One (4 Nov 2026): duty location for chosen staff (the purchaser).
-- The Chairman or Director switches it on per person (staff.track_location). The JD One Android
-- app then sends the phone's location from check-in to check-out. Only the Chairman and the
-- Director can see it. Points older than 30 days are deleted automatically. Safe to run again.

alter table jdone.staff add column if not exists track_location boolean not null default false;

create table if not exists jdone.location_pings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m integer,
  speed_kmh numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists location_pings_staff_at_idx on jdone.location_pings (staff_id, at desc);

-- Only the Chairman / Director may switch tracking on or off.
create or replace function jdone.guard_track_location() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
begin
  if auth.uid() is not null and new.track_location is distinct from old.track_location and not jdone.is_access_admin() then
    raise exception 'Only the Chairman or the Director can switch location on or off.';
  end if;
  return new;
end $$;
drop trigger if exists guard_track_location on jdone.staff;
create trigger guard_track_location before update on jdone.staff for each row execute function jdone.guard_track_location();

-- Keep 30 days only.
create or replace function jdone.trim_location_pings() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
begin
  delete from jdone.location_pings where at < now() - interval '30 days';
  return null;
end $$;
drop trigger if exists trim_location_pings on jdone.location_pings;
create trigger trim_location_pings after insert on jdone.location_pings for each statement execute function jdone.trim_location_pings();

alter table jdone.location_pings enable row level security;
drop policy if exists "own ping when switched on" on jdone.location_pings;
create policy "own ping when switched on" on jdone.location_pings for insert to authenticated
  with check (staff_id = jdone.my_staff_id() and exists (select 1 from jdone.staff s where s.id = staff_id and s.track_location));
drop policy if exists "chairman director read" on jdone.location_pings;
create policy "chairman director read" on jdone.location_pings for select to authenticated using (jdone.is_access_admin() or staff_id = jdone.my_staff_id());
drop policy if exists "admin delete" on jdone.location_pings;
create policy "admin delete" on jdone.location_pings for delete to authenticated using (jdone.is_access_admin());
grant select, insert, delete on jdone.location_pings to authenticated;
grant all on jdone.location_pings to service_role;
