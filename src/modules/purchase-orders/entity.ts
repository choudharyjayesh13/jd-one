import { FileText, Send, PackageCheck, XCircle } from "lucide-react";
import { defineEntity, type Row } from "@/core/schema/types";
import { formatMoney, formatNumber, todayISO } from "@/core/format";
import { normalizePhone } from "@/core/phone";
import { PURCHASE_CATEGORIES } from "@/modules/purchases/entity";
import { PurchaseOrderForm } from "./PurchaseOrderForm";

export const PO_STATUSES = ["Draft", "Sent", "Received", "Cancelled"] as const;

export interface PoLine {
  stock_id: string | null;
  item: string;
  unit: string;
  qty: number;
  rate: number;
}

export function poLines(r: Row | Record<string, unknown>): PoLine[] {
  const raw = r.lines;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({ stock_id: l.stock_id ? String(l.stock_id) : null, item: String(l.item ?? ""), unit: String(l.unit ?? ""), qty: Number(l.qty) || 0, rate: Number(l.rate) || 0 }))
    .filter((l) => l.item && l.qty > 0);
}

/**
 * Purchase order to a vendor: items, quantities, rates. "Send to vendor" opens
 * WhatsApp with the order; "Goods received" books each line as a purchase
 * (stock goes up and the item's cost per unit is updated).
 */
export const purchaseOrders = defineEntity({
  name: "purchase-orders",
  label: "Purchase orders",
  labelSingular: "Purchase order",
  icon: FileText,
  table: "purchase_orders",
  teams: ["operations", "accounts"],
  unitField: "business_unit_id",
  titleField: "po_no",
  searchFields: ["po_no", "vendor_name", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  customForm: PurchaseOrderForm,
  fields: [
    { name: "po_no", label: "PO no.", type: "text", readOnly: true, help: "Given automatically when saved" },
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "vendor_id", label: "Vendor", type: "relation", entity: "vendors" },
    { name: "vendor_name", label: "Vendor name", type: "text" },
    { name: "category", label: "Category", type: "select", options: PURCHASE_CATEGORIES, required: true, default: "Grocery & dry ration" },
    { name: "lines", label: "Items", type: "multiselect", options: [], hidden: true },
    { name: "items_summary", label: "Items", type: "text", virtual: true, computed: (v) => poLines(v).map((l) => `${formatNumber(l.qty)} ${l.unit} ${l.item}`.replace(/\s+/g, " ")).join(", ") },
    { name: "total", label: "Total", type: "money", min: 0 },
    { name: "expected_on", label: "Expected on", type: "date" },
    { name: "status", label: "Status", type: "select", options: PO_STATUSES, required: true, default: "Draft", readOnly: true },
    { name: "received_on", label: "Received on", type: "date", readOnly: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["po_no", "date", "vendor_name", "items_summary", "total", "status", "expected_on"],
  hooks: {
    beforeSave(values) {
      const total = poLines(values).reduce((s, l) => s + l.qty * l.rate, 0);
      return { ...values, total };
    },
  },
  actions: [
    {
      id: "send",
      label: "Send to vendor",
      icon: Send,
      variant: "primary",
      visible: (r) => r.status === "Draft" || r.status === "Sent",
      async run({ record, store, toast, refresh }) {
        const vendor = record.vendor_id ? await store.get("vendors", String(record.vendor_id)) : null;
        const phone = normalizePhone(vendor?.phone);
        const text = [
          `Purchase order ${String(record.po_no ?? "")} — The Udaisarovar`,
          `Date: ${String(record.date ?? "")}${record.expected_on ? ` · needed by ${String(record.expected_on)}` : ""}`,
          ...poLines(record).map((l) => `• ${formatNumber(l.qty)} ${l.unit} ${l.item}${l.rate ? ` @ ${formatMoney(l.rate)}` : ""}`),
          `Total: ${formatMoney(record.total)}`,
        ].join("\n");
        window.open(phone.length >= 10 ? `https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        if (record.status === "Draft") await store.update("purchase-orders", record.id, { status: "Sent" });
        toast("Order opened in WhatsApp");
        await refresh();
      },
    },
    {
      id: "receive",
      label: "Goods received",
      icon: PackageCheck,
      variant: "primary",
      visible: (r) => r.status === "Sent" || r.status === "Draft",
      async run({ record, store, staffId, toast, refresh, confirm }) {
        const lines = poLines(record);
        if (!(await confirm(`Book ${lines.length} item${lines.length === 1 ? "" : "s"} as received? Stock goes up for items linked to stock.`))) return;
        const today = todayISO();
        for (const l of lines) {
          await store.create("purchases", {
            date: today,
            frequency: "One-time",
            category: record.category ?? "Other",
            item: l.item,
            stock_id: l.stock_id,
            quantity: l.qty,
            unit: l.unit,
            rate: l.rate || null,
            amount: l.qty * l.rate,
            vendor: record.vendor_name ?? null,
            payment_mode: "Credit (udhaar)",
            bought_by: staffId,
            notes: `PO ${String(record.po_no ?? "")}`,
            business_unit_id: record.business_unit_id,
            created_by: staffId,
          });
        }
        await store.update("purchase-orders", record.id, { status: "Received", received_on: today });
        toast("Goods received — stock updated");
        await refresh();
      },
    },
    {
      id: "cancel",
      label: "Cancel order",
      icon: XCircle,
      variant: "danger",
      visible: (r) => r.status === "Draft" || r.status === "Sent",
      async run({ record, store, toast, refresh, confirm }) {
        if (!(await confirm("Cancel this purchase order?"))) return;
        await store.update("purchase-orders", record.id, { status: "Cancelled" });
        toast("Cancelled");
        await refresh();
      },
    },
  ],
});
