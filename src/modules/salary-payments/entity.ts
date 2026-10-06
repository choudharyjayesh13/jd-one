import { Banknote } from "lucide-react";
import { defineEntity, type Role } from "@/core/schema/types";
import { todayISO, currentMonth } from "@/core/format";

/** Roles that may see money: expenses, salaries paid, vendor payments (mirrors jdone.is_money_admin()). */
export const MONEY_ROLES: Role[] = ["owner", "manager", "accounts", "finance"];

/** Salary actually paid, month by month. Staff see only their own rows (database rule). */
export const salaryPayments = defineEntity({
  name: "salary-payments",
  label: "Salaries paid",
  labelSingular: "Salary payment",
  icon: Banknote,
  table: "salary_payments",
  teams: ["accounts", "finance"],
  titleField: "staff_name",
  searchFields: ["staff_name", "notes", "kind"],
  defaultSort: { field: "date", dir: "desc" },
  permissions: { read: MONEY_ROLES, create: MONEY_ROLES, update: MONEY_ROLES, delete: ["owner"] },
  fields: [
    { name: "date", label: "Paid on", type: "date", required: true, default: todayISO },
    { name: "staff_name", label: "Paid to", type: "text", required: true },
    { name: "staff_id", label: "Staff record", type: "relation", entity: "staff" },
    { name: "salary_month", label: "For month (yyyy-mm)", type: "text", default: currentMonth, placeholder: "2026-09" },
    { name: "amount", label: "Amount", type: "money", required: true, min: 0 },
    { name: "kind", label: "Type", type: "select", options: ["Salary", "Advance", "Incentive", "Bonus", "Settlement"], required: true, default: "Salary" },
    { name: "mode", label: "Mode", type: "select", options: ["Cash", "UPI", "Bank"] },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "source_ref", label: "Imported from", type: "text", readOnly: true, hidden: true },
  ],
  listColumns: ["date", "staff_name", "salary_month", "amount", "kind", "mode"],
});
