"use client";
/**
 * Guest bill (/guest-bill/?id=<booking>): one bill for the whole stay — every
 * room category, GST, food & drink ordered to the room (KOTs linked to the
 * booking) and add-ons — minus the payments received. Print → "Save as PDF"
 * gives the PDF; WhatsApp sends the summary to the guest.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IndianRupee, MessageCircle, Printer } from "lucide-react";
import { useList, useRecord } from "@/core/ui/hooks";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { Button } from "@/core/ui/Button";
import { formatDate, formatMoney, todayISO } from "@/core/format";
import { normalizePhone } from "@/core/phone";
import { newHref, viewHref } from "@/core/routes";
import { nightsBetween } from "@/modules/customers/stats";
import { roomLines } from "@/modules/rooms/occupancy";
import { amountInWords } from "@/modules/vouchers/words";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Without a booking: guests in house or leaving soon, to open their bill. */
function BillPicker() {
  const today = todayISO();
  const { rows, loading } = useList("bookings", { range: { check_out: { gte: today } }, sort: { field: "check_out", dir: "asc" } });
  const open = rows.filter((r) => r.status === "Checked-in" || (r.status === "Confirmed" && String(r.check_in) <= today));
  if (loading) return <Loading />;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="jd-serif text-4xl font-medium">Guest bill</h1>
      <p className="text-sm text-slate-500">Guests in house now. Any booking's bill also opens from the booking page → Guest bill.</p>
      {open.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody is checked in right now.</p>
      ) : (
        <ul className="flex flex-col">
          {open.map((r) => (
            <li key={r.id} className="border-t border-line">
              <Link href={`/guest-bill/?id=${r.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="font-medium">{String(r.guest_name)}</span>
                <span className="text-sm text-slate-500">
                  {formatDate(r.check_in)} → {formatDate(r.check_out)} · balance {formatMoney(r.balance)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GuestBill() {
  const id = useSearchParams().get("id");
  return id ? <Bill id={id} /> : <BillPicker />;
}

function Bill({ id }: { id: string }) {
  const { row: b, loading, error } = useRecord("bookings", id);
  const { row: unit } = useRecord("business-units", b?.business_unit_id ? String(b.business_unit_id) : null);
  const { rows: payments } = useList("payments", { filter: { booking_id: id } });
  const { rows: kots } = useList("kots", { filter: { booking_id: id } });

  if (loading) return <Loading />;
  if (error || !b) return <ErrorBox message={error ?? "Booking not found."} />;

  const unitName = String(unit?.name ?? "The Udaisarovar");
  const nights = nightsBetween(b.check_in, b.check_out);
  const lines = roomLines(b);
  const website = !!b.booking_ref;
  const tax = website ? Number(b.tax_amount ?? 0) : 0;

  // Room charges: one line per room category (older bookings: the single room type).
  const roomCharges: { label: string; detail: string; amount: number }[] = lines.length
    ? lines.map((l) => ({
        label: `${l.rooms} × ${l.unit_type}`,
        detail: `${l.meal_plan} · ${nights} night${nights === 1 ? "" : "s"} @ ${formatMoney(l.rate)}`,
        amount: l.rate * l.rooms * nights,
      }))
    : [
        {
          label: `${Number(b.units ?? 1) || 1} × ${String(b.unit_type ?? "Room")}`,
          detail: `${String(b.meal_plan ?? "")} · ${nights} night${nights === 1 ? "" : "s"}`,
          amount: Number(website ? (b.room_amount ?? b.total) : b.total) || 0,
        },
      ];
  const fnb = kots
    .filter((k) => k.status !== "Cancelled" && Number(k.amount ?? 0) > 0)
    .map((k) => ({ label: `Food & drinks · KOT ${String(k.kot_no ?? "")}`, detail: `${formatDate(String(k.created_at ?? "").slice(0, 10))} · ${String(k.items ?? "").split("\n")[0]}`, amount: Number(k.amount) || 0 }));

  const charges = [...roomCharges, ...(tax > 0 ? [{ label: "GST", detail: "On room & meals", amount: tax }] : []), ...fnb];
  const totalCharges = charges.reduce((s, c) => s + c.amount, 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const balance = totalCharges - paid;
  const billNo = website ? String(b.booking_ref) : `B-${String(b.id).slice(0, 6).toUpperCase()}`;

  const phone = normalizePhone(b.phone);
  const waText = [
    `${unitName} — Guest bill ${billNo}`,
    `${String(b.guest_name)} · ${formatDate(b.check_in)} → ${formatDate(b.check_out)}`,
    ...charges.map((c) => `${c.label}: ${formatMoney(c.amount)}`),
    `Total: ${formatMoney(totalCharges)}`,
    `Paid: ${formatMoney(paid)}`,
    `Balance due: ${formatMoney(balance)}`,
    "Thank you for staying with us.",
  ].join("\n");

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <Link href={String(b.status) === "Checked-out" ? "/checked-out/" : String(b.status) === "Checked-in" ? "/staying/" : viewHref("bookings", String(b.id))}>
          <Button variant="secondary">← {String(b.status) === "Checked-out" ? "Checked-out" : String(b.status) === "Checked-in" ? "Staying" : "Booking"}</Button>
        </Link>
        <Button icon={Printer} variant="secondary" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
        {phone.length >= 10 && (
          <a href={`https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">
            <Button icon={MessageCircle} variant="secondary">
              Send to guest
            </Button>
          </a>
        )}
        {balance > 0 && (
          <Link href={newHref("payments", { booking_id: b.id, customer_id: b.customer_id, amount: balance })}>
            <Button icon={IndianRupee}>Add payment</Button>
          </Link>
        )}
      </div>

      <article className="w-full max-w-[720px] rounded-md bg-[#FBF8F2] p-8 text-[#1E1A14] print:max-w-none print:rounded-none print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="jd-serif text-3xl font-bold uppercase tracking-[0.14em]">{unitName}</span>
            <span className="text-[11px] uppercase tracking-[0.24em] text-[#8A672A]">JD Stays &amp; Hospitality · JD Group</span>
            {unit?.gstin ? <span className="text-xs text-[#5C5244]">GSTIN {String(unit.gstin)}</span> : null}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE}/brands/udaisarovar.webp`} alt="" className="h-14 w-14 rounded-full" />
        </div>
        <div className="my-5 h-px bg-[#D9CCB4]" />
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <span className="jd-serif text-3xl font-semibold">Guest bill</span>
          <span className="text-sm">
            <span className="font-mono">{billNo}</span> · {formatDate(todayISO())}
          </span>
        </div>

        <div className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <span className="text-[#5C5244]">Guest: </span>
            <b className="font-semibold">{String(b.guest_name)}</b> · {String(b.phone ?? "")}
          </div>
          <div className="sm:text-right">
            <span className="text-[#5C5244]">Stay: </span>
            {formatDate(b.check_in)} → {formatDate(b.check_out)} · {nights} night{nights === 1 ? "" : "s"}
          </div>
          {b.gst_company ? (
            <div className="sm:col-span-2">
              <span className="text-[#5C5244]">Bill to: </span>
              {String(b.gst_company)}
              {b.gstin ? ` · GSTIN ${String(b.gstin)}` : ""}
            </div>
          ) : null}
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-[#D9CCB4] text-left text-[11px] uppercase tracking-[0.18em] text-[#5C5244]">
              <th className="py-2 font-medium">Charges</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((c, i) => (
              <tr key={i} className="border-b border-dashed border-[#D9CCB4]">
                <td className="py-2.5">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-[#5C5244]">{c.detail}</div>
                </td>
                <td className="py-2.5 text-right font-medium">{formatMoney(c.amount)}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 font-semibold">Total</td>
              <td className="pt-3 text-right font-semibold">{formatMoney(totalCharges)}</td>
            </tr>
          </tbody>
        </table>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-[#D9CCB4] text-left text-[11px] uppercase tracking-[0.18em] text-[#5C5244]">
              <th className="py-2 font-medium">Payments received</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td className="py-2.5 text-[#5C5244]" colSpan={2}>
                  No payment yet
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b border-dashed border-[#D9CCB4]">
                  <td className="py-2.5">
                    {formatDate(p.date)} · {String(p.mode ?? "")}
                    {p.reference ? <span className="text-xs text-[#5C5244]"> · {String(p.reference)}</span> : null}
                  </td>
                  <td className="py-2.5 text-right">{formatMoney(p.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-6 flex items-baseline justify-between rounded bg-[#F3ECDF] px-4 py-3">
          <span className="text-xs uppercase tracking-[0.2em] text-[#5C5244]">{balance > 0 ? "Balance due" : balance < 0 ? "Refund due" : "Fully paid"}</span>
          <span className="jd-serif text-4xl font-bold">{formatMoney(Math.abs(balance))}</span>
        </div>
        {balance !== 0 && <p className="mt-1 text-sm italic text-[#5C5244]">{amountInWords(Math.abs(balance))}</p>}

        <div className="mt-14 flex justify-between text-xs text-[#5C5244]">
          <span className="min-w-36 border-t border-[#8C8273] pt-1.5">Guest signature</span>
          <span className="min-w-36 border-t border-[#8C8273] pt-1.5 text-right">Front office</span>
        </div>
        <p className="mt-6 text-center text-xs text-[#8C8273]">Thank you for staying with us · app.myjdgroup.com</p>
      </article>
    </div>
  );
}
