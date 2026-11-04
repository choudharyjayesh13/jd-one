"use client";
/**
 * Front Office → Arrivals (/arrivals/) and Departures (/departures/).
 * From one date to another – the next 7 days to start, "+ 7 days" for more – grouped by day,
 * with the guest, rooms, people, meal plan, source, balance and status.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { addDays, formatDate, formatDateTime, formatMoney, todayISO } from "@/core/format";
import { viewHref } from "@/core/routes";
import { Badge } from "@/core/ui/Badge";
import { Button } from "@/core/ui/Button";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { roomLines, roomsLabel, weekday } from "./occupancy";
import { useUnitChoice } from "./unit";

type Kind = "arrivals" | "departures";
const LIVE = ["Confirmed", "On hold", "Checked-in", "Checked-out"];

export function Movements({ kind }: { kind: Kind }) {
  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const { unit, setUnit, units, canAll, unitName } = useUnitChoice();
  const field = kind === "arrivals" ? "check_in" : "check_out";
  const { rows, loading } = useList("bookings", { filter: unit ? { business_unit_id: unit } : {}, range: { [field]: { gte: from, lte: to } }, sort: { field, dir: "asc" } });
  const { rows: rooms } = useList("rooms", { filter: unit ? { business_unit_id: unit } : {} });
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, String(r.name)])), [rooms]);

  const list = rows.filter((b) => LIVE.includes(String(b.status)));
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const b of list) m.set(String(b[field]), [...(m.get(String(b[field])) ?? []), b]);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [list, field]);

  const done = (b: Row) => (kind === "arrivals" ? ["Checked-in", "Checked-out"] : ["Checked-out"]).includes(String(b.status));
  const assigned = (b: Row) => {
    const ids = [String(b.room_id ?? ""), ...roomLines(b).flatMap((l) => (l.room_ids ?? []).map(String))].filter(Boolean);
    const names = Array.from(new Set(ids)).map((id) => roomName.get(id)).filter(Boolean);
    return names.length ? names.join(", ") : "Room not assigned";
  };
  const people = (b: Row) => {
    const lines = roomLines(b);
    const a = lines.length ? lines.reduce((s, l) => s + l.adults, 0) : Number(b.adults ?? 0);
    const c = lines.length ? lines.reduce((s, l) => s + l.children, 0) : Number(b.children ?? 0);
    return `${a} adult${a === 1 ? "" : "s"}${c ? ` · ${c} child${c === 1 ? "" : "ren"}` : ""}`;
  };
  const title = kind === "arrivals" ? "Arrivals" : "Departures";
  const nights = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title={title}
          subtitle={`${unitName} · ${formatDate(from)} to ${formatDate(to)} · ${list.length} ${list.length === 1 ? "booking" : "bookings"}`}
          actions={
            <Button icon={Printer} onClick={() => window.print()} disabled={!list.length}>
              Print / Save as PDF
            </Button>
          }
        />
      </div>
      {/* Report header: only on paper / PDF */}
      <header className="mb-4 hidden items-center gap-4 border-b border-slate-300 pb-3 print:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brands/udaisarovar.webp`} alt="" className="h-14 w-14 rounded-full" />
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{title} report</p>
          <h1 className="jd-serif text-2xl font-semibold text-black">
            {unitName} · {formatDate(from)} to {formatDate(to)}
          </h1>
          <p className="text-xs text-slate-600">
            {list.length} {list.length === 1 ? "booking" : "bookings"} · {list.filter(done).length} {kind === "arrivals" ? "checked in" : "checked out"} · balance due {formatMoney(list.reduce((s, b) => s + Number(b.balance ?? 0), 0))} · printed {formatDateTime(new Date().toISOString())}
          </p>
        </div>
      </header>
      <div className="mb-5 flex flex-wrap items-end gap-2 print:hidden">
        <Button variant="secondary" size="sm" aria-label="Earlier" onClick={() => (setFrom(addDays(from, -7)), setTo(addDays(to, -7)))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <label className="flex flex-col text-[11px] uppercase tracking-[0.14em] text-slate-500">
          From
          <Input type="date" value={from} onChange={(e) => e.target.value && (setFrom(e.target.value), e.target.value > to && setTo(addDays(e.target.value, 6)))} className="w-auto" />
        </label>
        <label className="flex flex-col text-[11px] uppercase tracking-[0.14em] text-slate-500">
          To
          <Input type="date" value={to} min={from} onChange={(e) => e.target.value && e.target.value >= from && setTo(e.target.value)} className="w-auto" />
        </label>
        <Button variant="secondary" size="sm" aria-label="Later" onClick={() => (setFrom(addDays(from, 7)), setTo(addDays(to, 7)))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setTo(addDays(to, 7))}>
          + 7 days
        </Button>
        {from !== today && (
          <Button variant="ghost" size="sm" onClick={() => (setFrom(today), setTo(addDays(today, 6)))}>
            Today
          </Button>
        )}
        {canAll && (
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="ml-auto w-auto">
            <option value="">All JD Stays properties</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {String(u.name)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="mb-3 text-xs uppercase tracking-[0.14em] text-slate-500 print:hidden">{nights} days</p>

      {loading ? (
        <Loading />
      ) : byDay.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-slate-500">No {kind} in these dates.</p>
      ) : (
        <div className="space-y-5">
          {byDay.map(([day, items]) => (
            <section key={day} className="break-inside-avoid-page overflow-hidden rounded-xl border border-line bg-white print:rounded-none print:border-slate-300">
              <header className={cn("flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5", day === today && "bg-[#faf5ea]")}>
                <h2 className="jd-serif text-xl font-semibold text-navy">
                  {day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : weekday(day)} <span className="font-sans text-sm font-normal text-slate-500">· {formatDate(day)}</span>
                </h2>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  {items.filter(done).length} of {items.length} {kind === "arrivals" ? "checked in" : "checked out"}
                </span>
              </header>
              <ul className="divide-y divide-line">
                {items.map((b) => (
                  <li key={b.id}>
                    <Link href={viewHref("bookings", b.id)} className="grid grid-cols-1 gap-1 px-4 py-3 hover:bg-slate-50 sm:grid-cols-[1.4fr_1.4fr_1fr_auto] sm:items-center sm:gap-4 sm:px-5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy">{String(b.guest_name)}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {String(b.phone ?? "")}
                          {b.source ? ` · ${String(b.source)}` : ""}
                        </span>
                      </span>
                      <span className="min-w-0 text-sm text-slate-700">
                        <span className="block truncate">{roomsLabel(b)}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {assigned(b)} · {people(b)}
                          {b.meal_plan ? ` · ${String(b.meal_plan)}` : ""}
                        </span>
                      </span>
                      <span className="text-sm text-slate-700">
                        <span className="block text-xs text-slate-500">
                          {kind === "arrivals" ? `till ${formatDate(b.check_out)}` : `since ${formatDate(b.check_in)}`}
                        </span>
                        <span className={cn("block", Number(b.balance ?? 0) > 0 ? "font-medium text-red-700" : "text-emerald-700")}>{Number(b.balance ?? 0) > 0 ? `Due ${formatMoney(b.balance)}` : "Paid"}</span>
                      </span>
                      <span className="justify-self-start sm:justify-self-end">
                        <Badge value={b.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function Arrivals() {
  return <Movements kind="arrivals" />;
}
export function Departures() {
  return <Movements kind="departures" />;
}
