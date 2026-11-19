import { FilePenLine } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

const EVERYONE = ["owner", "manager", "hr", "accounts", "finance", "marketing", "staff"] as const;

/**
 * Entries that are final once saved. Only the fields listed can still be filled in by anyone
 * (status, proof photos, notes…); any other change becomes an edit request that the Director or
 * Chairman approves. The same lists are enforced in the database (jdone.guard_locked_edit).
 */
export const LOCKED_ENTITIES: Record<string, string[]> = {
  vouchers: ["status", "paid_on", "mode", "reference", "payment_proof", "paid_by", "paid_to_account", "notes", "payee_qr"],
  payments: ["notes"],
  expenses: ["receipt"],
  "petty-cash": ["receipt", "notes"],
  purchases: ["bill_photo", "notes"],
  "salary-payments": ["notes"],
  "payment-requests": ["status", "sent_at", "paid_at", "payment_id", "upi_link", "notes"],
  kots: ["status", "served_at", "printed_at", "special_notes"],
  "daily-reports": ["remarks", "electricity_photo"],
  "purchase-orders": ["status", "received_on", "notes"],
  checkins: ["actual_out", "notes"],
  "meter-readings": ["photo", "note"],
};

export const editRequests = defineEntity({
  name: "edit-requests",
  label: "Edit approvals",
  labelSingular: "Edit request",
  icon: FilePenLine,
  table: "edit_requests",
  teams: ["operations"],
  hidden: true,
  titleField: "record_label",
  searchFields: ["record_label", "reason", "entity"],
  defaultSort: { field: "created_at", dir: "desc" },
  permissions: { read: [...EVERYONE], create: [...EVERYONE], update: [...EVERYONE], delete: ["owner"] },
  fields: [
    { name: "entity", label: "What", type: "text", required: true },
    { name: "record_id", label: "Record", type: "text", required: true },
    { name: "record_label", label: "Entry", type: "text" },
    { name: "changes", label: "Changes", type: "multiselect", hidden: true },
    { name: "patch", label: "New values", type: "multiselect", hidden: true },
    { name: "reason", label: "Why", type: "textarea", required: true },
    { name: "status", label: "Status", type: "select", options: ["Pending", "Approved", "Rejected", "Cancelled"] },
    { name: "requested_by", label: "Asked by", type: "relation", entity: "staff" },
    { name: "decided_by", label: "Decided by", type: "relation", entity: "staff" },
    { name: "decided_at", label: "Decided at", type: "datetime" },
    { name: "decision_note", label: "Note from approver", type: "text" },
  ],
  listColumns: ["created_at", "entity", "record_label", "status"],
});
