import { ArrowLeftRight } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const STOCK_DIRECTIONS = ["In", "Out", "Count"] as const;
export const STOCK_SOURCES = ["Consumption", "KOT", "Purchase", "Received", "Wastage", "Laundry / damaged", "Count", "Other"] as const;

/** Every stock change. In adds, Out reduces, Count sets the quantity (the database updates the stock item). */
export const stockMovements = defineEntity({
  name: "stock-movements",
  label: "Stock in / out",
  labelSingular: "Stock entry",
  icon: ArrowLeftRight,
  table: "stock_movements",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "source",
  searchFields: ["source", "note", "direction"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "stock_id", label: "Item", type: "relation", entity: "stock", required: true },
    { name: "direction", label: "In / out", type: "select", options: STOCK_DIRECTIONS, required: true, default: "Out", help: "In = received, Out = used, Count = actual count now" },
    { name: "quantity", label: "Quantity", type: "number", required: true, min: 0 },
    { name: "source", label: "Reason", type: "select", options: STOCK_SOURCES, required: true, default: "Consumption" },
    { name: "kot_id", label: "KOT", type: "relation", entity: "kots", help: "For ingredients used on an order" },
    { name: "staff_id", label: "Entered by", type: "relation", entity: "staff" },
    { name: "note", label: "Note", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "purchase_id", label: "Purchase", type: "relation", entity: "purchases", readOnly: true, hidden: true },
  ],
  listColumns: ["date", "stock_id", "direction", "quantity", "source", "kot_id", "staff_id"],
  hooks: {
    beforeSave(values, ctx, id) {
      const out = { ...values };
      if (!id && !out.staff_id && ctx.staffId) out.staff_id = ctx.staffId;
      if (out.direction === "Count") out.source = "Count";
      return out;
    },
  },
});
