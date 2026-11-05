-- JD One phase 2 (4 Nov 2026): one booking, several room categories.
--   bookings.room_lines = [{unit_type, rooms, adults, children, meal_plan, rate, room_ids[]}, …]
--   The first category is still copied to unit_type / units / room_id, so older screens keep working.
--   The website's availability check now counts every category of a booking.
-- Run once in Supabase → SQL Editor. Safe to run again. Changes no existing data.

alter table jdone.bookings add column if not exists room_lines jsonb not null default '[]'::jsonb;

-- Rooms of a type that are free on EVERY night of the stay (website booking engine).
create or replace function jdone.be_free_rooms(p_unit uuid, p_type text, p_in date, p_out date) returns integer
language sql stable security definer set search_path = jdone, public as $$
  select greatest(0, (select count(*) from jdone.rooms r where r.business_unit_id = p_unit and r.unit_type = p_type and r.active and r.status <> 'Out of order')::int
    - coalesce((select max(used) from (
        select d::date as night,
               sum(case
                     when jsonb_typeof(b.room_lines) = 'array' and jsonb_array_length(b.room_lines) > 0 then
                       (select coalesce(sum(greatest(1, coalesce((l ->> 'rooms')::int, 1))), 0)
                          from jsonb_array_elements(b.room_lines) l where l ->> 'unit_type' = p_type)
                     when b.unit_type = p_type then coalesce(b.units, 1)
                     else 0
                   end) as used
        from generate_series(p_in, p_out - 1, interval '1 day') d
        join jdone.bookings b on b.business_unit_id = p_unit
          and b.check_in <= d::date and b.check_out > d::date
          and (b.status in ('Confirmed', 'Checked-in') or (b.status = 'On hold' and (b.hold_until is null or b.hold_until > now())))
        group by d) x), 0))
$$;
