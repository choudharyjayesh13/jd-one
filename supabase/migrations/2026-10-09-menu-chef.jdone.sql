-- Chef can manage the menu (what's available today + rates); guests read it live in the guest app. 9 Oct 2026.
create or replace function jdone.is_kitchen() returns boolean language sql stable security definer set search_path = jdone, public as $$
  select coalesce((select s.designation ilike '%chef%' from jdone.staff s where s.auth_user_id = auth.uid() and s.active limit 1), false) or jdone.is_hr_admin()
$$;
grant execute on function jdone.is_kitchen() to authenticated;
drop policy if exists "office write" on jdone.menu_items;
drop policy if exists "kitchen write" on jdone.menu_items;
create policy "kitchen write" on jdone.menu_items for all to authenticated using (jdone.is_kitchen()) with check (jdone.is_kitchen());
notify pgrst, 'reload schema';
