import { Flame } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const GAS_EVENTS = ["Full received", "Connected to stove", "Empty returned"] as const;

/** LPG cylinders: received full, connected, returned empty. */
export const gasLogs = defineEntity({
  name: "gas-logs",
  label: "Gas cylinders",
  labelSingular: "Gas cylinder entry",
  icon: Flame,
  table: "gas_logs",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "event",
  searchFields: ["vendor", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "event", label: "What happened", type: "select", options: GAS_EVENTS, required: true, default: "Connected to stove" },
    { name: "cylinders", label: "Cylinders", type: "number", min: 1, default: 1, required: true },
    { name: "vendor", label: "Gas agency", type: "text" },
    { name: "amount", label: "Amount paid (₹)", type: "money", min: 0, help: "For cylinders received" },
    { name: "entered_by", label: "Entered by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "event", "cylinders", "vendor", "amount", "entered_by"],
});
