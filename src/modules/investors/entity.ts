import { Landmark } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";

/**
 * Investors / wallet customers: the people who log in to the customer portal on
 * myjdgroup.com. `auth_user_id` links to their portal login (auto-linked by
 * email on sign-up); wallet balance = Σ wallet transactions.
 */
export const investors = defineEntity({
  name: "investors",
  label: "Investors",
  labelSingular: "Investor",
  icon: Landmark,
  table: "investors",
  teams: ["finance", "accounts"],
  titleField: "name",
  searchFields: ["name", "phone", "email", "pan_last4"],
  defaultSort: { field: "created_at", dir: "desc" },
  permissions: { create: [...ADMIN_ROLES, "finance", "accounts"], update: [...ADMIN_ROLES, "finance", "accounts"], delete: ["owner"] },
  reverse: [
    { entity: "investments", field: "investor_id", label: "Investments" },
    { entity: "wallet-transactions", field: "investor_id", label: "Wallet transactions" },
  ],
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone", required: true },
    { name: "email", label: "Portal login email", type: "email", required: true, help: "Must match the email they sign up with on myjdgroup.com/portal" },
    { name: "customer_id", label: "CRM customer", type: "relation", entity: "customers", help: "Link to the same person's guest record, if any" },
    { name: "city", label: "City", type: "text" },
    { name: "pan_last4", label: "PAN (last 4)", type: "text", help: "Never store the full PAN here" },
    { name: "kyc_status", label: "KYC", type: "select", options: ["Pending", "Submitted", "Verified", "Rejected"], default: "Pending" },
    { name: "relationship_owner", label: "Relationship owner", type: "relation", entity: "staff" },
    { name: "portal_active", label: "Portal access", type: "boolean", default: true, help: "Untick to block portal login without deleting data" },
    { name: "auth_user_id", label: "Portal user id", type: "text", readOnly: true, help: "Filled automatically when they sign up with the email above" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["name", "phone", "email", "kyc_status", "portal_active", "relationship_owner"],
});
