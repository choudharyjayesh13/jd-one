-- Staff KYC: Aadhaar (number + photos) and parents / guardian details. Private: each person sees only their own;
-- owner / manager / HR see all. Photos in the PRIVATE bucket `staff-docs` (signed URLs only). 8 Oct 2026.
create table if not exists jdone.staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references jdone.staff(id) on delete cascade,
  aadhaar_number text check (aadhaar_number is null or aadhaar_number ~ '^\d{12}$'),
  aadhaar_front text,
  aadhaar_back text,
  father_name text,
  mother_name text,
  guardian_name text,
  guardian_relation text,
  guardian_phone text,
  verified boolean not null default false,
  verified_by uuid references jdone.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_updated_at on jdone.staff_documents;
create trigger set_updated_at before update on jdone.staff_documents for each row execute function jdone.set_updated_at();
alter table jdone.staff_documents enable row level security;
drop policy if exists "own or hr read" on jdone.staff_documents;
create policy "own or hr read" on jdone.staff_documents for select to authenticated
  using (jdone.is_hr_admin() or staff_id in (select s.id from jdone.staff s where s.auth_user_id = auth.uid()));
drop policy if exists "own or hr insert" on jdone.staff_documents;
create policy "own or hr insert" on jdone.staff_documents for insert to authenticated
  with check (jdone.is_hr_admin() or staff_id in (select s.id from jdone.staff s where s.auth_user_id = auth.uid()));
drop policy if exists "own or hr update" on jdone.staff_documents;
create policy "own or hr update" on jdone.staff_documents for update to authenticated
  using (jdone.is_hr_admin() or staff_id in (select s.id from jdone.staff s where s.auth_user_id = auth.uid()))
  with check (jdone.is_hr_admin() or staff_id in (select s.id from jdone.staff s where s.auth_user_id = auth.uid()));
drop policy if exists "owner delete" on jdone.staff_documents;
create policy "owner delete" on jdone.staff_documents for delete to authenticated using (jdone.is_owner());
grant select, insert, update, delete on jdone.staff_documents to authenticated, service_role;

insert into storage.buckets (id, name, public) values ('staff-docs', 'staff-docs', false)
  on conflict (id) do update set public = false;
drop policy if exists "staff-docs own or hr read" on storage.objects;
create policy "staff-docs own or hr read" on storage.objects for select to authenticated
  using (bucket_id = 'staff-docs' and (jdone.is_hr_admin() or (storage.foldername(name))[1] in (select s.id::text from jdone.staff s where s.auth_user_id = auth.uid())));
drop policy if exists "staff-docs own or hr insert" on storage.objects;
create policy "staff-docs own or hr insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-docs' and (jdone.is_hr_admin() or (storage.foldername(name))[1] in (select s.id::text from jdone.staff s where s.auth_user_id = auth.uid())));
drop policy if exists "staff-docs own or hr update" on storage.objects;
create policy "staff-docs own or hr update" on storage.objects for update to authenticated
  using (bucket_id = 'staff-docs' and (jdone.is_hr_admin() or (storage.foldername(name))[1] in (select s.id::text from jdone.staff s where s.auth_user_id = auth.uid())));
notify pgrst, 'reload schema';
