-- JD One (19 Nov 2026): Meta lead sheet link + Sales team (3 seats).
-- * Sales posts sales_1..sales_3: only these people (plus Chairman / Director / owner) can see leads.
-- * The agency's Google Sheet ("Udaisarovar Meta Leads 2026") sends new rows from every "Campaign…" tab
--   to jdone.sheet_ingest_leads(key, rows) and reads progress back with jdone.sheet_lead_status(key).
--   The key lives in jdone.sheet_links; only the Chairman and the Director can see or change it.
-- Safe to run again.

-- 1. Sales posts -------------------------------------------------------------------------------
alter table jdone.org_posts drop constraint if exists org_posts_post_check;
alter table jdone.org_posts add constraint org_posts_post_check
  check (post in ('chairman', 'director', 'property_supervisor', 'task_manager', 'sales_1', 'sales_2', 'sales_3'));
insert into jdone.org_posts (post) values ('sales_1'), ('sales_2'), ('sales_3') on conflict (post) do nothing;
alter policy "director sets task manager" on jdone.org_posts
  using (jdone.is_director() and (post = 'task_manager' or post like 'sales\_%'))
  with check (jdone.is_director() and (post = 'task_manager' or post like 'sales\_%'));

create or replace function jdone.is_sales() returns boolean
language sql stable security definer set search_path to jdone, public as $$
  select exists (select 1 from jdone.org_posts
    where post like 'sales\_%' and email is not null and lower(email) = jdone.current_email() and jdone.current_email() <> '')
$$;

create or replace function jdone.can_see_leads() returns boolean
language sql stable security definer set search_path to jdone, public as $$
  select jdone.is_staff() and (jdone.is_owner() or jdone.is_chairman() or jdone.is_sales())
$$;

-- Staff ids of the Sales seats, in seat order (seat must have a login email that matches an active staff member).
create or replace function jdone.sales_staff_ids() returns uuid[]
language sql stable security definer set search_path to jdone, public as $$
  select coalesce(array_agg(s.id order by p.post), '{}')
  from jdone.org_posts p join jdone.staff s on lower(s.email) = lower(p.email) and s.active
  where p.post like 'sales\_%' and p.email is not null
$$;

-- 2. Leads: only the Sales team sees them --------------------------------------------------------
alter policy "staff read" on jdone.leads using (jdone.can_see_leads());
alter policy "staff insert" on jdone.leads with check (jdone.can_see_leads());
alter policy "staff update" on jdone.leads using (jdone.can_see_leads()) with check (jdone.can_see_leads());

alter table jdone.leads add column if not exists ad_name text;
alter table jdone.leads add column if not exists sheet_tab text;
alter table jdone.leads add column if not exists form_with text;
alter table jdone.leads add column if not exists form_occasion text;
alter table jdone.leads add column if not exists form_when text;
alter table jdone.leads add column if not exists form_package text;
create index if not exists leads_sheet_tab_idx on jdone.leads (sheet_tab) where sheet_tab is not null;

-- 3. The sheet link (key + counters + which campaign tabs are switched off) ------------------------
create table if not exists jdone.sheet_links (
  id text primary key,
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  business_unit_id uuid references jdone.business_units (id),
  rr_next int not null default 0,
  last_in_at timestamptz,
  last_in_count int,
  total_in int not null default 0,
  last_out_at timestamptz,
  created_at timestamptz not null default now()
);
alter table jdone.sheet_links add column if not exists skip_tabs text[] not null default '{"Campaign 1"}';
alter table jdone.sheet_links add column if not exists tabs_seen jsonb not null default '{}';
alter table jdone.sheet_links enable row level security;
drop policy if exists "posts read sheet link" on jdone.sheet_links;
create policy "posts read sheet link" on jdone.sheet_links for select to authenticated
  using (jdone.is_chairman() or jdone.is_director());
insert into jdone.sheet_links (id, business_unit_id)
  select 'meta-leads', (select id from jdone.business_units where name ilike '%udai%sarovar%' order by created_at limit 1)
  on conflict (id) do nothing;

create or replace function jdone.rotate_sheet_key() returns void
language plpgsql security definer set search_path to jdone, public as $$
begin
  if not (jdone.is_chairman() or jdone.is_director()) then raise exception 'Only the Chairman or the Director can change the key'; end if;
  update jdone.sheet_links set secret = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id = 'meta-leads';
end $$;

-- 4. Helpers -------------------------------------------------------------------------------------
create or replace function jdone.norm_phone(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then return ''; end if;
  if length(d) > 10 and d like '0%' then d := regexp_replace(d, '^0+', ''); end if;
  if length(d) = 12 and d like '91%' then return substr(d, 3); end if;
  if length(d) = 11 and d like '0%' then return substr(d, 2); end if;
  if length(d) > 12 then return right(d, 10); end if;
  return d;
end $$;

create or replace function jdone.try_ts(p text) returns timestamptz
language plpgsql immutable as $$
begin
  if coalesce(trim(p), '') = '' then return null; end if;
  if p ~ '[+-]\d\d:?\d\d$' or p ~ 'Z$' then return p::timestamptz; end if;
  return (p::timestamp at time zone 'Asia/Kolkata');
exception when others then return null;
end $$;

create or replace function jdone.try_date(p text) returns date
language plpgsql immutable as $$
begin
  if coalesce(trim(p), '') = '' then return null; end if;
  return left(trim(p), 10)::date;
exception when others then return null;
end $$;

-- Sheet stage words → JD One stages.
create or replace function jdone.sheet_stage_to_jd(p text) returns text
language sql immutable as $$
  select case
    when lower(trim(coalesce(p, ''))) in ('not answered', 'no answer', 'not picked', 'switched off') then 'Contact attempted'
    when lower(trim(coalesce(p, ''))) in ('callback scheduled', 'discussed', 'contacted', 'call back') then 'Contacted'
    when lower(trim(coalesce(p, ''))) like 'hot%' then 'Qualified'
    when lower(trim(coalesce(p, ''))) like 'quot%' then 'Quote shared'
    when lower(trim(coalesce(p, ''))) in ('booked', 'won', 'confirmed') then 'Won'
    when lower(trim(coalesce(p, ''))) in ('lost', 'not interested', 'junk') then 'Lost'
    else 'New' end
$$;

-- JD One stages → the words the agency's sheet and dashboard already use.
create or replace function jdone.jd_stage_to_sheet(p text) returns text
language sql immutable as $$
  select case p
    when 'New' then 'New'
    when 'Contact attempted' then 'Not Answered'
    when 'Contacted' then 'Discussed'
    when 'Nurture' then 'Callback Scheduled'
    when 'Qualified' then 'Hot – Interested'
    when 'Quote preparation' then 'Hot – Interested'
    when 'Awaiting approval' then 'Quotation sent'
    when 'Quote shared' then 'Quotation sent'
    when 'Confirmation pending' then 'Quotation sent'
    when 'Won' then 'Booked'
    when 'Lost' then 'Lost'
    else coalesce(p, 'New') end
$$;

-- Same person typed differently in the sheet ("Aasharam" / "Asharam Keer").
create or replace function jdone.name_key(p text) returns text
language sql immutable as $$
  select regexp_replace(lower(split_part(trim(coalesce(p, '')), ' ', 1)), '(.)\1+', '\1', 'g')
$$;

-- 5. Intake: the sheet sends rows here -----------------------------------------------------------
create or replace function jdone.sheet_ingest_leads(p_key text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path to jdone, public as $$
declare
  link jdone.sheet_links;
  r jsonb;
  ph text; mid text; st text; who uuid; inc text;
  ex jdone.leads;
  sellers uuid[] := jdone.sales_staff_ids();
  ns int := coalesce(array_length(jdone.sales_staff_ids(), 1), 0);
  rr int;
  n_new int := 0; n_upd int := 0; n_skip int := 0;
begin
  select * into link from jdone.sheet_links where id = 'meta-leads' for update;
  if link.id is null or coalesce(p_key, '') = '' or p_key <> link.secret then
    raise exception 'Wrong key' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Send a list of up to 500 rows';
  end if;
  rr := link.rr_next;

  for r in select value from jsonb_array_elements(p_rows) loop
    ph := jdone.norm_phone(r ->> 'phone');
    mid := nullif(trim(coalesce(r ->> 'meta_id', '')), '');
    if ph = '' or (r ->> 'tab') = any (link.skip_tabs) then n_skip := n_skip + 1; continue; end if;

    ex := null;
    if mid is not null then select * into ex from jdone.leads where external_id = mid limit 1; end if;
    if ex.id is null then select * into ex from jdone.leads where phone = ph order by created_at desc limit 1; end if;

    st := jdone.sheet_stage_to_jd(r ->> 'stage');
    inc := r ->> 'incharge';
    who := null;
    if ns > 0 and coalesce(trim(inc), '') <> '' then
      select s.id into who from jdone.staff s where s.id = any (sellers) and jdone.name_key(s.name) = jdone.name_key(inc) limit 1;
    end if;

    if ex.id is null then
      if who is null and ns > 0 then who := sellers[(rr % ns) + 1]; rr := rr + 1; end if;
      insert into jdone.leads (
        name, phone, email, business_unit_id, source, campaign, ad_name, sheet_tab, lead_type,
        form_with, form_occasion, form_when, form_package, requirement, guests,
        stage, qualification, assigned_to, next_follow_up, call_attempts, last_contact, notes,
        external_source, external_id, created_at)
      values (
        coalesce(nullif(trim(r ->> 'name'), ''), 'Meta lead'), ph, nullif(trim(r ->> 'email'), ''), link.business_unit_id,
        case when lower(coalesce(r ->> 'platform', '')) in ('ig', 'instagram') then 'Instagram' else 'Meta Ads' end,
        coalesce(nullif(trim(r ->> 'campaign'), ''), r ->> 'tab'), nullif(trim(r ->> 'ad_name'), ''), r ->> 'tab', 'Stay',
        nullif(trim(r ->> 'with'), ''), nullif(trim(r ->> 'occasion'), ''), nullif(trim(r ->> 'when'), ''), nullif(trim(r ->> 'package'), ''),
        nullif(concat_ws(' · ',
          nullif(trim(r ->> 'with'), ''), nullif(trim(r ->> 'occasion'), ''),
          case when nullif(trim(r ->> 'guests'), '') is not null then trim(r ->> 'guests') || ' guests' end,
          nullif(trim(r ->> 'when'), ''), nullif(trim(r ->> 'package'), '')), ''),
        nullif(substring(coalesce(r ->> 'guests', '') from '(\d+)\D*$'), '')::int,
        st, case when lower(coalesce(r ->> 'stage', '')) like 'hot%' then 'Hot' end, who,
        jdone.try_date(r ->> 'follow_up'),
        coalesce(nullif(substring(coalesce(r ->> 'calls', '') from '(\d+)'), '')::int, 0),
        jdone.try_date(r ->> 'last_contacted'),
        case when nullif(trim(r ->> 'remark'), '') is not null then 'Sheet remark: ' || trim(r ->> 'remark') end,
        'Meta sheet',
        case when mid is not null and not exists (select 1 from jdone.leads where external_id = mid) then mid end,
        coalesce(jdone.try_ts(r ->> 'created'), now()));
      n_new := n_new + 1;
    else
      if ex.assigned_to is null and who is null and ns > 0 then who := sellers[(rr % ns) + 1]; rr := rr + 1; end if;
      update jdone.leads set
        sheet_tab = coalesce(sheet_tab, r ->> 'tab'),
        campaign = coalesce(campaign, nullif(trim(r ->> 'campaign'), ''), r ->> 'tab'),
        ad_name = coalesce(ad_name, nullif(trim(r ->> 'ad_name'), '')),
        form_with = coalesce(form_with, nullif(trim(r ->> 'with'), '')),
        form_occasion = coalesce(form_occasion, nullif(trim(r ->> 'occasion'), '')),
        form_when = coalesce(form_when, nullif(trim(r ->> 'when'), '')),
        form_package = coalesce(form_package, nullif(trim(r ->> 'package'), '')),
        email = coalesce(email, nullif(trim(r ->> 'email'), '')),
        external_id = coalesce(external_id, case when mid is not null and not exists (select 1 from jdone.leads where external_id = mid) then mid end),
        assigned_to = coalesce(assigned_to, who),
        -- progress typed in the sheet before the team moved to JD One is kept, but never overrides work done in JD One
        stage = case when stage = 'New' and coalesce(call_attempts, 0) = 0 and st <> 'New' then st else stage end,
        qualification = case when stage = 'New' and coalesce(call_attempts, 0) = 0 and lower(coalesce(r ->> 'stage', '')) like 'hot%' then 'Hot' else qualification end,
        next_follow_up = coalesce(next_follow_up, jdone.try_date(r ->> 'follow_up')),
        call_attempts = greatest(coalesce(call_attempts, 0), coalesce(nullif(substring(coalesce(r ->> 'calls', '') from '(\d+)'), '')::int, 0)),
        last_contact = coalesce(last_contact, jdone.try_date(r ->> 'last_contacted')),
        notes = case when nullif(trim(r ->> 'remark'), '') is not null and position(trim(r ->> 'remark') in coalesce(notes, '')) = 0
                     then concat_ws(E'\n', notes, 'Sheet remark: ' || trim(r ->> 'remark')) else notes end
      where id = ex.id;
      n_upd := n_upd + 1;
    end if;
  end loop;

  update jdone.sheet_links set rr_next = rr, last_in_at = now(), last_in_count = n_new, total_in = total_in + n_new where id = 'meta-leads';
  return jsonb_build_object('new', n_new, 'matched', n_upd, 'skipped', n_skip);
end $$;

-- 6. Status back to the sheet (also gives any lead without an owner to the next Sales seat) ------
create or replace function jdone.sheet_lead_status(p_key text) returns jsonb
language plpgsql security definer set search_path to jdone, public as $$
declare
  link jdone.sheet_links;
  sellers uuid[] := jdone.sales_staff_ids();
  ns int := coalesce(array_length(jdone.sales_staff_ids(), 1), 0);
  rr int;
  l record;
begin
  select * into link from jdone.sheet_links where id = 'meta-leads' for update;
  if link.id is null or coalesce(p_key, '') = '' or p_key <> link.secret then
    raise exception 'Wrong key' using errcode = '28000';
  end if;
  rr := link.rr_next;
  if ns > 0 then
    for l in select id from jdone.leads where sheet_tab is not null and assigned_to is null and stage not in ('Won', 'Lost') order by created_at loop
      update jdone.leads set assigned_to = sellers[(rr % ns) + 1] where id = l.id;
      rr := rr + 1;
    end loop;
  end if;
  update jdone.sheet_links set rr_next = rr, last_out_at = now() where id = 'meta-leads';

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', le.external_id,
      'phone', le.phone,
      'stage', jdone.jd_stage_to_sheet(le.stage),
      'jd_stage', le.stage,
      'incharge', s.name,
      'calls', coalesce(le.call_attempts, 0),
      'last', le.last_contact,
      'next', le.next_follow_up,
      'remark', concat_ws(' · ', nullif(le.next_action, ''), case when le.stage = 'Lost' then le.lost_reason end),
      'value', coalesce(le.booking_value, le.package_proposed)
    )), '[]'::jsonb)
    from jdone.leads le left join jdone.staff s on s.id = le.assigned_to
    where le.sheet_tab is not null);
end $$;

revoke all on function jdone.sheet_ingest_leads(text, jsonb) from public;
revoke all on function jdone.sheet_lead_status(text) from public;
revoke all on function jdone.rotate_sheet_key() from public;
grant execute on function jdone.sheet_ingest_leads(text, jsonb) to anon, authenticated;
grant execute on function jdone.sheet_lead_status(text) to anon, authenticated;
grant execute on function jdone.rotate_sheet_key() to authenticated;
grant select on jdone.sheet_links to authenticated;

-- 7. Which campaign tabs come into JD One (switched on/off in Sales → Meta sheet link) -------------
create or replace function jdone.sheet_config(p_key text, p_tabs jsonb) returns jsonb
language plpgsql security definer set search_path to jdone, public as $$
declare link jdone.sheet_links;
begin
  select * into link from jdone.sheet_links where id = 'meta-leads';
  if link.id is null or coalesce(p_key, '') = '' or p_key <> link.secret then
    raise exception 'Wrong key' using errcode = '28000';
  end if;
  if jsonb_typeof(p_tabs) = 'object' then
    update jdone.sheet_links set tabs_seen = p_tabs where id = 'meta-leads';
  end if;
  return jsonb_build_object('skip', to_jsonb(link.skip_tabs));
end $$;

create or replace function jdone.set_sheet_tab(p_tab text, p_on boolean) returns void
language plpgsql security definer set search_path to jdone, public as $$
begin
  if not (jdone.is_chairman() or jdone.is_director()) then raise exception 'Only the Chairman or the Director can change this'; end if;
  update jdone.sheet_links
     set skip_tabs = case when p_on then array_remove(skip_tabs, p_tab)
                          else (select array_agg(distinct x) from unnest(array_append(skip_tabs, p_tab)) x) end
   where id = 'meta-leads';
end $$;

revoke all on function jdone.sheet_config(text, jsonb) from public;
revoke all on function jdone.set_sheet_tab(text, boolean) from public;
grant execute on function jdone.sheet_config(text, jsonb) to anon, authenticated;
grant execute on function jdone.set_sheet_tab(text, boolean) to authenticated;
