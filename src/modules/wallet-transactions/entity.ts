import { Wallet } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

/** JD One wallet ledger per investor; balance on the portal = Σ credits − Σ debits. */
export const walletTransactions = defineEntity({
  name: "wallet-transactions",
  label: "Wallet transactions",
  labelSingular: "Wallet transaction",
  icon: Wallet,
  table: "wallet_transactions",
  teams: ["finance", "accounts"],
  titleField: "note",
  searchFields: ["note", "reference"],
  defaultSort: { field: "date", dir: "desc" },
  permissions: { create: [...ADMIN_ROLES, "finance", "accounts"], update: ADMIN_ROLES, delete: ["owner"] },
  fields: [
    { name: "investor_id", label: "Investor", type: "relation", entity: "investors", required: true },
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "direction", label: "Type", type: "select", options: ["credit", "debit"], required: true, default: "credit", help: "credit = money added to the wallet, debit = spent / withdrawn" },
    { name: "amount", label: "Amount (₹)", type: "money", required: true, min: 0 },
    { name: "category", label: "Category", type: "select", options: ["Deposit", "Return / interest", "Cashback", "Stay / spend", "Withdrawal", "Adjustment"], default: "Deposit" },
    { name: "investment_id", label: "Related investment", type: "relation", entity: "investments" },
    { name: "reference", label: "Reference (UTR / receipt)", type: "text" },
    { name: "note", label: "Note (shown to the customer)", type: "text", required: true },
    { name: "entered_by", label: "Entered by", type: "relation", entity: "staff" },
  ],
  listColumns: ["date", "investor_id", "direction", "amount", "category", "note", "reference"],
});
