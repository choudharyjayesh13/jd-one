import { ShoppingCart } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const PURCHASE_FREQUENCIES = ["Daily", "Weekly", "Monthly", "One-time"] as const;
export const PURCHASE_CATEGORIES = ["Vegetables & fruits", "Grocery & dry ration", "Dairy", "Meat & eggs", "Beverages & bar", "Gas & fuel", "Cleaning & housekeeping", "Linen & toiletries", "Maintenance & hardware", "Stationery & office", "Other"] as const;

/** Everything the property buys — daily (veg, milk), weekly (grocery), monthly (gas, linen) — with bill photo. */
export const purchases = defineEntity({
  name: "purchases",
  label: "Purchases",
  labelSingular: "Purchase",
  icon: ShoppingCart,
  table: "purchases",
  teams: ["operations", "accounts"],
  unitField: "business_unit_id",
  titleField: "item",
  searchFields: ["item", "vendor", "category"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "frequency", label: "Bought", type: "select", options: PURCHASE_FREQUENCIES, required: true, default: "Daily" },
    { name: "category", label: "Category", type: "select", options: PURCHASE_CATEGORIES, required: true },
    { name: "item", label: "Item", type: "text", required: true, placeholder: "Milk, tomatoes, LPG cylinder…" },
    { name: "quantity", label: "Quantity", type: "number", min: 0 },
    { name: "unit", label: "Unit", type: "text", placeholder: "kg, litre, pcs, cylinder" },
    { name: "rate", label: "Rate", type: "money", min: 0, help: "Price per unit (optional)" },
    { name: "amount", label: "Total amount", type: "money", required: true, min: 0, help: "Leave blank to use quantity × rate" },
    { name: "vendor", label: "Vendor / shop", type: "text" },
    { name: "payment_mode", label: "Paid by", type: "select", options: ["Cash", "UPI", "Card", "Bank", "Credit (udhaar)"], default: "Cash" },
    { name: "bought_by", label: "Bought by", type: "relation", entity: "staff" },
    { name: "bill_photo", label: "Bill photo", type: "file" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "item", "quantity", "unit", "amount", "category", "frequency", "vendor", "bought_by"],
  hooks: {
    beforeSave(values, ctx, id) {
      const out = { ...values };
      if ((out.amount === null || out.amount === undefined || out.amount === "") && out.quantity && out.rate) out.amount = Number(out.quantity) * Number(out.rate);
      if (!id && !out.bought_by && ctx.staffId) out.bought_by = ctx.staffId;
      return out;
    },
  },
});
