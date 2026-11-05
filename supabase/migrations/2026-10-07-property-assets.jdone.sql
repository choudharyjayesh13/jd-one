-- Property assets register (furniture, equipment, kitchen, linen, bar stock) with photos per item. 7 Oct 2026.
create table if not exists jdone.property_assets (
  id uuid primary key default gen_random_uuid(),
  item_no integer,
  name text not null,
  category text not null default 'Other',
  quantity numeric(12,2) not null default 1,
  unit text default 'pcs',
  condition text not null default 'Good',
  location text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  photos jsonb not null default '[]'::jsonb,
  purchase_date date,
  value numeric(12,2),
  last_checked date default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists property_assets_unit_idx on jdone.property_assets (business_unit_id, item_no);
drop trigger if exists set_updated_at on jdone.property_assets;
create trigger set_updated_at before update on jdone.property_assets for each row execute function jdone.set_updated_at();
alter table jdone.property_assets enable row level security;
drop policy if exists "staff read" on jdone.property_assets;
create policy "staff read" on jdone.property_assets for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.property_assets;
create policy "staff insert" on jdone.property_assets for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.property_assets;
create policy "staff update" on jdone.property_assets for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.property_assets;
create policy "owner delete" on jdone.property_assets for delete to authenticated using (jdone.is_owner());
grant all on jdone.property_assets to authenticated, service_role;
notify pgrst, 'reload schema';
