import { DoorClosed, Sparkles } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { UNIT_TYPES } from "@/modules/bookings/entity";

/** Front-desk status of a physical room; housekeeping status is kept separately. */
export const ROOM_STATUSES = ["Available", "Occupied", "Blocked", "Out of order"] as const;
export const HK_STATUSES = ["Clean", "Dirty", "Inspected", "Maintenance"] as const;
export const ROOM_AMENITIES = ["AC", "Lake view", "Pool view", "Garden", "Balcony", "Bathtub", "TV", "Mini fridge", "Extra bed", "Bunk bed"] as const;

const WRITE_ROLES = ["owner", "manager", "staff"] as const;

/**
 * Rooms = the physical inventory (AsiaTech "Room Management"). Each row is one
 * sellable unit (cottage / suite / tent); the type links it to rates and to
 * the unit_type on bookings.
 */
export const rooms = defineEntity({
  name: "rooms",
  label: "Rooms",
  labelSingular: "Room",
  icon: DoorClosed,
  table: "rooms",
  teams: ["property"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "unit_type", "block"],
  defaultSort: { field: "sort_order", dir: "asc" },
  secondarySort: { field: "name", dir: "asc" },
  unique: [["business_unit_id", "name"]],
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner", "manager"] },
  fields: [
    { name: "name", label: "Room number / name", type: "text", required: true, placeholder: "Cottage 1, Suite A, Tent 3" },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "unit_type", label: "Room type", type: "select", options: UNIT_TYPES, required: true, help: "Rates and availability are managed per room type" },
    { name: "block", label: "Block / area", type: "text", placeholder: "Lake side, Pool side" },
    { name: "max_adults", label: "Max adults", type: "number", min: 1, default: 2 },
    { name: "max_children", label: "Max children", type: "number", min: 0, default: 1 },
    { name: "extra_bed", label: "Extra bed possible", type: "boolean", default: false },
    { name: "status", label: "Status", type: "select", options: ROOM_STATUSES, default: "Available", required: true },
    { name: "hk_status", label: "Housekeeping", type: "select", options: HK_STATUSES, default: "Clean", help: "Updated automatically from housekeeping reports" },
    { name: "amenities", label: "Amenities", type: "multiselect", options: ROOM_AMENITIES, wide: true },
    { name: "sort_order", label: "Order on room chart", type: "number", default: 0 },
    { name: "active", label: "Active", type: "boolean", default: true, help: "Inactive rooms are not counted as inventory" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "unit_type", "business_unit_id", "status", "hk_status", "max_adults", "active"],
  reverse: [
    { entity: "bookings", field: "room_id", label: "Bookings" },
    { entity: "housekeeping-reports", field: "room_id", label: "Housekeeping reports" },
  ],
  actions: [
    {
      id: "mark-clean",
      label: "Mark clean",
      icon: Sparkles,
      visible: (r) => r.hk_status !== "Clean",
      async run({ record, store, staffId, toast, refresh }) {
        await store.update("rooms", record.id, { hk_status: "Clean" });
        await store.create("housekeeping-reports", {
          date: new Date().toISOString().slice(0, 10),
          business_unit_id: record.business_unit_id,
          room_id: record.id,
          status: "Clean",
          task: "Daily clean",
          cleaned_by: staffId,
          created_by: staffId,
        });
        toast("Room marked clean");
        await refresh();
      },
    },
  ],
});

/** Helper for calendars: active rooms counted per type. */
export function roomsByType(rows: Record<string, unknown>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.active === false) continue;
    const t = String(r.unit_type ?? "Other");
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}
