-- Booking engine quote: say WHY a room type has no price (e.g. 'Minimum stay 2 nights for these dates' on Diwali / 31 Dec) instead of 'Not available'. 9 Oct 2026.
create or replace function jdone.be_quote(p_unit_code text, p_in date, p_out date, p_adults int, p_children int, p_rooms int)
returns jsonb language plpgsql stable security definer set search_path = jdone, public as $$
declare u uuid; t record; out jsonb := '[]'::jsonb; plans jsonb; free int; per_room_adults int; per_room_children int; maxa int; pr jsonb; mp text; why text;
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
    plans := '[]'::jsonb; why := null;
    if per_room_adults <= maxa then
      foreach mp in array array['CP', 'MAP', 'AP'] loop
        pr := jdone.be_price(u, t.unit_type, mp, p_in, p_out, per_room_adults, per_room_children);
        if (pr->>'ok')::boolean then
          plans := plans || jsonb_build_array(pr || jsonb_build_object('meal_plan', mp,
            'room_amount', (pr->>'room_amount')::numeric * p_rooms, 'tax', (pr->>'tax')::numeric * p_rooms, 'total', (pr->>'total')::numeric * p_rooms));
        else why := coalesce(why, pr->>'reason');
        end if;
      end loop;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('unit_type', t.unit_type, 'free_rooms', free, 'bookable', free >= p_rooms and jsonb_array_length(plans) > 0,
      'max_adults_per_room', maxa, 'plans', plans,
      'note', case when per_room_adults > maxa then 'Too many guests per room — add a room' when free < p_rooms then 'Sold out for these dates' when jsonb_array_length(plans) = 0 then coalesce(why, 'Not available for these dates') else null end));
  end loop;
  return jsonb_build_object('nights', p_out - p_in, 'rooms', p_rooms, 'types', out);
end $$;
notify pgrst, 'reload schema';
