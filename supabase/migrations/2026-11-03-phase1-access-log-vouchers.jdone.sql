-- JD One phase 1 (3 Nov 2026), for JD Stays & Hospitality → The Udaisarovar:
--   1. Posts: Chairman and Director. Access belongs to the post, not the person.
--   2. Team access: department modules per staff member, level 0 No access · 1 View · 2 Edit · 3 Manage.
--   3. Director changes: everything the Director creates, edits or deletes is logged for the Chairman.
--   4. Vouchers: a numbered voucher for every payment received (RV) and every expense paid (PV),
--      posted to the JD Stays & Hospitality ledger.
-- Run once in Supabase → SQL Editor. Safe to run again. Changes no existing data.

-- ---------------------------------------------------------------- helpers
create or replace function jdone.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- ---------------------------------------------------------------- 1. posts
create table if not exists jdone.org_posts (
  id uuid primary key default gen_random_uuid(),
  post text not null unique check (post in ('chairman', 'director')),
  holder_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

-- Chairman's login email is filled in later (see the last line of this file).
insert into jdone.org_posts (post, holder_name, email) values
  ('chairman', 'Jayesh Choudhary', null),
  ('director', 'Akshayraj S. Chanchodi', 'akshaychanchori@gmail.com')
on conflict (post) do nothing;

create or replace function jdone.is_director() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select exists (
    select 1 from jdone.org_posts
    where post = 'director' and email is not null and lower(email) = jdone.current_email() and jdone.current_email() <> ''
  )
$$;

-- Until the Chairman's email is set, the owner account (that is not the Director) acts as Chairman.
create or replace function jdone.is_chairman() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select case
    when exists (select 1 from jdone.org_posts where post = 'chairman' and email is not null)
      then exists (select 1 from jdone.org_posts where post = 'chairman' and lower(email) = jdone.current_email() and jdone.current_email() <> '')
    else coalesce(jdone.current_staff_role() = 'owner', false) and not jdone.is_director()
  end
$$;

create or replace function jdone.is_access_admin() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select jdone.is_chairman() or jdone.is_director()
$$;

alter table jdone.org_posts enable row level security;
drop policy if exists "staff read" on jdone.org_posts;
create policy "staff read" on jdone.org_posts for select to authenticated using (jdone.is_staff());
drop policy if exists "chairman write" on jdone.org_posts;
create policy "chairman write" on jdone.org_posts for update to authenticated using (jdone.is_chairman()) with check (jdone.is_chairman());

-- ---------------------------------------------------------------- 2. team access
create table if not exists jdone.staff_access (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  module text not null,
  level smallint not null default 0 check (level between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (staff_id, module)
);
create index if not exists staff_access_staff_idx on jdone.staff_access (staff_id);

alter table jdone.staff_access enable row level security;
drop policy if exists "staff read" on jdone.staff_access;
create policy "staff read" on jdone.staff_access for select to authenticated using (jdone.is_staff());
drop policy if exists "admin insert" on jdone.staff_access;
create policy "admin insert" on jdone.staff_access for insert to authenticated with check (jdone.is_access_admin());
drop policy if exists "admin update" on jdone.staff_access;
create policy "admin update" on jdone.staff_access for update to authenticated using (jdone.is_access_admin()) with check (jdone.is_access_admin());
drop policy if exists "admin delete" on jdone.staff_access;
create policy "admin delete" on jdone.staff_access for delete to authenticated using (jdone.is_access_admin());

-- ---------------------------------------------------------------- 3. director changes
create table if not exists jdone.change_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_email text,
  actor_post text,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after jsonb,
  seen boolean not null default false,
  undone_at timestamptz,
  undone_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists change_log_at_idx on jdone.change_log (at desc);

alter table jdone.change_log enable row level security;
drop policy if exists "chairman read" on jdone.change_log;
create policy "chairman read" on jdone.change_log for select to authenticated using (jdone.is_chairman());
drop policy if exists "chairman update" on jdone.change_log;
create policy "chairman update" on jdone.change_log for update to authenticated using (jdone.is_chairman()) with check (jdone.is_chairman());
-- No insert/delete policy: rows are written only by the trigger below and are never deleted from the app.

create or replace function jdone.log_director_change() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if not jdone.is_director() then return null; end if;
  -- ignore saves that only touched updated_at
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then return null; end if;
  insert into jdone.change_log (actor_email, actor_post, table_name, record_id, action, before, after)
  values (jdone.current_email(), 'director', tg_table_name, coalesce(n ->> 'id', o ->> 'id'), tg_op, o, n);
  return null;
end $$;

-- Every table in the jdone schema except the log itself and the voucher counter.
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'jdone' and table_type = 'BASE TABLE' and table_name not in ('change_log', 'voucher_counters')
  loop
    execute format('drop trigger if exists zz_log_director_change on jdone.%I', t);
    execute format('create trigger zz_log_director_change after insert or update or delete on jdone.%I for each row execute function jdone.log_director_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 4. vouchers
create table if not exists jdone.vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text unique,
  vtype text not null check (vtype in ('RV', 'PV')),
  date date not null default current_date,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  ledger text not null default 'JD Stays & Hospitality',
  party text,
  against text,
  source_table text,
  source_id uuid,
  mode text,
  reference text,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'To pay' check (status in ('Received', 'To pay', 'Paid', 'Cancelled')),
  paid_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create unique index if not exists vouchers_source_uidx on jdone.vouchers (source_table, source_id) where source_id is not null;
create index if not exists vouchers_date_idx on jdone.vouchers (date desc);

create table if not exists jdone.voucher_counters (
  prefix text primary key,
  last_no integer not null default 0
);
alter table jdone.voucher_counters enable row level security; -- only the numbering function touches it

-- Number = <unit code>/<RV|PV>/<financial year>/<0001>, e.g. UDS/RV/26-27/0148. Restarts every 1 April.
create or replace function jdone.assign_voucher_no() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  code text;
  fy int;
  pre text;
  n int;
begin
  if new.voucher_no is not null and new.voucher_no <> '' then return new; end if;
  select coalesce(nullif(short_code, ''), 'JD') into code from jdone.business_units where id = new.business_unit_id;
  code := coalesce(code, 'JD');
  fy := case when extract(month from new.date) >= 4 then extract(year from new.date)::int else extract(year from new.date)::int - 1 end;
  pre := code || '/' || new.vtype || '/' || lpad((fy % 100)::text, 2, '0') || '-' || lpad(((fy + 1) % 100)::text, 2, '0');
  insert into jdone.voucher_counters (prefix, last_no) values (pre, 1)
  on conflict (prefix) do update set last_no = jdone.voucher_counters.last_no + 1
  returning last_no into n;
  new.voucher_no := pre || '/' || lpad(n::text, 4, '0');
  return new;
end $$;
drop trigger if exists assign_voucher_no on jdone.vouchers;
create trigger assign_voucher_no before insert on jdone.vouchers for each row execute function jdone.assign_voucher_no();

drop trigger if exists set_updated_at on jdone.vouchers;
create trigger set_updated_at before update on jdone.vouchers for each row execute function jdone.set_updated_at();
drop trigger if exists set_updated_at on jdone.staff_access;
create trigger set_updated_at before update on jdone.staff_access for each row execute function jdone.set_updated_at();
drop trigger if exists set_updated_at on jdone.org_posts;
create trigger set_updated_at before update on jdone.org_posts for each row execute function jdone.set_updated_at();
drop trigger if exists set_updated_at on jdone.change_log;
create trigger set_updated_at before update on jdone.change_log for each row execute function jdone.set_updated_at();

alter table jdone.vouchers enable row level security;
drop policy if exists "staff read" on jdone.vouchers;
create policy "staff read" on jdone.vouchers for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.vouchers;
create policy "staff insert" on jdone.vouchers for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.vouchers;
create policy "staff update" on jdone.vouchers for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.vouchers;
create policy "owner delete" on jdone.vouchers for delete to authenticated using (jdone.is_owner());

-- Payment received against a booking → Receipt voucher (RV).
create or replace function jdone.payment_voucher() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare b record;
begin
  if tg_op = 'DELETE' then
    update jdone.vouchers set status = 'Cancelled', notes = coalesce(notes || ' · ', '') || 'Payment deleted' where source_table = 'payments' and source_id = old.id;
    return old;
  end if;
  select guest_name, business_unit_id into b from jdone.bookings where id = new.booking_id;
  if tg_op = 'INSERT' then
    insert into jdone.vouchers (vtype, date, business_unit_id, party, against, source_table, source_id, mode, reference, amount, status, paid_on, created_by)
    values ('RV', new.date, b.business_unit_id, coalesce(b.guest_name, 'Guest'), 'Booking payment' || coalesce(' · ' || b.guest_name, ''),
            'payments', new.id, new.mode, new.reference, new.amount, 'Received', new.date, new.created_by)
    on conflict do nothing;
  else
    update jdone.vouchers set date = new.date, amount = new.amount, mode = new.mode, reference = new.reference, paid_on = new.date
    where source_table = 'payments' and source_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists payment_voucher on jdone.payments;
create trigger payment_voucher after insert or update or delete on jdone.payments for each row execute function jdone.payment_voucher();

-- Expense paid → Payment voucher (PV), already paid.
create or replace function jdone.expense_voucher() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
begin
  if tg_op = 'DELETE' then
    update jdone.vouchers set status = 'Cancelled', notes = coalesce(notes || ' · ', '') || 'Expense deleted' where source_table = 'expenses' and source_id = old.id;
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into jdone.vouchers (vtype, date, business_unit_id, party, against, source_table, source_id, mode, amount, status, paid_on, created_by)
    values ('PV', new.date, new.business_unit_id, new.vendor, 'Expense · ' || new.category || coalesce(' · ' || nullif(new.detail, ''), ''),
            'expenses', new.id, new.mode, new.amount, 'Paid', new.date, new.created_by)
    on conflict do nothing;
  else
    update jdone.vouchers set date = new.date, amount = new.amount, mode = new.mode, party = new.vendor, business_unit_id = new.business_unit_id,
      against = 'Expense · ' || new.category || coalesce(' · ' || nullif(new.detail, ''), ''), paid_on = new.date
    where source_table = 'expenses' and source_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists expense_voucher on jdone.expenses;
create trigger expense_voucher after insert or update or delete on jdone.expenses for each row execute function jdone.expense_voucher();

-- ---------------------------------------------------------------- grants (same as the rest of the schema)
grant all on jdone.org_posts, jdone.staff_access, jdone.change_log, jdone.vouchers, jdone.voucher_counters to authenticated, service_role;
grant execute on function jdone.current_email(), jdone.is_director(), jdone.is_chairman(), jdone.is_access_admin() to authenticated, service_role;

-- Realtime: the Chairman's bell updates live when the Director changes something.
do $$ begin
  begin alter publication supabase_realtime add table jdone.change_log; exception when others then null; end;
  begin alter publication supabase_realtime add table jdone.vouchers; exception when others then null; end;
end $$;

-- When the Chairman's login email is known, run this one line (put the real email):
--   update jdone.org_posts set email = 'chairman-login@example.com' where post = 'chairman';
