import { IndianRupee } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/** Private pay — each person sees only their own row (database rule); owner / manager / HR see and edit all. */
export const staffPay = defineEntity({
  name: "staff-pay",
  label: "Salaries & pay",
  labelSingular: "Pay record",
  icon: IndianRupee,
  table: "staff_pay",
  teams: ["hr"],
  titleField: "role_in_plan",
  searchFields: ["role_in_plan", "pay_note"],
  defaultSort: { field: "monthly_salary", dir: "desc" },
  permissions: { create: ["owner", "manager", "hr"], update: ["owner", "manager", "hr"], delete: ["owner"] },
  fields: [
    { name: "staff_id", label: "Staff", type: "relation", entity: "staff", required: true },
    { name: "monthly_salary", label: "Monthly salary", type: "money", min: 0 },
    { name: "role_in_plan", label: "Role (pay grade)", type: "text" },
    { name: "pay_note", label: "Note", type: "textarea" },
  ],
  listColumns: ["staff_id", "role_in_plan", "monthly_salary", "pay_note"],
});
