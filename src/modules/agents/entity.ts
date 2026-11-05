import { Briefcase } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";

const WRITE_ROLES = ["owner", "manager", "marketing", "accounts"] as const;

/** Travel and corporate agents (AsiaTech "User Management → Travel Agent"): who sends us business on credit or commission. */
export const agents = defineEntity({
  name: "agents",
  label: "Travel & corporate agents",
  labelSingular: "Agent",
  icon: Briefcase,
  table: "agents",
  teams: ["property", "marketing"],
  titleField: "company",
  searchFields: ["company", "contact_person", "phone", "city"],
  defaultSort: { field: "company", dir: "asc" },
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner", "manager"] },
  fields: [
    { name: "kind", label: "Agent type", type: "select", options: ["Travel agent", "Corporate", "Taxi / driver", "Wedding planner", "Other"], required: true, default: "Travel agent" },
    { name: "company", label: "Company", type: "text", required: true },
    { name: "contact_person", label: "Contact person", type: "text" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "email", label: "Email", type: "email" },
    { name: "city", label: "City", type: "text", default: "Udaipur" },
    { name: "commission_pct", label: "Commission %", type: "number", min: 0, max: 100, help: "Paid to the agent on room revenue" },
    { name: "credit_allowed", label: "Credit allowed", type: "boolean", default: false, help: "Bookings can check out with balance due (Credit report)" },
    { name: "credit_limit", label: "Credit limit", type: "money", min: 0 },
    { name: "gstin", label: "GSTIN", type: "text" },
    { name: "active", label: "Active", type: "boolean", default: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["company", "kind", "contact_person", "phone", "city", "commission_pct", "active"],
  reverse: [{ entity: "bookings", field: "agent_id", label: "Bookings" }],
  hooks: {
    beforeSave: (values) => ({ ...values, phone: normalizePhone(values.phone) || values.phone || null }),
  },
});
