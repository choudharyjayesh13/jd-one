import { Contact } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";
import { LEAD_SOURCES } from "@/modules/leads/options";
import { Customer360 } from "./Customer360";

export const CUSTOMER_TAGS = ["Family", "Couple", "Friends", "Corporate", "Wedding", "Repeat", "VIP", "Agent"] as const;

/** The CRM contact. Phone is the unique key so leads/bookings never create duplicates. */
export const customers = defineEntity({
  name: "customers",
  label: "Customers",
  labelSingular: "Customer",
  icon: Contact,
  table: "customers",
  teams: ["marketing", "operations", "finance"],
  titleField: "name",
  searchFields: ["customer_no", "name", "phone", "email", "city", "company"],
  defaultSort: { field: "created_at", dir: "desc" },
  unique: [["phone"]],
  customDetail: Customer360,
  fields: [
    { name: "customer_no", label: "Customer no.", type: "text", readOnly: true, help: "Assigned automatically (JDC-00001…)" },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone", required: true, help: "Unique — used to match leads and bookings" },
    { name: "email", label: "Email", type: "email" },
    { name: "city", label: "City", type: "text" },
    { name: "company", label: "Company", type: "text" },
    { name: "tags", label: "Tags", type: "multiselect", options: CUSTOMER_TAGS, wide: true },
    { name: "owner_id", label: "Relationship owner", type: "relation", entity: "staff" },
    { name: "first_source", label: "Source of first contact", type: "select", options: LEAD_SOURCES },
    { name: "first_seen", label: "First seen", type: "date" },
    { name: "birthday", label: "Birthday", type: "date" },
    { name: "anniversary", label: "Anniversary", type: "date" },
    { name: "preferences", label: "Preferences", type: "textarea", placeholder: "Room type, meals, occasions…" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "phone", "city", "tags", "owner_id", "first_source"],
  reverse: [
    { entity: "bookings", field: "customer_id", label: "Bookings" },
    { entity: "leads", field: "customer_id", label: "Leads" },
    { entity: "activities", field: "customer_id", label: "Activities" },
    { entity: "payments", field: "customer_id", label: "Payments" },
    { entity: "tasks", field: "customer_id", label: "Tasks" },
  ],
  hooks: {
    beforeSave: (values) => ({ ...values, phone: normalizePhone(values.phone) || null }),
  },
});
