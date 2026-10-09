-- JD One network: Area help (thana, hospitals, fire, complaint lines) per area. Safe to re-run.
create table if not exists jdone.area_services (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Police station',
  name text not null,
  area_covered text,
  address text,
  state text not null default 'Rajasthan',
  district text not null default 'Udaipur',
  city text not null,
  lat double precision,
  lng double precision,
  phone text,
  phone2 text,
  hours text default '24x7',
  officer_name text,
  officer_rank text,
  officer_phone text,
  beat_officer text,
  beat_rank text,
  beat_area text,
  beat_phone text,
  officers_checked_on date,
  verified boolean not null default false,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists area_services_geo_idx on jdone.area_services (state, district, city, type);

drop trigger if exists set_updated_at on jdone.area_services;
create trigger set_updated_at before update on jdone.area_services for each row execute function jdone.set_updated_at();
alter table jdone.area_services enable row level security;
drop policy if exists "staff read" on jdone.area_services;
create policy "staff read" on jdone.area_services for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.area_services;
create policy "staff insert" on jdone.area_services for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.area_services;
create policy "staff update" on jdone.area_services for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.area_services;
create policy "owner delete" on jdone.area_services for delete to authenticated using (jdone.is_owner());
grant select, insert, update, delete on jdone.area_services to authenticated;
