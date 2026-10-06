import { Coffee } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

/** Rest time given by a leader (owner / manager / HR). The staff member sees "You are on rest time". */
export const restPeriods = defineEntity({
  name: "rest-periods",
  label: "Rest time",
  labelSingular: "Rest time",
  icon: Coffee,
  table: "rest_periods",
  teams: ["hr"],
  titleField: "date",
  searchFields: ["note"],
  defaultSort: { field: "date", dir: "desc" },
  permissions: { create: ["owner", "manager", "hr"], update: ["owner", "manager", "hr"], delete: ["owner", "manager", "hr"] },
  fields: [
    { name: "staff_id", label: "Staff", type: "relation", entity: "staff", required: true },
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "start_time", label: "From", type: "text", required: true, placeholder: "13:00" },
    { name: "end_time", label: "Until", type: "text", required: true, placeholder: "15:00" },
    { name: "note", label: "Message to staff", type: "text", placeholder: "Take rest, all rooms done" },
    { name: "assigned_by", label: "Given by", type: "relation", entity: "staff" },
  ],
  listColumns: ["date", "staff_id", "start_time", "end_time", "note", "assigned_by"],
  hooks: {
    beforeSave(values, ctx, id) {
      return !id && !values.assigned_by && ctx.staffId ? { ...values, assigned_by: ctx.staffId } : values;
    },
  },
});
