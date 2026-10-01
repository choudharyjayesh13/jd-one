-- JD One — migration 1 Oct 2026 (c): network orders routed to each member's own system.
-- Run AFTER 2026-10-01-network-members.jdone.sql. Idempotent.
--
-- A member links their website / ERP / order system on their business record
-- (order_webhook_url + secret, order_page_url, order_email). Every network order
-- inserted here is POSTed to that webhook from the database (pg_net), so the
-- seller gets the order in their own system without touching JD One.

create extension if not exists pg_net with schema extensions;

alter table jdone.business_units
  add column if not exists erp_name text not null default 'None',
  add column if not exists order_page_url text,
  add column if not exists order_webhook_url text,
  add column if not exists order_webhook_secret text,
  add column if not exists order_email text;

create table if not exists jdone.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique,
  business_unit_id uuid not null references jdone.business_units(id) on delete cascade,
  customer_name text not null,
  phone text not null,
  customer_id uuid references jdone.customers(id) on delete set null,
  buyer_unit_id uuid references jdone.business_units(id) on delete set null,
  items text not null,
  amount numeric(12,2),
  discount_pct numeric(5,2) not null default 0,
  deliver_to text,
  needed_by date,
  status text not null default 'New' check (status in ('New','Sent to seller','Accepted','Fulfilled','Cancelled')),
  dispatch_status text not null default 'Not sent' check (dispatch_status in ('Not sent','Queued','Sent','Failed','No integration')),
  dispatched_at timestamptz,
  dispatch_request_id bigint,
  external_ref text,
  placed_by uuid references jdone.staff(id) on delete set null,
  placed_by_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists orders_seller_idx on jdone.orders (business_unit_id, created_at desc);
create index if not exists orders_status_idx on jdone.orders (status);
drop trigger if exists set_updated_at on jdone.orders;
create trigger set_updated_at before update on jdone.orders for each row execute function jdone.set_updated_at();

-- Order number if the client did not set one.
create or replace function jdone.set_order_no() returns trigger
language plpgsql as $$
begin
  if new.order_no is null then
    new.order_no := 'JDO-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 4));
  end if;
  return new;
end $$;
drop trigger if exists set_order_no on jdone.orders;
create trigger set_order_no before insert on jdone.orders for each row execute function jdone.set_order_no();

-- Forward the order to the seller's webhook. Fires on insert, and whenever dispatch_status is set back to 'Queued' (Resend).
create or replace function jdone.dispatch_order() returns trigger
language plpgsql security definer set search_path = jdone, public, extensions as $$
declare
  seller jdone.business_units%rowtype;
  buyer_name text;
  payload jsonb;
  req bigint;
begin
  if tg_op = 'UPDATE' and not (new.dispatch_status = 'Queued' and old.dispatch_status is distinct from 'Queued') then
    return new;
  end if;
  select * into seller from jdone.business_units where id = new.business_unit_id;
  if seller.order_webhook_url is null or seller.order_webhook_url = '' then
    new.dispatch_status := 'No integration';
    return new;
  end if;
  select name into buyer_name from jdone.business_units where id = new.buyer_unit_id;
  payload := jsonb_build_object(
    'event', 'order.created',
    'source', 'JD One network',
    'order_no', new.order_no,
    'order_id', new.id,
    'seller', jsonb_build_object('id', seller.id, 'name', seller.name),
    'customer', jsonb_build_object('name', new.customer_name, 'phone', new.phone, 'customer_id', new.customer_id),
    'buyer_business', buyer_name,
    'items', new.items,
    'amount', new.amount,
    'discount_pct', new.discount_pct,
    'deliver_to', new.deliver_to,
    'needed_by', new.needed_by,
    'notes', new.notes,
    'placed_by', new.placed_by_name,
    'placed_at', new.created_at
  );
  begin
    select net.http_post(
      url := seller.order_webhook_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-JDOne-Secret', coalesce(seller.order_webhook_secret, ''), 'X-JDOne-Event', 'order.created'),
      body := payload
    ) into req;
    new.dispatch_status := 'Sent';
    new.dispatched_at := now();
    new.dispatch_request_id := req;
  exception when others then
    new.dispatch_status := 'Failed';
  end;
  return new;
end $$;
drop trigger if exists dispatch_order on jdone.orders;
create trigger dispatch_order before insert or update of dispatch_status on jdone.orders for each row execute function jdone.dispatch_order();

-- RLS: an order is visible to the seller's people and to the buyer's people; network admins see all.
alter table jdone.orders enable row level security;
drop policy if exists "staff read" on jdone.orders;
create policy "staff read" on jdone.orders for select to authenticated using (jdone.is_staff() and (jdone.can_access_unit(business_unit_id) or jdone.can_access_unit(buyer_unit_id) or placed_by = (select id from jdone.staff where auth_user_id = auth.uid() limit 1)));
drop policy if exists "staff insert" on jdone.orders;
create policy "staff insert" on jdone.orders for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.orders;
create policy "staff update" on jdone.orders for update to authenticated using (jdone.is_staff() and (jdone.can_access_unit(business_unit_id) or jdone.can_access_unit(buyer_unit_id))) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.orders;
create policy "owner delete" on jdone.orders for delete to authenticated using (jdone.is_owner() and jdone.can_access_unit(business_unit_id));
-- A customer signed in to the portal may read their own orders.
drop policy if exists "customer read own orders" on jdone.orders;
create policy "customer read own orders" on jdone.orders for select to authenticated using (customer_id = (select id from jdone.customers where auth_user_id = auth.uid() limit 1));

-- Known websites of members (order page templates can be set by each member later).
update jdone.business_units set website = coalesce(website, 'https://stepwhere.in'), erp_name = case when erp_name = 'None' then 'Own website' else erp_name end where name = 'Stepwhere';
update jdone.business_units set website = coalesce(website, 'https://www.pronite.in') where name = 'Pronite';
update jdone.business_units set website = coalesce(website, 'https://www.myjdgroup.com') where name = 'JD Group HQ';

grant all on all tables in schema jdone to anon, authenticated, service_role;
grant all on all sequences in schema jdone to anon, authenticated, service_role;
