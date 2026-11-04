-- JD One (4 Nov 2026): Property Supervisor post + report duty.
--   The Director, the Chairman and the Property Supervisor assign who sends which department's
--   end-of-day report ("report-<department>") and who runs the night audit ("night-audit").
-- Safe to run again. Changes no existing data.

alter table jdone.org_posts drop constraint if exists org_posts_post_check;
alter table jdone.org_posts add constraint org_posts_post_check check (post in ('chairman', 'director', 'property_supervisor'));
insert into jdone.org_posts (post, holder_name, email) values ('property_supervisor', null, null) on conflict (post) do nothing;

create or replace function jdone.is_property_supervisor() returns boolean
language sql stable security definer set search_path = jdone, public as $$
  select exists (
    select 1 from jdone.org_posts
    where post = 'property_supervisor' and email is not null and lower(email) = jdone.current_email() and jdone.current_email() <> ''
  )
$$;
grant execute on function jdone.is_property_supervisor() to authenticated, service_role;

-- Team access stays with the Chairman / Director; report duty rows can also be set by the Property Supervisor.
drop policy if exists "admin insert" on jdone.staff_access;
create policy "admin insert" on jdone.staff_access for insert to authenticated
  with check (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')));
drop policy if exists "admin update" on jdone.staff_access;
create policy "admin update" on jdone.staff_access for update to authenticated
  using (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')))
  with check (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')));
drop policy if exists "admin delete" on jdone.staff_access;
create policy "admin delete" on jdone.staff_access for delete to authenticated
  using (jdone.is_access_admin() or (jdone.is_property_supervisor() and (module = 'night-audit' or module like 'report-%')));

-- When the Property Supervisor is known, run this one line (put the real name and login email):
--   update jdone.org_posts set holder_name = 'Name', email = 'login@example.com' where post = 'property_supervisor';
