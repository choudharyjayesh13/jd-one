import { Wallet } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { EXPENSE_CATEGORIES } from "@/modules/expenses/entity";
import { PettyCashSummary } from "./PettyCashSummary";

export const PETTY_KINDS = ["Cash in", "Cash out"] as const;
const WRITE_ROLES = ["owner", "manager", "staff", "accounts"] as const;

/**
 * Petty cash ledger per property: cash handed to the front desk (Cash in) and
 * small spends (Cash out). Balance = Σ in − Σ out, shown above the list.
 * Bigger vendor bills belong under Expenses.
 */
export const pettyCash = defineEntity({
  name: "petty-cash",
  label: "Petty cash",
  labelSingular: "Petty cash entry",
  icon: Wallet,
  table: "petty_cash",
  teams: ["property", "accounts"],
  unitField: "business_unit_id",
  titleField: "purpose",
  searchFields: ["purpose", "category", "paid_to"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  permissions: { create: [...WRITE_ROLES], update: ["owner", "manager", "accounts"], delete: ["owner"] },
  listExtra: PettyCashSummary,
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "kind", label: "Type", type: "select", options: PETTY_KINDS, required: true, default: "Cash out" },
    { name: "amount", label: "Amount", type: "money", required: true, min: 1 },
    { name: "purpose", label: "Purpose", type: "text", required: true, placeholder: "Milk, auto fare, gas refill…" },
    { name: "category", label: "Category", type: "select", options: ["Top-up from owner", "Guest cash received", ...EXPENSE_CATEGORIES], required: true, default: "Kitchen & food" },
    { name: "paid_to", label: "Paid to / received from", type: "text" },
    { name: "handled_by", label: "Handled by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "receipt", label: "Receipt photo", type: "file" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "payment_id", label: "Payment", type: "relation", entity: "payments", readOnly: true, hidden: true },
  ],
  listColumns: ["date", "kind", "amount", "purpose", "category", "handled_by", "business_unit_id"],
});
