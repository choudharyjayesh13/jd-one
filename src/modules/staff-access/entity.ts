import { KeyRound } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/** One row per staff member × menu module: the access level set in Team access. */
export const staffAccess = defineEntity({
  name: "staff-access",
  label: "Team access",
  labelSingular: "Access",
  icon: KeyRound,
  table: "staff_access",
  teams: ["hr"],
  hidden: true,
  titleField: "module",
  searchFields: ["module"],
  defaultSort: { field: "module", dir: "asc" },
  fields: [
    { name: "staff_id", label: "Staff", type: "relation", entity: "staff", required: true },
    { name: "module", label: "Module", type: "text", required: true },
    { name: "level", label: "Level", type: "number", required: true, min: 0, max: 3 },
  ],
  listColumns: ["staff_id", "module", "level"],
  permissions: { read: ["owner", "manager"], create: ["owner", "manager"], update: ["owner", "manager"], delete: ["owner", "manager"] },
});
