/** Loads everything the dashboard sections need in one pass. */
import type { DataStore } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { addDays, currentMonth, monthRange, todayISO } from "@/core/format";
import { crmSummary, type CrmSummary } from "@/modules/customers/crm-summary";
import { OTA_SOURCES } from "@/modules/bookings/entity";
import { OPEN_STAGES } from "@/modules/leads/options";
import { computeScoreboard, rapidService, type ScoreRow } from "@/modules/scoreboard/compute";

export interface DashboardData {
  today: string;
  month: string;
  units: Row[];
  staff: Row[];
  candidates: Row[];
  bookings: Row[];
  reportsMonth: Row[];
  targets: Row[];
  leads: Row[];
  stock: Row[];
  tasks: Row[];
  tickets: Row[];
  attendanceToday: Row[];
  attendanceMonth: Row[];
  activitiesMonth: Row[];
  expensesMonth: Row[];
  paymentsMonth: Row[];
  rooms: Row[];
  rates: Row[];
  paymentRequests: Row[];
  housekeepingToday: Row[];
  pettyCash: Row[];
  crm: CrmSummary;
}

export async function loadDashboard(store: DataStore, unitId: string | null): Promise<DashboardData> {
  const today = todayISO();
  const month = currentMonth();
  const { start, end } = monthRange(month);
  const unitFilter = unitId ? { business_unit_id: unitId } : {};
  const [units, staff, bookings, reportsMonth, targets, leads, stock, tasks, attendanceToday, expensesMonth, paymentsMonth, crm, candidates, tickets, attendanceMonth, activitiesMonth, rooms, rates, paymentRequests, housekeepingToday, pettyCash] = await Promise.all([
    store.list("business-units"),
    store.list("staff", { filter: unitFilter }),
    store.list("bookings", { filter: unitFilter }),
    store.list("daily-reports", { filter: unitFilter, range: { date: { gte: start, lte: end } } }),
    store.list("targets", { filter: { ...unitFilter, month } }),
    store.list("leads", { filter: unitFilter }),
    store.list("stock", { filter: unitFilter }),
    store.list("tasks", { filter: unitFilter }),
    store.list("attendance", { filter: { date: today } }),
    store.list("expenses", { filter: unitFilter, range: { date: { gte: start, lte: end } } }),
    store.list("payments", { range: { date: { gte: start, lte: end } } }),
    crmSummary(store),
    store.list("candidates", { filter: unitFilter }),
    store.list("tickets", { filter: unitFilter }),
    store.list("attendance", { range: { date: { gte: start, lte: end } } }),
    store.list("activities", { range: { at: { gte: `${start}T00:00:00+05:30`, lte: `${end}T23:59:59+05:30` } } }),
    // Property tables arrived with the 30 Sep 2026 migration; tolerate a backend that lacks them.
    optional(store.list("rooms", { filter: { ...unitFilter, active: true } })),
    optional(store.list("rates", { filter: unitFilter, range: { date_to: { gte: today } } })),
    optional(store.list("payment-requests", { filter: unitFilter })),
    optional(store.list("housekeeping-reports", { filter: { ...unitFilter, date: today } })),
    optional(store.list("petty-cash", { filter: unitFilter })),
  ]);
  return { today, month, units, staff, bookings, reportsMonth, targets, leads, stock, tasks, tickets, attendanceToday, attendanceMonth, activitiesMonth, expensesMonth, paymentsMonth, crm, candidates, rooms, rates, paymentRequests, housekeepingToday, pettyCash };
}

/* ---- property (front office) ---- */
export function occupancyToday(d: DashboardData): { occupied: number; total: number; pct: number | null } {
  const total = d.rooms.length;
  const occupied = d.bookings.filter((b) => (b.status === "Confirmed" || b.status === "Checked-in" || b.status === "On hold") && String(b.check_in) <= d.today && String(b.check_out) > d.today).reduce((s, b) => s + Number(b.units ?? 1), 0);
  return { occupied: Math.min(occupied, total || occupied), total, pct: total ? Math.round((Math.min(occupied, total) / total) * 100) : null };
}
export function dirtyRooms(d: DashboardData) {
  return d.rooms.filter((r) => r.hk_status === "Dirty" || r.hk_status === "Maintenance" || r.status === "Out of order");
}
export function pendingRequests(d: DashboardData) {
  return d.paymentRequests.filter((r) => r.status === "Pending" || r.status === "Sent");
}
export function pettyCashBalance(d: DashboardData) {
  return d.pettyCash.reduce((s, r) => s + (r.kind === "Cash in" ? 1 : -1) * Number(r.amount ?? 0), 0);
}
/** Tonight's room-only rate per type (latest row wins), for the rate strip. */
export function ratesTonight(d: DashboardData): { type: string; rate: number | null; note: string | null }[] {
  const types = Array.from(new Set(d.rooms.map((r) => String(r.unit_type))));
  return types.map((type) => {
    let best: Row | null = null;
    for (const r of d.rates) {
      if (r.unit_type !== type || r.meal_plan !== "CP" || String(r.date_from) > d.today || String(r.date_to) < d.today) continue;
      if (!best || String(r.created_at) > String(best.created_at)) best = r;
    }
    return { type, rate: best ? Number(best.rate) : null, note: best?.closed ? "Closed" : ((best?.note as string | null) ?? null) };
  });
}

const optional = (p: Promise<Row[]>) => p.catch(() => [] as Row[]);

/* ---- derived numbers shared by sections ---- */
export const sum = (rows: Row[], f: string) => rows.reduce((s, r) => s + Number(r[f] ?? 0), 0);

export function arrivalsToday(d: DashboardData) {
  return d.bookings.filter((b) => b.check_in === d.today && (b.status === "Confirmed" || b.status === "Enquiry"));
}
export function departuresToday(d: DashboardData) {
  return d.bookings.filter((b) => b.check_out === d.today && b.status === "Checked-in");
}
export function inHouse(d: DashboardData) {
  return d.bookings.filter((b) => b.status === "Checked-in");
}
export function openLeads(d: DashboardData) {
  return d.leads.filter((l) => OPEN_STAGES.includes(String(l.stage)));
}
export function overdueFollowUps(d: DashboardData) {
  return openLeads(d).filter((l) => l.next_follow_up && String(l.next_follow_up) < d.today);
}
export function unassignedLeads(d: DashboardData) {
  return openLeads(d).filter((l) => !l.assigned_to);
}
export function leadsThisWeek(d: DashboardData) {
  const from = addDays(d.today, -6);
  return d.leads.filter((l) => String(l.created_at).slice(0, 10) >= from);
}
export function lowStock(d: DashboardData) {
  return d.stock.filter((s) => Number(s.quantity ?? 0) <= Number(s.min_quantity ?? 0));
}
export function openTasks(d: DashboardData) {
  return d.tasks.filter((t) => t.status !== "Done").sort((a, b) => String(a.due ?? "9").localeCompare(String(b.due ?? "9")));
}
export function salesMTDByUnit(d: DashboardData) {
  return d.units.map((u) => {
    const sales = sum(
      d.reportsMonth.filter((r) => r.business_unit_id === u.id),
      "sales_total",
    );
    const target = Number(d.targets.find((t) => t.business_unit_id === u.id)?.target_amount ?? 0);
    return { unit: u, sales, target, pct: target ? Math.round((sales / target) * 100) : null };
  });
}
export function groupBy(rows: Row[], field: string): { key: string; count: number; amount: number }[] {
  const m = new Map<string, { count: number; amount: number }>();
  for (const r of rows) {
    const k = String(r[field] ?? "—");
    const e = m.get(k) ?? { count: 0, amount: 0 };
    e.count++;
    e.amount += Number(r.amount ?? r.total ?? 0);
    m.set(k, e);
  }
  return Array.from(m, ([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count || b.amount - a.amount);
}
export function bookingsThisMonth(d: DashboardData) {
  const { start, end } = monthRange(d.month);
  return d.bookings.filter((b) => String(b.check_in) >= start && String(b.check_in) <= end && !["Cancelled", "No-show"].includes(String(b.status)));
}
export function otaSplit(d: DashboardData) {
  const rows = bookingsThisMonth(d);
  const ota = rows.filter((b) => OTA_SOURCES.includes(String(b.source)));
  return { ota: ota.length, direct: rows.length - ota.length, otaAmount: sum(ota, "total"), directAmount: sum(rows, "total") - sum(ota, "total") };
}
export function leadsWonThisMonth(d: DashboardData) {
  const { start } = monthRange(d.month);
  const created = d.leads.filter((l) => String(l.created_at).slice(0, 10) >= start);
  return { created: created.length, won: created.filter((l) => l.stage === "Won").length, wonAll: d.leads.filter((l) => l.stage === "Won").length };
}
export function openTickets(d: DashboardData) {
  return d.tickets.filter((t) => !["Done", "Verified"].includes(String(t.status)));
}
/** Month-to-date scoreboard for the Operations "Team performance" card. */
export function teamPerformance(d: DashboardData): { top: ScoreRow[]; rapid: ReturnType<typeof rapidService> } {
  const { start, end } = monthRange(d.month);
  const staff = d.staff.filter((s) => s.active !== false && !s.left_on);
  const { rows } = computeScoreboard({ today: d.today, start, end, staff, attendance: d.attendanceMonth, tasks: d.tasks, tickets: d.tickets, leads: d.leads, activities: d.activitiesMonth });
  return { top: rows.filter((r) => r.score > 0).slice(0, 3), rapid: rapidService(d.tickets) };
}
