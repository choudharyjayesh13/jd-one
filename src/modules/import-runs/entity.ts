import { DownloadCloud } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";

/** One row per import (manual CSV or scheduled Meta sheet). Shown in Settings → Imports. */
export const importRuns = defineEntity({
  name: "import-runs",
  label: "Import runs",
  labelSingular: "Import run",
  icon: DownloadCloud,
  table: "import_runs",
  teams: ["marketing"],
  hidden: true,
  titleField: "source",
  searchFields: ["source", "message"],
  defaultSort: { field: "started_at", dir: "desc" },
  permissions: { create: [...ADMIN_ROLES, "marketing"], update: ADMIN_ROLES, delete: ["owner"] },
  fields: [
    { name: "source", label: "Source", type: "text", required: true },
    { name: "started_at", label: "Started", type: "datetime", required: true },
    { name: "finished_at", label: "Finished", type: "datetime" },
    { name: "rows", label: "Rows read", type: "number", default: 0 },
    { name: "customers_created", label: "Customers created", type: "number", default: 0 },
    { name: "created", label: "Leads created", type: "number", default: 0 },
    { name: "updated", label: "Leads updated", type: "number", default: 0 },
    { name: "skipped", label: "Skipped", type: "number", default: 0 },
    { name: "errors", label: "Errors", type: "number", default: 0 },
    { name: "message", label: "Message", type: "textarea" },
  ],
  listColumns: ["started_at", "source", "rows", "created", "updated", "skipped", "errors"],
});
