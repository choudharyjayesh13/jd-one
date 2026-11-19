-- KOT printing on the property POS printer + guests ordering food from the Guest App. 9 Oct 2026.
alter table jdone.kots add column if not exists printed_at timestamptz;
alter table jdone.kots add column if not exists source text not null default 'Staff';
create index if not exists kots_unprinted_idx on jdone.kots (created_at) where printed_at is null;

-- Guest App order: prices always come from the menu (never from the phone), max 20 per dish,
-- max 5 open guest orders per guest. The kitchen printer picks the KOT up and prints it.
create or replace function jdone.guest_order(p_lines jsonb, p_room text, p_notes text default null) returns jsonb
language plpgsql volatile security definer set search_path = jdone, public as $$
declare cid uuid := jdone.my_customer_id(); c record; b record; l jsonb; m record; q int;
        items text := ''; lines jsonb := '[]'::jsonb; total numeric := 0; unit uuid; k record;
begin
  if cid is null then return jsonb_build_object('ok', false, 'reason', 'Please sign in to the Guest App first'); end if;
  if coalesce(trim(p_room), '') = '' then return jsonb_build_object('ok', false, 'reason', 'Please enter your cottage / room / tent'); end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('ok', false, 'reason', 'Add at least one dish'); end if;
  if (select count(*) from jdone.kots where source = 'Guest app' and status in ('New', 'Preparing') and created_by is null
        and guest_name = (select name from jdone.customers where id = cid) and created_at > now() - interval '6 hours') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'You already have 5 orders being prepared — please call reception');
  end if;
  select * into c from jdone.customers where id = cid;
  select * into b from jdone.bookings where customer_id = cid and status in ('Confirmed', 'Checked-in')
    and check_in <= (now() at time zone 'Asia/Kolkata')::date and check_out >= (now() at time zone 'Asia/Kolkata')::date
    order by check_in desc limit 1;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := least(20, greatest(0, coalesce((l->>'qty')::int, 0)));
    if q = 0 then continue; end if;
    select * into m from jdone.menu_items where id = (l->>'id')::uuid and active;
    if m is null then return jsonb_build_object('ok', false, 'reason', 'A dish is no longer available today — please refresh the menu'); end if;
    unit := coalesce(unit, m.business_unit_id);
    items := items || case when items = '' then '' else E'\n' end || q || ' x ' || m.name;
    lines := lines || jsonb_build_object('item_id', m.id, 'name', m.name, 'qty', q, 'rate', m.price, 'amount', q * m.price);
    total := total + q * m.price;
  end loop;
  if items = '' then return jsonb_build_object('ok', false, 'reason', 'Add at least one dish'); end if;
  insert into jdone.kots (order_type, table_or_room, guest_name, booking_id, items, lines, special_notes, amount, status, source, business_unit_id)
  values ('Room', left(trim(p_room), 60), c.name, b.id, items, lines, nullif(left(trim(coalesce(p_notes, '')), 300), ''), total, 'New', 'Guest app',
          coalesce(unit, b.business_unit_id, (select id from jdone.business_units where short_code = 'UDS')))
  returning kot_no, amount into k;
  return jsonb_build_object('ok', true, 'kot_no', k.kot_no, 'amount', k.amount);
end $$;
revoke all on function jdone.guest_order(jsonb, text, text) from public;
grant execute on function jdone.guest_order(jsonb, text, text) to authenticated;
notify pgrst, 'reload schema';
