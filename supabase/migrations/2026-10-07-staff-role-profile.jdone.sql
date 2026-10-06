-- JD One — staff role profile (7 Oct 2026): job description + 5 KPIs + 5 KRAs per staff member.
-- Filled by owner/manager/HR on the staff record; shown to the staff member on My Day.
alter table jdone.staff
  add column if not exists job_description text,
  add column if not exists kpi_1 text, add column if not exists kpi_2 text, add column if not exists kpi_3 text,
  add column if not exists kpi_4 text, add column if not exists kpi_5 text,
  add column if not exists kra_1 text, add column if not exists kra_2 text, add column if not exists kra_3 text,
  add column if not exists kra_4 text, add column if not exists kra_5 text,
  add column if not exists role_profile_updated_at timestamptz;
notify pgrst, 'reload schema';
