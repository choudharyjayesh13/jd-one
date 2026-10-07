import { ChefHat, Flame, BellRing, Utensils, ReceiptIndianRupee, QrCode, PackageMinus } from "lucide-react";
import { newHref } from "@/core/routes";
import { defineEntity } from "@/core/schema/types";

export const KOT_TYPES = ["Table", "Room", "Camping", "Event", "Takeaway", "Staff meal"] as const;
export const KOT_STATUSES = ["New", "Preparing", "Ready", "Served", "Billed", "Cancelled"] as const;

/**
 * KOT — Kitchen Order Ticket. Service staff write the order (one item per line),
 * the kitchen moves it New → Preparing → Ready, service marks Served, then Billed.
 * KOT numbers (KOT-1001…) are assigned by the database.
 */
export const kots = defineEntity({
  name: "kots",
  label: "KOT – Orders",
  labelSingular: "KOT",
  icon: ChefHat,
  table: "kots",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "kot_no",
  searchFields: ["kot_no", "table_or_room", "guest_name", "items"],
  defaultSort: { field: "created_at", dir: "desc" },
  fields: [
    { name: "kot_no", label: "KOT no.", type: "text", readOnly: true, help: "Given automatically when saved" },
    { name: "order_type", label: "Order for", type: "select", options: KOT_TYPES, required: true, default: "Table" },
    { name: "table_or_room", label: "Table / room no.", type: "text", placeholder: "T3, Earth cottage, Tent 2…" },
    { name: "guest_name", label: "Guest name", type: "text" },
    { name: "pax", label: "Guests (pax)", type: "number", min: 1 },
    { name: "items", label: "Items (one per line)", type: "textarea", required: true, placeholder: "2 x Paneer tikka\n1 x Dal makhani\n3 x Butter roti\n2 x Cold coffee" },
    { name: "special_notes", label: "Kitchen notes", type: "textarea", placeholder: "Less spicy, no onion, Jain…" },
    { name: "status", label: "Status", type: "select", options: KOT_STATUSES, required: true, default: "New" },
    { name: "amount", label: "Bill amount", type: "money", min: 0 },
    { name: "taken_by", label: "Order taken by", type: "relation", entity: "staff" },
    { name: "booking_id", label: "Booking (room orders)", type: "relation", entity: "bookings" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["kot_no", "order_type", "table_or_room", "items", "status", "amount", "taken_by"],
  hooks: {
    beforeSave(values, ctx, id) {
      const out = { ...values };
      if (!id && !out.taken_by && ctx.staffId) out.taken_by = ctx.staffId;
      if (out.status === "Served" && !out.served_at) out.served_at = new Date().toISOString();
      if (!id) delete out.kot_no; // database assigns KOT-1001, KOT-1002…
      return out;
    },
  },
  actions: [
    { id: "prep", label: "Start preparing", icon: Flame, variant: "primary", visible: (r) => r.status === "New",
      async run({ record, store, toast, refresh }) { await store.update("kots", record.id, { status: "Preparing" }); toast("Kitchen is preparing"); await refresh(); } },
    { id: "ready", label: "Ready", icon: BellRing, variant: "primary", visible: (r) => r.status === "Preparing",
      async run({ record, store, toast, refresh }) { await store.update("kots", record.id, { status: "Ready" }); toast("Order ready to serve"); await refresh(); } },
    { id: "served", label: "Served", icon: Utensils, variant: "primary", visible: (r) => r.status === "Ready",
      async run({ record, store, toast, refresh }) { await store.update("kots", record.id, { status: "Served", served_at: new Date().toISOString() }); toast("Served"); await refresh(); } },
    { id: "qr", label: "Show QR to guest", icon: QrCode, visible: (r) => r.status !== "Cancelled" && r.status !== "New",
      async run({ record }) {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        window.location.href = `${base}/pay-qr/?kot=${encodeURIComponent(String(record.kot_no ?? ""))}${record.amount ? `&amount=${record.amount}` : ""}`;
      } },
    { id: "ingredients", label: "Log ingredients used", icon: PackageMinus, visible: (r) => r.status !== "Cancelled",
      run: ({ record, navigate }) => navigate(newHref("stock-movements", { kot_id: record.id, direction: "Out", source: "KOT", business_unit_id: record.business_unit_id })) },
    { id: "bill", label: "Bill", icon: ReceiptIndianRupee, visible: (r) => r.status === "Served",
      form: { title: "Bill this KOT", fields: ["amount"], patch: { status: "Billed" }, submitLabel: "Save bill" } },
  ],
});
