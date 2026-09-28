import { CalendarCheck } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const ATTENDANCE_STATUSES = ["P", "A", "H", "L"] as const;
export const ATTENDANCE_LABELS: Record<string, string> = { P: "Present", A: "Absent", H: "Half day", L: "Leave" };

export const attendance = defineEntity({
  name: "attendance",
  label: "Attendance",
  labelSingular: "Attendance entry",
  icon: CalendarCheck,
  table: "attendance",
  teams: ["hr"],
  titleField: "date",
  searchFields: ["remarks", "date"],
  defaultSort: { field: "date", dir: "desc" },
  unique: [["date", "staff_id"]],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "staff_id", label: "Staff", type: "relation", entity: "staff", required: true },
    { name: "status", label: "Status", type: "select", options: ATTENDANCE_STATUSES, required: true, default: "P", help: "P present · A absent · H half day · L leave" },
    { name: "remarks", label: "Remarks", type: "text" },
    // Captured by the phone check-in page (Mark attendance).
    { name: "checked_in_at", label: "Checked in", type: "datetime" },
    { name: "checked_out_at", label: "Checked out", type: "datetime" },
    { name: "selfie", label: "Check-in selfie", type: "file" },
    { name: "selfie_out", label: "Check-out selfie", type: "file" },
    { name: "latitude", label: "Latitude", type: "number", step: 0.000001, readOnly: true },
    { name: "longitude", label: "Longitude", type: "number", step: 0.000001, readOnly: true },
    { name: "accuracy_m", label: "GPS accuracy (m)", type: "number", readOnly: true },
    { name: "distance_m", label: "Distance from property (m)", type: "number", readOnly: true },
    { name: "location_ok", label: "On site", type: "boolean", readOnly: true },
    { name: "device", label: "Device", type: "text", readOnly: true, hidden: true },
  ],
  listColumns: ["date", "staff_id", "status", "checked_in_at", "checked_out_at", "distance_m", "selfie"],
});
