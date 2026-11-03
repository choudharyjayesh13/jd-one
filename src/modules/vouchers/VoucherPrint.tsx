"use client";
/** Printable voucher (/voucher-print/?id=…): Print → "Save as PDF" gives the PDF. */
import { useSearchParams } from "next/navigation";
import { Printer, Send } from "lucide-react";
import { useRecord } from "@/core/ui/hooks";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { Button } from "@/core/ui/Button";
import { useToast } from "@/core/ui/Toast";
import { formatDate, formatMoney } from "@/core/format";
import { amountInWords } from "./words";
import { shareVoucher, voucherTitle } from "./share";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function VoucherPrint() {
  const params = useSearchParams();
  const id = params.get("id");
  const { row: v, loading, error } = useRecord("vouchers", id);
  const { row: unit } = useRecord("business-units", v?.business_unit_id ? String(v.business_unit_id) : null);
  const { toast } = useToast();
  if (!id) return <ErrorBox message="No voucher chosen." />;
  if (loading) return <Loading />;
  if (error || !v) return <ErrorBox message={error ?? "Voucher not found."} />;
  const unitName = String(unit?.name ?? "The Udaisarovar");
  const rows: [string, string][] = [
    ["Date", formatDate(v.date)],
    [v.vtype === "RV" ? "Received from" : "Paid to", String(v.party ?? "—")],
    ["For", String(v.against ?? "—")],
    ["Mode", String(v.mode ?? "—")],
    ["Reference", String(v.reference ?? "—")],
    ["Status", String(v.status ?? "")],
  ];
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex gap-2 print:hidden">
        <Button icon={Printer} variant="secondary" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
        <Button
          icon={Send}
          onClick={() =>
            void shareVoucher(v, unitName).then((how) => {
              if (how === "downloaded") toast("Voucher image saved — attach it in WhatsApp", "info");
            })
          }
        >
          Share
        </Button>
      </div>
      <article className="w-full max-w-[640px] rounded-md bg-[#FBF8F2] p-8 text-[#1E1A14] print:max-w-none print:rounded-none print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="jd-serif text-3xl font-bold uppercase tracking-[0.14em]">{unitName}</span>
            <span className="text-[11px] uppercase tracking-[0.24em] text-[#8A672A]">JD Stays &amp; Hospitality · JD Group</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE}/brands/udaisarovar.webp`} alt="" className="h-14 w-14 rounded-full" />
        </div>
        <div className="my-5 h-px bg-[#D9CCB4]" />
        <div className="flex items-baseline justify-between gap-4">
          <span className="jd-serif text-3xl font-semibold">{voucherTitle(v)}</span>
          <span className="font-mono text-sm">{String(v.voucher_no ?? "")}</span>
        </div>
        <dl className="mt-4 flex flex-col">
          {rows.map(([k, val]) => (
            <div key={k} className="flex justify-between gap-6 border-b border-dashed border-[#D9CCB4] py-2.5 text-sm">
              <dt className="text-[#5C5244]">{k}</dt>
              <dd className="text-right font-medium">{val}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-[0.2em] text-[#5C5244]">Amount</span>
          <span className="jd-serif text-4xl font-bold">{formatMoney(v.amount)}</span>
        </div>
        <p className="mt-1 text-sm italic text-[#5C5244]">{amountInWords(Number(v.amount) || 0)}</p>
        <div className="mt-5 rounded bg-[#F3ECDF] px-3 py-2 text-sm">
          Posted to ledger: <b className="font-semibold">{String(v.ledger ?? "JD Stays & Hospitality")}</b>
        </div>
        <div className="mt-14 flex justify-between text-xs text-[#5C5244]">
          <span className="min-w-36 border-t border-[#8C8273] pt-1.5">Prepared by</span>
          <span className="min-w-36 border-t border-[#8C8273] pt-1.5 text-right">Authorised signatory</span>
        </div>
      </article>
    </div>
  );
}
