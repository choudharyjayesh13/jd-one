import { ClipboardCheck, MoonStar } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/** A department's end-of-day report: the day's figures (snapshot) plus the staff member's note. */
export const deptReports = defineEntity({
  name: "dept-reports",
  label: "Department reports",
  labelSingular: "Department report",
  icon: ClipboardCheck,
  table: "dept_reports",
  teams: ["operations"],
  hidden: true,
  titleField: "department",
  searchFields: ["department", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true },
    { name: "department", label: "Department", type: "text", required: true },
    { name: "data", label: "Figures", type: "multiselect", hidden: true },
    { name: "notes", label: "Note", type: "textarea" },
    { name: "submitted_by", label: "Submitted by", type: "relation", entity: "staff" },
    { name: "submitted_at", label: "Submitted at", type: "datetime" },
  ],
  listColumns: ["date", "department", "submitted_by"],
});

/** Night audit: the day closed, with every department's figures, warnings and notes. */
export const nightAudits = defineEntity({
  name: "night-audits",
  label: "Night audits",
  labelSingular: "Night audit",
  icon: MoonStar,
  table: "night_audits",
  teams: ["operations"],
  hidden: true,
  titleField: "date",
  searchFields: ["notes"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true },
    { name: "data", label: "Figures", type: "multiselect", hidden: true },
    { name: "warnings", label: "Warnings", type: "multiselect", hidden: true },
    { name: "notes", label: "Note", type: "textarea" },
    { name: "closed_by", label: "Closed by", type: "relation", entity: "staff" },
    { name: "closed_at", label: "Closed at", type: "datetime" },
  ],
  listColumns: ["date", "closed_by"],
});
