-- JD One: WhatsApp/AsiaTech history import, salary payments, vendors, monthly targets, money-table privacy. 7 Oct 2026.

-- Who may see money (expenses, salaries paid, vendor payments): owner, managers, accounts, finance.
create or replace function jdone.is_money_admin() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select coalesce(jdone.current_staff_role() in ('owner','manager','accounts','finance'), false)
$$;
grant execute on function jdone.is_money_admin() to authenticated;

-- Expenses: any staff may still add one, but only money admins can read/edit them.
drop policy if exists "staff read" on jdone.expenses;
create policy "money read" on jdone.expenses for select to authenticated using (jdone.is_money_admin());
drop policy if exists "staff update" on jdone.expenses;
drop policy if exists "money update" on jdone.expenses;
create policy "money update" on jdone.expenses for update to authenticated using (jdone.is_money_admin()) with check (jdone.is_money_admin());
alter table jdone.expenses add column if not exists source_ref text;
create unique index if not exists expenses_source_ref_key on jdone.expenses (source_ref) where source_ref is not null;

-- Salary payments actually paid (history from the Accounts WhatsApp group onward).
create table if not exists jdone.salary_payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references jdone.staff(id) on delete set null,
  staff_name text not null,
  salary_month text check (salary_month ~ '^\d{4}-\d{2}$'),
  date date not null default current_date,
  amount numeric(12,2) not null,
  kind text not null default 'Salary',
  mode text,
  notes text,
  source_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists salary_payments_month_idx on jdone.salary_payments (salary_month, staff_name);

-- Vendors we pay (suppliers, utilities, contractors). Repair contacts stay in service_vendors.
create table if not exists jdone.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text,
  category text not null default 'Other',
  supplies text,
  payment_details text,
  payments_count integer,
  total_paid numeric(12,2),
  first_paid date,
  last_paid date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

do $$ declare t text; begin
  foreach t in array array['salary_payments','vendors'] loop
    execute format('drop trigger if exists set_updated_at on jdone.%I', t);
    execute format('create trigger set_updated_at before update on jdone.%I for each row execute function jdone.set_updated_at()', t);
    execute format('alter table jdone.%I enable row level security', t);
    execute format('drop policy if exists "money all" on jdone.%I', t);
    execute format('create policy "money all" on jdone.%I for all to authenticated using (jdone.is_money_admin()) with check (jdone.is_money_admin())', t);
    execute format('grant all on jdone.%I to authenticated, service_role', t);
  end loop;
end $$;
drop policy if exists "own salary read" on jdone.salary_payments;
create policy "own salary read" on jdone.salary_payments for select to authenticated
  using (staff_id in (select s.id from jdone.staff s where s.auth_user_id = auth.uid()));

-- Rooms per unit + monthly occupancy / ADR targets.
alter table jdone.business_units add column if not exists rooms integer;
update jdone.business_units set rooms = 5 where short_code = 'UDS' and rooms is null;
alter table jdone.targets add column if not exists occupancy_target numeric(5,2) default 70;
alter table jdone.targets add column if not exists adr_target numeric(12,2);

-- Leads / bookings imported from WhatsApp keep a stable reference so re-runs do not duplicate.
alter table jdone.bookings add column if not exists import_source text;

-- Customers without a phone used a JDC placeholder; switch it to their JDG number.
update jdone.customers set phone = customer_no where phone like 'JDC%' and customer_no is not null;
notify pgrst, 'reload schema';
