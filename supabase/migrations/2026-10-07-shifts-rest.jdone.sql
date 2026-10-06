-- JD One — two shifts per day + leader-assigned rest time. 7 Oct 2026.
alter table jdone.staff
  add column if not exists shift1_start text default '08:00', add column if not exists shift1_end text default '14:00',
  add column if not exists shift2_start text default '17:00', add column if not exists shift2_end text default '22:00';
update jdone.staff set shift1_start = coalesce(shift1_start,'08:00'), shift1_end = coalesce(shift1_end,'14:00'), shift2_start = coalesce(shift2_start,'17:00'), shift2_end = coalesce(shift2_end,'22:00');
alter table jdone.attendance
  add column if not exists shift2_in_at timestamptz, add column if not exists shift2_out_at timestamptz,
  add column if not exists selfie_shift2_in text, add column if not exists selfie_shift2_out text;
create table if not exists jdone.rest_periods (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  date date not null default current_date,
  start_time text not null,
  end_time text not null,
  note text,
  assigned_by uuid references jdone.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists rest_periods_day_idx on jdone.rest_periods (date, staff_id);
drop trigger if exists set_updated_at on jdone.rest_periods;
create trigger set_updated_at before update on jdone.rest_periods for each row execute function jdone.set_updated_at();
alter table jdone.rest_periods enable row level security;
drop policy if exists "staff read" on jdone.rest_periods;
create policy "staff read" on jdone.rest_periods for select to authenticated using (jdone.is_staff());
drop policy if exists "leader insert" on jdone.rest_periods;
create policy "leader insert" on jdone.rest_periods for insert to authenticated with check (jdone.is_hr_admin());
drop policy if exists "leader update" on jdone.rest_periods;
create policy "leader update" on jdone.rest_periods for update to authenticated using (jdone.is_hr_admin()) with check (jdone.is_hr_admin());
drop policy if exists "leader delete" on jdone.rest_periods;
create policy "leader delete" on jdone.rest_periods for delete to authenticated using (jdone.is_hr_admin());
grant all on jdone.rest_periods to authenticated, service_role;
-- Jayesh 7 Oct: shift 1 07:00–13:00, break 13:00–15:00, shift 2 15:00–night (22:00).
alter table jdone.staff alter column shift1_start set default '07:00', alter column shift1_end set default '13:00', alter column shift2_start set default '15:00', alter column shift2_end set default '22:00';
update jdone.staff set shift1_start='07:00', shift1_end='13:00', shift2_start='15:00', shift2_end='22:00';
alter table jdone.staff add column if not exists daily_routine text;
notify pgrst, 'reload schema';

-- 7 Oct: task completion proof photo (stamped with name + time) and daily-routine task key.
alter table jdone.tasks add column if not exists completion_photo text, add column if not exists routine_key text;
create index if not exists tasks_routine_idx on jdone.tasks (assigned_to, due, routine_key);
