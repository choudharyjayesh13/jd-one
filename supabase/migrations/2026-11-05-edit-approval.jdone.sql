-- JD One (5 Nov 2026): entries are final once made. Changing a voucher, payment, expense, bill …
-- needs the Director's or Chairman's approval (an edit request); workflow fields (status, proof
-- photos, notes) can still be filled in. Applied on 5 Nov 2026. Safe to run again.

create table if not exists jdone.edit_requests (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  record_id uuid not null,
  record_label text,
  changes jsonb not null default '[]'::jsonb,
  patch jsonb not null default '{}'::jsonb,
  reason text not null check (length(trim(reason)) >= 3),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  requested_by uuid references jdone.staff(id) on delete set null,
  decided_by uuid references jdone.staff(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists edit_requests_status_idx on jdone.edit_requests (status, created_at desc);
create index if not exists edit_requests_record_idx on jdone.edit_requests (record_id);
alter table jdone.edit_requests enable row level security;
drop policy if exists "own or approver read" on jdone.edit_requests;
create policy "own or approver read" on jdone.edit_requests for select to authenticated using (jdone.is_staff() and (requested_by = jdone.my_staff_id() or jdone.is_access_admin()));
drop policy if exists "staff ask" on jdone.edit_requests;
create policy "staff ask" on jdone.edit_requests for insert to authenticated with check (jdone.is_staff() and status = 'Pending');
drop policy if exists "approver or own cancel" on jdone.edit_requests;
create policy "approver or own cancel" on jdone.edit_requests for update to authenticated
  using (jdone.is_access_admin() or (requested_by = jdone.my_staff_id() and status = 'Pending'))
  with check (jdone.is_access_admin() or status in ('Pending', 'Cancelled'));
drop trigger if exists set_updated_at on jdone.edit_requests;
create trigger set_updated_at before update on jdone.edit_requests for each row execute function jdone.set_updated_at();
grant all on jdone.edit_requests to authenticated, service_role;

-- Blocks changes to anything but the listed columns, except for the Chairman / Director.
create or replace function jdone.guard_locked_edit() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
begin
  if auth.uid() is null or jdone.is_access_admin() then return new; end if;
  o := o - 'updated_at'; n := n - 'updated_at';
  if tg_nargs > 0 then
    foreach k in array tg_argv loop o := o - k; n := n - k; end loop;
  end if;
  if o is distinct from n then
    raise exception 'LOCKED: This entry is final. Send the change to the Director or Chairman for approval.';
  end if;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('vouchers', $a$'status','paid_on','mode','reference','payment_proof','paid_by','paid_to_account','notes','payee_qr'$a$),
    ('payments', $a$'notes'$a$),
    ('expenses', $a$'receipt','source_ref'$a$),
    ('petty_cash', $a$'receipt','notes','payment_id'$a$),
    ('purchases', $a$'bill_photo','notes','stock_id'$a$),
    ('salary_payments', $a$'notes','source_ref'$a$),
    ('payment_requests', $a$'status','sent_at','paid_at','payment_id','upi_link','notes'$a$),
    ('kots', $a$'status','served_at','printed_at','stock_deducted','special_notes'$a$),
    ('daily_reports', $a$'remarks','electricity_photo','sales_total','electricity_units'$a$),
    ('purchase_orders', $a$'status','received_on','notes'$a$),
    ('checkins', $a$'actual_out','notes'$a$),
    ('meter_readings', $a$'photo','note','units','days'$a$)
  ) as t(tbl, args) loop
    execute format('drop trigger if exists zz_guard_locked_edit on jdone.%I', r.tbl);
    execute format('create trigger zz_guard_locked_edit before update on jdone.%I for each row execute function jdone.guard_locked_edit(%s)', r.tbl, r.args);
  end loop;
end $$;
