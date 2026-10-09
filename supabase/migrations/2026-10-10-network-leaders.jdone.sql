-- JD One network: local leaders directory (panchayat + urban representatives). Safe to re-run.
create table if not exists jdone.leaders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Sarpanch',
  body_type text not null default 'Gram Panchayat',
  body_name text not null,
  ward_no text,
  area text,
  state text not null default 'Rajasthan',
  district text not null,
  city text not null,
  party text default 'Not known',
  party_symbol text,
  phone text,
  photo text,
  in_office_since date,
  term text,
  in_politics_since int,
  previous_posts text,
  status text not null default 'In office',
  verified boolean not null default false,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references jdone.staff(id) on delete set null
);
create index if not exists leaders_geo_idx on jdone.leaders (state, district, city);

drop trigger if exists set_updated_at on jdone.leaders;
create trigger set_updated_at before update on jdone.leaders for each row execute function jdone.set_updated_at();
alter table jdone.leaders enable row level security;
drop policy if exists "staff read" on jdone.leaders;
create policy "staff read" on jdone.leaders for select to authenticated using (jdone.is_staff());
drop policy if exists "staff insert" on jdone.leaders;
create policy "staff insert" on jdone.leaders for insert to authenticated with check (jdone.is_staff());
drop policy if exists "staff update" on jdone.leaders;
create policy "staff update" on jdone.leaders for update to authenticated using (jdone.is_staff()) with check (jdone.is_staff());
drop policy if exists "owner delete" on jdone.leaders;
create policy "owner delete" on jdone.leaders for delete to authenticated using (jdone.is_owner());
grant select, insert, update, delete on jdone.leaders to authenticated;
