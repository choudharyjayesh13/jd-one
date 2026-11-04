-- JD One (4 Nov 2026): HR → Employees — leaving is a process.
--   HR records a resignation with a notice period (7 days, 15 days or 1 month); the login stops
--   by itself after the last working day. Only the Chairman / Director can remove someone today.
-- Safe to run again. Changes no existing data.

alter table jdone.staff
  add column if not exists exit_status text check (exit_status in ('Notice period', 'Left', 'Removed')),
  add column if not exists resigned_on date,
  add column if not exists notice_days integer,
  add column if not exists last_working_day date,
  add column if not exists exit_reason text;

-- Someone past their last working day is no longer staff (no login, no data), even before the list is tidied.
create or replace function jdone.is_staff() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select exists (
    select 1 from jdone.staff
    where auth_user_id = auth.uid() and active
      and (last_working_day is null or last_working_day >= (now() at time zone 'Asia/Kolkata')::date)
  )
$$;

create or replace function jdone.current_staff_role() returns text
language sql stable security definer set search_path = jdone, public as $$
  select role from jdone.staff
  where auth_user_id = auth.uid() and active
    and (last_working_day is null or last_working_day >= (now() at time zone 'Asia/Kolkata')::date)
  limit 1
$$;

-- The rules, enforced for everyone except the Chairman and the Director.
create or replace function jdone.guard_staff_exit() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or jdone.is_access_admin() then return new; end if;

  if old.active and not new.active then
    if old.last_working_day is not null and old.last_working_day < today then return new; end if; -- notice served
    raise exception 'Only the Chairman or the Director can remove someone immediately. Record a resignation instead – access ends after the last working day.';
  end if;

  if not old.active and new.active and old.exit_status = 'Removed' then
    raise exception 'Only the Chairman or the Director can bring back someone they removed.';
  end if;

  if new.last_working_day is distinct from old.last_working_day and new.last_working_day is not null then
    if new.resigned_on is null or new.last_working_day < new.resigned_on + 7 then
      raise exception 'The notice period must be at least 7 days from the resignation date.';
    end if;
    if new.last_working_day < today then
      raise exception 'The last working day cannot be in the past.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_staff_exit on jdone.staff;
create trigger guard_staff_exit before update on jdone.staff for each row execute function jdone.guard_staff_exit();

-- Tidy the list: people whose notice is over become "Left" (also done by the Employees page when opened).
create or replace function jdone.close_due_exits() returns integer
language plpgsql security definer set search_path = jdone, public as $$
declare n integer;
begin
  update jdone.staff set active = false, left_on = last_working_day, exit_status = 'Left'
  where active and last_working_day is not null and last_working_day < (now() at time zone 'Asia/Kolkata')::date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function jdone.close_due_exits() from public, anon;
grant execute on function jdone.close_due_exits() to authenticated, service_role;
