-- Daily operations, 13 Oct 2026 (Jayesh):
--  1. deals         — customer pipeline (every customer deal in progress, any business)
--  2. daily_reports — bijli (electricity) meter opening/closing + units consumed + meter photo
--  3. daily_filings — the day's papers (bills, vouchers, register pages) uploaded from the daily group link
--  4. vehicle_logs  — scooty / car km + petrol per day
--  5. shift_closes  — evening shift-close report (cash, gas, water, inventory check, issues)

-- 1. Customer deals ---------------------------------------------------------
create table if not exists jdone.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  customer_id uuid references jdone.customers(id) on delete set null,
  lead_id uuid references jdone.leads(id) on delete set null,
  contact_name text,
  phone text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  kind text not null default 'Stay',
  stage text not null default 'Enquiry',
  value numeric(12,2) not null default 0,
  advance numeric(12,2) not null default 0,
  expected_date date,
  next_follow_up date,
  assigned_to uuid references jdone.staff(id) on delete set null,
  lost_reason text,
  closed_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists deals_stage_idx on jdone.deals (stage, expected_date);
create index if not exists deals_customer_idx on jdone.deals (customer_id);

-- 2. Bijli units on the daily report ----------------------------------------
alter table jdone.daily_reports add column if not exists electricity_opening numeric(12,2);
alter table jdone.daily_reports add column if not exists electricity_closing numeric(12,2);
alter table jdone.daily_reports add column if not exists electricity_units numeric(12,2);
alter table jdone.daily_reports add column if not exists electricity_photo jsonb not null default '[]'::jsonb;
alter table jdone.daily_reports add column if not exists dg_hours numeric(6,2);

create or replace function jdone.set_electricity_units() returns trigger language plpgsql as $$
begin
  if new.electricity_opening is not null and new.electricity_closing is not null then
    new.electricity_units := greatest(new.electricity_closing - new.electricity_opening, 0);
  end if;
  return new;
end $$;
drop trigger if exists set_electricity_units on jdone.daily_reports;
create trigger set_electricity_units before insert or update on jdone.daily_reports
  for each row execute function jdone.set_electricity_units();

-- 3. Daily filings ----------------------------------------------------------
create table if not exists jdone.daily_filings (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  category text not null default 'Bills & vouchers',
  files jsonb not null default '[]'::jsonb,
  amount numeric(12,2),
  submitted_by uuid references jdone.staff(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists daily_filings_date_idx on jdone.daily_filings (date desc);

-- 4. Vehicle logs -----------------------------------------------------------
create table if not exists jdone.vehicle_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  vehicle text not null,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  driver uuid references jdone.staff(id) on delete set null,
  start_km numeric(10,1),
  end_km numeric(10,1),
  km numeric(10,1),
  petrol_litres numeric(8,2),
  petrol_amount numeric(12,2),
  purpose text,
  photos jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists vehicle_logs_vehicle_idx on jdone.vehicle_logs (vehicle, date desc);

create or replace function jdone.set_vehicle_km() returns trigger language plpgsql as $$
begin
  if new.start_km is not null and new.end_km is not null then
    new.km := greatest(new.end_km - new.start_km, 0);
  end if;
  return new;
end $$;
drop trigger if exists set_vehicle_km on jdone.vehicle_logs;
create trigger set_vehicle_km before insert or update on jdone.vehicle_logs
  for each row execute function jdone.set_vehicle_km();

-- 5. Evening shift close ----------------------------------------------------
create table if not exists jdone.shift_closes (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  closed_by uuid references jdone.staff(id) on delete set null,
  cash_in_hand numeric(12,2),
  gas_full integer,
  gas_empty integer,
  water_jars integer,
  rooms_occupied integer,
  electricity_closing numeric(12,2),
  inventory_ok boolean not null default true,
  inventory_notes text,
  issues text,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists shift_closes_date_idx on jdone.shift_closes (date desc);

-- Common: updated_at triggers, RLS (staff read/insert/update, owner delete), grants
do $$
declare t text;
begin
  foreach t in array array['deals','daily_filings','vehicle_logs','shift_closes'] loop
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
    execute format('grant all on jdone.%I to authenticated, service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
