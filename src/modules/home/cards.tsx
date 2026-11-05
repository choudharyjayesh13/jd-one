"use client";
/**
 * Home cards: every figure / list that can appear on Home, and which departments see it.
 * The defaults below can be changed by the Chairman, Director or Property Supervisor
 * in Administration → Home cards (stored in jdone.home_cards).
 */
import type { ReactNode } from "react";
import { formatMoney } from "@/core/format";
import { listHref } from "@/core/routes";
import type { Row } from "@/core/schema/types";
import { roomsLabel } from "@/modules/rooms/occupancy";
import {
  arrivalsToday,
  bookingsThisMonth,
  departuresToday,
  dirtyRooms,
  inHouse,
  lowStock,
  occupancyToday,
  openLeads,
  openTasks,
  openTickets,
  overdueFollowUps,
  pendingRequests,
  pettyCashBalance,
  ratesTonight,
  sum,
  type DashboardData,
} from "@/modules/dashboard/data";

export type Tone = "good" | "bad" | undefined;
export interface StatCard {
  kind: "stat";
  id: string;
  title: string;
  depts: string[];
  href?: string;
  value: (d: DashboardData) => { value: ReactNode; hint?: string; tone?: Tone };
}
export interface ListCard {
  kind: "list";
  id: string;
  title: string;
  depts: string[];
  href?: string;
  entity: string;
  rows: (d: DashboardData) => Row[];
  primary: (r: Row, d: DashboardData) => string;
  secondary?: (r: Row, d: DashboardData) => string;
  badge?: (r: Row) => string;
  empty: string;
}
export type HomeCard = StatCard | ListCard;

const FO = "front-office";
const RES = "reservations";
const SALES = "sales";
const HK = "housekeeping";
const FBS = "fb-service";
const FBP = "fb-production";
const STORES = "stores";
const MAINT = "maintenance";
const ACC = "accounts";
const HR = "hr";

const staffName = (d: DashboardData, id: unknown) => String(d.staff.find((s) => s.id === id)?.name ?? "");

export const HOME_CARDS: HomeCard[] = [
  {
    kind: "stat",
    id: "occupancy",
    title: "Occupancy tonight",
    depts: [FO, RES, HK, SALES],
    href: "/room-chart/",
    value: (d) => {
      const o = occupancyToday(d);
      return { value: o.pct === null ? "—" : `${o.pct}%`, hint: o.total ? `${o.occupied} of ${o.total} rooms` : "Add rooms to track", tone: o.pct !== null && o.pct >= 80 ? "good" : undefined };
    },
  },
  { kind: "stat", id: "arrivals", title: "Arrivals today", depts: [FO, RES, HK, FBS, FBP], href: "/arrivals/", value: (d) => ({ value: arrivalsToday(d).length, hint: "to check in" }) },
  { kind: "stat", id: "departures", title: "Departures today", depts: [FO, RES, HK, ACC], href: "/departures/", value: (d) => ({ value: departuresToday(d).length, hint: "to check out" }) },
  { kind: "stat", id: "in-house", title: "In house", depts: [FO, FBS, FBP, HK], value: (d) => ({ value: inHouse(d).length, hint: `${inHouse(d).reduce((s, b) => s + (Number(b.adults ?? 0) + Number(b.children ?? 0)), 0)} guests` }) },
  { kind: "stat", id: "rooms-to-clean", title: "Rooms to clean", depts: [HK, FO], href: "/room-status/", value: (d) => ({ value: dirtyRooms(d).length, hint: `${d.housekeepingToday.length} cleaned today`, tone: dirtyRooms(d).length ? "bad" : "good" }) },
  {
    kind: "stat",
    id: "tonight-rate",
    title: "Tonight's rate (EP)",
    depts: [FO, RES, SALES],
    href: "/rates-calendar/",
    value: (d) => {
      const t = ratesTonight(d);
      const rates = t.map((x) => x.rate ?? Infinity).filter((r) => Number.isFinite(r)) as number[];
      return { value: rates.length ? formatMoney(Math.min(...rates)) : "—", hint: t.map((x) => `${x.type.split(" ")[0]} ${x.note === "Closed" ? "closed" : x.rate ? Number(x.rate).toLocaleString("en-IN") : "—"}`).join(" · ") || "Set rates" };
    },
  },
  { kind: "stat", id: "bookings-month", title: "Bookings this month", depts: [RES, SALES], href: listHref("bookings"), value: (d) => ({ value: bookingsThisMonth(d).length, hint: formatMoney(sum(bookingsThisMonth(d), "total")) }) },
  { kind: "stat", id: "balance-due", title: "Balance due (in house)", depts: [ACC, FO], value: (d) => ({ value: formatMoney(sum(inHouse(d), "balance")), tone: sum(inHouse(d), "balance") > 0 ? "bad" : "good" }) },
  { kind: "stat", id: "money-requested", title: "Money requested", depts: [ACC], href: listHref("payment-requests"), value: (d) => ({ value: formatMoney(sum(pendingRequests(d), "amount")), hint: `${pendingRequests(d).length} pending`, tone: pendingRequests(d).length ? "bad" : undefined }) },
  { kind: "stat", id: "petty-cash", title: "Petty cash in hand", depts: [ACC], href: listHref("petty-cash"), value: (d) => ({ value: formatMoney(pettyCashBalance(d)), tone: pettyCashBalance(d) < 0 ? "bad" : undefined }) },
  { kind: "stat", id: "received-month", title: "Received this month", depts: [ACC], href: listHref("payments"), value: (d) => ({ value: formatMoney(sum(d.paymentsMonth, "amount")), hint: `${d.paymentsMonth.length} payments`, tone: "good" }) },
  { kind: "stat", id: "expenses-month", title: "Expenses this month", depts: [ACC], href: listHref("expenses"), value: (d) => ({ value: formatMoney(sum(d.expensesMonth, "amount")), hint: `${d.expensesMonth.length} entries` }) },
  { kind: "stat", id: "open-leads", title: "Open leads", depts: [SALES], href: "/pipeline/", value: (d) => ({ value: openLeads(d).length }) },
  { kind: "stat", id: "overdue-followups", title: "Overdue follow-ups", depts: [SALES, RES], href: listHref("leads"), value: (d) => ({ value: overdueFollowUps(d).length, tone: overdueFollowUps(d).length ? "bad" : "good" }) },
  { kind: "stat", id: "low-stock", title: "Low stock items", depts: [STORES, FBP], href: listHref("stock"), value: (d) => ({ value: lowStock(d).length, tone: lowStock(d).length ? "bad" : "good" }) },
  { kind: "stat", id: "open-issues", title: "Open issues", depts: [MAINT, HK, FO], href: listHref("tickets"), value: (d) => ({ value: openTickets(d).length, tone: openTickets(d).length ? "bad" : "good" }) },
  {
    kind: "stat",
    id: "staff-present",
    title: "Staff present today",
    depts: [HR],
    href: "/attendance/grid/",
    value: (d) => {
      const team = d.staff.filter((s) => s.active !== false && s.role !== "owner");
      const present = d.attendanceToday.filter((a) => a.status === "P" || a.status === "H").length;
      return { value: `${present} / ${team.length}`, tone: present < team.length ? "bad" : "good" };
    },
  },
  { kind: "stat", id: "open-tasks", title: "Open tasks (team)", depts: [HR], href: "/task-board/", value: (d) => ({ value: openTasks(d).length, hint: `${openTasks(d).filter((t) => t.due && String(t.due) < d.today).length} overdue` }) },

  {
    kind: "list",
    id: "list-checkins",
    title: "Today's check-ins",
    depts: [FO, RES, HK, FBS],
    href: "/arrivals/",
    entity: "bookings",
    rows: arrivalsToday,
    primary: (r) => String(r.guest_name),
    secondary: (r) => `${roomsLabel(r)} · ${String(r.meal_plan ?? "")} · balance ${formatMoney(r.balance)}`,
    badge: (r) => String(r.status),
    empty: "No arrivals today",
  },
  {
    kind: "list",
    id: "list-checkouts",
    title: "Today's check-outs",
    depts: [FO, RES, HK, ACC],
    href: "/departures/",
    entity: "bookings",
    rows: departuresToday,
    primary: (r) => String(r.guest_name),
    secondary: (r) => `${roomsLabel(r)} · balance ${formatMoney(r.balance)}`,
    badge: (r) => String(r.status),
    empty: "No departures today",
  },
  { kind: "list", id: "list-dirty", title: "Rooms to clean", depts: [HK], href: "/room-status/", entity: "rooms", rows: dirtyRooms, primary: (r) => String(r.name), secondary: (r) => String(r.unit_type ?? ""), badge: (r) => String(r.hk_status ?? ""), empty: "All rooms clean" },
  { kind: "list", id: "list-requests", title: "Payment requests", depts: [ACC, FO], href: listHref("payment-requests"), entity: "payment-requests", rows: pendingRequests, primary: (r) => String(r.guest_name ?? r.purpose ?? "Request"), secondary: (r) => formatMoney(r.amount), badge: (r) => String(r.status ?? ""), empty: "No pending requests" },
  { kind: "list", id: "list-low-stock", title: "Low stock", depts: [STORES, FBP], href: listHref("stock"), entity: "stock", rows: lowStock, primary: (r) => String(r.item), secondary: (r) => `${Number(r.quantity ?? 0)} ${String(r.unit ?? "")} left · minimum ${Number(r.min_quantity ?? 0)}`, empty: "Nothing below minimum" },
  { kind: "list", id: "list-issues", title: "Open issues", depts: [MAINT], href: listHref("tickets"), entity: "tickets", rows: openTickets, primary: (r) => String(r.title), secondary: (r, d) => `${String(r.location ?? "")}${r.assigned_to ? ` · ${staffName(d, r.assigned_to)}` : ""}`, badge: (r) => String(r.priority ?? ""), empty: "No open issues" },
  { kind: "list", id: "list-followups", title: "Overdue follow-ups", depts: [SALES], href: listHref("leads"), entity: "leads", rows: overdueFollowUps, primary: (r) => String(r.name), secondary: (r, d) => `due ${String(r.next_follow_up)}${r.assigned_to ? ` · ${staffName(d, r.assigned_to)}` : ""}`, badge: (r) => String(r.stage ?? ""), empty: "No overdue follow-ups" },
  {
    kind: "list",
    id: "list-not-marked",
    title: "Attendance not marked",
    depts: [HR],
    href: "/attendance/grid/",
    entity: "staff",
    rows: (d) => {
      const marked = new Set(d.attendanceToday.map((a) => String(a.staff_id)));
      return d.staff.filter((s) => s.active !== false && s.role !== "owner" && !marked.has(String(s.id)));
    },
    primary: (r) => String(r.name),
    secondary: (r) => String(r.designation ?? ""),
    empty: "Everyone has marked attendance",
  },
];

/** Card id → departments, with any saved changes applied. */
export function cardDepartments(saved: Row[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of HOME_CARDS) out[c.id] = c.depts;
  for (const r of saved) if (Array.isArray(r.departments) && out[String(r.card)]) out[String(r.card)] = (r.departments as unknown[]).map(String);
  return out;
}
