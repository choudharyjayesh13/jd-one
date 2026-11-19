import { ClipboardList, CheckCircle2, XCircle, PackageCheck, PackageOpen } from "lucide-react";
import { defineEntity, type Row } from "@/core/schema/types";
import { todayISO, formatNumber } from "@/core/format";
import { IndentForm } from "./IndentForm";

export const INDENT_DEPARTMENTS = ["Kitchen", "F&B Service / bar", "Housekeeping", "Front office", "Maintenance", "Other"] as const;
export const INDENT_STATUSES = ["Requested", "Approved", "Issued", "Received", "Rejected"] as const;

export interface IndentLine {
  stock_id: string | null;
  item: string;
  unit: string;
  qty: number;
  issued_qty?: number;
}

export function indentLines(r: Row | Record<string, unknown>): IndentLine[] {
  const raw = r.lines;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      stock_id: l.stock_id ? String(l.stock_id) : null,
      item: String(l.item ?? ""),
      unit: String(l.unit ?? ""),
      qty: Number(l.qty) || 0,
      issued_qty: l.issued_qty === undefined || l.issued_qty === null ? undefined : Number(l.issued_qty) || 0,
    }))
    .filter((l) => l.item && l.qty > 0);
}

/**
 * Stock request (indent): a department asks Stores for items → Stores approves →
 * issues (stock goes down, as "Issued to department") → the department marks it
 * received. Kitchen raises them under F&B Production; Stores approves them under
 * Stores & Inventory.
 */
export const indents = defineEntity({
  name: "indents",
  label: "Stock requests (indents)",
  labelSingular: "Stock request",
  icon: ClipboardList,
  table: "indents",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "items_summary",
  searchFields: ["department", "notes", "status"],
  defaultSort: { field: "date", dir: "desc" },
  customForm: IndentForm,
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "department", label: "For department", type: "select", options: INDENT_DEPARTMENTS, required: true, default: "Kitchen" },
    {
      name: "items_summary",
      label: "Items",
      type: "text",
      virtual: true,
      computed: (v) =>
        indentLines(v)
          .map((l) => `${formatNumber(l.qty)} ${l.unit} ${l.item}`.replace(/\s+/g, " ").trim() + (l.issued_qty !== undefined && l.issued_qty !== l.qty ? ` (issued ${formatNumber(l.issued_qty)})` : ""))
          .join(", "),
    },
    { name: "lines", label: "Items", type: "multiselect", options: [], hidden: true },
    { name: "needed_by", label: "Needed by", type: "date" },
    { name: "status", label: "Status", type: "select", options: INDENT_STATUSES, required: true, default: "Requested", readOnly: true },
    { name: "requested_by", label: "Requested by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "approved_by", label: "Approved by", type: "relation", entity: "staff", readOnly: true },
    { name: "issued_by", label: "Issued by", type: "relation", entity: "staff", readOnly: true },
    { name: "received_by", label: "Received by", type: "relation", entity: "staff", readOnly: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "department", "items_summary", "status", "requested_by", "needed_by"],
  actions: [
    {
      id: "approve",
      label: "Approve",
      icon: CheckCircle2,
      variant: "primary",
      visible: (r) => r.status === "Requested",
      async run({ record, store, staffId, toast, refresh }) {
        await store.update("indents", record.id, { status: "Approved", approved_by: staffId });
        toast("Approved — Stores can issue it now");
        await refresh();
      },
    },
    {
      id: "issue",
      label: "Issue items",
      icon: PackageOpen,
      variant: "primary",
      visible: (r) => r.status === "Approved",
      async run({ record, store, staffId, toast, refresh, confirm }) {
        const lines = indentLines(record);
        // Issue what is in stock; say what is short before going ahead.
        const issued: IndentLine[] = [];
        const short: string[] = [];
        for (const l of lines) {
          if (!l.stock_id) {
            issued.push({ ...l, issued_qty: l.qty });
            continue;
          }
          const item = await store.get("stock", l.stock_id);
          const have = Math.max(0, Number(item?.quantity ?? 0));
          const give = Math.min(have, l.qty);
          if (give < l.qty) short.push(`${l.item}: ${formatNumber(give)} of ${formatNumber(l.qty)} ${l.unit}`);
          issued.push({ ...l, issued_qty: give });
        }
        if (short.length && !(await confirm(`Not enough stock for:\n${short.join("\n")}\n\nIssue what is available?`))) return;
        for (const l of issued) {
          if (!l.stock_id || !l.issued_qty) continue;
          await store.create("stock-movements", {
            date: todayISO(),
            stock_id: l.stock_id,
            direction: "Out",
            quantity: l.issued_qty,
            source: "Issued to department",
            note: `Indent · ${String(record.department ?? "")}`,
            staff_id: staffId,
            business_unit_id: record.business_unit_id,
            created_by: staffId,
          });
        }
        await store.update("indents", record.id, { status: "Issued", issued_by: staffId, lines: issued });
        toast("Issued — stock updated");
        await refresh();
      },
    },
    {
      id: "receive",
      label: "Mark received",
      icon: PackageCheck,
      variant: "primary",
      visible: (r) => r.status === "Issued",
      async run({ record, store, staffId, toast, refresh }) {
        await store.update("indents", record.id, { status: "Received", received_by: staffId });
        toast("Marked received");
        await refresh();
      },
    },
    {
      id: "reject",
      label: "Reject",
      icon: XCircle,
      variant: "danger",
      visible: (r) => r.status === "Requested" || r.status === "Approved",
      async run({ record, store, staffId, toast, refresh, confirm }) {
        if (!(await confirm("Reject this stock request?"))) return;
        await store.update("indents", record.id, { status: "Rejected", approved_by: staffId });
        toast("Rejected");
        await refresh();
      },
    },
  ],
});
