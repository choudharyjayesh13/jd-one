import { HandCoins, Copy, MessageCircle, CheckCircle2 } from "lucide-react";
import { defineEntity, type FieldValues, type Row } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { normalizePhone } from "@/core/phone";
import { recomputeBalance } from "@/modules/bookings/balance";

export const REQUEST_STATUSES = ["Pending", "Sent", "Paid", "Cancelled"] as const;
const WRITE_ROLES = ["owner", "manager", "staff", "accounts"] as const;

/** UPI deep link the guest can open in any UPI app. */
export function upiLink(upiId: string, payee: string, amount: number, note: string): string {
  const p = new URLSearchParams({ pa: upiId, pn: payee, am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 40) });
  return `upi://pay?${p.toString()}`;
}

export function requestMessage(r: Row, unit: Row | null): string {
  const hotel = String(unit?.name ?? "JD Group");
  const amt = Number(r.amount ?? 0).toLocaleString("en-IN");
  const lines = [`Namaste ${r.guest_name ?? ""},`, ``, `${hotel} requests a payment of ₹${amt}${r.purpose ? ` towards ${String(r.purpose).toLowerCase()}` : ""}.`];
  if (r.upi_link) lines.push(``, `Pay via UPI: ${r.upi_link}`);
  if (unit?.upi_id) lines.push(`UPI ID: ${unit.upi_id}`);
  lines.push(``, `Reference: ${String(r.id).slice(0, 8).toUpperCase()}`, `Thank you!`);
  return lines.join("\n");
}

/**
 * Request money (AsiaTech "Request Money"): a payment link sent to the guest
 * for an advance or balance. Marking it paid records the payment and updates
 * the booking balance.
 */
export const paymentRequests = defineEntity({
  name: "payment-requests",
  label: "Request money",
  labelSingular: "Payment request",
  icon: HandCoins,
  table: "payment_requests",
  teams: ["property", "accounts"],
  unitField: "business_unit_id",
  titleField: "guest_name",
  searchFields: ["guest_name", "phone", "purpose"],
  defaultSort: { field: "created_at", dir: "desc" },
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner", "manager"] },
  fields: [
    { name: "booking_id", label: "Booking", type: "relation", entity: "bookings", help: "Optional; guest name, phone and balance are copied from it" },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers" },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "guest_name", label: "Guest name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone", required: true },
    { name: "amount", label: "Amount", type: "money", required: true, min: 1 },
    { name: "purpose", label: "Purpose", type: "select", options: ["Advance", "Balance", "Extra services", "Food & beverage", "Damage", "Other"], default: "Advance", required: true },
    { name: "due", label: "Due by", type: "date", default: todayISO },
    { name: "status", label: "Status", type: "select", options: REQUEST_STATUSES, default: "Pending", required: true },
    { name: "upi_link", label: "UPI link", type: "text", readOnly: true, help: "Generated from the property's UPI ID (Hotel details)" },
    { name: "sent_at", label: "Sent at", type: "datetime", readOnly: true },
    { name: "paid_at", label: "Paid at", type: "datetime", readOnly: true },
    { name: "payment_id", label: "Payment", type: "relation", entity: "payments", readOnly: true },
    { name: "requested_by", label: "Requested by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["guest_name", "amount", "purpose", "status", "due", "booking_id", "requested_by"],
  hooks: {
    async beforeSave(values, ctx) {
      let v: FieldValues = { ...values, phone: normalizePhone(values.phone) || values.phone };
      if (v.booking_id) {
        const b = await ctx.store.get("bookings", String(v.booking_id));
        if (b) {
          v = { ...v, guest_name: v.guest_name || b.guest_name, phone: v.phone || b.phone, customer_id: v.customer_id || b.customer_id, business_unit_id: v.business_unit_id || b.business_unit_id };
          if (!v.amount && Number(b.balance ?? 0) > 0) v.amount = b.balance;
        }
      }
      const unit = v.business_unit_id ? await ctx.store.get("business-units", String(v.business_unit_id)) : null;
      if (unit?.upi_id && Number(v.amount) > 0) v.upi_link = upiLink(String(unit.upi_id), String(unit.name), Number(v.amount), `${v.purpose ?? "Payment"} ${v.guest_name ?? ""}`);
      return v;
    },
  },
  actions: [
    {
      id: "copy-message",
      label: "Copy message",
      icon: Copy,
      variant: "secondary",
      visible: (r) => r.status !== "Paid" && r.status !== "Cancelled",
      async run({ record, store, toast }) {
        const unit = record.business_unit_id ? await store.get("business-units", String(record.business_unit_id)) : null;
        await navigator.clipboard.writeText(requestMessage(record, unit));
        toast("Message copied — paste it into WhatsApp or SMS");
      },
    },
    {
      id: "send-whatsapp",
      label: "Send on WhatsApp",
      icon: MessageCircle,
      variant: "primary",
      visible: (r) => r.status !== "Paid" && r.status !== "Cancelled",
      async run({ record, store, toast, refresh }) {
        const unit = record.business_unit_id ? await store.get("business-units", String(record.business_unit_id)) : null;
        const phone = normalizePhone(record.phone).replace(/^\+/, "");
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(requestMessage(record, unit))}`, "_blank", "noopener");
        if (record.status === "Pending") await store.update("payment-requests", record.id, { status: "Sent", sent_at: new Date().toISOString() });
        toast("WhatsApp opened");
        await refresh();
      },
    },
    {
      id: "mark-paid",
      label: "Mark paid",
      icon: CheckCircle2,
      variant: "primary",
      visible: (r) => r.status !== "Paid" && r.status !== "Cancelled",
      form: { title: "Record the payment", fields: ["amount", "notes"], submitLabel: "Mark paid" },
      async run({ record, store, staffId, toast, refresh }) {
        const paidAt = new Date().toISOString();
        let payment_id: string | null = null;
        if (record.booking_id) {
          const p = await store.create("payments", {
            booking_id: record.booking_id,
            customer_id: record.customer_id ?? null,
            date: paidAt.slice(0, 10),
            amount: record.amount,
            mode: "UPI",
            reference: `REQ-${String(record.id).slice(0, 8).toUpperCase()}`,
            received_by: staffId,
            created_by: staffId,
          });
          payment_id = p.id;
          await recomputeBalance(store, String(record.booking_id));
        }
        await store.update("payment-requests", record.id, { status: "Paid", paid_at: paidAt, payment_id });
        toast(record.booking_id ? "Payment recorded on the booking" : "Marked paid");
        await refresh();
      },
    },
  ],
});
