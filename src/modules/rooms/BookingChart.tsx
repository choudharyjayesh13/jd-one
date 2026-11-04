"use client";
/**
 * Reservations → Booking chart (a hotel "tape chart").
 * Rows = physical rooms grouped by category; columns = nights. Each stay is one bar from
 * the middle of the arrival day to the middle of the departure day, coloured by status.
 * The category line shows rooms still free each night; the last line shows occupancy.
 * Tap a bar to open the booking, tap an empty night to book that room. Stays without a room
 * are listed under "Needs a room" to assign with one tap.
 */
import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getStore } from "@/core/data";
import { addDays, formatDate, formatMoney, todayISO } from "@/core/format";
import { newHref, viewHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { EmptyState, Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import type { Row } from "@/core/schema/types";
import { dayList, expandStays, isWeekend, occupiesNight, weekday, withRoomAssigned, type Stay } from "./occupancy";
import { useUnitChoice } from "./unit";

const VIEWS = [7, 14, 30] as const;
const COL: Record<number, number> = { 7: 112, 14: 68, 30: 42 };
const LEFT = 212;
const SHOWN = ["On hold", "Confirmed", "Checked-in", "Checked-out"];

const BAR: Record<string, string> = {
  Confirmed: "bg-[#f4ead3] border-[#a9802f] text-[#3d2f12]",
  "Checked-in": "bg-[#dcefe3] border-[#1f7a4d] text-[#0f3d26]",
  "On hold": "bg-white border-[#c9a24f] border-dashed text-[#6b5320]",
  "Checked-out": "bg-[#eef0f2] border-[#9aa3ad] text-[#55606b]",
};
const LEGEND: [string, string][] = [
  ["Confirmed", "bg-[#f4ead3] border-[#a9802f]"],
  ["Checked-in", "bg-[#dcefe3] border-[#1f7a4d]"],
  ["On hold", "bg-white border-[#c9a24f] border-dashed"],
  ["Checked-out", "bg-[#eef0f2] border-[#9aa3ad]"],
];
const HK_DOT: Record<string, string> = { Clean: "bg-emerald-500", Inspected: "bg-sky-500", Dirty: "bg-red-500", Maintenance: "bg-amber-500" };

const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export function BookingChart() {
  const { toast } = useToast();
  const today = todayISO();
  const [start, setStart] = useState(addDays(today, -1));
  const [days, setDays] = useState<number>(14);
  const { unit, setUnit, units, canAll, unitName } = useUnitChoice();
  const unitFilter = unit ? { business_unit_id: unit } : {};
  const end = addDays(start, days - 1);
  const { rows: rooms, loading } = useList("rooms", { filter: { ...unitFilter, active: true }, sort: { field: "sort_order", dir: "asc" }, thenBy: { field: "name", dir: "asc" } });
  const { rows: bookings, reload } = useList("bookings", { filter: unitFilter, range: { check_in: { lte: end }, check_out: { gte: start } } });
  const dates = useMemo(() => dayList(start, days), [start, days]);
  const col = COL[days] ?? 56;

  const stays = useMemo(() => expandStays(bookings.filter((b) => SHOWN.includes(String(b.status)))), [bookings]);
  const byRoom = useMemo(() => {
    const m = new Map<string, Stay[]>();
    for (const s of stays) if (s.room_id) m.set(String(s.room_id), [...(m.get(String(s.room_id)) ?? []), s]);
    return m;
  }, [stays]);
  const unassigned = useMemo(() => stays.filter((s) => !s.room_id && String(s.status) !== "Checked-out" && dates.some((d) => occupiesNight(s, d))), [stays, dates]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rooms) m.set(String(r.unit_type ?? "Rooms"), [...(m.get(String(r.unit_type ?? "Rooms")) ?? []), r]);
    return Array.from(m.entries());
  }, [rooms]);

  const sellable = rooms.filter((r) => String(r.status) !== "Out of order");
  const occupiedOn = (d: string) => stays.filter((s) => occupiesNight(s, d)).length;
  const freeOf = (type: string, list: Row[], d: string) =>
    list.filter((r) => String(r.status) !== "Out of order").length - stays.filter((s) => String(s.unit_type) === type && occupiesNight(s, d)).length;

  const assign = async (stay: Stay, roomId: string) => {
    try {
      const booking = bookings.find((b) => b.id === stay._bookingId);
      if (!booking) throw new Error("Booking not found");
      if (stay._line !== undefined && stay._slot !== undefined) {
        const room_lines = withRoomAssigned(booking, stay._line, stay._slot, roomId || null);
        await getStore().update("bookings", booking.id, { room_lines, ...(stay._line === 0 && stay._slot === 0 ? { room_id: roomId || null } : {}) });
      } else await getStore().update("bookings", booking.id, { room_id: roomId || null });
      toast(roomId ? "Room assigned" : "Room cleared");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const grid: CSSProperties = { gridTemplateColumns: `repeat(${days}, minmax(${col}px, 1fr))` };
  const minWidth = LEFT + days * col;

  /** Bar position in % of the night strip: middle of arrival day → middle of departure day. */
  const barFor = (s: Stay) => {
    const a = nightsBetween(start, String(s.check_in)) + 0.5;
    const b = nightsBetween(start, String(s.check_out)) + 0.5;
    const l = Math.max(0, a);
    const r = Math.min(days, b);
    if (r <= l) return null;
    return { left: `calc(${(l / days) * 100}% + 2px)`, width: `calc(${((r - l) / days) * 100}% - 4px)`, cutL: a < 0, cutR: b > days, px: (r - l) * col };
  };

  return (
    <div>
      <PageHeader
        title="Booking chart"
        subtitle={`${unitName} · ${formatDate(start)} – ${formatDate(end)}`}
        actions={
          <Link href={newHref("bookings", unit ? { business_unit_id: unit } : undefined)}>
            <Button icon={Plus}>New booking</Button>
          </Link>
        }
      />

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border border-line bg-white">
          <button type="button" aria-label="Earlier" onClick={() => setStart(addDays(start, -days))} className="flex h-9 w-9 items-center justify-center text-navy hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setStart(addDays(today, -1))} className="h-9 border-x border-line px-3 text-sm font-medium text-navy hover:bg-slate-50">
            Today
          </button>
          <button type="button" aria-label="Later" onClick={() => setStart(addDays(start, days))} className="flex h-9 w-9 items-center justify-center text-navy hover:bg-slate-50">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Input type="date" aria-label="From" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className="h-9 w-auto" />
        <div className="flex overflow-hidden rounded-lg border border-line bg-white text-sm">
          {VIEWS.map((v) => (
            <button key={v} type="button" onClick={() => setDays(v)} className={cn("h-9 px-3", days === v ? "bg-[#17140f] font-medium text-white" : "text-navy hover:bg-slate-50")}>
              {v} days
            </button>
          ))}
        </div>
        {canAll && (
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9 w-auto">
            <option value="">All JD Stays properties</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {String(u.name)}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {LEGEND.map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("h-3 w-5 rounded-sm border-l-[3px] border", c)} />
              {l}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,#e2e5e9_0_4px,#f6f7f8_4px_8px)]" />
            Out of order
          </span>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : rooms.length === 0 ? (
        <EmptyState title="No rooms set up yet" hint="Add each cottage, suite and tent under Company policy → Rooms setup to see the chart." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <div style={{ minWidth }} className="text-[13px]">
            {/* Month + day header */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-[#fbf9f5]">
              <div style={{ width: LEFT }} className="sticky left-0 z-30 flex shrink-0 items-end border-r border-line bg-[#fbf9f5] px-4 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Rooms
              </div>
              <div className="grid flex-1" style={grid}>
                {dates.map((d, i) => {
                  const first = i === 0 || d.slice(8) === "01";
                  return (
                    <div key={d} className={cn("relative border-r border-line/70 pb-1.5 pt-5 text-center", isWeekend(d) && "bg-[#f5f1e8]", d === today && "bg-[#f3e3bf]")}>
                      {first && <span className="absolute left-1.5 top-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7128]">{monthName(d)}</span>}
                      <div className={cn("text-[10px] uppercase tracking-[0.1em]", d === today ? "font-semibold text-[#7a5a1f]" : "text-slate-500")}>{weekday(d)}</div>
                      <div className={cn("jd-serif text-lg leading-tight", d === today ? "font-semibold text-[#17140f]" : "text-navy")}>{Number(d.slice(8))}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {groups.map(([type, list]) => (
              <div key={type}>
                {/* Category line: rooms free per night */}
                <div className="flex border-b border-line bg-[#f7f5f0]">
                  <div style={{ width: LEFT }} className="sticky left-0 z-10 shrink-0 border-r border-line bg-[#f7f5f0] px-4 py-1.5">
                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#17140f]">{type}</span>
                      <span className="text-[11px] text-slate-500">{list.length}</span>
                    </div>
                  </div>
                  <div className="grid flex-1" style={grid}>
                    {dates.map((d) => {
                      const f = freeOf(type, list, d);
                      return (
                        <div key={d} className={cn("border-r border-line/60 py-1.5 text-center text-[11px] font-medium", f <= 0 ? "text-red-700" : "text-slate-500")}>
                          {f <= 0 ? "Sold" : `${f} free`}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {list.map((room) => {
                  const ooo = String(room.status) === "Out of order";
                  return (
                    <div key={room.id} className="group flex border-b border-line/80 last:border-b-line">
                      <div style={{ width: LEFT }} className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-white px-4 py-2 group-hover:bg-[#fcfaf6]">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", HK_DOT[String(room.hk_status)] ?? "bg-slate-300")} title={`Housekeeping: ${String(room.hk_status ?? "—")}`} />
                        <span className="truncate font-medium text-navy">{String(room.name)}</span>
                      </div>
                      <div className="relative h-11 flex-1">
                        <div className="grid h-full" style={grid}>
                          {dates.map((d) =>
                            d >= today && !ooo ? (
                              <Link
                                key={d}
                                href={newHref("bookings", { unit_type: room.unit_type, room_id: room.id, check_in: d, check_out: addDays(d, 1), business_unit_id: room.business_unit_id })}
                                title={`Book ${String(room.name)} from ${formatDate(d)}`}
                                className={cn("border-r border-line/50 hover:bg-[#f3e3bf]/40", isWeekend(d) && "bg-[#faf7f0]", d === today && "bg-[#f3e3bf]/30")}
                              />
                            ) : (
                              <div key={d} className={cn("border-r border-line/50", isWeekend(d) && "bg-[#faf7f0]", d === today && "bg-[#f3e3bf]/30")} />
                            ),
                          )}
                        </div>
                        {ooo && (
                          <div className="pointer-events-none absolute inset-y-1.5 left-0.5 right-0.5 flex items-center rounded bg-[repeating-linear-gradient(135deg,#e2e5e9_0_6px,#f6f7f8_6px_12px)] px-3 text-xs font-medium text-slate-600">Out of order</div>
                        )}
                        {(byRoom.get(room.id) ?? []).map((s) => {
                          const p = barFor(s);
                          if (!p) return null;
                          const n = nightsBetween(String(s.check_in), String(s.check_out));
                          const due = Number(s.balance ?? 0) > 0 && String(s.status) !== "Checked-out";
                          return (
                            <Link
                              key={`${s._bookingId}-${s._line ?? ""}-${s._slot ?? ""}`}
                              href={viewHref("bookings", s._bookingId)}
                              style={{ left: p.left, width: p.width }}
                              title={`${String(s.guest_name)} · ${formatDate(s.check_in)} → ${formatDate(s.check_out)} · ${n} night${n === 1 ? "" : "s"} · ${String(s.meal_plan ?? "")} · ${String(s.status)}${due ? ` · balance ${formatMoney(s.balance)}` : ""}`}
                              className={cn(
                                "absolute inset-y-1.5 flex items-center gap-1.5 overflow-hidden border border-l-[3px] px-2 shadow-[0_1px_0_rgba(23,20,15,0.06)] transition hover:z-10 hover:shadow-md",
                                BAR[String(s.status)] ?? BAR.Confirmed,
                                p.cutL ? "rounded-l-none border-l" : "rounded-l-md",
                                p.cutR ? "rounded-r-none" : "rounded-r-md",
                              )}
                            >
                              <span className="min-w-0 truncate font-medium">{String(s.guest_name)}</span>
                              {p.px >= 190 && (
                                <span className="shrink-0 text-[11px] opacity-70">
                                  {n}N · {String(s.meal_plan ?? "")}
                                </span>
                              )}
                              {due && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" title="Balance due" />}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Occupancy line */}
            <div className="flex bg-[#fbf9f5]">
              <div style={{ width: LEFT }} className="sticky left-0 z-10 shrink-0 border-r border-line bg-[#fbf9f5] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Occupancy
              </div>
              <div className="grid flex-1" style={grid}>
                {dates.map((d) => {
                  const pct = sellable.length ? Math.round((Math.min(occupiedOn(d), sellable.length) / sellable.length) * 100) : 0;
                  return (
                    <div key={d} className="border-r border-line/60 py-2 text-center">
                      <div className={cn("text-xs font-semibold", pct >= 90 ? "text-[#1f7a4d]" : pct >= 50 ? "text-[#7a5a1f]" : "text-slate-500")}>{pct}%</div>
                      <div className="mx-auto mt-1 h-1 w-3/5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-[#a9802f]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <section className="mt-4 rounded-xl border border-[#e7dcc4] bg-[#fbf7ee]">
          <h2 className="border-b border-[#e7dcc4] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5a1f]">Needs a room · {unassigned.length}</h2>
          <ul className="divide-y divide-[#efe5cf]">
            {unassigned.map((s) => (
              <li key={`${s._bookingId}-${s._line ?? ""}-${s._slot ?? ""}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
                <Link href={viewHref("bookings", s._bookingId)} className="min-w-[160px] font-medium text-navy hover:underline">
                  {String(s.guest_name)}
                </Link>
                <span className="text-slate-600">{String(s.unit_type)}</span>
                <span className="text-slate-600">
                  {formatDate(s.check_in)} → {formatDate(s.check_out)}
                </span>
                <span className="text-xs text-slate-500">{String(s.status)}</span>
                <Select value="" onChange={(e) => void assign(s, e.target.value)} className="ml-auto h-8 w-auto text-xs">
                  <option value="">Assign room…</option>
                  {rooms
                    .filter((r) => r.unit_type === s.unit_type && String(r.status) !== "Out of order" && !dates.some((d) => occupiesNight(s, d) && (byRoom.get(r.id) ?? []).some((o) => occupiesNight(o, d))))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {String(r.name)}
                      </option>
                    ))}
                </Select>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-2 text-xs text-slate-500">Tap a stay to open the booking · tap an empty night to book that room · red dot = balance due · coloured dot by the room = housekeeping.</p>
    </div>
  );
}
