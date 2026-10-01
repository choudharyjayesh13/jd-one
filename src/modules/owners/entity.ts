import { Crown } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";

/**
 * Owners = the people who own businesses on the JD One network (Jayesh,
 * his father, any solo owner who joins). An owner has one or more business
 * units, each with its own staff and customers. Network admins (JD Group)
 * see every owner; other owners see only their own businesses.
 */
export const owners = defineEntity({
  name: "owners",
  label: "Owners (network)",
  labelSingular: "Owner",
  icon: Crown,
  table: "owners",
  teams: ["marketing"],
  titleField: "name",
  searchFields: ["name", "phone", "email", "city"],
  defaultSort: { field: "name", dir: "asc" },
  unique: [["email"]],
  permissions: { create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["owner"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "email", label: "Email", type: "email", help: "Their JD One login email; linked automatically at sign-up" },
    { name: "city", label: "City", type: "text", default: "Udaipur" },
    { name: "kind", label: "Owner type", type: "select", options: ["Individual", "Family", "Company"], default: "Individual" },
    { name: "network_admin", label: "Network admin", type: "boolean", default: false, help: "Sees every owner and business on the network (JD Group only)" },
    { name: "active", label: "Active", type: "boolean", default: true },
    { name: "auth_user_id", label: "Login user id", type: "text", readOnly: true, hidden: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "phone", "city", "kind", "network_admin", "active"],
  reverse: [{ entity: "business-units", field: "owner_id", label: "Businesses" }],
  hooks: {
    beforeSave: (values) => ({ ...values, phone: normalizePhone(values.phone) || values.phone || null, email: values.email ? String(values.email).trim().toLowerCase() : null }),
  },
});
