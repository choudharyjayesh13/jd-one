-- Kitchen stock + housekeeping inventory with a movement ledger:
-- purchases add stock, KOT / daily consumption reduce it, a count sets it. 7 Oct 2026.
alter table jdone.stock alter column quantity drop not null;
alter table jdone.stock alter column quantity drop default;
alter table jdone.stock add column if not exists category text not null default 'Kitchen';
alter table jdone.stock add column if not exists pack_size text;
alter table jdone.stock add column if not exists notes text;
alter table jdone.purchases add column if not exists stock_id uuid references jdone.stock(id) on delete set null;

create table if not exists jdone.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references jdone.stock(id) on delete cascade,
  date date not null default current_date,
  direction text not null check (direction in ('In','Out','Count')),
  quantity numeric(12,2) not null check (quantity >= 0),
  source text not null default 'Consumption',
  kot_id uuid references jdone.kots(id) on delete set null,
  purchase_id uuid references jdone.purchases(id) on delete cascade,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  staff_id uuid references jdone.staff(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists stock_movements_stock_idx on jdone.stock_movements (stock_id, date desc);

-- Keep stock.quantity in step with the ledger.
create or replace function jdone.apply_stock_movement() returns trigger language plpgsql security definer set search_path = jdone, public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.direction <> 'Count' then
    update jdone.stock set quantity = coalesce(quantity,0) - case when old.direction = 'In' then old.quantity else -old.quantity end where id = old.stock_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if new.direction = 'Count' then
      update jdone.stock set quantity = new.quantity, last_counted = new.date where id = new.stock_id;
    else
      update jdone.stock set quantity = coalesce(quantity,0) + case when new.direction = 'In' then new.quantity else -new.quantity end where id = new.stock_id;
    end if;
    update jdone.stock set low_stock = coalesce(quantity,0) <= coalesce(min_quantity,0) and quantity is not null where id = new.stock_id;
    return new;
  end if;
  return old;
end $$;
drop trigger if exists apply_stock_movement on jdone.stock_movements;
create trigger apply_stock_movement after insert or update or delete on jdone.stock_movements for each row execute function jdone.apply_stock_movement();

-- A purchase linked to a stock item adds it to stock (re-synced when the purchase changes).
create or replace function jdone.purchase_to_stock() returns trigger language plpgsql security definer set search_path = jdone, public as $$
begin
  delete from jdone.stock_movements where purchase_id = new.id;
  if new.stock_id is not null and coalesce(new.quantity,0) > 0 then
    insert into jdone.stock_movements (stock_id, date, direction, quantity, source, purchase_id, business_unit_id, staff_id, note)
    values (new.stock_id, new.date, 'In', new.quantity, 'Purchase', new.id, new.business_unit_id, new.bought_by, 'Purchase: ' || new.item);
  end if;
  return new;
end $$;
drop trigger if exists purchase_to_stock on jdone.purchases;
create trigger purchase_to_stock after insert or update of stock_id, quantity, date on jdone.purchases for each row execute function jdone.purchase_to_stock();

drop trigger if exists set_updated_at on jdone.stock_movements;
create trigger set_updated_at before update on jdone.stock_movements for each row execute function jdone.set_updated_at();
alter table jdone.stock_movements enable row level security;
drop policy if exists "staff read" on jdone.stock_movements;
create policy "staff read" on jdone.stock_movements for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.stock_movements;
create policy "staff insert" on jdone.stock_movements for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.stock_movements;
create policy "staff update" on jdone.stock_movements for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.stock_movements;
create policy "owner delete" on jdone.stock_movements for delete to authenticated using (jdone.is_owner());
grant all on jdone.stock_movements to authenticated, service_role;
notify pgrst, 'reload schema';
