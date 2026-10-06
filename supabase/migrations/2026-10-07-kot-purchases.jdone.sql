-- JD One — KOT (kitchen order tickets) + Purchases (daily / weekly / monthly buying). 7 Oct 2026.
create sequence if not exists jdone.kot_no_seq start 1001;
create table if not exists jdone.kots (
  id uuid primary key default gen_random_uuid(),
  kot_no text not null default ('KOT-' || nextval('jdone.kot_no_seq')::text),
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  order_type text not null default 'Table',
  table_or_room text,
  guest_name text,
  booking_id uuid references jdone.bookings(id) on delete set null,
  pax integer,
  items text not null,
  special_notes text,
  status text not null default 'New' check (status in ('New','Preparing','Ready','Served','Billed','Cancelled')),
  amount numeric(12,2),
  taken_by uuid references jdone.staff(id) on delete set null,
  served_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists kots_status_idx on jdone.kots (status, created_at desc);

create table if not exists jdone.purchases (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  frequency text not null default 'Daily' check (frequency in ('Daily','Weekly','Monthly','One-time')),
  category text not null default 'Other',
  item text not null,
  quantity numeric(12,2),
  unit text,
  rate numeric(12,2),
  amount numeric(12,2) not null,
  vendor text,
  payment_mode text default 'Cash',
  bought_by uuid references jdone.staff(id) on delete set null,
  bill_photo text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists purchases_date_idx on jdone.purchases (date desc);

do $$ declare t text; begin
  foreach t in array array['kots','purchases'] loop
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
    execute format('grant all on jdone.%I to authenticated, service_role', t);
  end loop;
end $$;
grant usage, select on sequence jdone.kot_no_seq to authenticated, service_role;
notify pgrst, 'reload schema';
