-- JD One (5 Nov 2026): electricity meter readings (Maintenance) and payment details on vouchers.
-- Applied on 5 Nov 2026. Safe to run again.

-- Payment vouchers: proof of payment and how/why it was paid.
alter table jdone.vouchers add column if not exists bill_no text;
alter table jdone.vouchers add column if not exists paid_to_account text;
alter table jdone.vouchers add column if not exists payment_proof jsonb;
alter table jdone.vouchers add column if not exists paid_by uuid references jdone.staff(id) on delete set null;

-- Meter readings: one reading per meter per day, with a photo; units = this reading − the previous one.
create table if not exists jdone.meter_readings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  meter text not null default 'Main meter',
  reading numeric not null check (reading >= 0),
  units numeric,
  days integer,
  photo jsonb,
  recorded_by uuid references jdone.staff(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (business_unit_id, meter, date)
);
create index if not exists meter_readings_date_idx on jdone.meter_readings (business_unit_id, meter, date desc);

create or replace function jdone.meter_units() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare prev record;
begin
  select reading, date into prev from jdone.meter_readings
   where business_unit_id is not distinct from new.business_unit_id and meter = new.meter and date < new.date and id <> new.id
   order by date desc limit 1;
  if prev is null then new.units := null; new.days := null;
  else new.units := new.reading - prev.reading; new.days := new.date - prev.date; end if;
  return new;
end $$;
drop trigger if exists meter_units on jdone.meter_readings;
create trigger meter_units before insert or update of reading, date, meter, business_unit_id on jdone.meter_readings for each row execute function jdone.meter_units();

-- A reading added for an earlier day re-works the next day's units.
create or replace function jdone.meter_units_next() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare nxt uuid;
begin
  select id into nxt from jdone.meter_readings
   where business_unit_id is not distinct from new.business_unit_id and meter = new.meter and date > new.date
   order by date asc limit 1;
  if nxt is not null then update jdone.meter_readings set reading = reading where id = nxt; end if;
  return null;
end $$;
drop trigger if exists meter_units_next on jdone.meter_readings;
create trigger meter_units_next after insert or update of reading, date on jdone.meter_readings for each row execute function jdone.meter_units_next();

alter table jdone.meter_readings enable row level security;
drop policy if exists "staff read" on jdone.meter_readings;
create policy "staff read" on jdone.meter_readings for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.meter_readings;
create policy "staff insert" on jdone.meter_readings for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.meter_readings;
create policy "staff update" on jdone.meter_readings for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.meter_readings;
create policy "owner delete" on jdone.meter_readings for delete to authenticated using (jdone.is_owner());
drop trigger if exists set_updated_at on jdone.meter_readings;
create trigger set_updated_at before update on jdone.meter_readings for each row execute function jdone.set_updated_at();
drop trigger if exists zz_log_director_change on jdone.meter_readings;
create trigger zz_log_director_change after insert or update or delete on jdone.meter_readings for each row execute function jdone.log_director_change();
grant all on jdone.meter_readings to authenticated, service_role;

-- Starting point: the 31 Oct closing reading from the daily report.
insert into jdone.meter_readings (date, business_unit_id, meter, reading, photo, note)
select r.date, coalesce(r.business_unit_id, '71c3804a-5906-4328-9e3b-79555f65f035'::uuid), 'Main meter', r.electricity_closing, r.electricity_photo, 'Copied from the daily report'
from jdone.daily_reports r where r.date = '2026-10-31' and r.electricity_closing is not null
on conflict do nothing;

-- Vendor's UPI QR on payment vouchers (scan it to pay). Can be added after the voucher is saved.
alter table jdone.vouchers add column if not exists payee_qr jsonb;
drop trigger if exists zz_guard_locked_edit on jdone.vouchers;
create trigger zz_guard_locked_edit before update on jdone.vouchers for each row execute function jdone.guard_locked_edit('status','paid_on','mode','reference','payment_proof','paid_by','paid_to_account','notes','payee_qr');
