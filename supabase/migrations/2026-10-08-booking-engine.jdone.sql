-- JD One booking engine (website direct bookings). 8 Oct 2026.
-- Public (anon) can ONLY call the three functions below; they run with definer rights and never expose other data.
alter table jdone.bookings
  add column if not exists booking_ref text,
  add column if not exists gst_company text,
  add column if not exists gstin text,
  add column if not exists gst_address text,
  add column if not exists billing_email text,
  add column if not exists room_amount numeric(12,2),
  add column if not exists tax_amount numeric(12,2),
  add column if not exists payment_ref text,
  add column if not exists payment_verified boolean not null default false,
  add column if not exists rooms_count integer;
create unique index if not exists bookings_booking_ref_key on jdone.bookings (booking_ref) where booking_ref is not null;
create sequence if not exists jdone.booking_ref_seq start 10001;

-- Rooms of a type that are free on EVERY night of the stay.
create or replace function jdone.be_free_rooms(p_unit uuid, p_type text, p_in date, p_out date) returns integer
language sql stable security definer set search_path = jdone, public as $$
  select greatest(0, (select count(*) from jdone.rooms r where r.business_unit_id = p_unit and r.unit_type = p_type and r.active and r.status <> 'Out of order')::int
    - coalesce((select max(used) from (
        select d::date as night, sum(coalesce(b.units, 1)) as used
        from generate_series(p_in, p_out - 1, interval '1 day') d
        join jdone.bookings b on b.business_unit_id = p_unit and b.unit_type = p_type
          and b.check_in <= d::date and b.check_out > d::date
          and (b.status in ('Confirmed', 'Checked-in') or (b.status = 'On hold' and (b.hold_until is null or b.hold_until > now())))
        group by d) x), 0))
$$;

-- Price of one room for the stay (nightly rate of the latest matching rate row), with occupancy extras and GST per night.
create or replace function jdone.be_price(p_unit uuid, p_type text, p_plan text, p_in date, p_out date, p_adults int, p_children int)
returns jsonb language plpgsql stable security definer set search_path = jdone, public as $$
declare d date; r record; room_total numeric := 0; tax numeric := 0; nightly numeric; minn int := 1;
        base int := case when p_type = 'Family Suite' then 3 else 2 end;
        meal numeric := case p_plan when 'CP' then 300 when 'MAP' then 1100 when 'AP' then 1600 else 0 end;
begin
  if p_out <= p_in then return jsonb_build_object('ok', false, 'reason', 'Check-out must be after check-in'); end if;
  d := p_in;
  while d < p_out loop
    select * into r from jdone.rates x where x.business_unit_id = p_unit and x.unit_type = p_type and x.meal_plan = p_plan
      and d between x.date_from and x.date_to and x.channel in ('All channels', 'Website', 'Booking engine')
      order by x.created_at desc limit 1;
    if r is null or r.closed then return jsonb_build_object('ok', false, 'reason', 'Not available on ' || to_char(d, 'DD Mon')); end if;
    minn := greatest(minn, coalesce(r.min_nights, 1));
    nightly := r.rate
      + greatest(0, p_adults - base) * (coalesce(r.extra_adult, 1000) + case when extract(month from d) between 4 and 6 and p_plan = 'CP' then 0 else meal end)
      + greatest(0, p_children) * coalesce(r.extra_child, 1000)
      - case when p_type = 'Family Suite' and p_adults < 3 then 1000 else 0 end;
    room_total := room_total + nightly;
    tax := tax + round(nightly * case when nightly <= 7500 then 0.05 else 0.18 end);
    d := d + 1;
  end loop;
  if (p_out - p_in) < minn then return jsonb_build_object('ok', false, 'reason', 'Minimum stay ' || minn || ' nights for these dates'); end if;
  return jsonb_build_object('ok', true, 'nights', p_out - p_in, 'room_amount', room_total, 'tax', tax, 'total', room_total + tax, 'min_nights', minn);
end $$;

-- Public quote: every room type with free rooms and prices per meal plan.
create or replace function jdone.be_quote(p_unit_code text, p_in date, p_out date, p_adults int, p_children int, p_rooms int)
returns jsonb language plpgsql stable security definer set search_path = jdone, public as $$
declare u uuid; t record; out jsonb := '[]'::jsonb; plans jsonb; free int; per_room_adults int; per_room_children int; maxa int; pr jsonb; mp text;
begin
  select id into u from jdone.business_units where short_code = p_unit_code;
  if u is null then return jsonb_build_object('error', 'Unknown property'); end if;
  if p_in < current_date then return jsonb_build_object('error', 'Check-in cannot be in the past'); end if;
  if p_out - p_in > 30 then return jsonb_build_object('error', 'For stays longer than 30 nights please call us'); end if;
  p_rooms := greatest(1, coalesce(p_rooms, 1));
  per_room_adults := ceil(greatest(1, p_adults)::numeric / p_rooms);
  per_room_children := ceil(greatest(0, p_children)::numeric / p_rooms);
  for t in select unit_type, min(sort_order) so, max(max_adults) ma, count(*) n from jdone.rooms where business_unit_id = u and active group by unit_type order by min(sort_order) loop
    maxa := case when t.unit_type = 'Family Suite' then 4 when t.unit_type = 'Camping' then 2 else 3 end;
    free := jdone.be_free_rooms(u, t.unit_type, p_in, p_out);
    plans := '[]'::jsonb;
    if per_room_adults <= maxa then
      foreach mp in array array['CP', 'MAP', 'AP'] loop
        pr := jdone.be_price(u, t.unit_type, mp, p_in, p_out, per_room_adults, per_room_children);
        if (pr->>'ok')::boolean then
          plans := plans || jsonb_build_array(pr || jsonb_build_object('meal_plan', mp,
            'room_amount', (pr->>'room_amount')::numeric * p_rooms, 'tax', (pr->>'tax')::numeric * p_rooms, 'total', (pr->>'total')::numeric * p_rooms));
        end if;
      end loop;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('unit_type', t.unit_type, 'free_rooms', free, 'bookable', free >= p_rooms and jsonb_array_length(plans) > 0,
      'max_adults_per_room', maxa, 'plans', plans,
      'note', case when per_room_adults > maxa then 'Too many guests per room — add a room' when free < p_rooms then 'Sold out for these dates' when jsonb_array_length(plans) = 0 then 'Not available for these dates' else null end));
  end loop;
  return jsonb_build_object('nights', p_out - p_in, 'rooms', p_rooms, 'types', out);
end $$;

-- Public booking: re-prices on the server, checks rooms are free, holds them for 20 minutes until payment.
create or replace function jdone.be_book(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = jdone, public as $$
declare u uuid; v_in date := (p->>'check_in')::date; v_out date := (p->>'check_out')::date; rooms int := greatest(1, coalesce((p->>'rooms')::int, 1));
        adults int := greatest(1, coalesce((p->>'adults')::int, 2)); kids int := greatest(0, coalesce((p->>'children')::int, 0));
        typ text := p->>'unit_type'; plan text := p->>'meal_plan'; ph text := right(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), 10);
        pr jsonb; cid uuid; ref text; bid uuid; pay_now numeric; total numeric;
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
  pay_now := case when p->>'pay' = 'advance' then ceil(total * 0.5) else total end;
  select id into cid from jdone.customers where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = ph order by created_at limit 1;
  if cid is null then
    insert into jdone.customers (name, phone, email, first_source, first_seen) values (trim(p->>'name'), ph, nullif(p->>'email', ''), 'Website booking', current_date) returning id into cid;
  end if;
  ref := 'UDS' || nextval('jdone.booking_ref_seq');
  insert into jdone.bookings (guest_name, phone, customer_id, business_unit_id, check_in, check_out, unit_type, units, rooms_count, adults, children, meal_plan,
      room_amount, tax_amount, total, advance, paid, balance, source, status, hold_until, booked_by, booking_ref, special_requests,
      gst_company, gstin, gst_address, billing_email)
  values (trim(p->>'name'), ph, cid, u, v_in, v_out, typ, rooms, rooms, adults, kids, plan,
      (pr->>'room_amount')::numeric * rooms, (pr->>'tax')::numeric * rooms, total, pay_now, 0, total, 'Website', 'On hold', now() + interval '20 minutes', 'Booking engine', ref,
      nullif(p->>'requests', ''), nullif(p->>'gst_company', ''), nullif(upper(p->>'gstin'), ''), nullif(p->>'gst_address', ''), nullif(p->>'email', ''))
  returning id into bid;
  return jsonb_build_object('ok', true, 'booking_ref', ref, 'total', total, 'pay_now', pay_now, 'room_amount', (pr->>'room_amount')::numeric * rooms, 'tax', (pr->>'tax')::numeric * rooms);
end $$;

-- Public: Razorpay success → confirm the held booking. Staff verify the payment id in Razorpay (payment_verified).
create or replace function jdone.be_paid(p_ref text, p_payment_id text, p_amount numeric) returns jsonb
language plpgsql volatile security definer set search_path = jdone, public as $$
declare b record;
begin
  if p_payment_id !~ '^pay_[A-Za-z0-9]{8,}$' then return jsonb_build_object('ok', false, 'reason', 'Invalid payment id'); end if;
  select * into b from jdone.bookings where booking_ref = p_ref for update;
  if b is null then return jsonb_build_object('ok', false, 'reason', 'Booking not found'); end if;
  if b.status <> 'On hold' then return jsonb_build_object('ok', b.status = 'Confirmed', 'booking_ref', p_ref, 'status', b.status); end if;
  update jdone.bookings set status = 'Confirmed', hold_until = null, paid = least(b.advance, b.total),
      balance = b.total - least(b.advance, b.total), payment_ref = p_payment_id, payment_verified = false
    where id = b.id;
  insert into jdone.payments (booking_id, customer_id, date, amount, mode, reference, notes)
  values (b.id, b.customer_id, current_date, least(b.advance, b.total), 'Online', p_payment_id, 'Razorpay via website booking engine — verify in Razorpay, then tick Payment verified');
  return jsonb_build_object('ok', true, 'booking_ref', p_ref, 'status', 'Confirmed', 'check_in', b.check_in, 'check_out', b.check_out, 'unit_type', b.unit_type, 'meal_plan', b.meal_plan, 'total', b.total);
end $$;

revoke all on function jdone.be_free_rooms(uuid, text, date, date) from public;
revoke all on function jdone.be_price(uuid, text, text, date, date, int, int) from public;
grant execute on function jdone.be_quote(text, date, date, int, int, int) to anon, authenticated;
grant execute on function jdone.be_book(jsonb) to anon, authenticated;
grant execute on function jdone.be_paid(text, text, numeric) to anon, authenticated;
grant usage on schema jdone to anon;
notify pgrst, 'reload schema';
