-- Sales & Marketing: CRM fields on leads + "converted lead = lifetime guest". 8 Oct 2026.
alter table jdone.leads add column if not exists call_attempts integer not null default 0;
alter table jdone.leads add column if not exists crm_id text;
alter table jdone.leads add column if not exists won_at timestamptz;
create index if not exists leads_followup_idx on jdone.leads (assigned_to, next_follow_up) where stage not in ('Won','Lost');
create index if not exists leads_phone_idx on jdone.leads (phone);

-- A lead marked Won becomes a guest for life: link the customer with the same phone, or create one (gets a JDG number).
create or replace function jdone.lead_won_to_customer() returns trigger language plpgsql security definer set search_path = jdone, public as $$
declare ph text := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
        cid uuid;
begin
  if new.stage = 'Won' then
    if new.won_at is null then new.won_at := now(); end if;
    if new.customer_id is null and length(ph) = 10 then
      select id into cid from jdone.customers where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = ph order by created_at limit 1;
      if cid is null then
        insert into jdone.customers (name, phone, email, first_source, first_seen, owner_id, notes)
        values (new.name, ph, new.email, coalesce(new.source, 'Lead'), current_date, new.assigned_to, 'Converted from lead' || coalesce(' ' || new.crm_id, ''))
        returning id into cid;
      end if;
      new.customer_id := cid;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lead_won_to_customer on jdone.leads;
create trigger lead_won_to_customer before insert or update of stage, customer_id, phone on jdone.leads for each row execute function jdone.lead_won_to_customer();

-- A booking made from a lead marks the lead Won (and so links/creates the lifetime guest).
create or replace function jdone.booking_wins_lead() returns trigger language plpgsql security definer set search_path = jdone, public as $$
begin
  if new.lead_id is not null and coalesce(new.status, '') not in ('Cancelled', 'Enquiry') then
    update jdone.leads set stage = 'Won', customer_id = coalesce(customer_id, new.customer_id) where id = new.lead_id and stage <> 'Won';
  end if;
  return new;
end $$;
drop trigger if exists booking_wins_lead on jdone.bookings;
create trigger booking_wins_lead after insert or update of lead_id, status on jdone.bookings for each row execute function jdone.booking_wins_lead();
notify pgrst, 'reload schema';
