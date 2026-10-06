/**
 * Month-by-month sales, ADR and occupancy per business unit, from bookings.
 * A booking's revenue is spread evenly over its nights, so a stay across two months counts in both.
 *   room nights = nights in the month × rooms booked
 *   occupancy   = room nights ÷ (rooms in the unit × days in the month)
 *   ADR         = room revenue ÷ room nights
 */
import type { Row } from "@/core/schema/types";
import { addDays, monthRange } from "@/core/format";

export const DEFAULT_TARGET = 600000;
export const DEFAULT_OCCUPANCY = 70;
const COUNTED = new Set(["Confirmed", "Checked-in", "Checked-out"]);

export interface MonthStat {
  month: string;
  days: number;
  roomNights: number;
  revenue: number;
  bookings: number;
  adr: number;
  occupancy: number;
  target: number;
  occupancyTarget: number;
  adrTarget: number;
  bySource: Record<string, number>;
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

function nightsBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000));
}

export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function computeMonths(bookings: Row[], targets: Row[], rooms: number, months: string[]): MonthStat[] {
  const stats = new Map<string, MonthStat>();
  for (const month of months) {
    const { days } = monthRange(month);
    const t = targets.find((x) => x.month === month);
    const target = t ? n(t.target_amount) : DEFAULT_TARGET;
    const occupancyTarget = t && t.occupancy_target != null ? n(t.occupancy_target) : DEFAULT_OCCUPANCY;
    const capacity = rooms * days;
    const adrTarget = t && t.adr_target ? n(t.adr_target) : capacity && occupancyTarget ? Math.round(target / (capacity * (occupancyTarget / 100))) : 0;
    stats.set(month, { month, days, roomNights: 0, revenue: 0, bookings: 0, adr: 0, occupancy: 0, target, occupancyTarget, adrTarget, bySource: {} });
  }
  for (const b of bookings) {
    if (!COUNTED.has(String(b.status))) continue;
    const ci = String(b.check_in ?? "").slice(0, 10);
    const co = String(b.check_out ?? "").slice(0, 10) || (ci ? addDays(ci, 1) : "");
    if (!ci) continue;
    const nights = Math.max(1, nightsBetween(ci, co));
    const units = Math.max(1, n(b.units));
    const perNight = n(b.total) / nights;
    const seen = new Set<string>();
    for (let i = 0; i < nights; i++) {
      const day = addDays(ci, i);
      const s = stats.get(day.slice(0, 7));
      if (!s) continue;
      s.roomNights += units;
      s.revenue += perNight;
      const src = String(b.source ?? "Other");
      s.bySource[src] = (s.bySource[src] ?? 0) + perNight;
      if (!seen.has(s.month)) { s.bookings += 1; seen.add(s.month); }
    }
  }
  for (const s of stats.values()) {
    s.revenue = Math.round(s.revenue);
    s.adr = s.roomNights ? Math.round(s.revenue / s.roomNights) : 0;
    s.occupancy = rooms ? Math.round((s.roomNights / (rooms * s.days)) * 1000) / 10 : 0;
  }
  return months.map((m) => stats.get(m)!);
}

/** What the team still needs this month to reach the target. */
export function paceFor(s: MonthStat, today: string, rooms: number) {
  const { start, end } = monthRange(s.month);
  const daysLeft = today < start ? s.days : today > end ? 0 : nightsBetween(today, end) + 1;
  const salesGap = Math.max(0, s.target - s.revenue);
  const nightsNeeded = Math.max(0, Math.ceil((s.occupancyTarget / 100) * rooms * s.days - s.roomNights));
  return { daysLeft, salesGap, perDay: daysLeft ? Math.ceil(salesGap / daysLeft) : salesGap, nightsNeeded };
}
