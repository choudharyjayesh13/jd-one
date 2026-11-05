import { Search, Undo2 } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const LOST_STATUSES = ["In storage", "Returned to guest", "Couriered to guest", "Disposed / donated"] as const;

/** Items guests leave behind: where found, who has it, when it went back. */
export const lostFound = defineEntity({
  name: "lost-found",
  label: "Lost & found",
  labelSingular: "Lost & found item",
  icon: Search,
  table: "lost_found",
  teams: ["property", "operations"],
  unitField: "business_unit_id",
  titleField: "item",
  searchFields: ["item", "found_at", "guest_name", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Found on", type: "date", required: true, default: todayISO },
    { name: "item", label: "Item", type: "text", required: true, placeholder: "Black phone charger, gold earring…" },
    { name: "room_id", label: "Room", type: "relation", entity: "rooms" },
    { name: "found_at", label: "Where found", type: "text", placeholder: "Under the bed, poolside, restaurant…" },
    { name: "found_by", label: "Found by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "booking_id", label: "Guest's booking", type: "relation", entity: "bookings" },
    { name: "guest_name", label: "Guest name", type: "text" },
    { name: "stored_at", label: "Kept at", type: "text", placeholder: "Front office locker" },
    { name: "status", label: "Status", type: "select", options: LOST_STATUSES, required: true, default: "In storage" },
    { name: "returned_on", label: "Returned / disposed on", type: "date" },
    { name: "returned_to", label: "Handed to", type: "text", placeholder: "Guest name / courier & tracking no." },
    { name: "photo", label: "Photo", type: "file" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "item", "room_id", "guest_name", "status", "found_by"],
  actions: [
    {
      id: "return",
      label: "Returned to guest",
      icon: Undo2,
      variant: "primary",
      visible: (r) => r.status === "In storage",
      form: { title: "Returned to guest", fields: ["returned_on", "returned_to", "notes"], patch: { status: "Returned to guest" }, submitLabel: "Save" },
    },
  ],
});
