-- JD One phase 4 (4 Nov 2026): Housekeeping, Activities, Security.
--   housekeeping_reports  + room checklist ticks (bed, bathroom, floor, AC/lights, water)
--   amenity_refills       — what was refilled in which room
--   linen_logs            — linen sent to / received from the laundry
--   lost_found            — items guests leave behind
--   activity_bookings     — boating, bonfire, horse riding… per date & time (activities = add-on services)
--   gate_entries          — people at the gate
--   vehicle_entries       — vehicles in and out
-- Room status board and Slots & capacity need no new tables.
-- Run once in Supabase → SQL Editor, after the phase-1 file. Safe to run again. Changes no existing data.

alter table jdone.housekeeping_reports
  add column if not exists bed_made boolean not null default false,
  add column if not exists bathroom_clean boolean not null default false,
  add column if not exists floor_dusting boolean not null default false,
  add column if not exists ac_lights_ok boolean not null default false,
  add column if not exists water_placed boolean not null default false;

create table if not exists jdone.amenity_refills (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  room_id uuid references jdone.rooms(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  water_bottles integer,
  done_by uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

create table if not exists jdone.linen_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  item text not null,
  movement text not null check (movement in ('Sent to laundry', 'Received from laundry', 'Damaged / discarded', 'New stock added')),
  quantity integer not null check (quantity > 0),
  vendor text,
  amount numeric(12,2),
  done_by uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

create table if not exists jdone.lost_found (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  item text not null,
  room_id uuid references jdone.rooms(id) on delete set null,
  found_at text,
  found_by uuid references jdone.staff(id) on delete set null,
  booking_id uuid references jdone.bookings(id) on delete set null,
  guest_name text,
  stored_at text,
  status text not null default 'In storage',
  returned_on date,
  returned_to text,
  photo text,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

create table if not exists jdone.activity_bookings (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  time text,
  add_on_id uuid references jdone.add_ons(id) on delete set null,
  booking_id uuid references jdone.bookings(id) on delete set null,
  guest_name text not null,
  people integer not null default 1 check (people > 0),
  amount numeric(12,2),
  payment text default 'Add to room bill',
  status text not null default 'Booked' check (status in ('Booked', 'Done', 'Cancelled')),
  assigned_to uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists activity_bookings_date_idx on jdone.activity_bookings (date, time);

create table if not exists jdone.gate_entries (
  id uuid primary key default gen_random_uuid(),
  time_in timestamptz not null default now(),
  visitor_name text not null,
  phone text,
  people integer default 1,
  purpose text not null default 'Visitor for guest',
  to_meet text,
  vehicle_no text,
  id_type text,
  id_last4 text,
  time_out timestamptz,
  guard uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists gate_entries_time_idx on jdone.gate_entries (time_in desc);

create table if not exists jdone.vehicle_entries (
  id uuid primary key default gen_random_uuid(),
  time_in timestamptz not null default now(),
  vehicle_no text not null,
  vehicle_type text not null default 'Car',
  purpose text not null default 'Guest',
  driver_name text,
  phone text,
  booking_id uuid references jdone.bookings(id) on delete set null,
  parking_spot text,
  time_out timestamptz,
  guard uuid references jdone.staff(id) on delete set null,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists vehicle_entries_time_idx on jdone.vehicle_entries (time_in desc);

-- Same rules as the other tables: staff read and write, owner / Director delete;
-- updated_at; and the Director-change log (if the phase-1 file has been run).
do $$
declare t text;
begin
  foreach t in array array['amenity_refills', 'linen_logs', 'lost_found', 'activity_bookings', 'gate_entries', 'vehicle_entries'] loop
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
