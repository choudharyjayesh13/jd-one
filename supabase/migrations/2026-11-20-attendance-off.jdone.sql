
-- ===== Attendance: O = Off (20 Nov 2026) =====
alter table jdone.attendance drop constraint if exists attendance_status_check;
alter table jdone.attendance add constraint attendance_status_check check (status = any (array['P','A','H','L','O']));
