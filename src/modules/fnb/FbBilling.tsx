"use client";
/**
 * Room charge & billing (/fb-billing/): today's food orders that still need
 * money. Room orders (linked to a booking) go on the guest bill; table and
 * takeaway orders are settled here — a receipt voucher is made for each.
 */
import { useState } from "react";
import Link from "next/link";
import { getStore } from "@/core/data";
import { addDays, formatDate, formatMoney, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Input, Select } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import type { Row } from "@/core/schema/types";

const MODES = ["Cash", "UPI", "Card"] as const;

export function FbBilling() {
  const user = useUser();
  const { toast } = useToast();
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const [day, setDay] = useState(todayISO());
  const [mode, setMode] = useState<string>("UPI");
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows, loading, reload } = useList("kots", { filter: unitFilter, range: { created_at: { gte: `${day}T00:00:00+05:30`, lte: `${addDays(day, 1)}T00:00:00+05:30` } }, sort: { field: "created_at", dir: "asc" } });
  const live = rows.filter((k) => k.status !== "Cancelled");
  const room = live.filter((k) => k.booking_id);
  const open = live.filter((k) => !k.booking_id && k.status !== "Billed");
  const settled = live.filter((k) => !k.booking_id && k.status === "Billed");

  const settle = async (k: Row) => {
    try {
      await getStore().create("vouchers", {
        vtype: "RV",
        date: day,
        business_unit_id: k.business_unit_id,
        party: String(k.guest_name || k.table_or_room || "Walk-in guest"),
        against: `Food & drinks · KOT ${String(k.kot_no ?? "")}`,
        amount: Number(k.amount) || 0,
        mode,
        status: "Received",
        paid_on: day,
        ledger: "JD Stays & Hospitality",
        created_by: staffId,
      });
      await getStore().update("kots", k.id, { status: "Billed" });
      toast(`KOT ${String(k.kot_no ?? "")} settled by ${mode}`);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const row = (k: Row, right: React.ReactNode) => (
    <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2.5 text-sm">
      <Link href={viewHref("kots", k.id)} className="min-w-0">
        <span className="font-medium">KOT {String(k.kot_no ?? "")}</span>
        <span className="text-slate-500">
          {" "}
          · {String(k.order_type ?? "")}
          {k.table_or_room ? ` ${String(k.table_or_room)}` : ""}
          {k.guest_name ? ` · ${String(k.guest_name)}` : ""} · {String(k.status)}
        </span>
      </Link>
      <span className="flex items-center gap-3">
        <span className="font-semibold">{formatMoney(k.amount)}</span>
        {right}
      </span>
    </li>
  );
  const sum = (xs: Row[]) => xs.reduce((s, k) => s + (Number(k.amount) || 0), 0);

  return (
    <div>
      <PageHeader
        title="Room charge & billing"
        subtitle={`Food orders of ${formatDate(day)}`}
        actions={
          <>
            <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-auto" />
            <Select value={mode} onChange={(e) => setMode(e.target.value)} className="w-auto" aria-label="Paid by">
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="jd-serif text-2xl font-semibold">To settle · {formatMoney(sum(open))}</h2>
            {open.length === 0 ? <p className="text-sm text-slate-500">Nothing to settle.</p> : <ul>{open.map((k) => row(k, <Button size="sm" onClick={() => void settle(k)}>Settle ({mode})</Button>))}</ul>}
          </section>
          <section>
            <h2 className="jd-serif text-2xl font-semibold">Charged to rooms · {formatMoney(sum(room))}</h2>
            <p className="text-xs text-slate-500">These are on the guest’s bill and are paid at check-out.</p>
            {room.length === 0 ? (
              <p className="text-sm text-slate-500">No room orders.</p>
            ) : (
              <ul>
                {room.map((k) =>
                  row(
                    k,
                    <Link href={`/guest-bill/?id=${String(k.booking_id)}`} className="text-sm underline">
                      Guest bill
                    </Link>,
                  ),
                )}
              </ul>
            )}
          </section>
          <section>
            <h2 className="jd-serif text-2xl font-semibold">Settled · {formatMoney(sum(settled))}</h2>
            {settled.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : <ul>{settled.map((k) => row(k, null))}</ul>}
          </section>
        </div>
      )}
    </div>
  );
}
