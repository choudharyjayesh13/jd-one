-- JD One (4 Nov 2026): HR → Leave requests. Any employee asks for a weekly off, monthly off,
-- leave, half day or emergency leave with a reason; HR, the Property Supervisor, the Director
-- or the Chairman approves or rejects it. Nobody approves their own request. Safe to run again.

create table if not exists jdone.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  kind text not null check (kind in ('Weekly off', 'Monthly off', 'Leave', 'Half day', 'Emergency')),
  date_from date not null,
  date_to date not null,
  days numeric not null default 1,
  reason text not null check (length(trim(reason)) >= 3),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  decided_by uuid references jdone.staff(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  check (date_to >= date_from)
);
create index if not exists leave_requests_staff_idx on jdone.leave_requests (staff_id, date_from desc);
create index if not exists leave_requests_status_idx on jdone.leave_requests (status, date_from);

create or replace function jdone.my_staff_id() returns uuid
language sql stable security definer set search_path = jdone, public as $$
  select id from jdone.staff where auth_user_id = auth.uid() limit 1
$$;

-- Who may approve: HR, the Property Supervisor, the Director, the Chairman.
create or replace function jdone.is_leave_approver() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select coalesce(jdone.current_staff_role() = 'hr', false) or jdone.is_access_admin() or jdone.is_property_supervisor()
$$;

-- Rules for every change, whatever the screen.
create or replace function jdone.guard_leave_request() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare me uuid := jdone.my_staff_id();
begin
  if auth.uid() is null then return new; end if; -- server / SQL editor
  if tg_op = 'INSERT' then
    if new.staff_id is distinct from me and not jdone.is_leave_approver() then
      raise exception 'You can only ask leave for yourself.';
    end if;
    new.status := 'Pending'; new.decided_by := null; new.decided_at := null; new.decision_note := null;
    return new;
  end if;
  -- UPDATE
  if new.status is distinct from old.status and new.status in ('Approved', 'Rejected') then
    if not jdone.is_leave_approver() then
      raise exception 'Only HR, the Property Supervisor, the Director or the Chairman can approve leave.';
    end if;
    if old.staff_id = me and not jdone.is_chairman() then
      raise exception 'You cannot approve your own leave.';
    end if;
    new.decided_by := me; new.decided_at := now();
    return new;
  end if;
  if old.staff_id = me and not jdone.is_leave_approver() then
    if old.status <> 'Pending' then raise exception 'This request has already been decided.'; end if;
    if new.status not in ('Pending', 'Cancelled') then raise exception 'Not allowed.'; end if;
    if new.staff_id <> old.staff_id or new.decided_by is distinct from old.decided_by then raise exception 'Not allowed.'; end if;
    return new;
  end if;
  if not jdone.is_leave_approver() then raise exception 'Not allowed.'; end if;
  return new;
end $$;
drop trigger if exists guard_leave_request on jdone.leave_requests;
create trigger guard_leave_request before insert or update on jdone.leave_requests for each row execute function jdone.guard_leave_request();

alter table jdone.leave_requests enable row level security;
drop policy if exists "own or approver read" on jdone.leave_requests;
create policy "own or approver read" on jdone.leave_requests for select to authenticated
  using (jdone.is_staff() and (staff_id = jdone.my_staff_id() or jdone.is_leave_approver() or jdone.is_hr_admin()));
drop policy if exists "staff ask" on jdone.leave_requests;
create policy "staff ask" on jdone.leave_requests for insert to authenticated with check (jdone.is_staff());
drop policy if exists "own or approver update" on jdone.leave_requests;
create policy "own or approver update" on jdone.leave_requests for update to authenticated
  using (jdone.is_staff() and (staff_id = jdone.my_staff_id() or jdone.is_leave_approver()))
  with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.leave_requests;
create policy "owner delete" on jdone.leave_requests for delete to authenticated using (jdone.is_owner());
drop trigger if exists set_updated_at on jdone.leave_requests;
create trigger set_updated_at before update on jdone.leave_requests for each row execute function jdone.set_updated_at();
grant all on jdone.leave_requests to authenticated, service_role;
grant execute on function jdone.my_staff_id(), jdone.is_leave_approver() to authenticated;
