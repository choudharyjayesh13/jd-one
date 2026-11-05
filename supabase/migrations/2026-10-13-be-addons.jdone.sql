-- Booking engine add-on services (horse riding, sightseeing, camping, transfers…) from jdone.add_ons. 13 Oct 2026.
alter table jdone.bookings add column if not exists addons jsonb not null default '[]'::jsonb;
alter table jdone.bookings add column if not exists addons_amount numeric(12,2) not null default 0;

-- Public list of active add-ons for a property (anon can read only these fields).
create or replace function jdone.be_addons(p_unit_code text) returns jsonb language sql stable security definer set search_path = jdone, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price, 'per', a.per, 'tax_pct', a.tax_pct, 'description', a.description)
           order by (a.price = 0), a.price desc, a.name), '[]'::jsonb)
  from jdone.add_ons a join jdone.business_units b on b.id = a.business_unit_id
  where b.short_code = p_unit_code and a.active
$$;
grant execute on function jdone.be_addons(text) to anon, authenticated;

create or replace function jdone.be_book(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = jdone, public as $$
declare u uuid; v_in date := (p->>'check_in')::date; v_out date := (p->>'check_out')::date; rooms int := greatest(1, coalesce((p->>'rooms')::int, 1));
        adults int := greatest(1, coalesce((p->>'adults')::int, 2)); kids int := greatest(0, coalesce((p->>'children')::int, 0));
        typ text := p->>'unit_type'; plan text := p->>'meal_plan'; ph text := right(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), 10);
        pr jsonb; cid uuid; ref text; bid uuid; pay_now numeric; total numeric;
        ad jsonb; ao record; aq int; add_amt numeric := 0; add_list jsonb := '[]'::jsonb; add_note text := '';
begin
  select id into u from jdone.business_units where short_code = coalesce(p->>'unit', 'UDS');
  if u is null or typ is null or plan not in ('CP', 'MAP', 'AP') then return jsonb_build_object('ok', false, 'reason', 'Missing room or meal plan'); end if;
  if length(ph) <> 10 or coalesce(trim(p->>'name'), '') = '' then return jsonb_build_object('ok', false, 'reason', 'Name and 10-digit mobile are required'); end if;
  if coalesce(p->>'gstin', '') <> '' and upper(p->>'gstin') !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$' then return jsonb_build_object('ok', false, 'reason', 'GSTIN looks wrong (15 characters, e.g. 08ABCDE1234F1Z5)'); end if;
  perform pg_advisory_xact_lock(hashtext('be:' || u::text || typ));
  if jdone.be_free_rooms(u, typ, v_in, v_out) < rooms then return jsonb_build_object('ok', false, 'reason', 'Sorry — just sold out. Please pick another room type or dates.'); end if;
  pr := jdone.be_price(u, typ, plan, v_in, v_out, ceil(adults::numeric / rooms)::int, ceil(kids::numeric / rooms)::int);
  if not (pr->>'ok')::boolean then return pr; end if;
  total := (pr->>'total')::numeric * rooms;
  -- Add-on services (horse riding, sightseeing cabs, camping…): priced on the server from jdone.add_ons.
  for ad in select * from jsonb_array_elements(coalesce(p->'addons', '[]'::jsonb)) loop
    aq := least(20, greatest(0, coalesce((ad->>'qty')::int, 0)));
    if aq = 0 then continue; end if;
    select * into ao from jdone.add_ons where id = (ad->>'id')::uuid and active and business_unit_id = u;
    if ao is null then continue; end if;
    add_list := add_list || jsonb_build_object('id', ao.id, 'name', ao.name, 'qty', aq, 'per', ao.per, 'price', ao.price,
      'amount', round(ao.price * aq * case when ao.per in ('Night', 'Person per night') then (v_out - v_in) else 1 end * (1 + coalesce(ao.tax_pct, 0) / 100.0)),
      'on_request', ao.price = 0);
    add_amt := add_amt + round(ao.price * aq * case when ao.per in ('Night', 'Person per night') then (v_out - v_in) else 1 end * (1 + coalesce(ao.tax_pct, 0) / 100.0));
    add_note := add_note || case when add_note = '' then '' else ', ' end || aq || ' × ' || ao.name || case when ao.price = 0 then ' (price on request)' else '' end;
  end loop;
  total := total + add_amt;
  pay_now := case when p->>'pay' = 'advance' then ceil(total * 0.5) else total end;
  select id into cid from jdone.customers where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = ph order by created_at limit 1;
  if cid is null then
    insert into jdone.customers (name, phone, email, first_source, first_seen) values (trim(p->>'name'), ph, nullif(p->>'email', ''), 'Website booking', current_date) returning id into cid;
  end if;
  ref := 'UDS' || nextval('jdone.booking_ref_seq');
  insert into jdone.bookings (guest_name, phone, customer_id, business_unit_id, check_in, check_out, unit_type, units, rooms_count, adults, children, meal_plan,
      room_amount, tax_amount, total, advance, paid, balance, source, status, hold_until, booked_by, booking_ref, special_requests,
      gst_company, gstin, gst_address, billing_email, addons, addons_amount)
  values (trim(p->>'name'), ph, cid, u, v_in, v_out, typ, rooms, rooms, adults, kids, plan,
      (pr->>'room_amount')::numeric * rooms, (pr->>'tax')::numeric * rooms, total, pay_now, 0, total, 'Website', 'On hold', now() + interval '20 minutes', 'Booking engine', ref,
      nullif(concat_ws(' · ', case when add_note <> '' then 'ADD-ONS: ' || add_note end, nullif(p->>'requests', '')), ''), nullif(p->>'gst_company', ''), nullif(upper(p->>'gstin'), ''), nullif(p->>'gst_address', ''), nullif(p->>'email', ''), add_list, add_amt)
  returning id into bid;
  return jsonb_build_object('ok', true, 'booking_ref', ref, 'total', total, 'pay_now', pay_now, 'room_amount', (pr->>'room_amount')::numeric * rooms, 'tax', (pr->>'tax')::numeric * rooms, 'addons_amount', add_amt, 'addons', add_list);
end $$;
grant execute on function jdone.be_book(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
