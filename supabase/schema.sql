-- JD One — Supabase schema (idempotent; safe to re-run).
-- Run in the Supabase SQL editor. Creates tables, indexes, updated_at triggers,
-- row-level security, the `receipts` + `tickets` storage buckets, the customer_stats view
-- and seed rows for business units + unit types.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_code text,
  type text,
  city text,
  phone text,
  active boolean not null default true,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  role text not null default 'staff' check (role in ('owner','manager','hr','accounts','finance','marketing','staff')),
  business_unit_id uuid references public.business_units(id) on delete set null,
  designation text,
  active boolean not null default true,
  joined_on date,
  left_on date,
  salary numeric(12,2),
  auth_user_id uuid unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

-- created_by everywhere points at the staff member who entered the record.
alter table public.business_units drop constraint if exists business_units_created_by_fkey;
alter table public.business_units add constraint business_units_created_by_fkey foreign key (created_by) references public.staff(id) on delete set null;
alter table public.staff drop constraint if exists staff_created_by_fkey;
alter table public.staff add constraint staff_created_by_fkey foreign key (created_by) references public.staff(id) on delete set null;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  city text,
  company text,
  tags text[] not null default '{}',
  owner_id uuid references public.staff(id) on delete set null,
  first_source text,
  first_seen date,
  birthday date,
  anniversary date,
  preferences text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create unique index if not exists customers_phone_key on public.customers (phone);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  customer_id uuid references public.customers(id) on delete set null,
  business_unit_id uuid references public.business_units(id) on delete set null,
  source text not null default 'Other',
  campaign text,
  requirement text,
  visit_from date,
  visit_to date,
  guests integer,
  budget numeric(12,2),
  qualification text,
  stage text not null default 'New',
  assigned_to uuid references public.staff(id) on delete set null,
  next_follow_up date,
  last_contact date,
  lost_reason text,
  notes text,
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create unique index if not exists leads_external_id_key on public.leads (external_id) where external_id is not null;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  type text not null default 'call',
  at timestamptz not null default now(),
  summary text not null,
  next_action text,
  next_action_date date,
  done_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  phone text,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  business_unit_id uuid references public.business_units(id) on delete set null,
  check_in date not null,
  check_out date not null,
  unit_type text not null,
  units integer not null default 1,
  adults integer default 2,
  children integer default 0,
  meal_plan text default 'CP',
  rate numeric(12,2),
  total numeric(12,2) default 0,
  advance numeric(12,2) default 0,
  paid numeric(12,2) default 0,
  balance numeric(12,2) default 0,
  source text not null default 'Direct',
  status text not null default 'Confirmed',
  special_requests text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  date date not null default current_date,
  amount numeric(12,2) not null,
  mode text not null default 'UPI',
  reference text,
  received_by uuid references public.staff(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actual_in timestamptz,
  actual_out timestamptz,
  id_proof_type text,
  id_number text,            -- last 4 digits only (the app enforces this)
  vehicle text,
  room_numbers text,
  handled_by uuid references public.staff(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  sales_cash numeric(12,2) not null default 0,
  sales_online numeric(12,2) not null default 0,
  sales_total numeric(12,2) not null default 0,
  occupancy_units integer,
  submitted_by uuid references public.staff(id) on delete set null,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null,
  unique (date, business_unit_id)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  status text not null check (status in ('P','A','H','L')),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null,
  unique (date, staff_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  business_unit_id uuid references public.business_units(id) on delete set null,
  amount numeric(12,2) not null,
  category text not null,
  vendor text not null,
  detail text,
  paid_by uuid references public.staff(id) on delete set null,
  mode text default 'Cash',
  receipt text,              -- public URL in the `receipts` bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);

create table if not exists public.stock (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  unit text default 'pcs',
  quantity numeric(12,2) not null default 0,
  min_quantity numeric(12,2) not null default 0,
  low_stock boolean not null default false,
  business_unit_id uuid references public.business_units(id) on delete set null,
  last_counted date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  business_unit_id uuid references public.business_units(id) on delete set null,
  type text not null default 'Other',
  priority text default 'Medium',
  assigned_to uuid references public.staff(id) on delete set null,
  due date,
  status text not null default 'Open',
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);

create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  target_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null,
  unique (business_unit_id, month)
);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows integer not null default 0,
  customers_created integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  errors integer not null default 0,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);


-- WhatsApp messages with customers (written by scripts/sync-whatsapp.ts).
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null default 'whatsapp',
  account text not null check (account in ('udaisarovar','pronite','personal')),
  direction text not null check (direction in ('in','out')),
  sent_at timestamptz not null,
  sender_phone text,
  sender_name text,
  body text,
  media_type text,
  media_url text,
  chat_jid text,
  external_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null,
  unique (account, external_id)
);
create index if not exists messages_customer_sent_idx on public.messages (customer_id, sent_at desc);
create index if not exists messages_phone_idx on public.messages (sender_phone);

-- Hiring pipeline (HR); "Mark as hired" creates the staff row and links it here.
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  position text not null,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  source text,
  stage text not null default 'Applied',
  applied_on date,
  interview_on timestamptz,
  expected_salary numeric(12,2),
  offered_salary numeric(12,2),
  joining_date date,
  experience_years numeric(4,1),
  current_city text,
  interviewer uuid references public.staff(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  documents text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create index if not exists candidates_stage_idx on public.candidates (business_unit_id, stage);

-- Phone check-in (selfie + time + GPS) on attendance; property coordinates on business units.
alter table public.attendance
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_out_at timestamptz,
  add column if not exists selfie text,
  add column if not exists selfie_out text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists accuracy_m integer,
  add column if not exists distance_m integer,
  add column if not exists location_ok boolean,
  add column if not exists device text;
alter table public.business_units
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geofence_m integer default 300;



-- ---------------------------------------------------------------- staff self sign-up + approval, maintenance tickets, task points (29 Sep 2026)
-- Roles that may approve sign-ups (mirrors APPROVER_ROLES in the app).
create or replace function public.is_hr_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() in ('owner','manager','hr'), false)
$$;

-- Login → Create account writes this row on first sign-in; HR → Staff approves it (creates the staff row).
create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  name text not null,
  phone text,
  email text,
  designation text,
  business_unit_id uuid references public.business_units(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.staff(id) on delete set null,
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create index if not exists signup_requests_status_idx on public.signup_requests (status);

-- Maintenance tickets; media / resolution_media hold JSON arrays of {url, type, name, size} (files in the `tickets` bucket).
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Other',
  business_unit_id uuid references public.business_units(id) on delete set null,
  location text,
  booking_id uuid references public.bookings(id) on delete set null,
  priority text not null default 'Medium',
  priority_rank integer not null default 2,   -- 0 Urgent … 3 Low, kept by the app for sorting
  description text,
  media jsonb not null default '[]'::jsonb,
  reported_by uuid references public.staff(id) on delete set null,
  assigned_to uuid references public.staff(id) on delete set null,
  status text not null default 'Open' check (status in ('Open','In progress','Waiting parts','Done','Verified')),
  due date,
  started_at timestamptz,                     -- first time the ticket leaves Open (first response)
  resolved_at timestamptz,                    -- set when Done / Verified
  resolution_notes text,
  resolution_media jsonb not null default '[]'::jsonb,
  cost numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_unit_idx on public.tickets (business_unit_id);
create index if not exists tickets_assigned_idx on public.tickets (assigned_to);
create index if not exists tickets_priority_idx on public.tickets (priority_rank, created_at desc);

-- Tasks: points for the scoreboard, completion time, and the ticket that created the task.
alter table public.tasks
  add column if not exists points integer not null default 1,
  add column if not exists completed_at timestamptz,
  add column if not exists ticket_id uuid references public.tickets(id) on delete set null;
create index if not exists tasks_ticket_idx on public.tasks (ticket_id);
create index if not exists tasks_assigned_idx on public.tasks (assigned_to, status);

-- link_staff_on_signup: a staff row pre-created by HR with the person's email is linked to their
-- login the moment they sign up, so they skip approval. Self sign-ups without a staff row go
-- through signup_requests instead. The trigger is only added when no trigger on auth.users
-- already calls this function (the live project had it installed by hand).
create or replace function public.link_staff_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.staff set auth_user_id = new.id
   where auth_user_id is null and email is not null and lower(email) = lower(new.email);
  return new;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgfoid = 'public.link_staff_on_signup'::regproc) then
    create trigger link_staff after insert on auth.users for each row execute function public.link_staff_on_signup();
  end if;
end $$;

-- ---------------------------------------------------------------- customer portal (myjdgroup.com/portal)
-- Investors log in with Supabase Auth; they may READ only their own rows (auth_user_id = auth.uid()).
create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  customer_id uuid references public.customers(id) on delete set null,
  city text,
  pan_last4 text,
  kyc_status text not null default 'Pending',
  relationship_owner uuid references public.staff(id) on delete set null,
  portal_active boolean not null default true,
  auth_user_id uuid unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create unique index if not exists investors_email_key on public.investors (lower(email));

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  project text not null,
  business_unit_id uuid references public.business_units(id) on delete set null,
  type text not null default 'Debt / fixed return',
  amount numeric(14,2) not null,
  invested_on date not null,
  annual_return_pct numeric(6,2),
  maturity_on date,
  current_value numeric(14,2),
  returns_paid numeric(14,2) not null default 0,
  status text not null default 'Active',
  reference text,
  document text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create index if not exists investments_investor_idx on public.investments (investor_id);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  date date not null default current_date,
  direction text not null check (direction in ('credit','debit')),
  amount numeric(14,2) not null check (amount >= 0),
  category text not null default 'Deposit',
  investment_id uuid references public.investments(id) on delete set null,
  reference text,
  note text not null,
  entered_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null
);
create index if not exists wallet_tx_investor_idx on public.wallet_transactions (investor_id, date desc);

create or replace view public.wallet_balances with (security_invoker = on) as
select i.id as investor_id, i.name, i.email,
  coalesce(sum(case when t.direction = 'credit' then t.amount else -t.amount end), 0) as balance,
  max(t.date) as last_transaction
from public.investors i left join public.wallet_transactions t on t.investor_id = i.id
group by i.id, i.name, i.email;

-- Portal users: link on sign-up by email, and allow them to read their own rows.
create or replace function public.link_investor_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.investors set auth_user_id = new.id
   where auth_user_id is null and lower(email) = lower(new.email);
  return new;
end $$;
drop trigger if exists link_investor on auth.users;
create trigger link_investor after insert on auth.users for each row execute function public.link_investor_on_signup();

alter table public.investors enable row level security;
alter table public.investments enable row level security;
alter table public.wallet_transactions enable row level security;
drop policy if exists "investor read own" on public.investors;
create policy "investor read own" on public.investors for select to authenticated using (auth_user_id = auth.uid() and portal_active);
drop policy if exists "investor read own investments" on public.investments;
create policy "investor read own investments" on public.investments for select to authenticated
  using (exists (select 1 from public.investors i where i.id = investor_id and i.auth_user_id = auth.uid() and i.portal_active));
drop policy if exists "investor read own wallet" on public.wallet_transactions;
create policy "investor read own wallet" on public.wallet_transactions for select to authenticated
  using (exists (select 1 from public.investors i where i.id = investor_id and i.auth_user_id = auth.uid() and i.portal_active));


-- Portal customers may read their own bookings (matched via the investor's linked CRM customer or phone).
drop policy if exists "investor read own bookings" on public.bookings;
create policy "investor read own bookings" on public.bookings for select to authenticated
  using (exists (select 1 from public.investors i where i.auth_user_id = auth.uid() and i.portal_active
                 and (i.customer_id = bookings.customer_id or i.phone = bookings.phone)));

-- Lookup of unit types (the app also has them as select options).
create table if not exists public.unit_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  business_unit_id uuid references public.business_units(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes
create index if not exists leads_customer_idx on public.leads (customer_id);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_follow_up_idx on public.leads (next_follow_up);
create index if not exists leads_unit_idx on public.leads (business_unit_id);
create index if not exists activities_lead_idx on public.activities (lead_id);
create index if not exists activities_customer_idx on public.activities (customer_id);
create index if not exists bookings_customer_idx on public.bookings (customer_id);
create index if not exists bookings_dates_idx on public.bookings (check_in, check_out);
create index if not exists bookings_unit_idx on public.bookings (business_unit_id);
create index if not exists payments_booking_idx on public.payments (booking_id);
create index if not exists payments_customer_idx on public.payments (customer_id);
create index if not exists payments_date_idx on public.payments (date);
create index if not exists checkins_booking_idx on public.checkins (booking_id);
create index if not exists daily_reports_date_idx on public.daily_reports (date);
create index if not exists attendance_date_idx on public.attendance (date);
create index if not exists expenses_date_idx on public.expenses (date);
create index if not exists expenses_unit_idx on public.expenses (business_unit_id);
create index if not exists stock_unit_idx on public.stock (business_unit_id);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_customer_idx on public.tasks (customer_id);
create index if not exists staff_auth_idx on public.staff (auth_user_id);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['business_units','staff','customers','leads','activities','bookings','payments','checkins','daily_reports','attendance','expenses','stock','tasks','targets','import_runs','messages','candidates','investors','investments','wallet_transactions','tickets','signup_requests']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- auth helpers (security definer so RLS on staff does not block the lookup)
create or replace function public.current_staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where auth_user_id = auth.uid() and active limit 1
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where auth_user_id = auth.uid() and active)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() = 'owner', false)
$$;

-- ---------------------------------------------------------------- row level security
-- Any active staff member may read and write; only the owner may delete.
do $$
declare t text;
begin
  foreach t in array array['business_units','staff','customers','leads','activities','bookings','payments','checkins','daily_reports','attendance','expenses','stock','tasks','targets','import_runs','messages','candidates','investors','investments','wallet_transactions','unit_types','tickets']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff read" on public.%I', t);
    execute format('create policy "staff read" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('drop policy if exists "staff insert" on public.%I', t);
    execute format('create policy "staff insert" on public.%I for insert to authenticated with check (public.is_staff())', t);
    execute format('drop policy if exists "staff update" on public.%I', t);
    execute format('create policy "staff update" on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('drop policy if exists "owner delete" on public.%I', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (public.is_owner())', t);
  end loop;
end $$;

-- Sign-up requests: a signed-in user may create/see their OWN request (they are not staff yet);
-- staff read all; owner/manager/hr decide.
alter table public.signup_requests enable row level security;
drop policy if exists "own signup insert" on public.signup_requests;
create policy "own signup insert" on public.signup_requests for insert to authenticated with check (auth_user_id = auth.uid());
drop policy if exists "own or staff signup read" on public.signup_requests;
create policy "own or staff signup read" on public.signup_requests for select to authenticated using (auth_user_id = auth.uid() or public.is_staff());
drop policy if exists "hr signup update" on public.signup_requests;
create policy "hr signup update" on public.signup_requests for update to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());
drop policy if exists "hr signup delete" on public.signup_requests;
create policy "hr signup delete" on public.signup_requests for delete to authenticated using (public.is_hr_admin());

-- The sign-up form (not signed in) lists active business units with the anon key: id, name, short_code, active only.
drop policy if exists "anon read active units" on public.business_units;
create policy "anon read active units" on public.business_units for select to anon using (active);
revoke select on public.business_units from anon;
grant select (id, name, short_code, active) on public.business_units to anon;

-- ---------------------------------------------------------------- customer 360° view
-- One row per customer with the headline numbers (RLS of the underlying tables applies).
create or replace view public.customer_stats with (security_invoker = on) as
select
  c.id as customer_id,
  c.name,
  c.phone,
  count(b.id) filter (where b.status in ('Confirmed','Checked-in','Checked-out') and b.check_in <= current_date) as stays,
  coalesce(sum(greatest(b.check_out - b.check_in, 0)) filter (where b.status in ('Confirmed','Checked-in','Checked-out') and b.check_in <= current_date), 0) as nights,
  coalesce((select sum(p.amount) from public.payments p where p.customer_id = c.id), 0) as spend,
  max(b.check_in) filter (where b.status in ('Confirmed','Checked-in','Checked-out') and b.check_in <= current_date) as last_visit,
  min(b.check_in) filter (where b.status in ('Confirmed','Checked-in') and b.check_in > current_date) as next_booking,
  (select count(*) from public.leads l where l.customer_id = c.id and l.stage not in ('Won','Lost')) as open_leads,
  (select max(a.at) from public.activities a where a.customer_id = c.id) as last_activity
from public.customers c
left join public.bookings b on b.customer_id = c.id
group by c.id, c.name, c.phone;

-- ---------------------------------------------------------------- storage: receipts bucket (public read, staff write)
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "receipts public read" on storage.objects;
create policy "receipts public read" on storage.objects for select using (bucket_id = 'receipts');
drop policy if exists "receipts staff insert" on storage.objects;
create policy "receipts staff insert" on storage.objects for insert to authenticated with check (bucket_id = 'receipts' and public.is_staff());
drop policy if exists "receipts staff update" on storage.objects;
create policy "receipts staff update" on storage.objects for update to authenticated using (bucket_id = 'receipts' and public.is_staff());
drop policy if exists "receipts owner delete" on storage.objects;
create policy "receipts owner delete" on storage.objects for delete to authenticated using (bucket_id = 'receipts' and public.is_owner());

-- ---------------------------------------------------------------- storage: tickets bucket (photos/videos; public read, staff write)
insert into storage.buckets (id, name, public)
values ('tickets', 'tickets', true)
on conflict (id) do nothing;

drop policy if exists "tickets public read" on storage.objects;
create policy "tickets public read" on storage.objects for select using (bucket_id = 'tickets');
drop policy if exists "tickets staff insert" on storage.objects;
create policy "tickets staff insert" on storage.objects for insert to authenticated with check (bucket_id = 'tickets' and public.is_staff());
drop policy if exists "tickets staff update" on storage.objects;
create policy "tickets staff update" on storage.objects for update to authenticated using (bucket_id = 'tickets' and public.is_staff());
drop policy if exists "tickets owner delete" on storage.objects;
create policy "tickets owner delete" on storage.objects for delete to authenticated using (bucket_id = 'tickets' and public.is_owner());

-- ---------------------------------------------------------------- seeds
insert into public.business_units (name, short_code, type, city) values
  ('The Udaisarovar', 'UDS', 'Resort', 'Udaipur'),
  ('Pronite', 'PRN', 'Events', 'Udaipur'),
  ('CPC – Choudhary Properties & Consultancy', 'CPC', 'Consultancy', 'Udaipur'),
  ('JD Group HQ', 'HQ', 'HQ', 'Udaipur'),
  ('Hotel Kirti Plaza', 'HKP', 'Hotel', 'Udaipur'),
  ('The Artist House', 'TAH', 'Hotel', 'Udaipur'),
  ('House of Beauty', 'HOB', 'Salon', 'Udaipur')
on conflict (name) do nothing;

insert into public.unit_types (name, business_unit_id)
select v.name, (select id from public.business_units where name = 'The Udaisarovar')
from (values ('Lake View Cottage'), ('Pool View Cottage'), ('Family Suite'), ('Camping'), ('Glass House'), ('Other')) as v(name)
on conflict (name) do nothing;

-- ---------------------------------------------------------------- first owner
-- After creating your login under Authentication → Users, link it:
--   insert into public.staff (name, role, business_unit_id, auth_user_id, active)
--   values ('Jayesh Choudhary', 'owner', (select id from public.business_units where name = 'JD Group HQ'), '<auth user uuid>', true);
