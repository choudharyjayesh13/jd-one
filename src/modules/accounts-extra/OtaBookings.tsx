"use client";
/** OTA bookings (/ota-bookings/): this month's bookings from MakeMyTrip, Booking.com, Airbnb… per channel, and the list. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { currentMonth, formatDate, formatMoney, formatMonth, monthRange } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { newHref, viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Input } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { OTA_SOURCES } from "@/modules/bookings/entity";
import { nightsBetween } from "@/modules/customers/stats";
import { roomsLabel } from "@/modules/rooms/occupancy";

export function OtaBookings() {
  const user = useUser();
  const [month, setMonth] = useState(currentMonth());
  const { start, end } = monthRange(month);
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows, loading } = useList("bookings", { filter: unitFilter, range: { check_in: { gte: start, lte: end } }, sort: { field: "check_in", dir: "asc" } });
  const ota = rows.filter((b) => OTA_SOURCES.includes(String(b.source)) && b.status !== "Cancelled");
  const all = rows.filter((b) => b.status !== "Cancelled");

  const byChannel = useMemo(() => {
    const m = new Map<string, { n: number; nights: number; amt: number }>();
    for (const b of ota) {
      const c = String(b.source);
      const cur = m.get(c) ?? { n: 0, nights: 0, amt: 0 };
      cur.n += 1;
      cur.nights += nightsBetween(b.check_in, b.check_out) * (Number(b.units) || 1);
      cur.amt += Number(b.total) || 0;
      m.set(c, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].amt - a[1].amt);
  }, [ota]);
  const otaAmt = ota.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const allAmt = all.reduce((s, b) => s + (Number(b.total) || 0), 0);

  return (
    <div>
      <PageHeader
        title="OTA bookings"
        subtitle={`${formatMonth(month)} · ${ota.length} of ${all.length} bookings · ${allAmt ? Math.round((otaAmt / allAmt) * 100) : 0}% of revenue from OTAs`}
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" />
            <Link href={newHref("bookings", { source: "MMT/Goibibo" })}>
              <Button size="sm">+ OTA booking</Button>
            </Link>
          </>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            {byChannel.length === 0 ? (
              <div className="bg-background p-4 text-sm text-slate-500">No OTA bookings this month.</div>
            ) : (
              byChannel.map(([c, x]) => (
                <div key={c} className="flex flex-col gap-1 bg-background p-4">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{c}</span>
                  <span className="jd-serif text-3xl font-semibold leading-none">{formatMoney(x.amt)}</span>
                  <span className="text-xs text-slate-500">
                    {x.n} bookings · {x.nights} room nights
                  </span>
                </div>
              ))
            )}
          </div>
          <ul>
            {ota.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2.5 text-sm">
                <Link href={viewHref("bookings", b.id)}>
                  <span className="font-medium">{String(b.guest_name)}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {String(b.source)} · {formatDate(b.check_in)} → {formatDate(b.check_out)} · {roomsLabel(b)}
                    {b.external_ref ? ` · ${String(b.external_ref)}` : ""}
                  </span>
                </Link>
                <span className="font-semibold">{formatMoney(b.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
