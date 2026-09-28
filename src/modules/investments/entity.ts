import { TrendingUp } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const INVESTMENT_STATUSES = ["Active", "Matured", "Withdrawn", "Cancelled"] as const;

/** An investor's holding in a JD Group project/venture, shown on the customer portal. */
export const investments = defineEntity({
  name: "investments",
  label: "Investments",
  labelSingular: "Investment",
  icon: TrendingUp,
  table: "investments",
  teams: ["finance", "accounts"],
  titleField: "project",
  searchFields: ["project", "reference", "notes"],
  defaultSort: { field: "invested_on", dir: "desc" },
  unitField: "business_unit_id",
  permissions: { create: [...ADMIN_ROLES, "finance"], update: [...ADMIN_ROLES, "finance"], delete: ["owner"] },
  fields: [
    { name: "investor_id", label: "Investor", type: "relation", entity: "investors", required: true },
    { name: "project", label: "Project / venture", type: "text", required: true, placeholder: "CPC One – Capital Tower, The Udaisarovar expansion…" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units" },
    { name: "type", label: "Type", type: "select", options: ["Equity", "Debt / fixed return", "Property unit", "Membership", "Other"], default: "Debt / fixed return" },
    { name: "amount", label: "Amount invested (₹)", type: "money", required: true, min: 0 },
    { name: "invested_on", label: "Invested on", type: "date", required: true, default: todayISO },
    { name: "annual_return_pct", label: "Annual return %", type: "number", min: 0, step: 0.1 },
    { name: "maturity_on", label: "Maturity", type: "date" },
    { name: "current_value", label: "Current value (₹)", type: "money", min: 0, help: "Leave blank to show the invested amount" },
    { name: "returns_paid", label: "Returns paid so far (₹)", type: "money", min: 0, default: 0 },
    { name: "status", label: "Status", type: "select", options: INVESTMENT_STATUSES, required: true, default: "Active" },
    { name: "reference", label: "Agreement / reference no.", type: "text" },
    { name: "document", label: "Agreement copy", type: "file" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["investor_id", "project", "type", "amount", "invested_on", "annual_return_pct", "maturity_on", "status"],
});
