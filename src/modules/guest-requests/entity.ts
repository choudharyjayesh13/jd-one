import { BellRing, CheckCircle2, Play } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { nowLocalInput } from "@/core/format";

export const REQUEST_TYPES = ["Extra bed / mattress", "Towels & linen", "Water / tea / food", "Housekeeping", "Repair / not working", "Transport / taxi", "Late check-out", "Wake-up call", "Complaint", "Other"] as const;
export const REQUEST_STATUSES = ["Open", "In progress", "Done"] as const;

/** Anything a guest asks for during the stay, with who is on it and when it was done. */
export const guestRequests = defineEntity({
  name: "guest-requests",
  label: "Guest requests",
  labelSingular: "Guest request",
  icon: BellRing,
  table: "guest_requests",
  teams: ["property", "operations"],
  unitField: "business_unit_id",
  titleField: "request_type",
  searchFields: ["guest_name", "details", "request_type"],
  defaultSort: { field: "requested_at", dir: "desc" },
  fields: [
    { name: "requested_at", label: "Asked at", type: "datetime", required: true, default: nowLocalInput },
    { name: "booking_id", label: "Booking", type: "relation", entity: "bookings" },
    { name: "room_id", label: "Room", type: "relation", entity: "rooms" },
    { name: "guest_name", label: "Guest", type: "text" },
    { name: "request_type", label: "Request", type: "select", options: REQUEST_TYPES, required: true, default: "Water / tea / food" },
    { name: "details", label: "Details", type: "textarea" },
    { name: "priority", label: "Priority", type: "select", options: ["Normal", "Urgent"], default: "Normal" },
    { name: "assigned_to", label: "Assigned to", type: "relation", entity: "staff" },
    { name: "status", label: "Status", type: "select", options: REQUEST_STATUSES, required: true, default: "Open" },
    { name: "done_at", label: "Done at", type: "datetime" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["requested_at", "room_id", "guest_name", "request_type", "priority", "assigned_to", "status"],
  hooks: {
    async beforeSave(values, ctx) {
      const out = { ...values };
      if (out.booking_id && !out.guest_name) {
        const b = await ctx.store.get("bookings", String(out.booking_id));
        if (b) out.guest_name = b.guest_name;
      }
      if (out.status === "Done" && !out.done_at) out.done_at = new Date().toISOString();
      return out;
    },
  },
  actions: [
    {
      id: "start",
      label: "Working on it",
      icon: Play,
      visible: (r) => r.status === "Open",
      async run({ record, store, staffId, toast, refresh }) {
        await store.update("guest-requests", record.id, { status: "In progress", assigned_to: record.assigned_to ?? staffId });
        toast("Marked in progress");
        await refresh();
      },
    },
    {
      id: "done",
      label: "Done",
      icon: CheckCircle2,
      variant: "primary",
      visible: (r) => r.status !== "Done",
      async run({ record, store, toast, refresh }) {
        await store.update("guest-requests", record.id, { status: "Done", done_at: new Date().toISOString() });
        toast("Done");
        await refresh();
      },
    },
  ],
});
