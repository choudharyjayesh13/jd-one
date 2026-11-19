-- HR → Employees → Password: the Chairman or the Director sets a new password for a team member.
-- Only the Chairman can change the Chairman's password. Passwords stay encrypted (bcrypt).
create or replace function jdone.admin_set_password(p_staff uuid, p_password text)
returns void language plpgsql security definer set search_path = jdone, public, extensions as $$
declare
  v_uid uuid;
  v_email text;
begin
  if not jdone.is_access_admin() then
    raise exception 'Only the Chairman or the Director can set a password.';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'The password must be at least 8 characters.';
  end if;
  select auth_user_id into v_uid from jdone.staff where id = p_staff;
  if v_uid is null then
    raise exception 'This person has no app login yet.';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if not jdone.is_chairman()
     and exists (select 1 from jdone.org_posts where post = 'chairman' and lower(email) = v_email) then
    raise exception 'Only the Chairman can change the Chairman''s password.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('must_change_password', false, 'password_set_by_admin_at', now()),
         updated_at = now()
   where id = v_uid;
end $$;
revoke all on function jdone.admin_set_password(uuid, text) from public, anon;
grant execute on function jdone.admin_set_password(uuid, text) to authenticated;
