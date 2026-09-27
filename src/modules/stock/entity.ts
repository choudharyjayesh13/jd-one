import { Package } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const stock = defineEntity({
  name: "stock",
  label: "Stock",
  labelSingular: "Stock item",
  icon: Package,
  table: "stock",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "item",
  searchFields: ["item", "unit"],
  defaultSort: { field: "item", dir: "asc" },
  fields: [
    { name: "item", label: "Item", type: "text", required: true },
    { name: "unit", label: "Unit", type: "text", placeholder: "kg, litre, pcs", default: "pcs" },
    { name: "quantity", label: "Quantity", type: "number", required: true, min: 0, default: 0 },
    { name: "min_quantity", label: "Minimum quantity", type: "number", min: 0, default: 0, help: "Flagged as low stock at or below this" },
    { name: "low_stock", label: "Low stock", type: "boolean", computed: (v) => Number(v.quantity ?? 0) <= Number(v.min_quantity ?? 0) },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "last_counted", label: "Last counted", type: "date", default: todayISO },
  ],
  listColumns: ["item", "quantity", "unit", "min_quantity", "low_stock", "business_unit_id", "last_counted"],
});
