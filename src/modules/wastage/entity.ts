import { Trash } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const WASTAGE_REASONS = ["Spoiled", "Expired", "Leftover", "Burnt / overcooked", "Returned by guest", "Dropped / broken", "Other"] as const;

/** Food or stock thrown away. Picking a stock item takes the quantity off stock (as a Wastage movement). */
export const wastage = defineEntity({
  name: "wastage",
  label: "Wastage",
  labelSingular: "Wastage entry",
  icon: Trash,
  table: "wastage",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "item",
  searchFields: ["item", "reason", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "item", label: "What was wasted", type: "text", required: true, placeholder: "Paneer, cooked rice, milk…" },
    { name: "stock_id", label: "Stock item (optional)", type: "relation", entity: "stock", help: "Pick it to take the quantity off stock" },
    { name: "quantity", label: "Quantity", type: "number", min: 0 },
    { name: "unit", label: "Unit", type: "text", placeholder: "kg, litre, plates, pcs" },
    { name: "reason", label: "Reason", type: "select", options: WASTAGE_REASONS, required: true, default: "Spoiled" },
    { name: "value", label: "Approx. value (₹)", type: "money", min: 0 },
    { name: "photo", label: "Photo", type: "file" },
    { name: "recorded_by", label: "Recorded by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "item", "quantity", "unit", "reason", "value", "recorded_by"],
  hooks: {
    async afterCreate(record, ctx) {
      if (!record.stock_id || !Number(record.quantity)) return;
      await ctx.store.create("stock-movements", {
        date: record.date,
        stock_id: record.stock_id,
        direction: "Out",
        quantity: Number(record.quantity),
        source: "Wastage",
        note: `Wastage: ${String(record.reason ?? "")}`,
        staff_id: record.recorded_by ?? ctx.staffId,
        business_unit_id: record.business_unit_id,
        created_by: ctx.staffId,
      });
    },
  },
});
