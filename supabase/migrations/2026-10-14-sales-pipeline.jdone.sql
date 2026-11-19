-- Uday Sarovar sales pipeline (from Uday_Sarovar_Sales_Pipeline_and_EOD_Report.xlsx), 14 Oct 2026.
--  * 11 stages: New → Contact attempted → Contacted → Qualified → Quote preparation → Awaiting approval
--    → Quote shared → Confirmation pending → Won | Lost | Nurture
--  * lead register fields (check-in/out = visit_from/visit_to, adults, children, rooms, event need, next action,
--    package proposed, approval gate, booking value)
--  * lead_stage_history: every stage change (who/when) — real funnel conversion history
--  * sales_eod_reports: each sales person's end-of-day report + decision-maker review

-- 1. Lead register fields -----------------------------------------------------------
alter table jdone.leads add column if not exists city text;
alter table jdone.leads add column if not exists lead_type text;
alter table jdone.leads add column if not exists adults integer;
alter table jdone.leads add column if not exists children integer;
alter table jdone.leads add column if not exists rooms_count integer;
alter table jdone.leads add column if not exists event_requirement text;
alter table jdone.leads add column if not exists next_action text;
alter table jdone.leads add column if not exists package_proposed numeric(12,2);
alter table jdone.leads add column if not exists approval_status text not null default 'Not needed';
alter table jdone.leads add column if not exists approval_notes text;
alter table jdone.leads add column if not exists approved_by uuid references jdone.staff(id) on delete set null;
alter table jdone.leads add column if not exists approved_at timestamptz;
alter table jdone.leads add column if not exists booking_value numeric(12,2);
alter table jdone.leads add column if not exists stage_changed_at timestamptz;

-- 2. Stage names: map the old ones (importers may still send them) ---------------------
create or replace function jdone.normalize_lead_stage() returns trigger language plpgsql as $$
begin
  new.stage := case new.stage
    when 'Proposal' then 'Quote shared'
    when 'Negotiation' then 'Quote shared'
    when 'On Hold' then 'Nurture'
    else coalesce(new.stage, 'New') end;
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  -- quote sent for approval → mark pending; approved/revision decisions are made by owner/manager in the app
  if new.stage = 'Awaiting approval' and (tg_op = 'INSERT' or old.stage is distinct from 'Awaiting approval') and new.approval_status in ('Not needed', 'Revision required') then
    new.approval_status := 'Pending';
  end if;
  return new;
end $$;
drop trigger if exists a_normalize_lead_stage on jdone.leads;
create trigger a_normalize_lead_stage before insert or update on jdone.leads
  for each row execute function jdone.normalize_lead_stage();

update jdone.leads set stage = 'Quote shared' where stage in ('Proposal', 'Negotiation');
update jdone.leads set stage = 'Nurture' where stage = 'On Hold';

-- 3. Stage history ----------------------------------------------------------------
create table if not exists jdone.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references jdone.leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references jdone.staff(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists lead_stage_history_lead_idx on jdone.lead_stage_history (lead_id, changed_at);
create index if not exists lead_stage_history_day_idx on jdone.lead_stage_history (changed_at);

create or replace function jdone.log_lead_stage() returns trigger language plpgsql security definer set search_path = jdone, public as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into jdone.lead_stage_history (lead_id, from_stage, to_stage, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage,
            (select id from jdone.staff where auth_user_id = auth.uid() limit 1));
  end if;
  return null;
end $$;
drop trigger if exists log_lead_stage on jdone.leads;
create trigger log_lead_stage after insert or update of stage on jdone.leads
  for each row execute function jdone.log_lead_stage();

alter table jdone.lead_stage_history enable row level security;
drop policy if exists "staff read" on jdone.lead_stage_history;
create policy "staff read" on jdone.lead_stage_history for select to authenticated using (jdone.is_staff());
grant select on jdone.lead_stage_history to authenticated;
grant all on jdone.lead_stage_history to service_role;

-- 4. Sales end-of-day report --------------------------------------------------------
create table if not exists jdone.sales_eod_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  staff_id uuid references jdone.staff(id) on delete set null,
  business_unit_id uuid references jdone.business_units(id) on delete set null,
  leads_assigned integer default 0,
  calls_made integer default 0,
  whatsapp_sent integer default 0,
  conversations integer default 0,
  qualified integer default 0,
  quotes_prepared integer default 0,
  quotes_shared integer default 0,
  followups_done integer default 0,
  bookings_confirmed integer default 0,
  booking_value numeric(12,2) default 0,
  hot_leads text,
  blockers text,
  tomorrow_priorities text,
  manager_review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null,
  unique (date, staff_id)
);
drop trigger if exists set_updated_at on jdone.sales_eod_reports;
create trigger set_updated_at before update on jdone.sales_eod_reports for each row execute function jdone.set_updated_at();
alter table jdone.sales_eod_reports enable row level security;
drop policy if exists "staff read" on jdone.sales_eod_reports;
create policy "staff read" on jdone.sales_eod_reports for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.sales_eod_reports;
create policy "staff insert" on jdone.sales_eod_reports for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.sales_eod_reports;
create policy "staff update" on jdone.sales_eod_reports for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.sales_eod_reports;
create policy "owner delete" on jdone.sales_eod_reports for delete to authenticated using (jdone.is_owner());
grant all on jdone.sales_eod_reports to authenticated, service_role;

notify pgrst, 'reload schema';
