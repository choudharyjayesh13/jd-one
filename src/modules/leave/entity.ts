import { CalendarOff } from "lucide-react";
import { defineEntity, type Row } from "@/core/schema/types";

export const LEAVE_KINDS = ["Weekly off", "Monthly off", "Leave", "Half day", "Emergency"] as const;
export const LEAVE_HINT: Record<string, string> = {
  "Weekly off": "Your weekly day off",
  "Monthly off": "Monthly off day",
  Leave: "Planned leave, one or more days",
  "Half day": "Half of one day",
  Emergency: "Something urgent came up",
};

const EVERYONE = ["owner", "manager", "hr", "accounts", "finance", "marketing", "staff"] as const;

/** HR → Leave requests. Rules (own requests, who approves) are enforced in the database. */
export const leaveRequests = defineEntity({
  name: "leave-requests",
  label: "Leave requests",
  labelSingular: "Leave request",
  icon: CalendarOff,
  table: "leave_requests",
  teams: ["hr"],
  hidden: true,
  titleField: "kind",
  searchFields: ["kind", "reason"],
  defaultSort: { field: "date_from", dir: "desc" },
  permissions: { read: [...EVERYONE], create: [...EVERYONE], update: [...EVERYONE], delete: ["owner"] },
  fields: [
    { name: "staff_id", label: "Employee", type: "relation", entity: "staff", required: true },
    { name: "kind", label: "Type", type: "select", options: LEAVE_KINDS, required: true },
    { name: "date_from", label: "From", type: "date", required: true },
    { name: "date_to", label: "To", type: "date", required: true },
    { name: "days", label: "Days", type: "number" },
    { name: "reason", label: "Reason", type: "textarea", required: true },
    { name: "status", label: "Status", type: "select", options: ["Pending", "Approved", "Rejected", "Cancelled"] },
    { name: "decided_by", label: "Decided by", type: "relation", entity: "staff" },
    { name: "decided_at", label: "Decided at", type: "datetime" },
    { name: "decision_note", label: "Note from approver", type: "text" },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units" },
  ],
  listColumns: ["date_from", "staff_id", "kind", "status"],
});

/** Approved leave covering a date for a staff member (for the roster and My Day). */
export function leaveOn(rows: Row[], staffId: string, date: string): Row | null {
  return rows.find((r) => String(r.staff_id) === staffId && r.status === "Approved" && String(r.date_from) <= date && String(r.date_to) >= date) ?? null;
}
