/**
 * Customer 360° numbers. LocalStore computes everything in code; in Supabase
 * mode the same code runs (the `customer_stats` SQL view exists for reports).
 */
import type { DataStore } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export interface CustomerStats {
  stays: number;
  nights: number;
  spend: number;
  avgRate: number | null;
  lastVisit: string | null;
  nextBooking: string | null;
  openLeads: number;
  lastActivity: string | null;
  favouriteUnitType: string | null;
  favouriteMealPlan: string | null;
  typicalGroupSize: number | null;
  bookingWindowDays: number | null;
  weekendShare: number | null;
  cancelled: number;
}

const STAY_STATUSES = new Set(["Confirmed", "Checked-in", "Checked-out"]);

export function nightsBetween(a: unknown, b: unknown): number {
  if (!a || !b) return 0;
  const d = (new Date(`${String(b).slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${String(a).slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000;
  return d > 0 ? Math.round(d) : 0;
}

function mode(values: unknown[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of counts) if (c > n) [best, n] = [k, c];
  return best;
}

export function computeStats(bookings: Row[], payments: Row[], leads: Row[], activities: Row[]): CustomerStats {
  const today = todayISO();
  const stays = bookings.filter((b) => STAY_STATUSES.has(String(b.status)) && String(b.check_in ?? "") <= today);
  const nights = stays.reduce((n, b) => n + nightsBetween(b.check_in, b.check_out), 0);
  const spend = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const upcoming = bookings.filter((b) => STAY_STATUSES.has(String(b.status)) && String(b.check_in ?? "") > today).map((b) => String(b.check_in)).sort();
  const groupSizes = bookings.map((b) => Number(b.adults ?? 0) + Number(b.children ?? 0)).filter((n) => n > 0);
  const windows = bookings.filter((b) => b.check_in && b.created_at).map((b) => nightsBetween(String(b.created_at).slice(0, 10), b.check_in)).filter((n) => n >= 0);
  const weekend = stays.filter((b) => {
    const d = new Date(`${String(b.check_in)}T00:00:00Z`).getUTCDay();
    return d === 5 || d === 6;
  }).length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    stays: stays.length,
    nights,
    spend,
    avgRate: nights > 0 ? Math.round(spend / nights) : null,
    lastVisit: stays.map((b) => String(b.check_in)).sort().at(-1) ?? null,
    nextBooking: upcoming[0] ?? null,
    openLeads: leads.filter((l) => !["Won", "Lost"].includes(String(l.stage))).length,
    lastActivity: activities.map((a) => String(a.at ?? a.created_at)).sort().at(-1) ?? null,
    favouriteUnitType: mode(bookings.map((b) => b.unit_type)),
    favouriteMealPlan: mode(bookings.map((b) => b.meal_plan)),
    typicalGroupSize: groupSizes.length ? Math.round(avg(groupSizes)! * 10) / 10 : null,
    bookingWindowDays: windows.length ? Math.round(avg(windows)!) : null,
    weekendShare: stays.length ? Math.round((weekend / stays.length) * 100) : null,
    cancelled: bookings.filter((b) => ["Cancelled", "No-show"].includes(String(b.status))).length,
  };
}

export async function loadCustomerData(store: DataStore, customerId: string) {
  const f = { filter: { customer_id: customerId } };
  const [bookings, payments, leads, activities, tasks, messages] = await Promise.all([
    store.list("bookings", f),
    store.list("payments", f),
    store.list("leads", f),
    store.list("activities", f),
    store.list("tasks", f),
    store.list("messages", f),
  ]);
  return { bookings, payments, leads, activities, tasks, messages, stats: computeStats(bookings, payments, leads, activities) };
}

/** Cheap headline (stays, spend, open leads) for the inline form hint. */
export async function customerHeadline(store: DataStore, customerId: string) {
  const f = { filter: { customer_id: customerId } };
  const [bookings, payments, leads] = await Promise.all([store.list("bookings", f), store.list("payments", f), store.list("leads", f)]);
  const s = computeStats(bookings, payments, leads, []);
  return { stays: s.stays, spend: s.spend, openLeads: s.openLeads };
}
