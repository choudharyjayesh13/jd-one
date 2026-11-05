import { Store } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { MONEY_ROLES } from "@/modules/salary-payments/entity";

/** Suppliers, utilities and contractors we pay. (Repair contacts for staff stay under "Repair contacts".) */
export const vendors = defineEntity({
  name: "vendors",
  label: "Vendors",
  labelSingular: "Vendor",
  icon: Store,
  table: "vendors",
  teams: ["accounts", "finance"],
  titleField: "name",
  searchFields: ["name", "category", "supplies", "phone"],
  defaultSort: { field: "total_paid", dir: "desc" },
  permissions: { read: MONEY_ROLES, create: MONEY_ROLES, update: MONEY_ROLES, delete: ["owner"] },
  fields: [
    { name: "name", label: "Vendor", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "category", label: "Category", type: "select", options: ["Utilities & power", "Kitchen & food", "Fuel & gas", "Maintenance & hardware", "Housekeeping & laundry", "Pool & garden", "Ads, marketing & hiring", "Furniture & fittings", "Transport", "Other"], required: true, default: "Other" },
    { name: "supplies", label: "What they supply", type: "textarea" },
    { name: "payment_details", label: "UPI / bank details", type: "text" },
    { name: "total_paid", label: "Total paid so far", type: "money", min: 0 },
    { name: "payments_count", label: "No. of payments", type: "number", min: 0 },
    { name: "first_paid", label: "First paid", type: "date" },
    { name: "last_paid", label: "Last paid", type: "date" },
    { name: "active", label: "Active", type: "boolean", default: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "category", "total_paid", "last_paid", "phone"],
});
