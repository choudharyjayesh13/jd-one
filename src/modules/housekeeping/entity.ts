import { SprayCan } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { HK_STATUSES } from "@/modules/rooms/entity";

const WRITE_ROLES = ["owner", "manager", "staff"] as const;

/** One housekeeping entry per room per clean/inspection; the latest entry sets the room's housekeeping status. */
export const housekeepingReports = defineEntity({
  name: "housekeeping-reports",
  label: "Housekeeping",
  labelSingular: "Housekeeping report",
  icon: SprayCan,
  table: "housekeeping_reports",
  teams: ["property", "operations"],
  unitField: "business_unit_id",
  titleField: "room_id",
  searchFields: ["issues", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner", "manager"] },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "room_id", label: "Room", type: "relation", entity: "rooms", required: true },
    { name: "status", label: "Room status after", type: "select", options: HK_STATUSES, required: true, default: "Clean" },
    { name: "task", label: "Work done", type: "select", options: ["Daily clean", "Check-out clean", "Deep clean", "Turn-down", "Inspection", "Maintenance"], default: "Daily clean" },
    { name: "cleaned_by", label: "Cleaned by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "inspected_by", label: "Inspected by", type: "relation", entity: "staff" },
    { name: "linen_changed", label: "Linen changed", type: "boolean", default: false },
    { name: "towels_changed", label: "Towels changed", type: "boolean", default: false },
    { name: "minibar_checked", label: "Amenities / minibar refilled", type: "boolean", default: false },
    { name: "issues", label: "Issues found", type: "textarea", help: "Broken items, stains, pests… raise a ticket for repairs" },
    { name: "photos", label: "Photos", type: "files", wide: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["date", "room_id", "status", "task", "cleaned_by", "linen_changed", "issues"],
  hooks: {
    async afterCreate(record, ctx) {
      if (record.room_id) await ctx.store.update("rooms", String(record.room_id), { hk_status: record.status });
    },
    async afterUpdate(record, _prev, ctx) {
      if (record.room_id) await ctx.store.update("rooms", String(record.room_id), { hk_status: record.status });
    },
  },
});
