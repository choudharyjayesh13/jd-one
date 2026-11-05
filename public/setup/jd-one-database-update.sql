-- JD One: all redesign database changes, phases 1–6 (3–4 Nov 2026), in one file.
-- Run once in Supabase → SQL Editor (paste everything, press Run). Safe to run again; changes no existing data.
-- Same as running the six phase files one after another.

-- ================================================================ 2026-11-03-phase1-access-log-vouchers.jdone.sql
-- JD One phase 1 (3 Nov 2026), for JD Stays & Hospitality → The Udaisarovar:
--   1. Posts: Chairman and Director. Access belongs to the post, not the person.
--   2. Team access: department modules per staff member, level 0 No access · 1 View · 2 Edit · 3 Manage.
--   3. Director changes: everything the Director creates, edits or deletes is logged for the Chairman.
--   4. Vouchers: a numbered voucher for every payment received (RV) and every expense paid (PV),
--      posted to the JD Stays & Hospitality ledger.
-- Run once in Supabase → SQL Editor. Safe to run again. Changes no existing data.

-- ---------------------------------------------------------------- helpers
create or replace function jdone.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- ---------------------------------------------------------------- 1. posts
create table if not exists jdone.org_posts (
  id uuid primary key default gen_random_uuid(),
  post text not null unique check (post in ('chairman', 'director')),
  holder_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

-- Chairman's login email is filled in later (see the last line of this file).
insert into jdone.org_posts (post, holder_name, email) values
  ('chairman', 'Jayesh Choudhary', null),
  ('director', 'Akshayraj S. Chanchodi', 'akshaychanchori@gmail.com')
on conflict (post) do nothing;

create or replace function jdone.is_director() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select exists (
    select 1 from jdone.org_posts
    where post = 'director' and email is not null and lower(email) = jdone.current_email() and jdone.current_email() <> ''
  )
$$;

-- The Director has the same rights as the owner (deleting included); everything the Director does is logged below.
create or replace function jdone.is_owner() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select coalesce(jdone.current_staff_role() = 'owner', false) or jdone.is_director()
$$;

-- Until the Chairman's email is set, the owner account (that is not the Director) acts as Chairman.
create or replace function jdone.is_chairman() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select case
    when exists (select 1 from jdone.org_posts where post = 'chairman' and email is not null)
      then exists (select 1 from jdone.org_posts where post = 'chairman' and lower(email) = jdone.current_email() and jdone.current_email() <> '')
    else coalesce(jdone.current_staff_role() = 'owner', false) and not jdone.is_director()
  end
$$;

create or replace function jdone.is_access_admin() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select jdone.is_chairman() or jdone.is_director()
$$;

alter table jdone.org_posts enable row level security;
drop policy if exists "staff read" on jdone.org_posts;
create policy "staff read" on jdone.org_posts for select to authenticated using (jdone.is_staff());
drop policy if exists "chairman write" on jdone.org_posts;
create policy "chairman write" on jdone.org_posts for update to authenticated using (jdone.is_chairman()) with check (jdone.is_chairman());

-- ---------------------------------------------------------------- 2. team access
create table if not exists jdone.staff_access (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  module text not null,
  level smallint not null default 0 check (level between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (staff_id, module)
);
create index if not exists staff_access_staff_idx on jdone.staff_access (staff_id);

alter table jdone.staff_access enable row level security;
drop policy if exists "staff read" on jdone.staff_access;
create policy "staff read" on jdone.staff_access for select to authenticated using (jdone.is_staff());
drop policy if exists "admin insert" on jdone.staff_access;
create policy "admin insert" on jdone.staff_access for insert to authenticated with check (jdone.is_access_admin());
drop policy if exists "admin update" on jdone.staff_access;
create policy "admin update" on jdone.staff_access for update to authenticated using (jdone.is_access_admin()) with check (jdone.is_access_admin());
drop policy if exists "admin delete" on jdone.staff_access;
create policy "admin delete" on jdone.staff_access for delete to authenticated using (jdone.is_access_admin());

-- ---------------------------------------------------------------- 3. director changes
create table if not exists jdone.change_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_email text,
  actor_post text,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after jsonb,
  seen boolean not null default false,
  undone_at timestamptz,
  undone_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists change_log_at_idx on jdone.change_log (at desc);

alter table jdone.change_log enable row level security;
drop policy if exists "chairman read" on jdone.change_log;
create policy "chairman read" on jdone.change_log for select to authenticated using (jdone.is_chairman());
drop policy if exists "chairman update" on jdone.change_log;
create policy "chairman update" on jdone.change_log for update to authenticated using (jdone.is_chairman()) with check (jdone.is_chairman());
-- No insert/delete policy: rows are written only by the trigger below and are never deleted from the app.

create or replace function jdone.log_director_change() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if not jdone.is_director() then return null; end if;
  -- ignore saves that only touched updated_at
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then return null; end if;
  insert into jdone.change_log (actor_email, actor_post, table_name, record_id, action, before, after)
  values (jdone.current_email(), 'director', tg_table_name, coalesce(n ->> 'id', o ->> 'id'), tg_op, o, n);
  return null;
end $$;

-- Every table in the jdone schema except the log itself and the voucher counter.
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'jdone' and table_type = 'BASE TABLE' and table_name not in ('change_log', 'voucher_counters')
  loop
    execute format('drop trigger if exists zz_log_director_change on jdone.%I', t);
    execute format('create trigger zz_log_director_change after insert or update or delete on jdone.%I for each row execute function jdone.log_director_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 4. vouchers
create table if not exists jdone.vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text unique,
  vtype text not null check (vtype in ('RV', 'PV')),
  date date not null default current_date,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  ledger text not null default 'JD Stays & Hospitality',
  party text,
  against text,
  source_table text,
  source_id uuid,
  mode text,
  reference text,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'To pay' check (status in ('Received', 'To pay', 'Paid', 'Cancelled')),
  paid_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create unique index if not exists vouchers_source_uidx on jdone.vouchers (source_table, source_id) where source_id is not null;
create index if not exists vouchers_date_idx on jdone.vouchers (date desc);

create table if not exists jdone.voucher_counters (
  prefix text primary key,
  last_no integer not null default 0
);
alter table jdone.voucher_counters enable row level security; -- only the numbering function touches it

-- Number = <unit code>/<RV|PV>/<financial year>/<0001>, e.g. UDS/RV/26-27/0148. Restarts every 1 April.
create or replace function jdone.assign_voucher_no() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  code text;
  fy int;
  pre text;
  n int;
begin
  if new.voucher_no is not null and new.voucher_no <> '' then return new; end if;
  select coalesce(nullif(short_code, ''), 'JD') into code from jdone.business_units where id = new.business_unit_id;
  code := coalesce(code, 'JD');
  fy := case when extract(month from new.date) >= 4 then extract(year from new.date)::int else extract(year from new.date)::int - 1 end;
  pre := code || '/' || new.vtype || '/' || lpad((fy % 100)::text, 2, '0') || '-' || lpad(((fy + 1) % 100)::text, 2, '0');
  insert into jdone.voucher_counters (prefix, last_no) values (pre, 1)
  on conflict (prefix) do update set last_no = jdone.voucher_counters.last_no + 1
  returning last_no into n;
  new.voucher_no := pre || '/' || lpad(n::text, 4, '0');
  return new;
end $$;
drop trigger if exists assign_voucher_no on jdone.vouchers;
create trigger assign_voucher_no before insert on jdone.vouchers for each row execute function jdone.assign_voucher_no();

drop trigger if exists set_updated_at on jdone.vouchers;
create trigger set_updated_at before update on jdone.vouchers for each row execute function jdone.set_updated_at();
drop trigger if exists set_updated_at on jdone.staff_access;
create trigger set_updated_at before update on jdone.staff_access for each row execute function jdone.set_updated_at();
drop trigger if exists set_updated_at on jdone.org_posts;
create trigger set_updated_at before update on jdone.org_posts for each row execute function jdone.set_updated_at();
drop trigger if exists set_updated_at on jdone.change_log;
create trigger set_updated_at before update on jdone.change_log for each row execute function jdone.set_updated_at();

alter table jdone.vouchers enable row level security;
drop policy if exists "staff read" on jdone.vouchers;
create policy "staff read" on jdone.vouchers for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.vouchers;
create policy "staff insert" on jdone.vouchers for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.vouchers;
create policy "staff update" on jdone.vouchers for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.vouchers;
create policy "owner delete" on jdone.vouchers for delete to authenticated using (jdone.is_owner());

-- Payment received against a booking → Receipt voucher (RV).
create or replace function jdone.payment_voucher() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare b record;
begin
  if tg_op = 'DELETE' then
    update jdone.vouchers set status = 'Cancelled', notes = coalesce(notes || ' · ', '') || 'Payment deleted' where source_table = 'payments' and source_id = old.id;
    return old;
  end if;
  select guest_name, business_unit_id into b from jdone.bookings where id = new.booking_id;
  if tg_op = 'INSERT' then
    insert into jdone.vouchers (vtype, date, business_unit_id, party, against, source_table, source_id, mode, reference, amount, status, paid_on, created_by)
    values ('RV', new.date, b.business_unit_id, coalesce(b.guest_name, 'Guest'), 'Booking payment' || coalesce(' · ' || b.guest_name, ''),
            'payments', new.id, new.mode, new.reference, new.amount, 'Received', new.date, new.created_by)
    on conflict do nothing;
  else
    update jdone.vouchers set date = new.date, amount = new.amount, mode = new.mode, reference = new.reference, paid_on = new.date
    where source_table = 'payments' and source_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists payment_voucher on jdone.payments;
create trigger payment_voucher after insert or update or delete on jdone.payments for each row execute function jdone.payment_voucher();

-- Expense paid → Payment voucher (PV), already paid.
create or replace function jdone.expense_voucher() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
begin
  if tg_op = 'DELETE' then
    update jdone.vouchers set status = 'Cancelled', notes = coalesce(notes || ' · ', '') || 'Expense deleted' where source_table = 'expenses' and source_id = old.id;
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into jdone.vouchers (vtype, date, business_unit_id, party, against, source_table, source_id, mode, amount, status, paid_on, created_by)
    values ('PV', new.date, new.business_unit_id, new.vendor, 'Expense · ' || new.category || coalesce(' · ' || nullif(new.detail, ''), ''),
            'expenses', new.id, new.mode, new.amount, 'Paid', new.date, new.created_by)
    on conflict do nothing;
  else
    update jdone.vouchers set date = new.date, amount = new.amount, mode = new.mode, party = new.vendor, business_unit_id = new.business_unit_id,
      against = 'Expense · ' || new.category || coalesce(' · ' || nullif(new.detail, ''), ''), paid_on = new.date
    where source_table = 'expenses' and source_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists expense_voucher on jdone.expenses;
create trigger expense_voucher after insert or update or delete on jdone.expenses for each row execute function jdone.expense_voucher();

-- ---------------------------------------------------------------- grants (same as the rest of the schema)
grant all on jdone.org_posts, jdone.staff_access, jdone.change_log, jdone.vouchers, jdone.voucher_counters to authenticated, service_role;
grant execute on function jdone.current_email(), jdone.is_director(), jdone.is_chairman(), jdone.is_access_admin() to authenticated, service_role;

-- Realtime: the Chairman's bell updates live when the Director changes something.
do $$ begin
  begin alter publication supabase_realtime add table jdone.change_log; exception when others then null; end;
  begin alter publication supabase_realtime add table jdone.vouchers; exception when others then null; end;
end $$;

-- When the Chairman's login email is known, run this one line (put the real email):
--   update jdone.org_posts set email = 'chairman-login@example.com' where post = 'chairman';

-- ================================================================ 2026-11-04-phase2-booking-rooms.jdone.sql
-- JD One phase 2 (4 Nov 2026): one booking, several room categories.
--   bookings.room_lines = [{unit_type, rooms, adults, children, meal_plan, rate, room_ids[]}, …]
--   The first category is still copied to unit_type / units / room_id, so older screens keep working.
--   The website's availability check now counts every category of a booking.
-- Run once in Supabase → SQL Editor. Safe to run again. Changes no existing data.

alter table jdone.bookings add column if not exists room_lines jsonb not null default '[]'::jsonb;

-- Rooms of a type that are free on EVERY night of the stay (website booking engine).
create or replace function jdone.be_free_rooms(p_unit uuid, p_type text, p_in date, p_out date) returns integer
language sql stable security definer set search_path = jdone, public as $$
  select greatest(0, (select count(*) from jdone.rooms r where r.business_unit_id = p_unit and r.unit_type = p_type and r.active and r.status <> 'Out of order')::int
    - coalesce((select max(used) from (
        select d::date as night,
               sum(case
                     when jsonb_typeof(b.room_lines) = 'array' and jsonb_array_length(b.room_lines) > 0 then
                       (select coalesce(sum(greatest(1, coalesce((l ->> 'rooms')::int, 1))), 0)
                          from jsonb_array_elements(b.room_lines) l where l ->> 'unit_type' = p_type)
                     when b.unit_type = p_type then coalesce(b.units, 1)
                     else 0
                   end) as used
        from generate_series(p_in, p_out - 1, interval '1 day') d
        join jdone.bookings b on b.business_unit_id = p_unit
          and b.check_in <= d::date and b.check_out > d::date
          and (b.status in ('Confirmed', 'Checked-in') or (b.status = 'On hold' and (b.hold_until is null or b.hold_until > now())))
        group by d) x), 0))
$$;

-- ================================================================ 2026-11-04-phase3-kitchen-stores.jdone.sql
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

-- ================================================================ 2026-11-04-phase4-housekeeping-activities-security.jdone.sql
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

-- ================================================================ 2026-11-04-phase5-recipes-purchase-orders.jdone.sql
-- JD One phase 5 (4 Nov 2026): recipes & costing, purchase orders, stock cost.
--   stock.cost_per_unit     — kept up to date from the latest purchase rate
--   recipes                 — menu dish → ingredients for a batch of N portions
--   kots.stock_deducted     — when a KOT is Served (or Billed), its dishes' recipe ingredients go off stock, once
--   purchase_orders         — numbered PO-0001…; "Goods received" books purchases (stock goes up)
-- Run once in Supabase → SQL Editor, after the earlier files. Safe to run again. Changes no existing data.

alter table jdone.stock add column if not exists cost_per_unit numeric(12,2);

-- Latest purchase rate → stock item's cost per unit.
create or replace function jdone.purchase_cost_to_stock() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
begin
  if new.stock_id is not null and coalesce(new.rate, 0) > 0 then
    update jdone.stock set cost_per_unit = new.rate where id = new.stock_id;
  elsif new.stock_id is not null and coalesce(new.quantity, 0) > 0 and coalesce(new.amount, 0) > 0 then
    update jdone.stock set cost_per_unit = round(new.amount / new.quantity, 2) where id = new.stock_id;
  end if;
  return new;
end $$;
drop trigger if exists purchase_cost_to_stock on jdone.purchases;
create trigger purchase_cost_to_stock after insert or update on jdone.purchases for each row execute function jdone.purchase_cost_to_stock();

create table if not exists jdone.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  menu_id uuid references jdone.menu_items(id) on delete set null,
  portions integer not null default 1 check (portions > 0),
  lines jsonb not null default '[]'::jsonb,
  menu_price numeric(12,2),
  method text,
  active boolean not null default true,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create unique index if not exists recipes_menu_uidx on jdone.recipes (menu_id) where menu_id is not null;

create table if not exists jdone.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text unique,
  date date not null default current_date,
  vendor_id uuid references jdone.vendors(id) on delete set null,
  vendor_name text,
  category text,
  lines jsonb not null default '[]'::jsonb,
  total numeric(12,2),
  expected_on date,
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Received', 'Cancelled')),
  received_on date,
  notes text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create sequence if not exists jdone.po_seq start 1;
create or replace function jdone.assign_po_no() returns trigger language plpgsql as $$
begin
  if new.po_no is null or new.po_no = '' then new.po_no := 'PO-' || lpad(nextval('jdone.po_seq')::text, 4, '0'); end if;
  return new;
end $$;
drop trigger if exists assign_po_no on jdone.purchase_orders;
create trigger assign_po_no before insert on jdone.purchase_orders for each row execute function jdone.assign_po_no();

-- Served KOT → recipe ingredients off stock (once per KOT).
alter table jdone.kots add column if not exists stock_deducted boolean not null default false;
-- KOTs already served before recipes existed must never be deducted later.
update jdone.kots set stock_deducted = true where status in ('Served', 'Billed', 'Cancelled') and not stock_deducted;
create or replace function jdone.kot_recipe_stock() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  l jsonb;
  ing jsonb;
  r record;
  q numeric;
begin
  if new.stock_deducted or new.status not in ('Served', 'Billed') then return new; end if;
  for l in select * from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb)) loop
    if coalesce(l ->> 'item_id', '') !~* '^[0-9a-f-]{36}$' then continue; end if;
    select * into r from jdone.recipes where menu_id = (l ->> 'item_id')::uuid and active limit 1;
    if not found then continue; end if;
    for ing in select * from jsonb_array_elements(coalesce(r.lines, '[]'::jsonb)) loop
      if coalesce(ing ->> 'stock_id', '') !~* '^[0-9a-f-]{36}$' then continue; end if;
      q := coalesce((ing ->> 'qty')::numeric, 0) / greatest(coalesce(r.portions, 1), 1) * coalesce((l ->> 'qty')::numeric, 1);
      if q > 0 then
        insert into jdone.stock_movements (stock_id, date, direction, quantity, source, kot_id, business_unit_id, note)
        values ((ing ->> 'stock_id')::uuid, current_date, 'Out', round(q, 2), 'KOT', new.id, new.business_unit_id, 'Recipe: ' || r.name);
      end if;
    end loop;
  end loop;
  new.stock_deducted := true;
  return new;
end $$;
drop trigger if exists kot_recipe_stock on jdone.kots;
create trigger kot_recipe_stock before update on jdone.kots for each row execute function jdone.kot_recipe_stock();

do $$
declare t text;
begin
  foreach t in array array['recipes', 'purchase_orders'] loop
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
grant usage, select on sequence jdone.po_seq to authenticated, service_role;

-- ================================================================ 2026-11-04-phase6-guests-events-service.jdone.sql
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

-- ================================================================ 2026-11-04-hr-employee-exit.jdone.sql
-- JD One (4 Nov 2026): HR → Employees — leaving is a process.
--   HR records a resignation with a notice period (7 days, 15 days or 1 month); the login stops
--   by itself after the last working day. Only the Chairman / Director can remove someone today.
-- Safe to run again. Changes no existing data.

alter table jdone.staff
  add column if not exists exit_status text check (exit_status in ('Notice period', 'Left', 'Removed')),
  add column if not exists resigned_on date,
  add column if not exists notice_days integer,
  add column if not exists last_working_day date,
  add column if not exists exit_reason text;

-- Someone past their last working day is no longer staff (no login, no data), even before the list is tidied.
create or replace function jdone.is_staff() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select exists (
    select 1 from jdone.staff
    where auth_user_id = auth.uid() and active
      and (last_working_day is null or last_working_day >= (now() at time zone 'Asia/Kolkata')::date)
  )
$$;

create or replace function jdone.current_staff_role() returns text
language sql stable security definer set search_path = jdone, public as $$
  select role from jdone.staff
  where auth_user_id = auth.uid() and active
    and (last_working_day is null or last_working_day >= (now() at time zone 'Asia/Kolkata')::date)
  limit 1
$$;

-- The rules, enforced for everyone except the Chairman and the Director.
create or replace function jdone.guard_staff_exit() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or jdone.is_access_admin() then return new; end if;

  if old.active and not new.active then
    if old.last_working_day is not null and old.last_working_day < today then return new; end if; -- notice served
    raise exception 'Only the Chairman or the Director can remove someone immediately. Record a resignation instead – access ends after the last working day.';
  end if;

  if not old.active and new.active and old.exit_status = 'Removed' then
    raise exception 'Only the Chairman or the Director can bring back someone they removed.';
  end if;

  if new.last_working_day is distinct from old.last_working_day and new.last_working_day is not null then
    if new.resigned_on is null or new.last_working_day < new.resigned_on + 7 then
      raise exception 'The notice period must be at least 7 days from the resignation date.';
    end if;
    if new.last_working_day < today then
      raise exception 'The last working day cannot be in the past.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_staff_exit on jdone.staff;
create trigger guard_staff_exit before update on jdone.staff for each row execute function jdone.guard_staff_exit();

-- Tidy the list: people whose notice is over become "Left" (also done by the Employees page when opened).
create or replace function jdone.close_due_exits() returns integer
language plpgsql security definer set search_path = jdone, public as $$
declare n integer;
begin
  update jdone.staff set active = false, left_on = last_working_day, exit_status = 'Left'
  where active and last_working_day is not null and last_working_day < (now() at time zone 'Asia/Kolkata')::date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function jdone.close_due_exits() from public, anon;
grant execute on function jdone.close_due_exits() to authenticated, service_role;

-- ================================================================ 2026-11-04-reports-night-audit.jdone.sql
-- JD One (4 Nov 2026): Reports — department end-of-day reports and the night audit.
-- Safe to run again. Changes no existing data.

create table if not exists jdone.dept_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  department text not null,
  data jsonb not null default '{}'::jsonb,
  notes text,
  submitted_by uuid references jdone.staff(id) on delete set null,
  submitted_at timestamptz,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (date, department)
);
create index if not exists dept_reports_date_idx on jdone.dept_reports (date desc);

create table if not exists jdone.night_audits (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  data jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  notes text,
  closed_by uuid references jdone.staff(id) on delete set null,
  closed_at timestamptz,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

do $$
declare t text;
begin
  foreach t in array array['dept_reports', 'night_audits'] loop
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

-- ================================================================ 2026-11-04-property-supervisor-report-duty.jdone.sql
-- JD One (4 Nov 2026): Property Supervisor post + report duty.
--   The Director, the Chairman and the Property Supervisor assign who sends which department's
--   end-of-day report ("report-<department>") and who runs the night audit ("night-audit").
-- Safe to run again. Changes no existing data.

alter table jdone.org_posts drop constraint if exists org_posts_post_check;
alter table jdone.org_posts add constraint org_posts_post_check check (post in ('chairman', 'director', 'property_supervisor'));
insert into jdone.org_posts (post, holder_name, email) values ('property_supervisor', null, null) on conflict (post) do nothing;

create or replace function jdone.is_property_supervisor() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select exists (
    select 1 from jdone.org_posts
    where post = 'property_supervisor' and email is not null and lower(email) = jdone.current_email() and jdone.current_email() <> ''
  )
$$;
grant execute on function jdone.is_property_supervisor() to authenticated, service_role;

-- Team access stays with the Chairman / Director; report duty rows can also be set by the Property Supervisor.
drop policy if exists "admin insert" on jdone.staff_access;
create policy "admin insert" on jdone.staff_access for insert to authenticated
  with check (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')));
drop policy if exists "admin update" on jdone.staff_access;
create policy "admin update" on jdone.staff_access for update to authenticated
  using (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')))
  with check (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')));
drop policy if exists "admin delete" on jdone.staff_access;
create policy "admin delete" on jdone.staff_access for delete to authenticated
  using (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')));

-- When the Property Supervisor is known, run this one line (put the real name and login email):
--   update jdone.org_posts set holder_name = 'Name', email = 'login@example.com' where post = 'property_supervisor';

-- ================================================================ 2026-11-04-home-cards-roster.jdone.sql
-- JD One (4 Nov 2026): Home cards (which departments see which card) and the HR shift roster.
-- Safe to run again. Changes no existing data.

create table if not exists jdone.home_cards (
  id uuid primary key default gen_random_uuid(),
  card text not null unique,
  departments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
alter table jdone.home_cards enable row level security;
drop policy if exists "staff read" on jdone.home_cards;
create policy "staff read" on jdone.home_cards for select to authenticated using (jdone.is_staff());
drop policy if exists "admin write" on jdone.home_cards;
create policy "admin write" on jdone.home_cards for all to authenticated
  using (jdone.is_access_admin() or jdone.is_property_supervisor())
  with check (jdone.is_access_admin() or jdone.is_property_supervisor());

create table if not exists jdone.shift_roster (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  date date not null,
  off boolean not null default false,
  shift1_start text,
  shift1_end text,
  shift2_start text,
  shift2_end text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (staff_id, date)
);
alter table jdone.shift_roster enable row level security;
drop policy if exists "staff read" on jdone.shift_roster;
create policy "staff read" on jdone.shift_roster for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.shift_roster;
create policy "staff insert" on jdone.shift_roster for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.shift_roster;
create policy "staff update" on jdone.shift_roster for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "staff delete" on jdone.shift_roster;
create policy "staff delete" on jdone.shift_roster for delete to authenticated using (jdone.is_staff());

do $$
declare t text;
begin
  foreach t in array array['home_cards', 'shift_roster'] loop
    execute format('drop trigger if exists set_updated_at on jdone.%I', t);
    execute format('create trigger set_updated_at before update on jdone.%I for each row execute function jdone.set_updated_at()', t);
    execute format('drop trigger if exists zz_log_director_change on jdone.%I', t);
    execute format('create trigger zz_log_director_change after insert or update or delete on jdone.%I for each row execute function jdone.log_director_change()', t);
    execute format('grant all on jdone.%I to authenticated, service_role', t);
  end loop;
end $$;

-- ================================================================ 2026-11-04-rooms-dnd.jdone.sql
-- JD One (4 Nov 2026): Room chart — "Do not disturb" on a room. Safe to run again.
alter table jdone.rooms add column if not exists dnd boolean not null default false;

-- ===== HR: Chairman / Director set a team member's password =====
-- HR → Employees → Password: the Chairman or the Director sets a new password for a team member.
-- Only the Chairman can change the Chairman's password. Passwords stay encrypted (bcrypt).
create or replace function jdone.admin_set_password(p_staff uuid, p_password text)
returns void language plpgsql security definer set search_path = jdone, public, extensions as $$
declare
  v_uid uuid;
  v_email text;
begin
  if not jdone.is_access_admin() then
    raise exception 'Only the Chairman or the Director can set a password.';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'The password must be at least 8 characters.';
  end if;
  select auth_user_id into v_uid from jdone.staff where id = p_staff;
  if v_uid is null then
    raise exception 'This person has no app login yet.';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if not jdone.is_chairman()
     and exists (select 1 from jdone.org_posts where post = 'chairman' and lower(email) = v_email) then
    raise exception 'Only the Chairman can change the Chairman''s password.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('must_change_password', false, 'password_set_by_admin_at', now()),
         updated_at = now()
   where id = v_uid;
end $$;
revoke all on function jdone.admin_set_password(uuid, text) from public, anon;
grant execute on function jdone.admin_set_password(uuid, text) to authenticated;

-- ===== HR: leave requests =====
-- JD One (4 Nov 2026): HR → Leave requests. Any employee asks for a weekly off, monthly off,
-- leave, half day or emergency leave with a reason; HR, the Property Supervisor, the Director
-- or the Chairman approves or rejects it. Nobody approves their own request. Safe to run again.

create table if not exists jdone.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  kind text not null check (kind in ('Weekly off', 'Monthly off', 'Leave', 'Half day', 'Emergency')),
  date_from date not null,
  date_to date not null,
  days numeric not null default 1,
  reason text not null check (length(trim(reason)) >= 3),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  decided_by uuid references jdone.staff(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  check (date_to >= date_from)
);
create index if not exists leave_requests_staff_idx on jdone.leave_requests (staff_id, date_from desc);
create index if not exists leave_requests_status_idx on jdone.leave_requests (status, date_from);

create or replace function jdone.my_staff_id() returns uuid
language sql stable security definer set search_path = jdone, public as $$
  select id from jdone.staff where auth_user_id = auth.uid() limit 1
$$;

-- Who may approve: HR, the Property Supervisor, the Director, the Chairman.
create or replace function jdone.is_leave_approver() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select coalesce(jdone.current_staff_role() = 'hr', false) or jdone.is_access_admin() or jdone.is_property_supervisor()
$$;

-- Rules for every change, whatever the screen.
create or replace function jdone.guard_leave_request() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare me uuid := jdone.my_staff_id();
begin
  if auth.uid() is null then return new; end if; -- server / SQL editor
  if tg_op = 'INSERT' then
    if new.staff_id is distinct from me and not jdone.is_leave_approver() then
      raise exception 'You can only ask leave for yourself.';
    end if;
    new.status := 'Pending'; new.decided_by := null; new.decided_at := null; new.decision_note := null;
    return new;
  end if;
  -- UPDATE
  if new.status is distinct from old.status and new.status in ('Approved', 'Rejected') then
    if not jdone.is_leave_approver() then
      raise exception 'Only HR, the Property Supervisor, the Director or the Chairman can approve leave.';
    end if;
    if old.staff_id = me and not jdone.is_chairman() then
      raise exception 'You cannot approve your own leave.';
    end if;
    new.decided_by := me; new.decided_at := now();
    return new;
  end if;
  if old.staff_id = me and not jdone.is_leave_approver() then
    if old.status <> 'Pending' then raise exception 'This request has already been decided.'; end if;
    if new.status not in ('Pending', 'Cancelled') then raise exception 'Not allowed.'; end if;
    if new.staff_id <> old.staff_id or new.decided_by is distinct from old.decided_by then raise exception 'Not allowed.'; end if;
    return new;
  end if;
  if not jdone.is_leave_approver() then raise exception 'Not allowed.'; end if;
  return new;
end $$;
drop trigger if exists guard_leave_request on jdone.leave_requests;
create trigger guard_leave_request before insert or update on jdone.leave_requests for each row execute function jdone.guard_leave_request();

alter table jdone.leave_requests enable row level security;
drop policy if exists "own or approver read" on jdone.leave_requests;
create policy "own or approver read" on jdone.leave_requests for select to authenticated
  using (jdone.is_staff() and (staff_id = jdone.my_staff_id() or jdone.is_leave_approver() or jdone.is_hr_admin()));
drop policy if exists "staff ask" on jdone.leave_requests;
create policy "staff ask" on jdone.leave_requests for insert to authenticated with check (jdone.is_staff());
drop policy if exists "own or approver update" on jdone.leave_requests;
create policy "own or approver update" on jdone.leave_requests for update to authenticated
  using (jdone.is_staff() and (staff_id = jdone.my_staff_id() or jdone.is_leave_approver()))
  with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.leave_requests;
create policy "owner delete" on jdone.leave_requests for delete to authenticated using (jdone.is_owner());
drop trigger if exists set_updated_at on jdone.leave_requests;
create trigger set_updated_at before update on jdone.leave_requests for each row execute function jdone.set_updated_at();
grant all on jdone.leave_requests to authenticated, service_role;
grant execute on function jdone.my_staff_id(), jdone.is_leave_approver() to authenticated;

-- ===== Duty location (purchaser) =====
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

-- ===== Meter readings + voucher payment details =====
-- JD One (5 Nov 2026): electricity meter readings (Maintenance) and payment details on vouchers.
-- Applied on 5 Nov 2026. Safe to run again.

-- Payment vouchers: proof of payment and how/why it was paid.
alter table jdone.vouchers add column if not exists bill_no text;
alter table jdone.vouchers add column if not exists paid_to_account text;
alter table jdone.vouchers add column if not exists payment_proof jsonb;
alter table jdone.vouchers add column if not exists paid_by uuid references jdone.staff(id) on delete set null;

-- Meter readings: one reading per meter per day, with a photo; units = this reading − the previous one.
create table if not exists jdone.meter_readings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  meter text not null default 'Main meter',
  reading numeric not null check (reading >= 0),
  units numeric,
  days integer,
  photo jsonb,
  recorded_by uuid references jdone.staff(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (business_unit_id, meter, date)
);
create index if not exists meter_readings_date_idx on jdone.meter_readings (business_unit_id, meter, date desc);

create or replace function jdone.meter_units() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare prev record;
begin
  select reading, date into prev from jdone.meter_readings
   where business_unit_id is not distinct from new.business_unit_id and meter = new.meter and date < new.date and id <> new.id
   order by date desc limit 1;
  if prev is null then new.units := null; new.days := null;
  else new.units := new.reading - prev.reading; new.days := new.date - prev.date; end if;
  return new;
end $$;
drop trigger if exists meter_units on jdone.meter_readings;
create trigger meter_units before insert or update of reading, date, meter, business_unit_id on jdone.meter_readings for each row execute function jdone.meter_units();

-- A reading added for an earlier day re-works the next day's units.
create or replace function jdone.meter_units_next() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare nxt uuid;
begin
  select id into nxt from jdone.meter_readings
   where business_unit_id is not distinct from new.business_unit_id and meter = new.meter and date > new.date
   order by date asc limit 1;
  if nxt is not null then update jdone.meter_readings set reading = reading where id = nxt; end if;
  return null;
end $$;
drop trigger if exists meter_units_next on jdone.meter_readings;
create trigger meter_units_next after insert or update of reading, date on jdone.meter_readings for each row execute function jdone.meter_units_next();

alter table jdone.meter_readings enable row level security;
drop policy if exists "staff read" on jdone.meter_readings;
create policy "staff read" on jdone.meter_readings for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.meter_readings;
create policy "staff insert" on jdone.meter_readings for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.meter_readings;
create policy "staff update" on jdone.meter_readings for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.meter_readings;
create policy "owner delete" on jdone.meter_readings for delete to authenticated using (jdone.is_owner());
drop trigger if exists set_updated_at on jdone.meter_readings;
create trigger set_updated_at before update on jdone.meter_readings for each row execute function jdone.set_updated_at();
drop trigger if exists zz_log_director_change on jdone.meter_readings;
create trigger zz_log_director_change after insert or update or delete on jdone.meter_readings for each row execute function jdone.log_director_change();
grant all on jdone.meter_readings to authenticated, service_role;

-- Starting point: the 31 Oct closing reading from the daily report.
insert into jdone.meter_readings (date, business_unit_id, meter, reading, photo, note)
select r.date, coalesce(r.business_unit_id, '71c3804a-5906-4328-9e3b-79555f65f035'::uuid), 'Main meter', r.electricity_closing, r.electricity_photo, 'Copied from the daily report'
from jdone.daily_reports r where r.date = '2026-10-31' and r.electricity_closing is not null
on conflict do nothing;
