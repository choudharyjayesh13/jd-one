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
  ],
  listColumns: ["date", "staff_id", "status", "remarks"],
});
