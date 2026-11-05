import { History } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/** Written by the database for every change the Director makes; read by the Chairman. */
export const changeLog = defineEntity({
  name: "change-log",
  label: "Director changes",
  labelSingular: "Change",
  icon: History,
  table: "change_log",
  teams: ["hr"],
  hidden: true,
  titleField: "table_name",
  searchFields: ["table_name", "actor_email"],
  defaultSort: { field: "at", dir: "desc" },
  fields: [
    { name: "at", label: "When", type: "datetime" },
    { name: "actor_email", label: "By", type: "text" },
    { name: "actor_post", label: "Post", type: "text" },
    { name: "table_name", label: "Table", type: "text" },
    { name: "record_id", label: "Record", type: "text" },
    { name: "action", label: "Action", type: "text" },
    { name: "seen", label: "Seen", type: "boolean" },
    { name: "undone_at", label: "Undone at", type: "datetime" },
    { name: "undone_by", label: "Undone by", type: "text" },
  ],
  listColumns: ["at", "action", "table_name", "actor_email"],
  permissions: { read: ["owner", "manager"], create: [], update: ["owner", "manager"], delete: [] },
});
