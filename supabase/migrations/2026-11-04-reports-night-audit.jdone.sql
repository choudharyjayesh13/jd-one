-- JD One (4 Nov 2026): Reports — department end-of-day reports and the night audit.
-- Safe to run again. Changes no existing data.

create table if not exists jdone.dept_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  department text not null,
  data jsonb not null default '{}'::jsonb,
  notes text,
  submitted_by uuid references jdone.staff(id) on delete set null,
  submitted_at timestamptz,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (date, department)
);
create index if not exists dept_reports_date_idx on jdone.dept_reports (date desc);

create table if not exists jdone.night_audits (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  data jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  notes text,
  closed_by uuid references jdone.staff(id) on delete set null,
  closed_at timestamptz,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);

do $$
declare t text;
begin
  foreach t in array array['dept_reports', 'night_audits'] loop
    execute format('alter table jdone.%I enable row level security', t);
    execute format('drop policy if exists "staff read" on jdone.%I', t);
    execute format('create policy "staff read" on jdone.%I for select to authenticated using (jdone.is_staff())', t);
    execute format('drop policy if exists "staff insert" on jdone.%I', t);
    execute format('create policy "staff insert" on jdone.%I for insert to authenticated with check (jdone.is_staff())', t);
    execute format('drop policy if exists "staff update" on jdone.%I', t);
    execute format('create policy "staff update" on jdone.%I for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff())', t);
    execute format('drop policy if exists "owner delete" on jdone.%I', t);
    execute format('create policy "owner delete" on jdone.%I for delete to authenticated using (jdone.is_owner())', t);
    execute format('drop trigger if exists set_updated_at on jdone.%I', t);
    execute format('create trigger set_updated_at before update on jdone.%I for each row execute function jdone.set_updated_at()', t);
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'jdone' and p.proname = 'log_director_change') then
      execute format('drop trigger if exists zz_log_director_change on jdone.%I', t);
      execute format('create trigger zz_log_director_change after insert or update or delete on jdone.%I for each row execute function jdone.log_director_change()', t);
    end if;
    execute format('grant all on jdone.%I to authenticated, service_role', t);
  end loop;
end $$;
