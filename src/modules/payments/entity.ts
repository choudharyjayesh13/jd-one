import { IndianRupee } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { recomputeBalance } from "@/modules/bookings/balance";

export const payments = defineEntity({
  name: "payments",
  label: "Payments",
  labelSingular: "Payment",
  icon: IndianRupee,
  table: "payments",
  teams: ["accounts", "finance", "operations"],
  titleField: "reference",
  searchFields: ["reference", "mode"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "booking_id", label: "Booking", type: "relation", entity: "bookings", required: true },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers", help: "Copied from the booking" },
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "amount", label: "Amount", type: "money", required: true, min: 1 },
    { name: "mode", label: "Mode", type: "select", options: ["Cash", "UPI", "Card", "Bank", "OTA"], required: true, default: "UPI" },
    { name: "reference", label: "Reference", type: "text", placeholder: "UPI ref / receipt no." },
    { name: "received_by", label: "Received by", type: "relation", entity: "staff" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["date", "amount", "mode", "booking_id", "customer_id", "received_by", "reference"],
  hooks: {
    async beforeSave(values, ctx) {
      if (!values.customer_id && values.booking_id) {
        const b = await ctx.store.get("bookings", String(values.booking_id));
        if (b?.customer_id) values = { ...values, customer_id: b.customer_id };
      }
      return values;
    },
    afterCreate: (r, ctx) => recomputeBalance(ctx.store, String(r.booking_id)),
    async afterUpdate(r, prev, ctx) {
      await recomputeBalance(ctx.store, String(r.booking_id));
      if (prev.booking_id && prev.booking_id !== r.booking_id) await recomputeBalance(ctx.store, String(prev.booking_id));
    },
    afterRemove: (r, ctx) => recomputeBalance(ctx.store, String(r.booking_id)),
  },
});
