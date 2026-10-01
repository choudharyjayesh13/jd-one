-- JD One — migration 1 Oct 2026 (schema jdone): the owner network.
-- Three kinds of people: OWNERS (bring businesses), STAFF (work at a business), CUSTOMERS (use the
-- services, via the portal). Owners see only their own businesses; JD Group (network admin) sees all.
-- Idempotent; run once in the Supabase SQL editor AFTER 2026-09-30-property-ops.jdone.sql.

-- ---------------------------------------------------------------- owners
create table if not exists jdone.owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text unique,
  city text,
  kind text not null default 'Individual',
  network_admin boolean not null default false,
  active boolean not null default true,
  auth_user_id uuid unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
drop trigger if exists set_updated_at on jdone.owners;
create trigger set_updated_at before update on jdone.owners for each row execute function jdone.set_updated_at();

alter table jdone.business_units add column if not exists owner_id uuid references jdone.owners(id) on delete set null;
create index if not exists business_units_owner_idx on jdone.business_units (owner_id);

alter table jdone.customers add column if not exists auth_user_id uuid unique;

alter table jdone.signup_requests
  add column if not exists kind text not null default 'staff' check (kind in ('owner','staff','customer')),
  add column if not exists business_name text,
  add column if not exists business_type text,
  add column if not exists city text;

-- ---------------------------------------------------------------- who am I on the network
create or replace function jdone.current_owner_id() returns uuid
language sql stable security definer set search_path = jdone, public as $$
  select id from jdone.owners where auth_user_id = auth.uid() and active limit 1
$$;

-- Network admin = an owner flagged network_admin. Fallback for the time before owners are linked:
-- an owner-role staff member with NO owner record at all behaves as admin (keeps JD Group working).
create or replace function jdone.is_network_admin() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select coalesce(
    (select network_admin from jdone.owners where auth_user_id = auth.uid() and active limit 1),
    (jdone.current_staff_role() = 'owner' and not exists (select 1 from jdone.owners where auth_user_id = auth.uid()))
  )
$$;

-- Business units I may see: the ones I own, plus the one I work at.
create or replace function jdone.my_unit_ids() returns setof uuid
language sql stable security definer set search_path = jdone, public as $$
  select id from jdone.business_units where owner_id = jdone.current_owner_id()
  union
  select business_unit_id from jdone.staff where auth_user_id = auth.uid() and active and business_unit_id is not null
$$;

create or replace function jdone.can_access_unit(u uuid) returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select jdone.is_network_admin() or u is null or u in (select jdone.my_unit_ids())
$$;

grant execute on function jdone.current_owner_id(), jdone.is_network_admin(), jdone.my_unit_ids(), jdone.can_access_unit(uuid) to authenticated, anon, service_role;

-- Link owners to their logins by email at sign-up (alongside staff).
create or replace function jdone.link_staff_on_signup() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
begin
  update jdone.staff set auth_user_id = new.id
   where auth_user_id is null and email is not null and lower(email) = lower(new.email);
  update jdone.owners set auth_user_id = new.id
   where auth_user_id is null and email is not null and lower(email) = lower(new.email);
  return new;
end $$;

-- ---------------------------------------------------------------- row level security: per-owner isolation
-- Tables that carry business_unit_id are visible only inside the units the user may access.
do $$
declare t text;
begin
  foreach t in array array['staff','leads','bookings','daily_reports','expenses','stock','tasks','targets','candidates','tickets','investments','rooms','rates','promotions','payment_requests','housekeeping_reports','petty_cash','add_ons','unit_types']
  loop
    execute format('alter table jdone.%I enable row level security', t);
    execute format('drop policy if exists "staff read" on jdone.%I', t);
    execute format('create policy "staff read" on jdone.%I for select to authenticated using (jdone.is_staff() and jdone.can_access_unit(business_unit_id))', t);
    execute format('drop policy if exists "staff insert" on jdone.%I', t);
    execute format('create policy "staff insert" on jdone.%I for insert to authenticated with check (jdone.is_staff() and jdone.can_access_unit(business_unit_id))', t);
    execute format('drop policy if exists "staff update" on jdone.%I', t);
    execute format('create policy "staff update" on jdone.%I for update to authenticated using (jdone.is_staff() and jdone.can_access_unit(business_unit_id)) with check (jdone.is_staff() and jdone.can_access_unit(business_unit_id))', t);
    execute format('drop policy if exists "owner delete" on jdone.%I', t);
    execute format('create policy "owner delete" on jdone.%I for delete to authenticated using (jdone.is_owner() and jdone.can_access_unit(business_unit_id))', t);
  end loop;
end $$;

-- A staff member may always read their own staff row (needed to sign in even before unit links exist).
drop policy if exists "own staff row" on jdone.staff;
create policy "own staff row" on jdone.staff for select to authenticated using (auth_user_id = auth.uid());

-- business_units: visible if accessible; owners/managers edit their own; admins everything.
alter table jdone.business_units enable row level security;
drop policy if exists "staff read" on jdone.business_units;
create policy "staff read" on jdone.business_units for select to authenticated using (jdone.is_staff() and jdone.can_access_unit(id));
drop policy if exists "staff insert" on jdone.business_units;
create policy "staff insert" on jdone.business_units for insert to authenticated with check (jdone.is_network_admin() or owner_id = jdone.current_owner_id());
drop policy if exists "staff update" on jdone.business_units;
create policy "staff update" on jdone.business_units for update to authenticated using (jdone.is_staff() and jdone.can_access_unit(id)) with check (jdone.is_staff() and jdone.can_access_unit(id));
drop policy if exists "owner delete" on jdone.business_units;
create policy "owner delete" on jdone.business_units for delete to authenticated using (jdone.is_network_admin());

-- owners: see yourself; network admins see and manage everyone.
alter table jdone.owners enable row level security;
drop policy if exists "owner read" on jdone.owners;
create policy "owner read" on jdone.owners for select to authenticated using (auth_user_id = auth.uid() or jdone.is_network_admin());
drop policy if exists "owner insert" on jdone.owners;
create policy "owner insert" on jdone.owners for insert to authenticated with check (jdone.is_network_admin());
drop policy if exists "owner update" on jdone.owners;
create policy "owner update" on jdone.owners for update to authenticated using (auth_user_id = auth.uid() or jdone.is_network_admin()) with check (auth_user_id = auth.uid() or jdone.is_network_admin());
drop policy if exists "owner delete" on jdone.owners;
create policy "owner delete" on jdone.owners for delete to authenticated using (jdone.is_network_admin());

-- customers: a signed-in customer may read their own record (portal); staff rules unchanged (shared network identity by phone).
drop policy if exists "customer read own" on jdone.customers;
create policy "customer read own" on jdone.customers for select to authenticated using (auth_user_id = auth.uid());

-- signup_requests: owners/managers/HR of any unit may approve (owner approves their own staff; JD Group approves owners).
-- (existing policies use is_hr_admin(); unchanged.)

-- ---------------------------------------------------------------- seed: the first two owners and their businesses
insert into jdone.owners (name, phone, email, city, kind, network_admin)
select 'Jayesh Choudhary', '+918233334435', 'choudhary.jayesh13@gmail.com', 'Udaipur', 'Individual', true
where not exists (select 1 from jdone.owners where email = 'choudhary.jayesh13@gmail.com');

insert into jdone.owners (name, city, kind, network_admin, notes)
select 'Kelaas Choudhary', 'Chittorgarh', 'Individual', false, 'Jayesh''s father — BPCL petrol pumps + Hotel Kirti Plaza, Chittorgarh. Add email/phone to let him sign in.'
where not exists (select 1 from jdone.owners where name = 'Kelaas Choudhary');

-- Link Jayesh's owner record to his existing login (by staff email or by auth email).
update jdone.owners o set auth_user_id = coalesce(
  (select s.auth_user_id from jdone.staff s where s.role = 'owner' and s.auth_user_id is not null and lower(s.email) = lower(o.email) limit 1),
  (select u.id from auth.users u where lower(u.email) = lower(o.email) limit 1)
) where o.email = 'choudhary.jayesh13@gmail.com' and o.auth_user_id is null;

-- Father's businesses.
insert into jdone.business_units (name, short_code, type, city, active)
select v.name, v.short_code, v.type, v.city, true
from (values
  ('BPCL Petrol Pump', 'BPCL', 'Fuel station', 'Chittorgarh'),
  ('BPCL Petrol Pump – Badi Sadi', 'BPBS', 'Fuel station', 'Badi Sadi')
) as v(name, short_code, type, city)
on conflict (name) do nothing;
update jdone.business_units set city = 'Chittorgarh' where name = 'Hotel Kirti Plaza' and (city is null or city = 'Udaipur');

-- Ownership links (only where not already set).
update jdone.business_units set owner_id = (select id from jdone.owners where name = 'Kelaas Choudhary')
 where owner_id is null and name in ('Hotel Kirti Plaza', 'BPCL Petrol Pump', 'BPCL Petrol Pump – Badi Sadi');
update jdone.business_units set owner_id = (select id from jdone.owners where email = 'choudhary.jayesh13@gmail.com')
 where owner_id is null and name in ('The Udaisarovar', 'Pronite', 'CPC – Choudhary Properties & Consultancy', 'JD Group HQ', 'The Artist House', 'House of Beauty');

grant all on all tables in schema jdone to anon, authenticated, service_role;
grant all on all sequences in schema jdone to anon, authenticated, service_role;
