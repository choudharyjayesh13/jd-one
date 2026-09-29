-- JD One — migration 29 Sep 2026 (schema jdone): staff self sign-up + approval, maintenance
-- tickets with photos/videos, task points. Idempotent; run once in the Supabase SQL editor
-- of the shared project (schema jdone). Contains ONLY the statements new since schema.jdone.sql
-- of 28 Sep 2026.

-- ---------------------------------------------------------------- helper: who may approve sign-ups
create or replace function jdone.is_hr_admin() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select coalesce(jdone.current_staff_role() in ('owner','manager','hr'), false)
$$;

-- ---------------------------------------------------------------- tables
create table if not exists jdone.signup_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  name text not null,
  phone text,
  email text,
  designation text,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  requested_at timestamptz not null default now(),
  decided_by uuid references jdone.staff(id) on delete set null,
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists signup_requests_status_idx on jdone.signup_requests (status);

create table if not exists jdone.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Other',
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  location text,
  booking_id uuid references jdone.bookings(id) on delete set null,
  priority text not null default 'Medium',
  priority_rank integer not null default 2,
  description text,
  media jsonb not null default '[]'::jsonb,
  reported_by uuid references jdone.staff(id) on delete set null,
  assigned_to uuid references jdone.staff(id) on delete set null,
  status text not null default 'Open' check (status in ('Open','In progress','Waiting parts','Done','Verified')),
  due date,
  started_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  resolution_media jsonb not null default '[]'::jsonb,
  cost numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists tickets_status_idx on jdone.tickets (status);
create index if not exists tickets_unit_idx on jdone.tickets (business_unit_id);
create index if not exists tickets_assigned_idx on jdone.tickets (assigned_to);
create index if not exists tickets_priority_idx on jdone.tickets (priority_rank, created_at desc);

-- Tasks: scoreboard points, completion time, link to the ticket that created the task.
alter table jdone.tasks
  add column if not exists points integer not null default 1,
  add column if not exists completed_at timestamptz,
  add column if not exists ticket_id uuid references jdone.tickets(id) on delete set null;
create index if not exists tasks_ticket_idx on jdone.tasks (ticket_id);
create index if not exists tasks_assigned_idx on jdone.tasks (assigned_to, status);

-- ---------------------------------------------------------------- updated_at triggers
drop trigger if exists set_updated_at on jdone.tickets;
create trigger set_updated_at before update on jdone.tickets for each row execute function jdone.set_updated_at();
drop trigger if exists set_updated_at on jdone.signup_requests;
create trigger set_updated_at before update on jdone.signup_requests for each row execute function jdone.set_updated_at();

-- ---------------------------------------------------------------- link_staff_on_signup (note)
-- A staff row pre-created by HR with the person's email is linked to their login at sign-up, so
-- they skip approval; self sign-ups without a staff row go through signup_requests. The function
-- is (re)defined here; the trigger is only created if no trigger on auth.users already calls it
-- (the live project has it installed by hand).
create or replace function jdone.link_staff_on_signup() returns trigger
language plpgsql security definer set search_path = jdone, public as $$
begin
  update jdone.staff set auth_user_id = new.id
   where auth_user_id is null and email is not null and lower(email) = lower(new.email);
  return new;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgfoid = 'jdone.link_staff_on_signup'::regproc) then
    create trigger link_staff after insert on auth.users for each row execute function jdone.link_staff_on_signup();
  end if;
end $$;

-- ---------------------------------------------------------------- row level security
-- tickets: same rules as every other staff table.
alter table jdone.tickets enable row level security;
drop policy if exists "staff read" on jdone.tickets;
create policy "staff read" on jdone.tickets for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.tickets;
create policy "staff insert" on jdone.tickets for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.tickets;
create policy "staff update" on jdone.tickets for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.tickets;
create policy "owner delete" on jdone.tickets for delete to authenticated using (jdone.is_owner());

-- signup_requests: a signed-in user may create/see their OWN request (they are not staff yet);
-- staff read all; owner/manager/hr update/delete.
alter table jdone.signup_requests enable row level security;
drop policy if exists "own signup insert" on jdone.signup_requests;
create policy "own signup insert" on jdone.signup_requests for insert to authenticated with check (auth_user_id = auth.uid());
drop policy if exists "own or staff signup read" on jdone.signup_requests;
create policy "own or staff signup read" on jdone.signup_requests for select to authenticated using (auth_user_id = auth.uid() or jdone.is_staff());
drop policy if exists "hr signup update" on jdone.signup_requests;
create policy "hr signup update" on jdone.signup_requests for update to authenticated using (jdone.is_hr_admin()) with check (jdone.is_hr_admin());
drop policy if exists "hr signup delete" on jdone.signup_requests;
create policy "hr signup delete" on jdone.signup_requests for delete to authenticated using (jdone.is_hr_admin());

-- business_units: the sign-up form (anon key, not signed in) lists active units.
drop policy if exists "anon read active units" on jdone.business_units;
create policy "anon read active units" on jdone.business_units for select to anon using (active);

-- ---------------------------------------------------------------- storage: tickets bucket (public read, staff write, owner delete)
insert into storage.buckets (id, name, public)
values ('tickets', 'tickets', true)
on conflict (id) do nothing;

drop policy if exists "tickets public read" on storage.objects;
create policy "tickets public read" on storage.objects for select using (bucket_id = 'tickets');
drop policy if exists "tickets staff insert" on storage.objects;
create policy "tickets staff insert" on storage.objects for insert to authenticated with check (bucket_id = 'tickets' and jdone.is_staff());
drop policy if exists "tickets staff update" on storage.objects;
create policy "tickets staff update" on storage.objects for update to authenticated using (bucket_id = 'tickets' and jdone.is_staff());
drop policy if exists "tickets owner delete" on storage.objects;
create policy "tickets owner delete" on storage.objects for delete to authenticated using (bucket_id = 'tickets' and jdone.is_owner());

-- ---------------------------------------------------------------- grants
grant all on jdone.tickets, jdone.signup_requests to anon, authenticated, service_role;
grant execute on function jdone.is_hr_admin() to anon, authenticated, service_role;
grant execute on function jdone.link_staff_on_signup() to service_role;
-- anon may only read the columns the sign-up form needs (RLS above limits rows to active units).
revoke select on jdone.business_units from anon;
grant select (id, name, short_code, active) on jdone.business_units to anon;
