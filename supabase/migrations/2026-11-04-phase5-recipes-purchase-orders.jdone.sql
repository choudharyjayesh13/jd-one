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
