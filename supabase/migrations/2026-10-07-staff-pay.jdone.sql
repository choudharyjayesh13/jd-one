-- JD One — private pay: each person sees only their own salary; owner/manager/HR see all. 7 Oct 2026.
create table if not exists jdone.staff_pay (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references jdone.staff(id) on delete cascade,
  monthly_salary numeric(12,2),
  role_in_plan text,
  pay_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
drop trigger if exists set_updated_at on jdone.staff_pay;
create trigger set_updated_at before update on jdone.staff_pay for each row execute function jdone.set_updated_at();
alter table jdone.staff_pay enable row level security;
drop policy if exists "own or hr read" on jdone.staff_pay;
create policy "own or hr read" on jdone.staff_pay for select to authenticated
  using (jdone.is_hr_admin() or staff_id in (select s.id from jdone.staff s where s.auth_user_id = auth.uid()));
drop policy if exists "hr write" on jdone.staff_pay;
create policy "hr write" on jdone.staff_pay for all to authenticated using (jdone.is_hr_admin()) with check (jdone.is_hr_admin());
grant all on jdone.staff_pay to authenticated, service_role;
-- move any salary off the (all-staff-readable) staff table
insert into jdone.staff_pay (staff_id, monthly_salary, pay_note)
  select id, salary, 'moved from staff record' from jdone.staff where salary is not null
  on conflict (staff_id) do nothing;
update jdone.staff set salary = null where salary is not null;
notify pgrst, 'reload schema';
