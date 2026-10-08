-- Group assets: cars, scooties and equipment, with daily km, fuel refills and service history.
-- Safe to re-run.

create table if not exists jdone.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  asset_type text not null default 'Scooty',
  registration_no text unique,
  make_model text,
  year int,
  colour text,
  fuel_type text default 'Petrol',
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  assigned_to uuid references jdone.staff(id) on delete set null,
  status text not null default 'In use',
  odometer_km numeric(10,1),
  service_interval_km numeric(10,1) default 3000,
  service_interval_months int default 6,
  last_service_date date,
  last_service_km numeric(10,1),
  next_service_date date,
  next_service_km numeric(10,1),
  last_fuel_date date,
  last_fuel_km numeric(10,1),
  tyre_condition text,
  tyre_checked_on date,
  tyre_photos jsonb not null default '[]'::jsonb,
  insurance_expiry date,
  puc_expiry date,
  purchase_date date,
  purchase_value numeric(12,2),
  photo text,
  rc_doc text,
  insurance_doc text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

create table if not exists jdone.vehicle_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  asset_id uuid not null references jdone.assets(id) on delete cascade,
  driver_id uuid references jdone.staff(id) on delete set null,
  start_km numeric(10,1) not null,
  end_km numeric(10,1) not null check (end_km >= start_km),
  km numeric(10,1),
  purpose text not null,
  route text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists vehicle_logs_asset_idx on jdone.vehicle_logs (asset_id, date desc);

create table if not exists jdone.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  asset_id uuid not null references jdone.assets(id) on delete cascade,
  odometer_km numeric(10,1),
  litres numeric(8,2),
  amount numeric(12,2) not null,
  rate numeric(8,2),
  full_tank boolean not null default false,
  station text,
  paid_by text default 'UPI',
  filled_by uuid references jdone.staff(id) on delete set null,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  receipt text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists fuel_logs_asset_idx on jdone.fuel_logs (asset_id, date desc);

create table if not exists jdone.vehicle_services (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  asset_id uuid not null references jdone.assets(id) on delete cascade,
  service_type text not null default 'Regular service',
  odometer_km numeric(10,1),
  garage text,
  amount numeric(12,2),
  work_done text,
  valid_till date,
  done_by uuid references jdone.staff(id) on delete set null,
  bill text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists vehicle_services_asset_idx on jdone.vehicle_services (asset_id, date desc);

-- First vehicle, details from Jayesh 8 Oct 2026 (type to be confirmed by Akshay ji)
insert into jdone.assets (name, asset_type, registration_no, colour, odometer_km, status, notes)
values ('RJ12 SZ 4657 (red)', 'Scooty', 'RJ12 SZ 4657', 'Red', 30143, 'In use', 'Odometer 30,143 km on 8 Oct 2026. Tyre condition: add photos.')
on conflict (registration_no) do nothing;

-- updated_at triggers + RLS (same rules as every staff table)
do $$
declare t text;
begin
  foreach t in array array['assets','vehicle_logs','fuel_logs','vehicle_services']
  loop
    execute format('drop trigger if exists set_updated_at on jdone.%I', t);
    execute format('create trigger set_updated_at before update on jdone.%I for each row execute function jdone.set_updated_at()', t);
    execute format('alter table jdone.%I enable row level security', t);
    execute format('drop policy if exists "staff read" on jdone.%I', t);
    execute format('create policy "staff read" on jdone.%I for select to authenticated using (jdone.is_staff())', t);
    execute format('drop policy if exists "staff insert" on jdone.%I', t);
    execute format('create policy "staff insert" on jdone.%I for insert to authenticated with check (jdone.is_staff())', t);
    execute format('drop policy if exists "staff update" on jdone.%I', t);
    execute format('create policy "staff update" on jdone.%I for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff())', t);
    execute format('drop policy if exists "owner delete" on jdone.%I', t);
    execute format('create policy "owner delete" on jdone.%I for delete to authenticated using (jdone.is_owner())', t);
  end loop;
end $$;

grant select, insert, update, delete on jdone.assets, jdone.vehicle_logs, jdone.fuel_logs, jdone.vehicle_services to authenticated;
