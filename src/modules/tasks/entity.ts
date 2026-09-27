import { CheckSquare } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

export const tasks = defineEntity({
  name: "tasks",
  label: "Tasks",
  labelSingular: "Task",
  icon: CheckSquare,
  table: "tasks",
  teams: ["operations", "hr"],
  unitField: "business_unit_id",
  titleField: "title",
  searchFields: ["title", "notes"],
  defaultSort: { field: "due", dir: "asc" },
  fields: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "type", label: "Type", type: "select", options: ["Maintenance", "Housekeeping", "Purchase", "Follow-up", "Other"], required: true, default: "Other" },
    { name: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"], default: "Medium" },
    { name: "assigned_to", label: "Assigned to", type: "relation", entity: "staff" },
    { name: "due", label: "Due", type: "date" },
    { name: "status", label: "Status", type: "select", options: ["Open", "In progress", "Done"], required: true, default: "Open" },
    { name: "booking_id", label: "Related booking", type: "relation", entity: "bookings" },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["title", "status", "priority", "type", "assigned_to", "due", "business_unit_id"],
  hooks: {
    async beforeSave(values, ctx) {
      if (!values.customer_id && values.booking_id) {
        const b = await ctx.store.get("bookings", String(values.booking_id));
        if (b?.customer_id) values = { ...values, customer_id: b.customer_id };
      }
      return values;
    },
  },
});
