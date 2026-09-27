/** Loads everything the dashboard sections need in one pass. */
import type { DataStore } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { addDays, currentMonth, monthRange, todayISO } from "@/core/format";
import { crmSummary, type CrmSummary } from "@/modules/customers/crm-summary";
import { OTA_SOURCES } from "@/modules/bookings/entity";
import { OPEN_STAGES } from "@/modules/leads/options";

export interface DashboardData {
  today: string;
  month: string;
  units: Row[];
  staff: Row[];
  bookings: Row[];
  reportsMonth: Row[];
  targets: Row[];
  leads: Row[];
  stock: Row[];
  tasks: Row[];
  attendanceToday: Row[];
  expensesMonth: Row[];
  paymentsMonth: Row[];
  crm: CrmSummary;
}

export async function loadDashboard(store: DataStore, unitId: string | null): Promise<DashboardData> {
  const today = todayISO();
  const month = currentMonth();
  const { start, end } = monthRange(month);
  const unitFilter = unitId ? { business_unit_id: unitId } : {};
  const [units, staff, bookings, reportsMonth, targets, leads, stock, tasks, attendanceToday, expensesMonth, paymentsMonth, crm] = await Promise.all([
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
  ]);
  return { today, month, units, staff, bookings, reportsMonth, targets, leads, stock, tasks, attendanceToday, expensesMonth, paymentsMonth, crm };
}

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
