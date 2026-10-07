-- JD One — migration 30 Sep 2026 (schema jdone): Property / front-office modules modelled on the
-- AsiaTech channel-manager panel — rooms, rates calendar, promotions, request money, housekeeping,
-- petty cash, agents, add-ons, hotel details. Idempotent; run once in the Supabase SQL editor of the
-- shared project (safe to re-run after a partial run).
-- Contains ONLY the statements new since 2026-09-29-customer-no-asiatech.jdone.sql.

-- ---------------------------------------------------------------- hotel details on business units
alter table jdone.business_units
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists description text,
  add column if not exists star_category text,
  add column if not exists checkin_time text default '14:00',
  add column if not exists checkout_time text default '11:00',
  add column if not exists gstin text,
  add column if not exists gst_rate numeric(5,2) default 12,
  add column if not exists upi_id text,
  add column if not exists amenities jsonb not null default '[]'::jsonb,
  add column if not exists policies text,
  add column if not exists maps_url text;

-- ---------------------------------------------------------------- rooms (physical inventory)
create table if not exists jdone.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  unit_type text not null,
  block text,
  max_adults integer not null default 2,
  max_children integer not null default 1,
  extra_bed boolean not null default false,
  status text not null default 'Available' check (status in ('Available','Occupied','Blocked','Out of order')),
  hk_status text not null default 'Clean' check (hk_status in ('Clean','Dirty','Inspected','Maintenance')),
  amenities jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (business_unit_id, name)
);
create index if not exists rooms_unit_idx on jdone.rooms (business_unit_id, active);
create index if not exists rooms_type_idx on jdone.rooms (unit_type);

-- ---------------------------------------------------------------- travel / corporate agents
create table if not exists jdone.agents (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'Travel agent',
  company text not null,
  contact_person text,
  phone text,
  email text,
  city text,
  commission_pct numeric(5,2),
  credit_allowed boolean not null default false,
  credit_limit numeric(12,2),
  gstin text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

-- ---------------------------------------------------------------- add-on services
create table if not exists jdone.add_ons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  price numeric(12,2) not null default 0,
  per text not null default 'Booking',
  tax_pct numeric(5,2) default 18,
  quantity integer,
  description text,
  image text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

-- Bookings: assigned physical room (room chart), agent, hold expiry, and the "On hold" status.
alter table jdone.bookings
  add column if not exists room_id uuid references jdone.rooms(id) on delete set null,
  add column if not exists agent_id uuid references jdone.agents(id) on delete set null,
  add column if not exists hold_until timestamptz;
create index if not exists bookings_room_idx on jdone.bookings (room_id);
create index if not exists bookings_agent_idx on jdone.bookings (agent_id);

-- ---------------------------------------------------------------- rates (date-ranged, per type + meal plan)
create table if not exists jdone.rates (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  unit_type text not null,
  meal_plan text not null default 'EP' check (meal_plan in ('EP','CP','MAP','AP')),
  date_from date not null,
  date_to date not null,
  rate numeric(12,2) not null default 0,
  extra_adult numeric(12,2),
  extra_child numeric(12,2),
  channel text not null default 'All channels',
  closed boolean not null default false,
  min_nights integer not null default 1,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  check (date_to >= date_from)
);
create index if not exists rates_lookup_idx on jdone.rates (business_unit_id, unit_type, meal_plan, date_from, date_to);

-- ---------------------------------------------------------------- promotions / coupon codes
create table if not exists jdone.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  offer_type text not null default 'Seasonal offer',
  code text unique,
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  kind text not null default 'Percent',
  value numeric(12,2),
  unit_type text default 'All',
  date_from date not null,
  date_to date not null,
  min_nights integer not null default 1,
  channel text default 'All channels',
  active boolean not null default true,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

-- ---------------------------------------------------------------- request money (payment links)
create table if not exists jdone.payment_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references jdone.bookings(id) on delete set null,
  customer_id uuid references jdone.customers(id) on delete set null,
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  guest_name text not null,
  phone text not null,
  amount numeric(12,2) not null,
  purpose text not null default 'Advance',
  due date,
  status text not null default 'Pending' check (status in ('Pending','Sent','Paid','Cancelled')),
  upi_link text,
  sent_at timestamptz,
  paid_at timestamptz,
  payment_id uuid references jdone.payments(id) on delete set null,
  requested_by uuid references jdone.staff(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists payment_requests_status_idx on jdone.payment_requests (status);
create index if not exists payment_requests_booking_idx on jdone.payment_requests (booking_id);

-- ---------------------------------------------------------------- housekeeping reports
create table if not exists jdone.housekeeping_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  room_id uuid not null references jdone.rooms(id) on delete cascade,
  status text not null default 'Clean' check (status in ('Clean','Dirty','Inspected','Maintenance')),
  task text default 'Daily clean',
  cleaned_by uuid references jdone.staff(id) on delete set null,
  inspected_by uuid references jdone.staff(id) on delete set null,
  linen_changed boolean not null default false,
  towels_changed boolean not null default false,
  minibar_checked boolean not null default false,
  issues text,
  photos jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists housekeeping_date_idx on jdone.housekeeping_reports (date desc);
create index if not exists housekeeping_room_idx on jdone.housekeeping_reports (room_id);

-- ---------------------------------------------------------------- petty cash ledger
create table if not exists jdone.petty_cash (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  kind text not null default 'Cash out' check (kind in ('Cash in','Cash out')),
  amount numeric(12,2) not null,
  purpose text not null,
  category text not null default 'Kitchen & food',
  paid_to text,
  handled_by uuid references jdone.staff(id) on delete set null,
  receipt text,
  notes text,
  payment_id uuid references jdone.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists petty_cash_date_idx on jdone.petty_cash (business_unit_id, date desc);
create index if not exists petty_cash_payment_idx on jdone.petty_cash (payment_id);

-- ---------------------------------------------------------------- updated_at triggers + RLS (same rules as every staff table)
do $$
declare t text;
begin
  foreach t in array array['rooms','rates','promotions','payment_requests','housekeeping_reports','petty_cash','agents','add_ons']
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

-- ---------------------------------------------------------------- seed: The Udaisarovar rooms, numbered as in AsiaTech housekeeping
insert into jdone.rooms (name, business_unit_id, unit_type, block, max_adults, max_children, extra_bed, sort_order, amenities)
select v.name, u.id, v.unit_type, v.block, v.max_adults, v.max_children, v.extra_bed, v.sort_order, v.amenities::jsonb
from (values
  ('Cottage - 1',      'Lake View Cottage', 'Lake side',  2, 1, false, 1,  '["Lake view","Garden","AC"]'),
  ('Cottage - 2',      'Lake View Cottage', 'Lake side',  2, 1, false, 2,  '["Lake view","Garden","AC"]'),
  ('Cottage - 3',      'Lake View Cottage', 'Lake side',  2, 1, false, 3,  '["Lake view","Garden","AC"]'),
  ('Cottage - 4',      'Pool View Cottage', 'Pool side',  2, 1, false, 4,  '["Pool view","Garden","AC"]'),
  ('Family Suite - 5', 'Family Suite',      'Main house', 3, 1, true,  5,  '["AC","Bunk bed","Extra bed"]'),
  ('Camp - 6',         'Camping',           'Lawn',       2, 1, false, 6,  '["Garden"]'),
  ('Camp - 7',         'Camping',           'Lawn',       2, 1, false, 7,  '["Garden"]'),
  ('Camp - 8',         'Camping',           'Lawn',       2, 1, false, 8,  '["Garden"]'),
  ('Camp - 9',         'Camping',           'Lawn',       2, 1, false, 9,  '["Garden"]'),
  ('Camp - 10',        'Camping',           'Lawn',       2, 1, false, 10, '["Garden"]')
) as v(name, unit_type, block, max_adults, max_children, extra_bed, sort_order, amenities)
join jdone.business_units u on u.name = 'The Udaisarovar'
on conflict (business_unit_id, name) do nothing;

-- Agents already registered in AsiaTech.
insert into jdone.agents (kind, company, contact_person, city)
select v.kind, v.company, v.contact_person, v.city
from (values
  ('Travel agent', 'mamta tour and travels', 'Mamta', 'Udaipur'),
  ('Corporate', 'XYZ', 'Divya', 'Dungarpur'),
  ('Taxi / driver', 'Taxiservices', 'Rajendra', 'Udaipur')
) as v(kind, company, contact_person, city)
where not exists (select 1 from jdone.agents a where a.company = v.company);

-- Hotel details for The Udaisarovar (only fills blanks).
update jdone.business_units set
  type = coalesce(type, 'Resort'),
  star_category = coalesce(star_category, 'Resort'),
  checkin_time = coalesce(checkin_time, '14:00'),
  checkout_time = coalesce(checkout_time, '11:00'),
  website = coalesce(website, 'https://www.theudaisarovar.com'),
  amenities = case when amenities = '[]'::jsonb then '["Swimming pool","Lake view","Garden","Bonfire","Restaurant","Free Wi-Fi","Free parking","Air conditioning","Power backup","Indoor games","Camping"]'::jsonb else amenities end
where name = 'The Udaisarovar';

-- Grants for objects created above.
grant all on all tables in schema jdone to authenticated, service_role;
grant all on all sequences in schema jdone to authenticated, service_role;
