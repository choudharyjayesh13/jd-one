/**
 * Daily scoreboard: one row per active staff member for a period, computed
 * client-side from DataStore lists so it works in local and shared mode.
 *
 * score = task points + 2 × tickets resolved + 5 × leads won + 1 per present day − overdue tasks
 */
import type { DataStore } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { addDays, dateISO, monthRange, todayISO, TIMEZONE } from "@/core/format";
import { TICKET_CLOSED, isOpenTicket } from "@/modules/tickets/entity";

export type Period = "today" | "week" | "month";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

/** Inclusive yyyy-mm-dd range for a period (week = Monday–Sunday, IST). */
export function periodRange(period: Period, today = todayISO()): { start: string; end: string } {
  if (period === "today") return { start: today, end: today };
  if (period === "month") {
    const { start, end } = monthRange(today.slice(0, 7));
    return { start, end };
  }
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const start = addDays(today, -((dow + 6) % 7));
  return { start, end: addDays(start, 6) };
}

export interface ScoreboardInput {
  today: string;
  start: string;
  end: string;
  staff: Row[];
  attendance: Row[];
  tasks: Row[];
  tickets: Row[];
  leads: Row[];
  activities: Row[];
}

export interface ScoreRow {
  staff: Row;
  presentDays: number;
  onTimeDays: number;
  tasksDone: number;
  taskPoints: number;
  tasksOverdue: number;
  ticketsResolved: number;
  avgResolutionHours: number | null;
  leadsWon: number;
  activities: number;
  score: number;
  rank: number;
}

export interface ScoreboardResult {
  rows: ScoreRow[];
  totals: Omit<ScoreRow, "staff" | "rank" | "avgResolutionHours"> & { avgResolutionHours: number | null };
}

/** yyyy-mm-dd (IST) of a date or timestamp value; "" when empty/invalid. */
export function dayOf(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : dateISO(d);
}
const within = (value: unknown, start: string, end: string) => {
  const d = dayOf(value);
  return Boolean(d) && d >= start && d <= end;
};

/** "HH:MM" in IST for a timestamp. */
export function istTime(ts: unknown): string {
  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}
export const ON_TIME_LIMIT = "10:00"; // fallback when a staff member has no shift time
/** On time = checked in within 15 minutes of the staff member's shift-1 start (default 07:00). */
export function onTimeLimit(s: Row): string {
  const m = String(s.shift1_start ?? "07:00").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return ON_TIME_LIMIT;
  const mins = Number(m[1]) * 60 + Number(m[2]) + 15;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

const hoursBetween = (from: unknown, to: unknown) => {
  const a = new Date(String(from)).getTime();
  const b = new Date(String(to)).getTime();
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.max(0, (b - a) / 36e5);
};
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export function computeScoreboard(input: ScoreboardInput): ScoreboardResult {
  const { start, end, today } = input;
  const rows: ScoreRow[] = input.staff.map((s) => {
    const att = input.attendance.filter((a) => a.staff_id === s.id && a.status === "P" && within(a.date, start, end));
    const onTime = att.filter((a) => a.checked_in_at && istTime(a.checked_in_at) <= onTimeLimit(s));
    const mine = input.tasks.filter((t) => t.assigned_to === s.id);
    const done = mine.filter((t) => t.status === "Done" && within(t.completed_at ?? t.updated_at, start, end));
    const overdue = mine.filter((t) => t.status !== "Done" && t.due && String(t.due) < today);
    const resolved = input.tickets.filter((t) => t.assigned_to === s.id && TICKET_CLOSED.includes(String(t.status)) && within(t.resolved_at ?? t.updated_at, start, end));
    const resHours = resolved.map((t) => hoursBetween(t.created_at, t.resolved_at ?? t.updated_at)).filter((h): h is number => h !== null);
    const won = input.leads.filter((l) => l.assigned_to === s.id && l.stage === "Won" && within(l.updated_at, start, end));
    const acts = input.activities.filter((a) => a.done_by === s.id && within(a.at ?? a.created_at, start, end));
    const taskPoints = done.reduce((sum, t) => sum + Number(t.points ?? 1), 0);
    const score = taskPoints + 2 * resolved.length + 5 * won.length + att.length - overdue.length;
    return {
      staff: s,
      presentDays: att.length,
      onTimeDays: onTime.length,
      tasksDone: done.length,
      taskPoints,
      tasksOverdue: overdue.length,
      ticketsResolved: resolved.length,
      avgResolutionHours: avg(resHours),
      leadsWon: won.length,
      activities: acts.length,
      score,
      rank: 0,
    };
  });
  rows.sort((a, b) => b.score - a.score || b.taskPoints - a.taskPoints || String(a.staff.name).localeCompare(String(b.staff.name)));
  rows.forEach((r, i) => (r.rank = i + 1));
  const sum = (f: (r: ScoreRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const allRes = rows.map((r) => r.avgResolutionHours).filter((h): h is number => h !== null);
  return {
    rows,
    totals: {
      presentDays: sum((r) => r.presentDays),
      onTimeDays: sum((r) => r.onTimeDays),
      tasksDone: sum((r) => r.tasksDone),
      taskPoints: sum((r) => r.taskPoints),
      tasksOverdue: sum((r) => r.tasksOverdue),
      ticketsResolved: sum((r) => r.ticketsResolved),
      avgResolutionHours: avg(allRes),
      leadsWon: sum((r) => r.leadsWon),
      activities: sum((r) => r.activities),
      score: sum((r) => r.score),
    },
  };
}

/** "Rapid service" tile: open tickets by age and how fast work starts on them. */
export function rapidService(tickets: Row[], now = new Date()) {
  const open = tickets.filter(isOpenTicket);
  const age = (t: Row) => (now.getTime() - new Date(String(t.created_at)).getTime()) / 36e5;
  const responded = tickets.map((t) => (t.started_at ? hoursBetween(t.created_at, t.started_at) : null)).filter((h): h is number => h !== null);
  return {
    open: open.length,
    under2h: open.filter((t) => age(t) < 2).length,
    under24h: open.filter((t) => age(t) >= 2 && age(t) < 24).length,
    over24h: open.filter((t) => age(t) >= 24).length,
    avgFirstResponseHours: avg(responded),
    unassigned: open.filter((t) => !t.assigned_to).length,
  };
}

/** Everything the scoreboard needs for a period (optionally one unit). */
export async function loadScoreboardData(store: DataStore, period: Period, unitId: string | null): Promise<ScoreboardInput> {
  const today = todayISO();
  const { start, end } = periodRange(period, today);
  const unitFilter = unitId ? { business_unit_id: unitId } : {};
  const [staffAll, attendance, tasks, tickets, leads, activities] = await Promise.all([
    store.list("staff", { filter: { ...unitFilter, active: true }, sort: { field: "name", dir: "asc" } }),
    store.list("attendance", { range: { date: { gte: start, lte: end } } }),
    store.list("tasks"),
    store.list("tickets"),
    store.list("leads"),
    store.list("activities", { range: { at: { gte: `${start}T00:00:00+05:30`, lte: `${end}T23:59:59+05:30` } } }),
  ]);
  return { today, start, end, staff: staffAll.filter((s) => !s.left_on), attendance, tasks, tickets, leads, activities };
}

export const medal = (rank: number, score: number) => (score <= 0 ? "" : rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "");
