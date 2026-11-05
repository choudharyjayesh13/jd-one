-- New guest numbers always continue after the highest JDG number in use (imports assign numbers directly).
create or replace function jdone.set_customer_no() returns trigger language plpgsql security definer set search_path = jdone, public as $$
declare top int;
begin
  if new.customer_no is null or new.customer_no = '' then
    select coalesce(max(substring(customer_no from 4)::int), 0) into top from jdone.customers where customer_no ~ '^JDG\d+$';
    perform setval('jdone.customer_no_seq', greatest(top, (select last_value from jdone.customer_no_seq)));
    new.customer_no := 'JDG' || lpad(nextval('jdone.customer_no_seq')::text, 5, '0');
  end if;
  return new;
end $$;
select setval('jdone.customer_no_seq', (select coalesce(max(substring(customer_no from 4)::int), 1) from jdone.customers where customer_no ~ '^JDG\d+$'));
