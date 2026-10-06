"use client";
/** /performance: month-by-month sales, ADR and occupancy against target — for the GM and the sales team. */
import { useState } from "react";
import { TrendingUp, BedDouble, IndianRupee, Target, CalendarClock, Lock } from "lucide-react";
import { useUser } from "@/core/auth/AuthProvider";
import { formatMoney, formatMonth, currentMonth, todayISO } from "@/core/format";
import { Select } from "@/core/ui/Input";
import { Table, Th, Td } from "@/core/ui/Table";
import { useList } from "@/core/ui/hooks";
import { Loading } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { photoOfDay } from "@/core/ui/property";
import type { Row } from "@/core/schema/types";
import { computeMonths, monthsBetween, paceFor, type MonthStat } from "./compute";

/** Who may open this page: GM / owner / office roles, plus sales & reservations staff. */
export function canSeePerformance(role: string, staff: Row | null | undefined): boolean {
  if (["owner", "manager", "marketing", "finance", "accounts"].includes(role)) return true;
  return /sales|reservation|front office/i.test(String(staff?.designation ?? ""));
}

function Bar({ value, target, className }: { value: number; target: number; className?: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-400" : "bg-rose-400", className)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, progress }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string; progress?: { value: number; target: number } }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4 text-gold" />{label}</div>
      <div className="mt-2 text-2xl font-bold text-navy">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
      {progress && <div className="mt-3"><Bar value={progress.value} target={progress.target} /></div>}
    </div>
  );
}

const ok = (v: number, t: number) => (t ? (v >= t ? "text-emerald-600" : v >= 0.7 * t ? "text-amber-600" : "text-rose-600") : "");

export function Performance() {
  const user = useUser();
  const { rows: units, loading: lu } = useList("business-units");
  const { rows: bookings, loading: lb } = useList("bookings");
  const { rows: targets } = useList("targets");
  const roomUnits = units.filter((u) => Number(u.rooms ?? 0) > 0);
  const [unitId, setUnitId] = useState<string>("");
  const unit = roomUnits.find((u) => u.id === (unitId || user.unitId)) ?? roomUnits[0];
  const rooms = Number(unit?.rooms ?? 0);

  const stats: MonthStat[] = (() => {
    if (!unit) return [];
    const mine = bookings.filter((b) => b.business_unit_id === unit.id);
    const first = mine.map((b) => String(b.check_in ?? "")).filter(Boolean).sort()[0]?.slice(0, 7) ?? currentMonth();
    const [y, m] = currentMonth().split("-").map(Number);
    const last = `${m >= 11 ? y + 1 : y}-${String(((m + 1) % 12) + 1).padStart(2, "0")}`;
    return computeMonths(mine, targets.filter((t) => t.business_unit_id === unit.id), rooms, monthsBetween(first, last));
  })();

  if (!canSeePerformance(user.role, user.staff)) {
    return <div className="mx-auto max-w-lg rounded-2xl border bg-white p-8 text-center text-slate-600"><Lock className="mx-auto mb-3 h-6 w-6 text-slate-400" />This page is for the GM and the sales team.</div>;
  }
  if (lu || lb) return <Loading />;
  if (!unit) return <div className="p-6 text-slate-600">Set the number of rooms on a business unit (Business units → Rooms) to see occupancy.</div>;

  const cur = stats.find((s) => s.month === currentMonth()) ?? stats[stats.length - 1];
  const pace = cur ? paceFor(cur, todayISO(), rooms) : null;
  const past = stats.filter((s) => s.month <= currentMonth()).reverse();
  const ahead = stats.filter((s) => s.month > currentMonth());
  const best = [...past].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl text-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoOfDay(5).url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/80 to-navy/30" />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/70"><TrendingUp className="h-4 w-4 text-gold" /> Sales, ADR &amp; occupancy</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{cur ? formatMonth(cur.month) : ""}: {cur ? Math.round((cur.revenue / Math.max(1, cur.target)) * 100) : 0}% of target</h1>
            <p className="mt-1 text-sm text-white/70">{unit.name as string} · {rooms} rooms · target {formatMoney(cur?.target)} and {cur?.occupancyTarget}% occupancy</p>
          </div>
          {roomUnits.length > 1 && (
            <Select value={unit.id as string} onChange={(e) => setUnitId(e.target.value)} className="max-w-xs bg-white text-navy">
              {roomUnits.map((u) => <option key={u.id as string} value={u.id as string}>{u.name as string}</option>)}
            </Select>
          )}
        </div>
      </section>

      {cur && pace && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={IndianRupee} label="Sales this month" value={formatMoney(cur.revenue)} sub={`Target ${formatMoney(cur.target)}`} progress={{ value: cur.revenue, target: cur.target }} />
          <Kpi icon={BedDouble} label="Occupancy" value={`${cur.occupancy}%`} sub={`${cur.roomNights} of ${rooms * cur.days} room nights · target ${cur.occupancyTarget}%`} progress={{ value: cur.occupancy, target: cur.occupancyTarget }} />
          <Kpi icon={Target} label="ADR (avg rate / room night)" value={formatMoney(cur.adr)} sub={`Needed ${formatMoney(cur.adrTarget)} at ${cur.occupancyTarget}% occupancy`} progress={{ value: cur.adr, target: cur.adrTarget }} />
          <Kpi icon={CalendarClock} label="To hit target" value={pace.salesGap ? formatMoney(pace.salesGap) : "Target hit 🎉"} sub={pace.salesGap ? `${formatMoney(pace.perDay)} a day for ${pace.daysLeft} days · ${pace.nightsNeeded} more room nights` : "Keep selling — every extra booking is bonus"} />
        </div>
      )}

      {cur && Object.keys(cur.bySource).length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-navy">Where this month&apos;s sales come from</h2>
          <div className="space-y-2">
            {Object.entries(cur.bySource).sort((a, b) => b[1] - a[1]).map(([src, amt]) => (
              <div key={src} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-slate-600">{src}</span>
                <div className="flex-1"><Bar value={amt} target={cur.revenue} className="bg-navy" /></div>
                <span className="w-24 text-right font-medium">{formatMoney(Math.round(amt))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between p-5 pb-2">
          <h2 className="font-semibold text-navy">Month by month</h2>
          {best && <span className="text-xs text-slate-500">Best month: {formatMonth(best.month)} ({formatMoney(best.revenue)})</span>}
        </div>
        <Table>
          <thead><tr><Th>Month</Th><Th className="text-right">Sales</Th><Th className="text-right">Target</Th><Th className="text-right">Achieved</Th><Th className="text-right">Room nights</Th><Th className="text-right">Occupancy</Th><Th className="text-right">ADR</Th><Th className="text-right">Bookings</Th></tr></thead>
          <tbody>
            {[...ahead.reverse(), ...past].map((s) => (
              <tr key={s.month} className={cn(s.month === currentMonth() && "bg-amber-50", s.month > currentMonth() && "text-slate-400")}>
                <Td className="font-medium">{formatMonth(s.month)}{s.month > currentMonth() && " (on the books)"}</Td>
                <Td className="text-right">{formatMoney(s.revenue)}</Td>
                <Td className="text-right">{formatMoney(s.target)}</Td>
                <Td className={cn("text-right font-semibold", ok(s.revenue, s.target))}>{Math.round((s.revenue / Math.max(1, s.target)) * 100)}%</Td>
                <Td className="text-right">{s.roomNights}</Td>
                <Td className={cn("text-right", ok(s.occupancy, s.occupancyTarget))}>{s.occupancy}%</Td>
                <Td className={cn("text-right", ok(s.adr, s.adrTarget))}>{formatMoney(s.adr)}</Td>
                <Td className="text-right">{s.bookings}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="p-5 pt-3 text-xs text-slate-500">Counts confirmed, checked-in and checked-out bookings. A stay&apos;s amount is spread across its nights. Targets are set in Settings → Targets (default ₹6,00,000 and 70%).</p>
      </section>
    </div>
  );
}
