import { Users } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

export const STAFF_ROLES = ["owner", "manager", "hr", "accounts", "finance", "marketing", "staff"] as const;

export const staff = defineEntity({
  name: "staff",
  label: "Staff",
  labelSingular: "Staff member",
  icon: Users,
  table: "staff",
  teams: ["hr"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "phone", "designation"],
  defaultSort: { field: "name", dir: "asc" },
  permissions: { create: ["owner", "manager", "hr"], update: ["owner", "manager", "hr"], delete: ["owner"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "email", label: "Email", type: "email", help: "Same email as their app login (shared mode)" },
    { name: "role", label: "Role", type: "select", options: STAFF_ROLES, required: true, default: "staff" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "designation", label: "Designation", type: "text", placeholder: "Front office, Chef…" },
    { name: "active", label: "Active", type: "boolean", default: true, help: "Currently employed" },
    { name: "joined_on", label: "Joined on", type: "date" },
    { name: "left_on", label: "Left on", type: "date" },
    { name: "salary", label: "Salary (monthly)", type: "money", min: 0 },
    { name: "auth_user_id", label: "Login user id", type: "text", help: "Supabase Auth user id (shared mode). Leave blank in local mode." },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "role", "business_unit_id", "designation", "phone", "active"],
  reverse: [
    { entity: "attendance", field: "staff_id", label: "Attendance" },
    { entity: "tasks", field: "assigned_to", label: "Tasks" },
    { entity: "leads", field: "assigned_to", label: "Leads" },
  ],
});
