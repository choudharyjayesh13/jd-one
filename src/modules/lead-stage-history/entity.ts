import { History } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/** Written by the DB trigger log_lead_stage on every lead stage change; read-only in the app. */
export const leadStageHistory = defineEntity({
  name: "lead-stage-history",
  label: "Lead stage history",
  labelSingular: "Stage change",
  icon: History,
  table: "lead_stage_history",
  teams: ["marketing"],
  hidden: true,
  titleField: "to_stage",
  searchFields: ["from_stage", "to_stage"],
  defaultSort: { field: "changed_at", dir: "desc" },
  permissions: { create: [], update: [], delete: [] },
  fields: [
    { name: "lead_id", label: "Lead", type: "relation", entity: "leads", readOnly: true },
    { name: "from_stage", label: "From", type: "text", readOnly: true },
    { name: "to_stage", label: "To", type: "text", readOnly: true },
    { name: "changed_by", label: "By", type: "relation", entity: "staff", readOnly: true },
    { name: "changed_at", label: "When", type: "datetime", readOnly: true },
  ],
  listColumns: ["changed_at", "lead_id", "from_stage", "to_stage", "changed_by"],
});
