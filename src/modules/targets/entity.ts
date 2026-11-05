import { Goal } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";
import { currentMonth } from "@/core/format";

/** Monthly sales target per unit; edited from Settings, read by the dashboard. */
export const targets = defineEntity({
  name: "targets",
  label: "Targets",
  labelSingular: "Target",
  icon: Goal,
  table: "targets",
  teams: ["finance"],
  hidden: true,
  titleField: "month",
  searchFields: ["month"],
  defaultSort: { field: "month", dir: "desc" },
  unique: [["business_unit_id", "month"]],
  permissions: { create: [...ADMIN_ROLES, "finance"], update: [...ADMIN_ROLES, "finance"], delete: ["owner"] },
  fields: [
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "month", label: "Month (yyyy-mm)", type: "text", required: true, default: currentMonth, placeholder: "2026-09" },
    { name: "target_amount", label: "Target sales", type: "money", required: true, min: 0 },
    { name: "occupancy_target", label: "Occupancy target %", type: "number", min: 0, max: 100, default: 70 },
    { name: "adr_target", label: "ADR target (avg rate per room night)", type: "money", min: 0, help: "Leave blank to calculate from sales and occupancy" },
  ],
  listColumns: ["month", "business_unit_id", "target_amount", "occupancy_target", "adr_target"],
});
