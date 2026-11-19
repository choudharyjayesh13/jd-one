import { Shirt } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { LinenSummary } from "./LinenSummary";

export const LINEN_ITEMS = ["Bedsheet", "Pillow cover", "Duvet / quilt cover", "Bath towel", "Hand towel", "Face towel", "Bath mat", "Bathrobe", "Pool towel", "Table cloth", "Napkin", "Curtain", "Other"] as const;
export const LINEN_MOVES = ["Sent to laundry", "Received from laundry", "Damaged / discarded", "New stock added"] as const;

/** Linen sent to and received from the laundry; the summary shows what is still out. */
export const linenLogs = defineEntity({
  name: "linen-logs",
  label: "Linen & laundry",
  labelSingular: "Linen entry",
  icon: Shirt,
  table: "linen_logs",
  teams: ["property", "operations"],
  unitField: "business_unit_id",
  titleField: "item",
  searchFields: ["item", "vendor", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  listExtra: LinenSummary,
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "item", label: "Item", type: "select", options: LINEN_ITEMS, required: true, default: "Bedsheet" },
    { name: "movement", label: "What happened", type: "select", options: LINEN_MOVES, required: true, default: "Sent to laundry" },
    { name: "quantity", label: "Pieces", type: "number", min: 1, required: true },
    { name: "vendor", label: "Laundry", type: "text", placeholder: "In-house / laundry name" },
    { name: "amount", label: "Laundry charge (₹)", type: "money", min: 0 },
    { name: "done_by", label: "Entered by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "item", "movement", "quantity", "vendor", "amount", "done_by"],
});
