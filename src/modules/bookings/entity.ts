import { BedDouble, LogIn, LogOut, IndianRupee } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";
import { newHref } from "@/core/routes";
import { customerLiveHint, matchOrCreateCustomer } from "@/modules/customers/match";
import { nightsBetween } from "@/modules/customers/stats";
import { paidForBooking } from "./balance";

export const UNIT_TYPES = ["Lake View Cottage", "Pool View Cottage", "Family Suite", "Camping", "Glass House", "Other"] as const;
export const BOOKING_SOURCES = ["Direct", "MMT/Goibibo", "Booking.com", "Airbnb", "Agoda", "Expedia", "EaseMyTrip", "Cleartrip", "Google Hotels", "Travel agent", "Walk-in", "Corporate"] as const;
/** "On hold" = tentative block (AsiaTech Hold Booking): holds inventory until confirmed or released. */
export const BOOKING_STATUSES = ["Enquiry", "On hold", "Confirmed", "Checked-in", "Checked-out", "Cancelled", "No-show"] as const;
export const OTA_SOURCES: readonly string[] = ["MMT/Goibibo", "Booking.com", "Airbnb", "Agoda", "Expedia"];

const WRITE_ROLES = ["owner", "manager", "staff", "marketing", "accounts"] as const;

export const bookings = defineEntity({
  name: "bookings",
  label: "Bookings",
  labelSingular: "Booking",
  icon: BedDouble,
  table: "bookings",
  teams: ["property", "operations", "finance"],
  unitField: "business_unit_id",
  titleField: "guest_name",
  searchFields: ["guest_name", "phone", "unit_type"],
  defaultSort: { field: "check_in", dir: "desc" },
  // Finance reads bookings but does not edit them.
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner"] },
  liveHint: { watch: ["phone"], compute: customerLiveHint },
  fields: [
    { name: "guest_name", label: "Guest name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone", required: true },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers", help: "Matched automatically by phone" },
    { name: "lead_id", label: "Lead", type: "relation", entity: "leads" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "check_in", label: "Check-in", type: "date", required: true },
    { name: "check_out", label: "Check-out", type: "date", required: true },
    { name: "unit_type", label: "Unit type", type: "select", options: UNIT_TYPES, required: true },
    { name: "room_id", label: "Room / cottage", type: "relation", entity: "rooms", help: "Assign the exact room; shows on the room chart" },
    { name: "units", label: "Units", type: "number", min: 1, default: 1 },
    { name: "adults", label: "Adults", type: "number", min: 0, default: 2 },
    { name: "children", label: "Children", type: "number", min: 0, default: 0 },
    { name: "meal_plan", label: "Meal plan", type: "select", options: ["EP", "CP", "MAP", "AP"], default: "CP" },
    { name: "rate", label: "Rate / unit / night", type: "money", min: 0 },
    { name: "total", label: "Total", type: "money", min: 0, help: "Leave blank to use rate × units × nights" },
    { name: "advance", label: "Advance agreed", type: "money", min: 0, help: "Record the actual receipt under Payments" },
    { name: "paid", label: "Paid", type: "money", readOnly: true },
    { name: "balance", label: "Balance", type: "money", readOnly: true },
    { name: "source", label: "Source", type: "select", options: BOOKING_SOURCES, required: true, default: "Direct" },
    { name: "agent_id", label: "Agent", type: "relation", entity: "agents", help: "Travel / corporate agent who sent the booking" },
    { name: "hold_until", label: "Hold until", type: "datetime", help: "For On hold bookings: release if not confirmed by then" },
    { name: "status", label: "Status", type: "select", options: BOOKING_STATUSES, required: true, default: "Confirmed" },
    { name: "special_requests", label: "Special requests", type: "textarea" },
    { name: "booked_by", label: "Booked by", type: "text", help: "Staff member or channel that created the booking" },
    { name: "external_ref", label: "Channel booking ID", type: "text", readOnly: true, help: "AsiaTech / OTA reference" },
  ],
  listColumns: ["guest_name", "status", "check_in", "check_out", "unit_type", "business_unit_id", "total", "balance"],
  reverse: [
    { entity: "payments", field: "booking_id", label: "Payments" },
    { entity: "checkins", field: "booking_id", label: "Check-ins" },
    { entity: "tasks", field: "booking_id", label: "Tasks" },
  ],
  hooks: {
    async beforeSave(values, ctx, id) {
      const phone = normalizePhone(values.phone) || null;
      const customer_id = await matchOrCreateCustomer(ctx.store, { ...values, phone }, "guest_name", { source: "Direct", staffId: ctx.staffId });
      const nights = nightsBetween(values.check_in, values.check_out);
      const total = values.total !== null && values.total !== undefined ? Number(values.total) : Number(values.rate ?? 0) * Number(values.units ?? 1) * nights;
      const paid = id ? await paidForBooking(ctx.store, id) : 0;
      return { ...values, phone, customer_id, total, paid, balance: total - paid };
    },
    async afterCreate(record, ctx) {
      // A booking created from a lead closes that lead as Won.
      if (record.lead_id) {
        const lead = await ctx.store.get("leads", String(record.lead_id));
        if (lead && lead.stage !== "Won") await ctx.store.update("leads", lead.id, { stage: "Won" });
      }
    },
  },
  actions: [
    {
      id: "check-in",
      label: "Check in now",
      icon: LogIn,
      variant: "primary",
      visible: (r) => r.status === "Confirmed" || r.status === "Enquiry" || r.status === "On hold",
      async run({ record, store, staffId, toast, refresh, confirm }) {
        if (!(await confirm(`Check in ${record.guest_name}? A check-in record will be created.`))) return;
        await store.create("checkins", { booking_id: record.id, actual_in: new Date().toISOString(), handled_by: staffId, created_by: staffId });
        await store.update("bookings", record.id, { status: "Checked-in" });
        toast("Checked in");
        await refresh();
      },
    },
    {
      id: "check-out",
      label: "Check out now",
      icon: LogOut,
      variant: "primary",
      visible: (r) => r.status === "Checked-in",
      async run({ record, store, staffId, toast, refresh, confirm }) {
        const balance = Number(record.balance ?? 0);
        const msg = balance > 0 ? `Balance of ₹${balance.toLocaleString("en-IN")} is still due. Check out anyway?` : `Check out ${record.guest_name}?`;
        if (!(await confirm(msg))) return;
        const open = (await store.list("checkins", { filter: { booking_id: record.id, actual_out: null } }))[0];
        if (open) await store.update("checkins", open.id, { actual_out: new Date().toISOString() });
        else await store.create("checkins", { booking_id: record.id, actual_in: null, actual_out: new Date().toISOString(), handled_by: staffId, created_by: staffId });
        await store.update("bookings", record.id, { status: "Checked-out" });
        toast("Checked out");
        await refresh();
      },
    },
    {
      id: "add-payment",
      label: "Add payment",
      icon: IndianRupee,
      visible: (r) => r.status !== "Cancelled",
      run: ({ record, navigate }) => navigate(newHref("payments", { booking_id: record.id, customer_id: record.customer_id, amount: Number(record.balance ?? 0) > 0 ? record.balance : "" })),
    },
  ],
});
