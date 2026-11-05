-- JD One phase 3 (4 Nov 2026): F&B Production and Stores.
--   indents         — stock requests: department asks → Stores approves → issues (stock goes down) → received
--   wastage         — food / stock thrown away (with a stock item it also takes the quantity off stock)
--   hygiene_checks  — kitchen hygiene checklist, morning and evening
--   gas_logs        — LPG cylinders received, connected, returned
-- Kitchen display and meal counts need no new tables (they read KOTs and bookings).
-- Run once in Supabase → SQL Editor, after the phase-1 file. Safe to run again. Changes no existing data.

create table if not exists jdone.indents (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  department text not null default 'Kitchen',
  lines jsonb not null default '[]'::jsonb,
  needed_by date,
  status text not null default 'Requested' check (status in ('Requested', 'Approved', 'Issued', 'Received', 'Rejected')),
  requested_by uuid references jdone.staff(id) on delete set null,
  approved_by uuid references jdone.staff(id) on delete set null,
  issued_by uuid references jdone.staff(id) on delete set null,
  received_by uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists indents_status_idx on jdone.indents (status, date desc);

create table if not exists jdone.wastage (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  item text not null,
  stock_id uuid references jdone.stock(id) on delete set null,
  quantity numeric(12,2),
  unit text,
  reason text not null default 'Spoiled',
  value numeric(12,2),
  photo text,
  recorded_by uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists wastage_date_idx on jdone.wastage (date desc);

create table if not exists jdone.hygiene_checks (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  shift text not null default 'Morning' check (shift in ('Morning', 'Evening')),
  fridge_temp numeric(5,1),
  freezer_temp numeric(5,1),
  kitchen_clean boolean not null default false,
  utensils_clean boolean not null default false,
  staff_hygiene boolean not null default false,
  storage_ok boolean not null default false,
  pest_free boolean not null default false,
  all_ok boolean not null default false,
  issues text,
  photo text,
  checked_by uuid references jdone.staff(id) on delete set null,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create unique index if not exists hygiene_checks_day_uidx on jdone.hygiene_checks (business_unit_id, date, shift);

create table if not exists jdone.gas_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  event text not null check (event in ('Full received', 'Connected to stove', 'Empty returned')),
  cylinders integer not null default 1 check (cylinders > 0),
  vendor text,
  amount numeric(12,2),
  entered_by uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists gas_logs_date_idx on jdone.gas_logs (date desc);

-- Same rules as the other tables: staff read and write, owner / Director delete.
-- updated_at, and the Director-change log (if the phase-1 file has been run).
do $$
declare t text;
begin
  foreach t in array array['indents', 'wastage', 'hygiene_checks', 'gas_logs'] loop
    execute format('alter table jdone.%I enable row level security', t);
    execute format('drop policy if exists "staff read" on jdone.%I', t);
    execute format('create policy "staff read" on jdone.%I for select to authenticated using (jdone.is_staff())', t);
    execute format('drop policy if exists "staff insert" on jdone.%I', t);
    execute format('create policy "staff insert" on jdone.%I for insert to authenticated with check (jdone.is_staff())', t);
    execute format('drop policy if exists "staff update" on jdone.%I', t);
    execute format('create policy "staff update" on jdone.%I for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff())', t);
    execute format('drop policy if exists "owner delete" on jdone.%I', t);
    execute format('create policy "owner delete" on jdone.%I for delete to authenticated using (jdone.is_owner())', t);
    execute format('drop trigger if exists set_updated_at on jdone.%I', t);
    execute format('create trigger set_updated_at before update on jdone.%I for each row execute function jdone.set_updated_at()', t);
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'jdone' and p.proname = 'log_director_change') then
      execute format('drop trigger if exists zz_log_director_change on jdone.%I', t);
      execute format('create trigger zz_log_director_change after insert or update or delete on jdone.%I for each row execute function jdone.log_director_change()', t);
    end if;
    execute format('grant all on jdone.%I to authenticated, service_role', t);
  end loop;
end $$;

-- Live updates: kitchen display (KOTs) and stock requests.
do $$ begin
  begin alter publication supabase_realtime add table jdone.kots; exception when others then null; end;
  begin alter publication supabase_realtime add table jdone.indents; exception when others then null; end;
end $$;
