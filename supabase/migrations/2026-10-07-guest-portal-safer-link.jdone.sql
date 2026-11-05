-- Safer guest linking: match an existing customer by email, or by phone AND first name (phone alone could let
-- someone claim another guest's history). Otherwise create a new customer that staff can merge.
create or replace function jdone.link_customer_on_signup() returns trigger language plpgsql security definer set search_path = jdone, public as $$
declare ph text := right(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 10);
        nm text := lower(split_part(trim(coalesce(new.raw_user_meta_data->>'name', '')), ' ', 1));
        cid uuid;
begin
  if coalesce(new.raw_user_meta_data->>'kind', '') <> 'guest' then return new; end if;
  select id into cid from jdone.customers
   where auth_user_id is null and (
           (new.email is not null and lower(email) = lower(new.email))
        or (length(ph) = 10 and length(nm) >= 2 and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = ph
            and lower(split_part(trim(name), ' ', 1)) = nm))
   order by created_at limit 1;
  if cid is not null then
    update jdone.customers set auth_user_id = new.id, email = coalesce(email, new.email) where id = cid;
  else
    insert into jdone.customers (name, phone, email, first_source, first_seen, auth_user_id, notes)
    values (coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
            coalesce(nullif(ph, '') || case when exists (select 1 from jdone.customers c where c.phone = ph) then '-' || left(new.id::text, 4) else '' end, 'G-' || left(new.id::text, 8)),
            new.email, 'Guest portal', current_date, new.id,
            case when exists (select 1 from jdone.customers c where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = ph and length(ph) = 10)
                 then 'Signed up on the guest portal; phone matches an existing guest but the name did not — check and merge.' end);
  end if;
  return new;
end $$;
notify pgrst, 'reload schema';
