import { Receipt, Printer, Send, CheckCircle2 } from "lucide-react";
import { defineEntity, type FieldValues, type HookContext } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { shareVoucher } from "./share";

export const VOUCHER_TYPES = ["PV", "RV"] as const;
export const VOUCHER_STATUSES = ["To pay", "Paid", "Received", "Cancelled"] as const;

/** Local mode only: the database numbers vouchers itself (UDS/RV/26-27/0001). */
async function localVoucherNo(values: FieldValues, ctx: HookContext): Promise<string> {
  const date = String(values.date ?? todayISO());
  const [y, m] = date.split("-").map(Number);
  const fy = m >= 4 ? y : y - 1;
  let code = "JD";
  if (values.business_unit_id) {
    const unit = await ctx.store.get("business-units", String(values.business_unit_id));
    if (unit?.short_code) code = String(unit.short_code);
  }
  const prefix = `${code}/${values.vtype}/${String(fy % 100).padStart(2, "0")}-${String((fy + 1) % 100).padStart(2, "0")}`;
  const all = await ctx.store.list("vouchers");
  const last = all
    .map((v) => String(v.voucher_no ?? ""))
    .filter((n) => n.startsWith(`${prefix}/`))
    .map((n) => Number(n.slice(prefix.length + 1)) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}/${String(last + 1).padStart(4, "0")}`;
}

/**
 * Vouchers: a numbered record of every payment received (RV) or paid (PV),
 * posted to the JD Stays & Hospitality ledger. Payments and expenses create
 * theirs automatically (database triggers); others are added by hand.
 */
export const vouchers = defineEntity({
  name: "vouchers",
  label: "Vouchers",
  labelSingular: "Voucher",
  icon: Receipt,
  table: "vouchers",
  teams: ["accounts", "finance"],
  unitField: "business_unit_id",
  titleField: "voucher_no",
  searchFields: ["voucher_no", "party", "against", "reference"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "voucher_no", dir: "desc" },
  fields: [
    { name: "voucher_no", label: "Voucher no.", type: "text", readOnly: true, help: "Given automatically when saved, e.g. UDS/PV/26-27/0012" },
    { name: "vtype", label: "Type", type: "select", options: VOUCHER_TYPES, required: true, default: "PV", help: "PV = money paid out · RV = money received" },
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "party", label: "Paid to / received from", type: "text", required: true },
    { name: "against", label: "For", type: "text", placeholder: "Booking, bill, purchase…", wide: true },
    { name: "amount", label: "Amount", type: "money", required: true, min: 0 },
    { name: "bill_no", label: "Bill / invoice no.", type: "text", placeholder: "Vendor's bill number", showIf: (v) => v.vtype !== "RV" },
    { name: "mode", label: "Mode", type: "select", options: ["Cash", "UPI", "UPI QR", "Card", "Bank", "OTA"], default: "Bank" },
    { name: "payee_qr", label: "Vendor's UPI QR code", type: "file", help: "Photo or screenshot of the vendor's QR – scan it from here to pay", showIf: (v) => v.vtype !== "RV" && v.mode === "UPI QR" },
    { name: "paid_to_account", label: "Paid to account", type: "text", placeholder: "UPI ID / bank account / QR name", showIf: (v) => v.vtype !== "RV" },
    { name: "reference", label: "Reference", type: "text", placeholder: "UTR / cheque / UPI ref" },
    { name: "payment_proof", label: "Payment receipt", type: "files", help: "Screenshot of the UPI / QR / bank payment", showIf: (v) => v.vtype !== "RV" },
    { name: "paid_by", label: "Paid by", type: "relation", entity: "staff", showIf: (v) => v.vtype !== "RV" },
    { name: "status", label: "Status", type: "select", options: VOUCHER_STATUSES, required: true, default: "To pay" },
    { name: "paid_on", label: "Paid on", type: "date" },
    { name: "ledger", label: "Ledger", type: "text", default: "JD Stays & Hospitality", readOnly: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["voucher_no", "date", "vtype", "party", "amount", "mode", "status"],
  hooks: {
    async beforeSave(values, ctx, id) {
      let v = { ...values };
      if (!v.ledger) v.ledger = "JD Stays & Hospitality";
      if (v.status === "Paid" && !v.paid_on) v.paid_on = todayISO();
      if (v.vtype === "PV" && v.status === "Paid") {
        if (!v.paid_by && ctx.staffId) v.paid_by = ctx.staffId;
        const proof = Array.isArray(v.payment_proof) && v.payment_proof.length > 0;
        if (["UPI", "UPI QR"].includes(String(v.mode)) && !proof && !String(v.reference ?? "").trim()) {
          throw new Error("Add the payment receipt (UPI / QR screenshot) or the UPI reference number.");
        }
        if (v.mode === "Bank" && !proof && !String(v.reference ?? "").trim()) throw new Error("Add the bank UTR number or the payment receipt.");
      }
      if (!id && ctx.store.kind === "local" && !v.voucher_no) v = { ...v, voucher_no: await localVoucherNo(v, ctx) };
      return v;
    },
  },
  actions: [
    {
      id: "print",
      label: "Print / PDF",
      icon: Printer,
      variant: "secondary",
      run: (ctx) => ctx.navigate(`/voucher-print/?id=${encodeURIComponent(ctx.record.id)}`),
    },
    {
      id: "share",
      label: "Share",
      icon: Send,
      variant: "primary",
      run: async (ctx) => {
        const r = ctx.record;
        let unitName = "The Udaisarovar";
        if (r.business_unit_id) {
          const unit = await ctx.store.get("business-units", String(r.business_unit_id));
          if (unit?.name) unitName = String(unit.name);
        }
        const how = await shareVoucher(r, unitName);
        if (how === "downloaded") ctx.toast("Voucher image saved — attach it in WhatsApp", "info");
      },
    },
    {
      id: "mark-paid",
      label: "Mark as paid",
      icon: CheckCircle2,
      variant: "secondary",
      visible: (r) => r.status === "To pay",
      form: { title: "Mark as paid", fields: ["paid_on", "mode", "payee_qr", "paid_to_account", "reference", "payment_proof"], patch: { status: "Paid" }, submitLabel: "Mark as paid" },
    },
  ],
});
