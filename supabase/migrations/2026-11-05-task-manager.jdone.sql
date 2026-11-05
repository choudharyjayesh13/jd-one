-- JD One (5 Nov 2026): Task Manager post — assigns tasks to every staff member (HR → Assign tasks).
-- The Chairman or the Director chooses who holds it. Applied on 5 Nov 2026. Safe to run again.
alter table jdone.org_posts drop constraint if exists org_posts_post_check;
alter table jdone.org_posts add constraint org_posts_post_check check (post in ('chairman', 'director', 'property_supervisor', 'task_manager'));
insert into jdone.org_posts (post) values ('task_manager') on conflict (post) do nothing;
drop policy if exists "director sets task manager" on jdone.org_posts;
create policy "director sets task manager" on jdone.org_posts for update to authenticated
  using (jdone.is_director() and post = 'task_manager') with check (jdone.is_director() and post = 'task_manager');
