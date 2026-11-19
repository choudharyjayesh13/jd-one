-- Guest app content (properties, rules, timings, inclusions, experiences, today's combos). Any signed-in user
-- (guests + staff) reads active rows; owner / manager / HR edit. 8 Oct 2026.
create table if not exists jdone.guest_info (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('Property','Rule','Timing','Included','Experience','How-to','Combo')),
  title text not null,
  body text,
  price text,
  photo text,
  valid_from date,
  valid_to date,
  sort integer not null default 100,
  active boolean not null default true,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
drop trigger if exists set_updated_at on jdone.guest_info;
create trigger set_updated_at before update on jdone.guest_info for each row execute function jdone.set_updated_at();
alter table jdone.guest_info enable row level security;
drop policy if exists "signed-in read" on jdone.guest_info;
create policy "signed-in read" on jdone.guest_info for select to authenticated using (active or jdone.is_staff());
drop policy if exists "office write" on jdone.guest_info;
create policy "office write" on jdone.guest_info for all to authenticated using (jdone.is_hr_admin()) with check (jdone.is_hr_admin());
grant select, insert, update, delete on jdone.guest_info to authenticated, service_role;
notify pgrst, 'reload schema';
