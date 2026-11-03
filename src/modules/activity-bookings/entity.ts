import { Tent, CheckCircle2 } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const ACTIVITY_STATUSES = ["Booked", "Done", "Cancelled"] as const;
export const ACTIVITY_PAYMENT = ["Add to room bill", "Paid now", "Included in package", "Free"] as const;

/**
 * Boating, bonfire, horse riding, camping… booked for a date and time. The
 * activity list and prices are the Add-on services; "Available per day" there is
 * the day's capacity (see Activities → Slots & capacity).
 */
export const activityBookings = defineEntity({
  name: "activity-bookings",
  label: "Activity bookings",
  labelSingular: "Activity booking",
  icon: Tent,
  table: "activity_bookings",
  teams: ["property", "operations"],
  unitField: "business_unit_id",
  titleField: "guest_name",
  searchFields: ["guest_name", "notes"],
  defaultSort: { field: "date", dir: "asc" },
  secondarySort: { field: "time", dir: "asc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "time", label: "Time", type: "text", placeholder: "07:00, sunset, 20:30" },
    { name: "add_on_id", label: "Activity", type: "relation", entity: "add-ons", required: true },
    { name: "booking_id", label: "Guest's booking", type: "relation", entity: "bookings", help: "Room guests: pick the booking" },
    { name: "guest_name", label: "Guest name", type: "text", required: true },
    { name: "people", label: "People", type: "number", min: 1, default: 2, required: true },
    { name: "amount", label: "Amount (₹)", type: "money", min: 0, help: "Leave blank to use the activity price" },
    { name: "payment", label: "Payment", type: "select", options: ACTIVITY_PAYMENT, default: "Add to room bill" },
    { name: "status", label: "Status", type: "select", options: ACTIVITY_STATUSES, required: true, default: "Booked" },
    { name: "assigned_to", label: "Staff in charge", type: "relation", entity: "staff" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "time", "add_on_id", "guest_name", "people", "amount", "status"],
  hooks: {
    async beforeSave(values, ctx) {
      const out = { ...values };
      if (out.booking_id && !out.guest_name) {
        const b = await ctx.store.get("bookings", String(out.booking_id));
        if (b) out.guest_name = b.guest_name;
      }
      if ((out.amount === null || out.amount === undefined) && out.add_on_id) {
        const a = await ctx.store.get("add-ons", String(out.add_on_id));
        if (a) {
          const price = Number(a.price) || 0;
          const perPerson = String(a.per ?? "").startsWith("Person");
          out.amount = perPerson ? price * (Number(out.people) || 1) : price;
        }
      }
      return out;
    },
  },
  actions: [
    {
      id: "done",
      label: "Mark done",
      icon: CheckCircle2,
      variant: "primary",
      visible: (r) => r.status === "Booked",
      async run({ record, store, toast, refresh }) {
        await store.update("activity-bookings", record.id, { status: "Done" });
        toast("Marked done");
        await refresh();
      },
    },
  ],
});
