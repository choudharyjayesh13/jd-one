import { Package, PackagePlus, PackageMinus, ClipboardCheck } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { newHref } from "@/core/routes";

export const STOCK_CATEGORIES = ["Kitchen", "Housekeeping", "Bar & beverages", "Cleaning", "Other"] as const;

/**
 * Kitchen stock + housekeeping inventory. The quantity is kept by the database from
 * Stock in / out entries: purchases add, KOT / daily consumption reduce, a count sets it.
 */
export const stock = defineEntity({
  name: "stock",
  label: "Stock & inventory",
  labelSingular: "Stock item",
  icon: Package,
  table: "stock",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "item",
  searchFields: ["item", "category", "unit", "pack_size"],
  defaultSort: { field: "item", dir: "asc" },
  fields: [
    { name: "item", label: "Item", type: "text", required: true },
    { name: "category", label: "Category", type: "select", options: STOCK_CATEGORIES, required: true, default: "Kitchen" },
    { name: "quantity", label: "In stock now", type: "number", min: 0, help: "Count it and enter, or use Count / Add / Use below — purchases and consumption update it automatically" },
    { name: "unit", label: "Unit", type: "text", placeholder: "pkt, kg, g, bottle, pcs", default: "pcs" },
    { name: "pack_size", label: "Pack size", type: "text", placeholder: "100 g, 500 g, 1 kg" },
    { name: "min_quantity", label: "Re-order below", type: "number", min: 0, default: 0, help: "Flagged as low stock at or below this" },
    { name: "low_stock", label: "Low stock", type: "boolean", computed: (v) => v.quantity !== null && v.quantity !== undefined && v.quantity !== "" && Number(v.quantity) <= Number(v.min_quantity ?? 0) },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "last_counted", label: "Last counted", type: "date" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["item", "category", "quantity", "unit", "pack_size", "low_stock", "last_counted"],
  reverse: [{ entity: "stock-movements", field: "stock_id", label: "Stock in / out history" }],
  actions: [
    { id: "count", label: "Count", icon: ClipboardCheck, variant: "primary",
      run: ({ record, navigate }) => navigate(newHref("stock-movements", { stock_id: record.id, direction: "Count", source: "Count", business_unit_id: record.business_unit_id })) },
    { id: "add", label: "Add stock", icon: PackagePlus,
      run: ({ record, navigate }) => navigate(newHref("stock-movements", { stock_id: record.id, direction: "In", source: "Received", business_unit_id: record.business_unit_id })) },
    { id: "use", label: "Use / consume", icon: PackageMinus,
      run: ({ record, navigate }) => navigate(newHref("stock-movements", { stock_id: record.id, direction: "Out", source: "Consumption", business_unit_id: record.business_unit_id })) },
  ],
});
