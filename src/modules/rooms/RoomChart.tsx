"use client";
/**
 * Room chart (AsiaTech "Room Chart"): rows = physical rooms, columns = nights
 * in a 14-day window, cells = the guest occupying the room. Bookings without a
 * room are listed below so the front desk can assign one with a tap.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getStore } from "@/core/data";
import { addDays, formatDate, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { listHref, newHref, viewHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader, EmptyState } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import type { Row } from "@/core/schema/types";
import { bookingForRoom, dayList, isWeekend, occupiesNight, weekday } from "./occupancy";

const WINDOW = 14;
const statusTone: Record<string, string> = {
  "Checked-in": "bg-emerald-200 text-emerald-900",
  Confirmed: "bg-sky-200 text-sky-900",
  "Checked-out": "bg-slate-200 text-slate-700",
};
const hkTone: Record<string, string> = { Clean: "bg-emerald-500", Dirty: "bg-red-500", Inspected: "bg-sky-500", Maintenance: "bg-amber-500" };

export function RoomChart() {
  const user = useUser();
  const { toast } = useToast();
  const [start, setStart] = useState(todayISO());
  const [unit, setUnit] = useState(user.unitId ?? "");
  const unitFilter = unit ? { business_unit_id: unit } : {};
  const end = addDays(start, WINDOW - 1);
  const { rows: units } = useList("business-units", { filter: { active: true } });
  const { rows: rooms, loading } = useList("rooms", { filter: { ...unitFilter, active: true }, sort: { field: "sort_order", dir: "asc" }, thenBy: { field: "name", dir: "asc" } });
  const { rows: bookings, reload } = useList("bookings", { filter: unitFilter, range: { check_in: { lte: end } } });
  const dates = useMemo(() => dayList(start, WINDOW), [start]);
  const today = todayISO();

  const unassigned = useMemo(() => bookings.filter((b) => !b.room_id && dates.some((d) => occupiesNight(b, d))), [bookings, dates]);

  const assign = async (booking: Row, roomId: string) => {
    try {
      await getStore().update("bookings", booking.id, { room_id: roomId || null });
      toast(roomId ? "Room assigned" : "Room cleared");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // Render each booking once as a span starting at its first visible night.
  const cellsFor = (room: Row) => {
    const cells: { date: string; booking?: Row; span: number }[] = [];
    let i = 0;
    while (i < dates.length) {
      const d = dates[i];
      const b = bookingForRoom(bookings, room.id, d);
      if (!b) {
        cells.push({ date: d, span: 1 });
        i++;
        continue;
      }
      let span = 1;
      while (i + span < dates.length && bookingForRoom(bookings, room.id, dates[i + span])?.id === b.id) span++;
      cells.push({ date: d, booking: b, span });
      i += span;
    }
    return cells;
  };

  return (
    <div>
      <PageHeader
        title="Room chart"
        subtitle={
          <>
            {formatDate(start)} – {formatDate(end)} · who is in which room.{" "}
            <Link href={listHref("rooms")} className="underline">
              Rooms
            </Link>
          </>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => setStart(addDays(start, -7))} aria-label="Earlier" />
            <Input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className="w-auto" />
            <Button variant="secondary" size="sm" icon={ChevronRight} onClick={() => setStart(addDays(start, 7))} aria-label="Later" />
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
      {loading ? (
        <Loading />
      ) : rooms.length === 0 ? (
        <EmptyState title="No rooms yet" hint="Add each cottage, suite and tent under Rooms to see the chart." action={<Link href={newHref("rooms")}><Button size="sm" icon={Plus}>Add room</Button></Link>} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Room</th>
                {dates.map((d) => (
                  <th key={d} className={cn("min-w-[64px] px-1 py-1.5 text-center font-medium text-slate-500", d === today && "bg-gold/20 text-navy", isWeekend(d) && d !== today && "bg-slate-50")}>
                    <div>{Number(d.slice(8))} {formatDate(d).split(" ")[1]}</div>
                    <div className="text-[9px] font-normal">{weekday(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-t border-line">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                    <Link href={viewHref("rooms", room.id)} className="font-medium text-navy hover:underline">
                      {String(room.name)}
                    </Link>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className={cn("inline-block h-2 w-2 rounded-full", hkTone[String(room.hk_status)] ?? "bg-slate-300")} title={`Housekeeping: ${room.hk_status}`} />
                      {String(room.unit_type)}
                    </div>
                  </td>
                  {cellsFor(room).map((c) =>
                    c.booking ? (
                      <td key={c.date} colSpan={c.span} className="px-0.5 py-0.5">
                        <Link
                          href={viewHref("bookings", c.booking.id)}
                          className={cn("block truncate rounded px-2 py-1.5 font-medium", statusTone[String(c.booking.status)] ?? "bg-slate-100 text-slate-700")}
                          title={`${c.booking.guest_name} · ${formatDate(c.booking.check_in)} → ${formatDate(c.booking.check_out)} · ${c.booking.status}`}
                        >
                          {String(c.booking.guest_name)}
                          <span className="ml-1 font-normal opacity-70">{String(c.booking.meal_plan ?? "")}</span>
                        </Link>
                      </td>
                    ) : (
                      <td key={c.date} className={cn("px-0.5 py-0.5", isWeekend(c.date) && "bg-slate-50/60")}>
                        <Link href={newHref("bookings", { unit_type: room.unit_type, room_id: room.id, check_in: c.date, business_unit_id: room.business_unit_id })} className="block h-7 rounded border border-dashed border-transparent hover:border-line" title="New booking" />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unassigned.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 text-sm font-semibold text-amber-900">Bookings without a room ({unassigned.length})</div>
          <ul className="space-y-1.5">
            {unassigned.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={viewHref("bookings", b.id)} className="font-medium text-navy hover:underline">
                  {String(b.guest_name)}
                </Link>
                <span className="text-xs text-slate-600">
                  {String(b.unit_type)} · {formatDate(b.check_in)} → {formatDate(b.check_out)} · {String(b.status)}
                </span>
                <Select value="" onChange={(e) => void assign(b, e.target.value)} className="h-8 w-auto text-xs">
                  <option value="">Assign room…</option>
                  {rooms
                    .filter((r) => r.unit_type === b.unit_type && !dates.some((d) => occupiesNight(b, d) && bookingForRoom(bookings, r.id, d)))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {String(r.name)}
                      </option>
                    ))}
                </Select>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Green = checked in, blue = confirmed. Tap an empty cell to book that room from that night; the dot shows housekeeping status.</p>
    </div>
  );
}
