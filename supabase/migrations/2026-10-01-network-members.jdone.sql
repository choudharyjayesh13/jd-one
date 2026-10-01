-- JD One — migration 1 Oct 2026 (b): network members + network discounts.
-- Run AFTER 2026-10-01-owner-network.jdone.sql. Idempotent.

-- Each business sets what it gives the network: default 10% to customers dealing directly, 15% owner-to-owner.
alter table jdone.business_units
  add column if not exists network_customer_discount_pct numeric(5,2) not null default 10,
  add column if not exists network_owner_discount_pct numeric(5,2) not null default 15,
  add column if not exists network_offer text;

-- ---------------------------------------------------------------- owners
insert into jdone.owners (name, city, kind, notes)
select v.name, v.city, 'Individual', v.notes
from (values
  ('Deepak Chaudhary', 'Udaipur', 'Owns The Artist House and The Belmonte House'),
  ('Neelam Mevada', 'Udaipur', 'Owns House of Beauty'),
  ('Navin Suman', 'Udaipur', 'Jayesh''s friend — Stepwhere (child-safety footwear) and LOECEL; co-owners: Shubham Rao (Stepwhere), Navin''s wife (LOECEL — name needed)'),
  ('Shubham Rao', 'Udaipur', 'Jayesh''s friend — co-owner of Stepwhere')
) as v(name, city, notes)
where not exists (select 1 from jdone.owners o where o.name = v.name);

-- ---------------------------------------------------------------- businesses
insert into jdone.business_units (name, short_code, type, city, active, network_offer)
select v.name, v.short_code, v.type, v.city, true, v.offer
from (values
  ('The Belmonte House', 'TBH', 'Hotel', 'Udaipur', 'Boutique stay near Geetanjali Hospital, Udaipur'),
  ('Stepwhere', 'STW', 'Shop / retail', 'Udaipur', 'Smart child-safety footwear (stepwhere.in)'),
  ('LOECEL', 'LOE', 'Shop / retail', 'Udaipur', null)
) as v(name, short_code, type, city, offer)
on conflict (name) do nothing;

update jdone.business_units set type = coalesce(type, 'Hotel'), network_offer = coalesce(network_offer, 'Boutique hotel in a heritage theatre building, Udaipur') where name = 'The Artist House';
update jdone.business_units set type = coalesce(type, 'Salon'), network_offer = coalesce(network_offer, 'Salon & beauty (L''Oréal partner)') where name = 'House of Beauty';

-- ---------------------------------------------------------------- ownership
update jdone.business_units set owner_id = (select id from jdone.owners where name = 'Deepak Chaudhary')
 where owner_id is null and name in ('The Artist House', 'The Belmonte House');
update jdone.business_units set owner_id = (select id from jdone.owners where name = 'Neelam Mevada')
 where owner_id is null and name = 'House of Beauty';
update jdone.business_units set owner_id = (select id from jdone.owners where name = 'Navin Suman')
 where owner_id is null and name in ('Stepwhere', 'LOECEL');

-- Co-owner: Shubham Rao gets an owner-role seat at Stepwhere (sees that business once his login is linked by email).
insert into jdone.staff (name, role, business_unit_id, designation, active, notes)
select 'Shubham Rao', 'owner', (select id from jdone.business_units where name = 'Stepwhere'), 'Co-owner', true, 'Co-owner of Stepwhere; add email so sign-up links automatically'
where not exists (select 1 from jdone.staff s where s.name = 'Shubham Rao' and s.business_unit_id = (select id from jdone.business_units where name = 'Stepwhere'));

-- ---------------------------------------------------------------- network promotions on every active business
insert into jdone.promotions (name, offer_type, business_unit_id, kind, value, unit_type, date_from, date_to, min_nights, channel, active, terms)
select 'JD One network — customer direct 10%', 'Loyalty', u.id, 'Percent', u.network_customer_discount_pct, 'All', '2026-10-01', '2030-12-31', 1, 'Direct / website', true,
       'For JD One customers dealing directly with this member (not via OTAs/marketplaces).'
from jdone.business_units u
where u.active and not exists (select 1 from jdone.promotions p where p.business_unit_id = u.id and p.name = 'JD One network — customer direct 10%');

insert into jdone.promotions (name, offer_type, business_unit_id, kind, value, unit_type, date_from, date_to, min_nights, channel, active, terms)
select 'JD One network — owner to owner', 'Special user', u.id, 'Percent', u.network_owner_discount_pct, 'All', '2026-10-01', '2030-12-31', 1, 'Direct / website', true,
       'For other JD One owners and their businesses dealing directly with this member.'
from jdone.business_units u
where u.active and not exists (select 1 from jdone.promotions p where p.business_unit_id = u.id and p.name = 'JD One network — owner to owner');

grant all on all tables in schema jdone to anon, authenticated, service_role;
