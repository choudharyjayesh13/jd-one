-- JD One — repair contacts (carpenter, AC, electrician…) + ticket → chosen contact. 7 Oct 2026.
create table if not exists jdone.service_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade text not null default 'Other',
  phone text,
  area text,
  rating numeric(2,1),
  visit_charge text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists service_vendors_trade_idx on jdone.service_vendors (trade, active);
alter table jdone.tickets add column if not exists vendor_id uuid references jdone.service_vendors(id) on delete set null;
drop trigger if exists set_updated_at on jdone.service_vendors;
create trigger set_updated_at before update on jdone.service_vendors for each row execute function jdone.set_updated_at();
alter table jdone.service_vendors enable row level security;
drop policy if exists "staff read" on jdone.service_vendors;
create policy "staff read" on jdone.service_vendors for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.service_vendors;
create policy "staff insert" on jdone.service_vendors for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.service_vendors;
create policy "staff update" on jdone.service_vendors for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.service_vendors;
create policy "owner delete" on jdone.service_vendors for delete to authenticated using (jdone.is_owner());
grant all on jdone.service_vendors to authenticated, service_role;
notify pgrst, 'reload schema';
