import { Wrench, CheckCircle2 } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { addDays, todayISO } from "@/core/format";

export const SERVICE_TYPES = ["AC service", "Water pump", "DG set / generator", "Pool filter & pump", "Pest control", "Fire extinguisher refill", "Water tank cleaning", "RO / water purifier", "Geyser", "Electrical check", "Other"] as const;

/** Preventive service: what has to be serviced every N days, when it was last done, when it is due. */
export const serviceSchedules = defineEntity({
  name: "service-schedules",
  label: "Preventive service",
  labelSingular: "Service schedule",
  icon: Wrench,
  table: "service_schedules",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "what",
  searchFields: ["what", "asset_name", "notes"],
  defaultSort: { field: "next_due", dir: "asc" },
  fields: [
    { name: "what", label: "Service", type: "select", options: SERVICE_TYPES, required: true, default: "AC service" },
    { name: "asset_name", label: "Which one", type: "text", placeholder: "Cottage 3 AC, borewell pump…" },
    { name: "asset_id", label: "Asset", type: "relation", entity: "property-assets" },
    { name: "every_days", label: "Every (days)", type: "number", min: 1, required: true, default: 90 },
    { name: "last_done", label: "Last done", type: "date", default: todayISO },
    { name: "next_due", label: "Next due", type: "date", computed: (v) => (v.last_done ? addDays(String(v.last_done), Number(v.every_days) || 90) : null) },
    { name: "vendor_id", label: "Repair contact", type: "relation", entity: "service-vendors" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["next_due", "what", "asset_name", "every_days", "last_done", "vendor_id"],
  actions: [
    {
      id: "done",
      label: "Done today",
      icon: CheckCircle2,
      variant: "primary",
      async run({ record, store, toast, refresh }) {
        const today = todayISO();
        await store.update("service-schedules", record.id, { last_done: today, next_due: addDays(today, Number(record.every_days) || 90) });
        toast("Service recorded — next due date moved");
        await refresh();
      },
    },
  ],
});
