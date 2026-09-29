
-- Customer numbers (JDC-00001…) and channel references on bookings (AsiaTech import, 29 Sep 2026).
create sequence if not exists jdone.customer_no_seq;
alter table jdone.customers add column if not exists customer_no text;
create unique index if not exists customers_customer_no_key on jdone.customers (customer_no);
create or replace function jdone.set_customer_no() returns trigger language plpgsql as $$
begin
  if new.customer_no is null or new.customer_no = '' then
    new.customer_no := 'JDC-' || lpad(nextval('jdone.customer_no_seq')::text, 5, '0');
  end if;
  return new;
end $$;
drop trigger if exists set_customer_no on jdone.customers;
create trigger set_customer_no before insert on jdone.customers for each row execute function jdone.set_customer_no();
alter table jdone.bookings add column if not exists booked_by text, add column if not exists external_ref text;
create unique index if not exists bookings_external_ref_key on jdone.bookings (external_ref) where external_ref is not null;

-- backfill numbers for existing customers in creation order
update jdone.customers c set customer_no = 'JDC-' || lpad(nextval('jdone.customer_no_seq')::text, 5, '0') from (select id from jdone.customers where customer_no is null order by created_at) o where c.id = o.id;
select 'customer_no ready' as result;
