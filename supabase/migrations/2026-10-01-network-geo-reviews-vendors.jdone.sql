-- JD One — migration 1 Oct 2026 (d): State → District → City network, Google reviews, manager
-- mobiles, 300-members-per-city cap, and the shared vendor directory.
-- Run AFTER 2026-10-01-network-orders.jdone.sql. Idempotent.

alter table jdone.business_units
  add column if not exists state text not null default 'Rajasthan',
  add column if not exists district text,
  add column if not exists service_category text,
  add column if not exists manager_name text,
  add column if not exists manager_phone text,
  add column if not exists google_maps_url text,
  add column if not exists google_rating numeric(2,1),
  add column if not exists google_reviews_count integer;
create index if not exists business_units_geo_idx on jdone.business_units (state, district, city);

-- ---------------------------------------------------------------- 300 members per city
create or replace function jdone.enforce_city_cap() returns trigger
language plpgsql as $$
declare n integer;
begin
  if not new.active or new.city is null then return new; end if;
  if tg_op = 'UPDATE' and old.active and old.city is not distinct from new.city and old.state is not distinct from new.state then return new; end if;
  select count(*) into n from jdone.business_units
   where active and lower(city) = lower(new.city) and state is not distinct from new.state and id <> new.id;
  if n >= 300 then
    raise exception 'The JD One network already has 300 members in % (%). Deactivate one before adding another.', new.city, new.state;
  end if;
  return new;
end $$;
drop trigger if exists enforce_city_cap on jdone.business_units;
create trigger enforce_city_cap before insert or update of active, city, state on jdone.business_units for each row execute function jdone.enforce_city_cap();

-- ---------------------------------------------------------------- vendor directory (shared across the network)
create table if not exists jdone.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  contact_person text,
  phone text not null,
  whatsapp text,
  state text not null default 'Rajasthan',
  district text not null,
  city text not null,
  area text,
  delivers boolean not null default true,
  rating numeric(2,1),
  network_member_id uuid references jdone.business_units(id) on delete set null,
  recommended_by uuid references jdone.staff(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists vendors_geo_idx on jdone.vendors (state, district, city, category);
drop trigger if exists set_updated_at on jdone.vendors;
create trigger set_updated_at before update on jdone.vendors for each row execute function jdone.set_updated_at();
alter table jdone.vendors enable row level security;
drop policy if exists "staff read" on jdone.vendors;
create policy "staff read" on jdone.vendors for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.vendors;
create policy "staff insert" on jdone.vendors for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.vendors;
create policy "staff update" on jdone.vendors for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.vendors;
create policy "owner delete" on jdone.vendors for delete to authenticated using (jdone.is_owner());

-- Every member may see every member business on the Network page (names, contacts, reviews) —
-- that is the point of the network. Their DATA (bookings, staff, money) stays isolated.
drop policy if exists "network directory read" on jdone.business_units;
create policy "network directory read" on jdone.business_units for select to authenticated using (jdone.is_staff() and active);

-- ---------------------------------------------------------------- geography + Google reviews (looked up on Google 1 Oct 2026)
update jdone.business_units set state = 'Rajasthan', district = coalesce(district, 'Udaipur') where city = 'Udaipur';
update jdone.business_units set state = 'Rajasthan', district = coalesce(district, 'Chittorgarh') where city in ('Chittorgarh', 'Badi Sadi', 'Bari Sadri');
update jdone.business_units set city = 'Bari Sadri' where name = 'BPCL Petrol Pump – Badi Sadi';

update jdone.business_units u set
  phone = coalesce(u.phone, v.phone),
  manager_phone = coalesce(u.manager_phone, v.phone),
  service_category = coalesce(u.service_category, v.cat),
  google_rating = v.rating,
  google_reviews_count = v.reviews,
  google_maps_url = coalesce(u.google_maps_url, 'https://www.google.com/maps/search/?api=1&query=' || replace(v.q, ' ', '+'))
from (values
  ('The Udaisarovar',    '+918829809555', 'Stay & events',  4.2, 136,  'The Udaisarovar Lakeside Paradise Udaipur'),
  ('The Artist House',   '+917357368222', 'Stay',           4.0, 292,  'The Artist House Luxury Boutique Hotel Udaipur'),
  ('The Belmonte House', '+919950680044', 'Stay',           4.5, 2794, 'The Belmonte House Udaipur'),
  ('House of Beauty',    '+919950474466', 'Salon & beauty', 3.4, 92,   'House of Beauty Unisex Salon Udaipur'),
  ('Hotel Kirti Plaza',  '+917728888011', 'Stay',           4.4, 1292, 'Hotel Kirti Plaza Chittorgarh')
) as v(name, phone, cat, rating, reviews, q)
where u.name = v.name;

update jdone.business_units set service_category = coalesce(service_category, 'Fuel') where type = 'Fuel station';
update jdone.business_units set service_category = coalesce(service_category, 'Kids footwear'), manager_name = coalesce(manager_name, 'Navin Suman / Shubham Rao') where name = 'Stepwhere';
update jdone.business_units set service_category = coalesce(service_category, 'Aloe vera products'), manager_name = coalesce(manager_name, 'Naveen Suman') where name = 'Aloe E-Cell';
update jdone.business_units set service_category = coalesce(service_category, 'Events'), phone = coalesce(phone, '+918233334435'), manager_phone = coalesce(manager_phone, '+918233334435') where name in ('Pronite', 'JD Group HQ');

grant all on all tables in schema jdone to anon, authenticated, service_role;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- customer feedback + preferences (feed-forward)
alter table jdone.customers
  add column if not exists interests jsonb not null default '[]'::jsonb,
  add column if not exists budget text,
  add column if not exists taste jsonb not null default '[]'::jsonb;

create table if not exists jdone.feedback (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  customer_name text not null,
  phone text,
  customer_id uuid references jdone.customers(id) on delete set null,
  booking_id uuid references jdone.bookings(id) on delete set null,
  order_id uuid references jdone.orders(id) on delete set null,
  what text,
  date date,
  status text not null default 'Received' check (status in ('Requested','Received','Actioned')),
  rating integer check (rating between 1 and 5),
  mood text,
  liked jsonb not null default '[]'::jsonb,
  improve jsonb not null default '[]'::jsonb,
  comments text,
  would_recommend boolean,
  action_taken text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists feedback_unit_idx on jdone.feedback (business_unit_id, created_at desc);
drop trigger if exists set_updated_at on jdone.feedback;
create trigger set_updated_at before update on jdone.feedback for each row execute function jdone.set_updated_at();
alter table jdone.feedback enable row level security;
-- Ratings are network-wide (everyone sees scores to recommend well); comments are visible too so members learn.
drop policy if exists "staff read" on jdone.feedback;
create policy "staff read" on jdone.feedback for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.feedback;
create policy "staff insert" on jdone.feedback for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.feedback;
create policy "staff update" on jdone.feedback for update to authenticated using (jdone.is_staff() and jdone.can_access_unit(business_unit_id)) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.feedback;
create policy "owner delete" on jdone.feedback for delete to authenticated using (jdone.is_owner() and jdone.can_access_unit(business_unit_id));

grant all on all tables in schema jdone to anon, authenticated, service_role;
notify pgrst, 'reload schema';
