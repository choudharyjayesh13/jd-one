import { ShoppingBag, MessageCircle, ExternalLink, Send, CheckCircle2 } from "lucide-react";
import { ALL_ROLES, defineEntity, type FieldValues, type Row } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { normalizePhone } from "@/core/phone";
import { matchOrCreateCustomer } from "@/modules/customers/match";

export const ORDER_STATUSES = ["New", "Sent to seller", "Accepted", "Fulfilled", "Cancelled"] as const;
export const DISPATCH_STATUSES = ["Not sent", "Queued", "Sent", "Failed", "No integration"] as const;

/** Text of the order as the seller's WhatsApp receives it. */
export function orderMessage(o: Row, seller: Row | null): string {
  const lines = [
    `JD One network order ${String(o.order_no ?? "")}`.trim(),
    `For: ${String(seller?.name ?? "")}`,
    ``,
    `Customer: ${o.customer_name ?? ""} · ${o.phone ?? ""}`,
    `Items: ${o.items ?? ""}`,
  ];
  if (o.amount) lines.push(`Amount: ₹${Number(o.amount).toLocaleString("en-IN")}${o.discount_pct ? ` (after ${o.discount_pct}% network discount)` : ""}`);
  if (o.deliver_to) lines.push(`Deliver to: ${o.deliver_to}`);
  if (o.notes) lines.push(`Notes: ${o.notes}`);
  lines.push(``, `Placed via JD One by ${o.placed_by_name ?? "a network member"}.`);
  return lines.join("\n");
}

/** Fills {name} {phone} {items} {amount} {order_no} into the seller's order-page link. */
export function orderPageLink(template: string, o: Row): string {
  const enc = (v: unknown) => encodeURIComponent(String(v ?? ""));
  return template
    .replace(/\{name\}/g, enc(o.customer_name))
    .replace(/\{phone\}/g, enc(o.phone))
    .replace(/\{items\}/g, enc(o.items))
    .replace(/\{amount\}/g, enc(o.amount))
    .replace(/\{order_no\}/g, enc(o.order_no));
}

/**
 * Network orders: a customer (or another owner) orders a product/service from a
 * member business through JD One. The database forwards it to the seller's
 * webhook (ERP / website) the moment it is inserted; staff can also push it to
 * the seller on WhatsApp or open the seller's own order page with the details filled in.
 */
export const orders = defineEntity({
  name: "orders",
  label: "Network orders",
  labelSingular: "Order",
  icon: ShoppingBag,
  table: "orders",
  teams: ["property", "operations", "marketing", "accounts"],
  unitField: "business_unit_id",
  titleField: "order_no",
  searchFields: ["order_no", "customer_name", "phone", "items", "external_ref"],
  defaultSort: { field: "created_at", dir: "desc" },
  permissions: { read: ALL_ROLES, create: ALL_ROLES, update: ALL_ROLES, delete: ["owner", "manager"] },
  fields: [
    { name: "order_no", label: "Order no.", type: "text", readOnly: true, help: "Given automatically" },
    { name: "business_unit_id", label: "Seller (member business)", type: "relation", entity: "business-units", required: true },
    { name: "customer_name", label: "Customer name", type: "text", required: true },
    { name: "phone", label: "Customer phone", type: "phone", required: true },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers", help: "Matched automatically by phone" },
    { name: "buyer_unit_id", label: "Buying business (owner-to-owner)", type: "relation", entity: "business-units", help: "Set when another member business is the buyer — the owner discount applies" },
    { name: "items", label: "Items / service", type: "textarea", required: true, wide: true, placeholder: "2 × Stepwhere kids shoes size 28 (blue)\n1 × gift wrap" },
    { name: "amount", label: "Amount (after discount)", type: "money", min: 0 },
    { name: "discount_pct", label: "Network discount %", type: "number", min: 0, max: 100, readOnly: true, help: "10% customer / owner rate from the seller's settings" },
    { name: "deliver_to", label: "Deliver to / address", type: "textarea" },
    { name: "needed_by", label: "Needed by", type: "date" },
    { name: "status", label: "Status", type: "select", options: ORDER_STATUSES, default: "New", required: true },
    { name: "dispatch_status", label: "Sent to seller's system", type: "select", options: DISPATCH_STATUSES, default: "Not sent", readOnly: true },
    { name: "dispatched_at", label: "Dispatched at", type: "datetime", readOnly: true },
    { name: "external_ref", label: "Seller's order ID", type: "text", help: "ID in the seller's ERP / website once they accept" },
    { name: "placed_by", label: "Placed by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "placed_by_name", label: "Placed by (name)", type: "text", hidden: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["order_no", "business_unit_id", "customer_name", "items", "amount", "status", "dispatch_status", "created_at"],
  hooks: {
    async beforeSave(values, ctx, id) {
      const v: FieldValues = { ...values, phone: normalizePhone(values.phone) || values.phone };
      v.customer_id = await matchOrCreateCustomer(ctx.store, v, "customer_name", { source: "Direct", staffId: ctx.staffId });
      if (!id) {
        v.order_no = `JDO-${todayISO().replace(/-/g, "").slice(2)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const seller = v.business_unit_id ? await ctx.store.get("business-units", String(v.business_unit_id)) : null;
        const ownerToOwner = Boolean(v.buyer_unit_id);
        v.discount_pct = seller ? Number(ownerToOwner ? (seller.network_owner_discount_pct ?? 15) : (seller.network_customer_discount_pct ?? 10)) : 0;
        v.dispatch_status = seller?.order_webhook_url ? "Queued" : "No integration";
        if (ctx.staffId) {
          const me = await ctx.store.get("staff", ctx.staffId);
          if (me) v.placed_by_name = me.name;
        }
      }
      return v;
    },
  },
  actions: [
    {
      id: "whatsapp-seller",
      label: "Send to seller on WhatsApp",
      icon: MessageCircle,
      variant: "primary",
      visible: (r) => r.status === "New" || r.status === "Sent to seller",
      async run({ record, store, toast, refresh }) {
        const seller = await store.get("business-units", String(record.business_unit_id));
        const phone = seller?.phone ? normalizePhone(seller.phone).replace(/^\+/, "") : "";
        if (!phone) return toast("The seller has no phone number in Hotel details", "error");
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(record, seller))}`, "_blank", "noopener");
        if (record.status === "New") await store.update("orders", record.id, { status: "Sent to seller" });
        toast("WhatsApp opened");
        await refresh();
      },
    },
    {
      id: "open-order-page",
      label: "Open seller's order page",
      icon: ExternalLink,
      variant: "secondary",
      visible: () => true,
      async run({ record, store, toast }) {
        const seller = await store.get("business-units", String(record.business_unit_id));
        const tpl = seller?.order_page_url ? String(seller.order_page_url) : seller?.website ? String(seller.website) : "";
        if (!tpl) return toast("The seller has not linked an order page or website yet", "error");
        window.open(orderPageLink(tpl, record), "_blank", "noopener");
      },
    },
    {
      id: "resend-webhook",
      label: "Resend to seller's system",
      icon: Send,
      variant: "secondary",
      visible: (r) => r.dispatch_status === "Failed" || r.dispatch_status === "Not sent",
      async run({ record, store, toast, refresh }) {
        // The database trigger fires on this update and re-posts the order to the seller's webhook.
        await store.update("orders", record.id, { dispatch_status: "Queued" });
        toast("Queued for the seller's system");
        await refresh();
      },
    },
    {
      id: "fulfilled",
      label: "Mark fulfilled",
      icon: CheckCircle2,
      visible: (r) => r.status === "Accepted" || r.status === "Sent to seller",
      form: { title: "Fulfilled", fields: ["external_ref", "notes"], patch: { status: "Fulfilled" }, submitLabel: "Mark fulfilled" },
    },
  ],
});
