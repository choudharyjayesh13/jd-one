-- JD One (4 Nov 2026): Home cards (which departments see which card) and the HR shift roster.
-- Safe to run again. Changes no existing data.

create table if not exists jdone.home_cards (
  id uuid primary key default gen_random_uuid(),
  card text not null unique,
  departments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
alter table jdone.home_cards enable row level security;
drop policy if exists "staff read" on jdone.home_cards;
create policy "staff read" on jdone.home_cards for select to authenticated using (jdone.is_staff());
drop policy if exists "admin write" on jdone.home_cards;
create policy "admin write" on jdone.home_cards for all to authenticated
  using (jdone.is_access_admin() or jdone.is_property_supervisor())
  with check (jdone.is_access_admin() or jdone.is_property_supervisor());

create table if not exists jdone.shift_roster (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references jdone.staff(id) on delete cascade,
  date date not null,
  off boolean not null default false,
  shift1_start text,
  shift1_end text,
  shift2_start text,
  shift2_end text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (staff_id, date)
);
alter table jdone.shift_roster enable row level security;
drop policy if exists "staff read" on jdone.shift_roster;
create policy "staff read" on jdone.shift_roster for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.shift_roster;
create policy "staff insert" on jdone.shift_roster for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.shift_roster;
create policy "staff update" on jdone.shift_roster for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "staff delete" on jdone.shift_roster;
create policy "staff delete" on jdone.shift_roster for delete to authenticated using (jdone.is_staff());

do $$
declare t text;
begin
  foreach t in array array['home_cards', 'shift_roster'] loop
    execute format('drop trigger if exists set_updated_at on jdone.%I', t);
    execute format('create trigger set_updated_at before update on jdone.%I for each row execute function jdone.set_updated_at()', t);
    execute format('drop trigger if exists zz_log_director_change on jdone.%I', t);
    execute format('create trigger zz_log_director_change after insert or update or delete on jdone.%I for each row execute function jdone.log_director_change()', t);
    execute format('grant all on jdone.%I to authenticated, service_role', t);
  end loop;
end $$;
