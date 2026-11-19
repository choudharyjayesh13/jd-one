-- JD One (4 Nov 2026): Room chart — "Do not disturb" on a room. Safe to run again.
alter table jdone.rooms add column if not exists dnd boolean not null default false;
