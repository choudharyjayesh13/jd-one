-- JD One — guest portal: guest numbers JDG00001…, guest login linked to the customer record,
-- guests read only their own stays / orders and leave feedback. 7 Oct 2026.
alter table jdone.customers add column if not exists auth_user_id uuid unique;

-- 1) Guest numbers: JDG + 5 digits (Jayesh: "JDG then number").
create or replace function jdone.set_customer_no() returns trigger language plpgsql as $$
begin
  if new.customer_no is null or new.customer_no = '' then
    new.customer_no := 'JDG' || lpad(nextval('jdone.customer_no_seq')::text, 5, '0');
  end if;
  return new;
end $$;
update jdone.customers set customer_no = 'JDG' || substring(customer_no from 5) where customer_no like 'JDC-%';

-- 2) Which customer is the signed-in guest?
create or replace function jdone.my_customer_id() returns uuid language sql stable security definer set search_path = jdone, public as $$
  select id from jdone.customers where auth_user_id = auth.uid() limit 1
$$;
grant execute on function jdone.my_customer_id() to authenticated;

-- 3) Link a guest sign-up (user_metadata.kind = 'guest') to their customer record by phone or email, else create one.
create or replace function jdone.link_customer_on_signup() returns trigger language plpgsql security definer set search_path = jdone, public as $$
declare ph text := right(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 10);
        cid uuid;
begin
  if coalesce(new.raw_user_meta_data->>'kind', '') <> 'guest' then return new; end if;
  select id into cid from jdone.customers
   where auth_user_id is null and ((length(ph) = 10 and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = ph)
          or (new.email is not null and lower(email) = lower(new.email)))
   order by created_at limit 1;
  if cid is not null then
    update jdone.customers set auth_user_id = new.id, email = coalesce(email, new.email) where id = cid;
  else
    insert into jdone.customers (name, phone, email, first_source, first_seen, auth_user_id)
    values (coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), nullif(ph, ''), new.email, 'Guest portal', current_date, new.id);
  end if;
  return new;
end $$;
drop trigger if exists link_customer on auth.users;
create trigger link_customer after insert on auth.users for each row execute function jdone.link_customer_on_signup();

-- 4) Guest feedback: what they liked.
create table if not exists jdone.guest_feedback (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references jdone.customers(id) on delete cascade,
  booking_id uuid references jdone.bookings(id) on delete set null,
  rating integer check (rating between 1 and 5),
  liked text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table jdone.guest_feedback enable row level security;
drop policy if exists "guest own feedback" on jdone.guest_feedback;
create policy "guest own feedback" on jdone.guest_feedback for all to authenticated
  using (customer_id = jdone.my_customer_id() or jdone.is_staff()) with check (customer_id = jdone.my_customer_id() or jdone.is_staff());
grant all on jdone.guest_feedback to authenticated, service_role;

-- 5) Guests read only their own records.
drop policy if exists "guest read own customer" on jdone.customers;
create policy "guest read own customer" on jdone.customers for select to authenticated using (auth_user_id = auth.uid());
drop policy if exists "guest read own bookings" on jdone.bookings;
create policy "guest read own bookings" on jdone.bookings for select to authenticated using (customer_id is not null and customer_id = jdone.my_customer_id());
drop policy if exists "guest read own kots" on jdone.kots;
create policy "guest read own kots" on jdone.kots for select to authenticated
  using (booking_id in (select id from jdone.bookings where customer_id = jdone.my_customer_id()));
notify pgrst, 'reload schema';
