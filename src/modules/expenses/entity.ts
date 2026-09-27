import { Receipt } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const EXPENSE_CATEGORIES = ["Utilities & power", "Salaries & staff", "Maintenance & hardware", "Kitchen & food", "Fuel & gas", "Ads, marketing & hiring", "Other"] as const;

export const expenses = defineEntity({
  name: "expenses",
  label: "Expenses",
  labelSingular: "Expense",
  icon: Receipt,
  table: "expenses",
  teams: ["accounts", "finance"],
  unitField: "business_unit_id",
  titleField: "vendor",
  searchFields: ["vendor", "detail", "category"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "amount", label: "Amount", type: "money", required: true, min: 0 },
    { name: "category", label: "Category", type: "select", options: EXPENSE_CATEGORIES, required: true },
    { name: "vendor", label: "Vendor / paid to", type: "text", required: true },
    { name: "detail", label: "Detail", type: "textarea" },
    { name: "paid_by", label: "Paid by", type: "relation", entity: "staff" },
    { name: "mode", label: "Mode", type: "select", options: ["Cash", "UPI", "Card", "Bank"], default: "Cash" },
    { name: "receipt", label: "Receipt photo", type: "file" },
  ],
  listColumns: ["date", "vendor", "amount", "category", "business_unit_id", "paid_by", "mode"],
});
