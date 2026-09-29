"use client";
/**
 * Availability calendar (AsiaTech "Room Management → Availability Calendar"):
 * rows = room types, columns = days of the month, cell = units still free.
 * Inventory = active rooms of that type; bookings that hold inventory reduce it;
 * a stop-sell rate row shows the day as Closed.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { currentMonth, formatMonth, monthRange, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { listHref, newHref } from "@/core/routes";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader, EmptyState } from "@/core/ui/misc";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Plus } from "lucide-react";
import { UNIT_TYPES } from "@/modules/bookings/entity";
import { isClosed } from "@/modules/rates/entity";
import { roomsByType } from "./entity";
import { bookedUnits, dayList, isWeekend, weekday } from "./occupancy";

export function AvailabilityCalendar() {
  const user = useUser();
  const [month, setMonth] = useState(currentMonth());
  const [unit, setUnit] = useState(user.unitId ?? "");
  const { start, end, days } = monthRange(month);
  const unitFilter = unit ? { business_unit_id: unit } : {};
  const { rows: units } = useList("business-units", { filter: { active: true } });
  const { rows: rooms, loading } = useList("rooms", { filter: unitFilter });
  const { rows: bookings } = useList("bookings", { filter: unitFilter, range: { check_in: { lte: end } } });
  const { rows: rates } = useList("rates", { filter: unitFilter, range: { date_from: { lte: end } } });
  const today = todayISO();
  const dates = useMemo(() => dayList(start, days), [start, days]);
  const inventory = useMemo(() => roomsByType(rooms), [rooms]);
  const types = useMemo(() => {
    const known = UNIT_TYPES.filter((t) => inventory.has(t));
    const extra = Array.from(inventory.keys()).filter((t) => !known.includes(t as (typeof UNIT_TYPES)[number]));
    return [...known, ...extra];
  }, [inventory]);

  const cellTone = (free: number, total: number, closed: boolean) => {
    if (closed) return "bg-slate-200 text-slate-600";
    if (total === 0) return "bg-slate-50 text-slate-400";
    if (free <= 0) return "bg-red-100 text-red-800";
    if (free < total) return "bg-amber-100 text-amber-800";
    return "bg-emerald-50 text-emerald-800";
  };

  return (
    <div>
      <PageHeader
        title="Availability calendar"
        subtitle={
          <>
            {formatMonth(month)} · free units per room type per night.{" "}
            <Link href={listHref("rooms")} className="underline">
              Manage rooms
            </Link>
          </>
        }
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
            {!user.unitId && (
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto">
                <option value="">All properties</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)}
                  </option>
                ))}
              </Select>
            )}
            <Link href={newHref("bookings", unit ? { business_unit_id: unit } : undefined)}>
              <Button size="sm" icon={Plus}>
                Booking
              </Button>
            </Link>
          </>
        }
      />
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-50 ring-1 ring-emerald-200" /> all free</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" /> partly booked</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-100" /> sold out</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-200" /> closed (stop sell)</span>
      </div>
      {loading ? (
        <Loading />
      ) : types.length === 0 ? (
        <EmptyState title="No rooms yet" hint="Add each cottage, suite and tent under Rooms; availability is counted from them." action={<Link href={newHref("rooms")}><Button size="sm" icon={Plus}>Add room</Button></Link>} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Room type</th>
                {dates.map((d) => (
                  <th key={d} className={cn("min-w-[34px] px-0.5 py-1.5 text-center font-medium text-slate-500", d === today && "bg-gold/20 text-navy", isWeekend(d) && d !== today && "bg-slate-50")}>
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[9px] font-normal">{weekday(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const total = inventory.get(t) ?? 0;
                return (
                  <tr key={t} className="border-t border-line">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-navy">
                      {t}
                      <span className="ml-1 text-[10px] text-slate-500">({total})</span>
                    </td>
                    {dates.map((d) => {
                      const booked = bookedUnits(bookings, t, d);
                      const free = total - booked;
                      const closed = isClosed(rates, t, d);
                      return (
                        <td key={d} className="px-0.5 py-0.5 text-center">
                          <Link
                            href={newHref("bookings", { unit_type: t, check_in: d, ...(unit ? { business_unit_id: unit } : {}) })}
                            title={closed ? "Closed online" : `${free} of ${total} free · ${booked} booked`}
                            className={cn("block rounded px-1 py-1 font-semibold tabular-nums", cellTone(free, total, closed))}
                          >
                            {closed ? "×" : free}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="border-t border-line bg-slate-50">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 font-semibold text-slate-600">Occupancy</td>
                {dates.map((d) => {
                  const total = Array.from(inventory.values()).reduce((s, n) => s + n, 0);
                  const booked = types.reduce((s, t) => s + bookedUnits(bookings, t, d), 0);
                  const pct = total ? Math.round((booked / total) * 100) : 0;
                  return (
                    <td key={d} className={cn("px-0.5 py-1.5 text-center tabular-nums", pct >= 100 ? "text-red-700 font-semibold" : pct >= 60 ? "text-amber-700" : "text-slate-500")}>
                      {pct}%
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Tap a cell to start a booking for that room type and date. Only Confirmed and Checked-in bookings hold inventory.</p>
    </div>
  );
}
