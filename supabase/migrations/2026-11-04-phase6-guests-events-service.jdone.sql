-- JD One phase 6 (4 Nov 2026): guest requests, guest feedback, banquets & events, preventive service.
-- Room charge & billing, Daily F&B sales, Vendor dues and OTA bookings are pages on existing tables.
-- Run once in Supabase → SQL Editor, after the earlier files. Safe to run again. Changes no existing data.

create table if not exists jdone.guest_requests (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  booking_id uuid references jdone.bookings(id) on delete set null,
  room_id uuid references jdone.rooms(id) on delete set null,
  guest_name text,
  request_type text not null,
  details text,
  priority text default 'Normal',
  assigned_to uuid references jdone.staff(id) on delete set null,
  status text not null default 'Open' check (status in ('Open', 'In progress', 'Done')),
  done_at timestamptz,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists guest_requests_status_idx on jdone.guest_requests (status, requested_at desc);

create table if not exists jdone.guest_reviews (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  booking_id uuid references jdone.bookings(id) on delete set null,
  guest_name text not null,
  source text,
  rating_overall smallint check (rating_overall between 1 and 5),
  rating_food smallint check (rating_food between 1 and 5),
  rating_room smallint check (rating_room between 1 and 5),
  rating_service smallint check (rating_service between 1 and 5),
  average numeric(3,1),
  comments text,
  would_return boolean not null default true,
  follow_up boolean not null default false,
  followed_up_by uuid references jdone.staff(id) on delete set null,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

create table if not exists jdone.events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  start_time text,
  event_type text not null,
  client_name text not null,
  phone text,
  guests integer,
  venue text,
  menu text,
  setup text,
  rate_per_plate numeric(12,2),
  other_charges numeric(12,2),
  total numeric(12,2),
  advance numeric(12,2),
  balance numeric(12,2),
  status text not null default 'Enquiry' check (status in ('Enquiry', 'Tentative', 'Confirmed', 'Done', 'Cancelled')),
  lead_id uuid references jdone.leads(id) on delete set null,
  owner_id uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists events_date_idx on jdone.events (event_date);

create table if not exists jdone.service_schedules (
  id uuid primary key default gen_random_uuid(),
  what text not null,
  asset_name text,
  asset_id uuid references jdone.property_assets(id) on delete set null,
  every_days integer not null default 90 check (every_days > 0),
  last_done date,
  next_due date,
  vendor_id uuid references jdone.service_vendors(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists service_schedules_due_idx on jdone.service_schedules (next_due);

do $$
declare t text;
begin
  foreach t in array array['guest_requests', 'guest_reviews', 'events', 'service_schedules'] loop
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

do $$ begin
  begin alter publication supabase_realtime add table jdone.guest_requests; exception when others then null; end;
end $$;
