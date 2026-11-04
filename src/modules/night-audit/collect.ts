"use client";
/**
 * Gathers one day's figures for every hotel department, straight from what was
 * entered in JD One that day. Used by department reports and the night audit.
 * Each department becomes a Section: headline figures, short tables and alerts
 * (things that still need attention before the day is closed).
 */
import { getStore } from "@/core/data";
import type { ListQuery } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { TIMEZONE, addDays, formatMoney } from "@/core/format";
import { occupiesNight, roomsLabel, roomsOccupied } from "@/modules/rooms/occupancy";
import { eatersOn } from "@/modules/kitchen/MealCounts";
import { OTA_SOURCES } from "@/modules/bookings/entity";

export interface Stat {
  label: string;
  value: string;
  tone?: "good" | "bad";
}
export interface Table {
  title: string;
  columns: string[];
  rows: string[][];
}
export interface Section {
  dept: string;
  title: string;
  stats: Stat[];
  tables: Table[];
  alerts: string[];
}
export type DayData = Record<string, Section>;

export { REPORT_DEPARTMENTS, deptTitle } from "./access";
import { deptTitle } from "./access";
import { PAY_LATER_TAG } from "@/modules/frontdesk/desk";

const istDay = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
/** The India date (yyyy-mm-dd) of a timestamp. */
export function dayOf(ts: unknown): string {
  if (!ts) return "";
  const d = new Date(String(ts));
  return Number.isNaN(d.getTime()) ? String(ts).slice(0, 10) : istDay.format(d);
}
const timeOf = (ts: unknown) =>
  ts ? new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date(String(ts))) : "";

const num = (v: unknown) => Number(v) || 0;
const sum = (rows: Row[], f: string) => rows.reduce((s, r) => s + num(r[f]), 0);
const money = (v: number) => formatMoney(v);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function groupSum(rows: Row[], key: string, f: string): string {
  const m = new Map<string, number>();
  for (const r of rows) m.set(String(r[key] ?? "Other"), (m.get(String(r[key] ?? "Other")) ?? 0) + num(r[f]));
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${money(v)}`)
    .join(" · ");
}
function groupCount(rows: Row[], key: string): string {
  const m = new Map<string, number>();
  for (const r of rows) m.set(String(r[key] ?? "—"), (m.get(String(r[key] ?? "—")) ?? 0) + 1);
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
}

async function list(entity: string, q?: ListQuery): Promise<Row[]> {
  try {
    return await getStore().list(entity, q);
  } catch {
    return []; // table not there yet (database update not run) → nothing to report
  }
}

/** Everything that happened on `date` (yyyy-mm-dd, India time) for one property (or all when unitId is null). */
export async function collectDay(date: string, unitId: string | null): Promise<DayData> {
  const unit = unitId ? { business_unit_id: unitId } : {};
  const onDate = (field = "date"): ListQuery => ({ filter: unit, range: { [field]: { gte: date, lte: date } } });
  // Timestamps: fetch a day either side, then keep the rows whose India date is `date`.
  const around = (field: string): ListQuery => ({ filter: unit, range: { [field]: { gte: addDays(date, -1), lte: `${addDays(date, 1)}T23:59:59Z` } } });
  const today = (rows: Row[], field: string) => rows.filter((r) => dayOf(r[field]) === date);
  const stayFilter = unitId ? { business_unit_id: unitId } : {};

  const [
    bookingsLive,
    bookingsMade,
    rooms,
    shiftCloses,
    guestRequests,
    leadsMade,
    leadsOpen,
    salesActs,
    eventsMade,
    eventsOn,
    hkReports,
    linen,
    amenities,
    lostFound,
    kots,
    reviews,
    hygiene,
    wastage,
    gas,
    indents,
    stock,
    moves,
    purchases,
    pos,
    ticketsMade,
    ticketsOpen,
    preventive,
    actBookings,
    payments,
    expenses,
    petty,
    vouchers,
    attendance,
    staffAll,
    checkins,
    openStays,
    rest,
    gate,
    vehicles,
  ] = await Promise.all([
    list("bookings", { filter: stayFilter, range: { check_out: { gte: date } } }),
    list("bookings", around("created_at")),
    list("rooms", { filter: unit }),
    list("shift-closes", onDate()),
    list("guest-requests", around("requested_at")),
    list("leads", around("created_at")),
    list("leads", { filter: unit, range: { next_follow_up: { lte: date } } }),
    list("activities", { range: { at: { gte: addDays(date, -1), lte: `${addDays(date, 1)}T23:59:59Z` } } }),
    list("events", around("created_at")),
    list("events", { filter: unit, range: { event_date: { gte: date, lte: addDays(date, 7) } } }),
    list("housekeeping-reports", onDate()),
    list("linen-logs", onDate()),
    list("amenity-refills", onDate()),
    list("lost-found", onDate()),
    list("kots", around("created_at")),
    list("guest-feedback", onDate()),
    list("hygiene-checks", onDate()),
    list("wastage", onDate()),
    list("gas-logs", onDate()),
    list("indents", onDate()),
    list("stock", { filter: unit }),
    list("stock-movements", onDate()),
    list("purchases", onDate()),
    list("purchase-orders", around("updated_at")),
    list("tickets", around("created_at")),
    list("tickets", { filter: unit }),
    list("service-schedules", { filter: unit, range: { next_due: { lte: addDays(date, 7) } } }),
    list("activity-bookings", onDate()),
    list("payments", { range: { date: { gte: date, lte: date } } }),
    list("expenses", onDate()),
    list("petty-cash", onDate()),
    list("vouchers", onDate()),
    list("attendance", { range: { date: { gte: date, lte: date } } }),
    list("staff"),
    list("checkins", around("created_at")),
    list("checkins", { range: { actual_in: { gte: `${addDays(date, -60)}T00:00:00` } } }),
    list("rest-periods", { range: { date: { gte: date, lte: date } } }),
    list("gate-entries", around("time_in")),
    list("vehicle-entries", around("time_in")),
  ]);

  const out: DayData = {};
  const staff = staffAll.filter((x) => x.active !== false);
  const nameOf = new Map(staffAll.map((x) => [String(x.id), String(x.name)]));
  /** Section plus "who entered what today" for the department, from the entries' created_by. */
  const put = (dept: string, sec: Omit<Section, "dept" | "title">, entries: Row[] = []) => {
    const byPerson = new Map<string, number>();
    for (const r of entries) {
      const who = nameOf.get(String(r.created_by)) ?? "Guest app / system";
      byPerson.set(who, (byPerson.get(who) ?? 0) + 1);
    }
    const team: Table = {
      title: "Entries made today, by person",
      columns: ["Person", "Entries"],
      rows: Array.from(byPerson.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, String(v)]),
    };
    out[dept] = { dept, title: deptTitle(dept), ...sec, stats: [...sec.stats, { label: "Entries made today", value: String(entries.length) }], tables: [...sec.tables, team] };
  };

  // ---------------- Front Office
  {
    const live = bookingsLive.filter((b) => !["Cancelled", "Enquiry", "No-show"].includes(String(b.status)));
    const arrivals = live.filter((b) => String(b.check_in) === date);
    const arrived = arrivals.filter((b) => ["Checked-in", "Checked-out"].includes(String(b.status)));
    const departures = live.filter((b) => String(b.check_out) === date);
    const departed = departures.filter((b) => String(b.status) === "Checked-out");
    const inHouse = live.filter((b) => occupiesNight(b, date));
    const activeRooms = rooms.filter((r) => r.active !== false && String(r.status) !== "Out of order").length;
    const occ = roomsOccupied(live, date);
    const dueInHouse = inHouse.filter((b) => num(b.balance) > 0);
    const reqs = today(guestRequests, "requested_at");
    const reqOpen = guestRequests.filter((r) => String(r.status) !== "Done");
    const ciToday = today(checkins, "created_at");
    const alerts: string[] = [];
    for (const b of arrivals.filter((b) => !arrived.includes(b))) alerts.push(`Arrival not checked in: ${String(b.guest_name)} (${roomsLabel(b)})`);
    for (const b of departures.filter((b) => !departed.includes(b))) alerts.push(`Departure not checked out: ${String(b.guest_name)}${num(b.balance) > 0 ? ` · balance ${money(num(b.balance))}` : ""}`);
    const inHouseIds = new Set(inHouse.map((b) => String(b.id)));
    const payLater = new Set(openStays.filter((c) => !c.actual_out && String(c.notes ?? "").startsWith(PAY_LATER_TAG) && inHouseIds.has(String(c.booking_id))).map((c) => String(c.booking_id)));
    for (const b of inHouse.filter((b) => payLater.has(String(b.id)))) alerts.push(`Pays at check-out (approved): ${String(b.guest_name)} · balance ${money(num(b.balance))}`);
    if (!shiftCloses.length) alerts.push("Shift close not filled today");
    if (reqOpen.length) alerts.push(`${count(reqOpen.length, "guest request")} still open`);
    put("front-office", {
      stats: [
        { label: "Arrivals", value: `${arrived.length} of ${arrivals.length} checked in`, tone: arrived.length < arrivals.length ? "bad" : undefined },
        { label: "Departures", value: `${departed.length} of ${departures.length} checked out`, tone: departed.length < departures.length ? "bad" : undefined },
        { label: "In-house tonight", value: count(inHouse.length, "booking") },
        { label: "Occupancy tonight", value: activeRooms ? `${occ} / ${activeRooms} rooms · ${Math.round((occ / activeRooms) * 100)}%` : count(occ, "room") },
        { label: "Balance due (in-house)", value: money(sum(dueInHouse, "balance")), tone: dueInHouse.length ? "bad" : undefined },
        { label: "Guest requests today", value: `${reqs.length} · ${reqs.filter((r) => r.status === "Done").length} done` },
        { label: "Shift close", value: shiftCloses.length ? `Done · cash in hand ${money(sum(shiftCloses, "cash_in_hand"))}` : "Not done", tone: shiftCloses.length ? "good" : "bad" },
      ],
      tables: [
        { title: "Arrivals", columns: ["Guest", "Rooms", "Status"], rows: arrivals.map((b) => [String(b.guest_name), roomsLabel(b), String(b.status)]) },
        { title: "Departures", columns: ["Guest", "Balance", "Status"], rows: departures.map((b) => [String(b.guest_name), money(num(b.balance)), String(b.status)]) },
        { title: "In-house tonight", columns: ["Guest", "Rooms", "Till", "Balance"], rows: inHouse.map((b) => [String(b.guest_name), roomsLabel(b), String(b.check_out), `${money(num(b.balance))}${payLater.has(String(b.id)) ? " · pays at check-out" : ""}`]) },
      ],
      alerts,
    }, [...ciToday, ...shiftCloses, ...reqs]);
  }

  // ---------------- Reservations
  {
    const made = today(bookingsMade, "created_at").filter((b) => String(b.status) !== "Enquiry");
    const cancelled = bookingsLive.filter((b) => String(b.status) === "Cancelled" && dayOf(b.updated_at) === date);
    const noShow = bookingsLive.filter((b) => String(b.status) === "No-show" && String(b.check_in) === date);
    const next7 = bookingsLive.filter((b) => ["Confirmed", "On hold"].includes(String(b.status)) && String(b.check_in) > date && String(b.check_in) <= addDays(date, 7));
    const ota = made.filter((b) => OTA_SOURCES.includes(String(b.source)));
    const holds = bookingsLive.filter((b) => String(b.status) === "On hold");
    put("reservations", {
      stats: [
        { label: "New bookings", value: `${made.length} · ${money(sum(made, "total"))}` },
        { label: "Direct / OTA", value: `${made.length - ota.length} direct · ${ota.length} OTA` },
        { label: "By source", value: groupCount(made, "source") || "—" },
        { label: "Cancelled today", value: String(cancelled.length), tone: cancelled.length ? "bad" : undefined },
        { label: "No-shows", value: String(noShow.length), tone: noShow.length ? "bad" : undefined },
        { label: "Arrivals next 7 days", value: count(next7.length, "booking") },
        { label: "On hold", value: String(holds.length) },
      ],
      tables: [
        { title: "Bookings made today", columns: ["Guest", "Stay", "Source", "Total"], rows: made.map((b) => [String(b.guest_name), `${String(b.check_in)} → ${String(b.check_out)}`, String(b.source ?? ""), money(num(b.total))]) },
        { title: "Arriving in the next 7 days", columns: ["Arrival", "Guest", "Rooms", "Balance"], rows: next7.sort((a, b) => String(a.check_in).localeCompare(String(b.check_in))).map((b) => [String(b.check_in), String(b.guest_name), roomsLabel(b), money(num(b.balance))]) },
        { title: "Cancelled today", columns: ["Guest", "Stay", "Source"], rows: cancelled.map((b) => [String(b.guest_name), `${String(b.check_in)} → ${String(b.check_out)}`, String(b.source ?? "")]) },
      ],
      alerts: holds.filter((b) => b.hold_until && String(b.hold_until) < new Date().toISOString()).map((b) => `Hold expired: ${String(b.guest_name)}`),
    }, made);
  }

  // ---------------- Sales & Marketing
  {
    const newLeads = today(leadsMade, "created_at");
    const acts = today(salesActs, "at");
    const open = leadsOpen.filter((l) => !["Won", "Lost"].includes(String(l.stage)));
    const due = open.filter((l) => String(l.next_follow_up) === date);
    const overdue = open.filter((l) => String(l.next_follow_up) < date);
    const won = leadsMade.concat(leadsOpen).filter((l, i, a) => String(l.stage) === "Won" && dayOf(l.updated_at) === date && a.findIndex((x) => x.id === l.id) === i);
    const evNew = today(eventsMade, "created_at");
    put("sales", {
      stats: [
        { label: "New leads", value: `${newLeads.length}${newLeads.length ? ` · ${groupCount(newLeads, "source")}` : ""}` },
        { label: "Calls & follow-ups done", value: `${acts.length}${acts.length ? ` · ${groupCount(acts, "type")}` : ""}` },
        { label: "Follow-ups due today", value: String(due.length) },
        { label: "Overdue follow-ups", value: String(overdue.length), tone: overdue.length ? "bad" : "good" },
        { label: "Won today", value: String(won.length), tone: won.length ? "good" : undefined },
        { label: "Banquet / event enquiries", value: String(evNew.length) },
        { label: "Events next 7 days", value: String(eventsOn.filter((e) => !["Cancelled", "Enquiry"].includes(String(e.status))).length) },
      ],
      tables: [
        { title: "New leads", columns: ["Name", "Source", "Stage"], rows: newLeads.map((l) => [String(l.name), String(l.source ?? ""), String(l.stage ?? "")]) },
        { title: "Overdue follow-ups", columns: ["Name", "Due", "Stage"], rows: overdue.slice(0, 25).map((l) => [String(l.name), String(l.next_follow_up), String(l.stage ?? "")]) },
      ],
      alerts: overdue.length ? [`${count(overdue.length, "follow-up")} overdue`] : [],
    }, [...newLeads, ...acts, ...evNew]);
  }

  // ---------------- Housekeeping
  {
    const hk = (s: string) => rooms.filter((r) => r.active !== false && String(r.hk_status) === s).length;
    const ooo = rooms.filter((r) => String(r.status) === "Out of order");
    const sent = linen.filter((l) => l.movement === "Sent to laundry");
    const back = linen.filter((l) => l.movement === "Received from laundry");
    const dmg = linen.filter((l) => l.movement === "Damaged / discarded");
    put("housekeeping", {
      stats: [
        { label: "Rooms cleaned (reports)", value: String(hkReports.length) },
        { label: "Room status now", value: `${hk("Clean")} clean · ${hk("Inspected")} inspected · ${hk("Dirty")} dirty · ${hk("Maintenance")} maintenance` },
        { label: "Out of order", value: String(ooo.length), tone: ooo.length ? "bad" : undefined },
        { label: "Linen", value: `${sum(sent, "quantity")} sent · ${sum(back, "quantity")} back · ${sum(dmg, "quantity")} damaged` },
        { label: "Amenity refills", value: String(amenities.length) },
        { label: "Lost & found logged", value: String(lostFound.length) },
      ],
      tables: [{ title: "Cleaning reports", columns: ["Room status", "Task", "Issues"], rows: hkReports.map((r) => [String(r.status ?? ""), String(r.task ?? ""), String(r.issues ?? "")]) }],
      alerts: hk("Dirty") ? [`${count(hk("Dirty"), "room")} still dirty`] : [],
    }, [...hkReports, ...linen, ...amenities, ...lostFound]);
  }

  // ---------------- F&B Service
  {
    const k = today(kots, "created_at");
    const live = k.filter((x) => String(x.status) !== "Cancelled");
    const unbilled = live.filter((x) => String(x.status) !== "Billed");
    const room = live.filter((x) => /room/i.test(String(x.order_type)));
    const dine = live.filter((x) => !room.includes(x));
    const app = live.filter((x) => String(x.source) === "Guest app");
    const avg = reviews.length ? (sum(reviews, "average") / reviews.length).toFixed(1) : "—";
    put("fb-service", {
      stats: [
        { label: "Orders (KOT)", value: `${live.length} · ${money(sum(live, "amount"))}` },
        { label: "Guests served (covers)", value: String(sum(live, "pax")) },
        { label: "Dine-in", value: `${dine.length} orders · ${sum(dine, "pax")} guests · ${money(sum(dine, "amount"))}` },
        { label: "Room service", value: `${room.length} orders · ${sum(room, "pax")} guests · ${money(sum(room, "amount"))}` },
        { label: "From guest app", value: String(app.length) },
        { label: "Not billed yet", value: `${unbilled.length} · ${money(sum(unbilled, "amount"))}`, tone: unbilled.length ? "bad" : "good" },
        { label: "Cancelled", value: String(k.length - live.length) },
        { label: "Guest feedback", value: reviews.length ? `${reviews.length} · avg ${avg}/5` : "None" },
      ],
      tables: [{ title: "Orders", columns: ["KOT", "For", "Time", "Status", "Amount"], rows: k.map((x) => [String(x.kot_no ?? ""), `${String(x.order_type ?? "")} ${String(x.table_or_room ?? "")}`.trim(), timeOf(x.created_at), String(x.status), money(num(x.amount))]) }],
      alerts: unbilled.map((x) => `KOT ${String(x.kot_no ?? "")} not billed (${String(x.status)}, ${money(num(x.amount))})`),
    }, [...k, ...reviews]);
  }

  // ---------------- F&B Production
  {
    const eat = eatersOn(bookingsLive, date);
    const heads = (m: "Breakfast" | "Lunch" | "Dinner") => eat[m].reduce((s, e) => s + e.adults + e.children, 0);
    const shifts = hygiene.map((h) => `${String(h.shift)}${h.all_ok ? " ✓" : " ✗"}`).join(" · ");
    put("fb-production", {
      stats: [
        { label: "Meals (in-house guests)", value: `B ${heads("Breakfast")} · L ${heads("Lunch")} · D ${heads("Dinner")}` },
        { label: "Hygiene checks", value: hygiene.length ? shifts : "Not done", tone: hygiene.length >= 2 ? "good" : "bad" },
        { label: "Wastage", value: `${wastage.length} · ${money(sum(wastage, "value"))}`, tone: wastage.length ? "bad" : undefined },
        { label: "Stock requests (indents)", value: indents.length ? groupCount(indents, "status") : "None" },
        { label: "Gas", value: gas.length ? groupCount(gas, "event") : "No entry" },
      ],
      tables: [{ title: "Wastage", columns: ["Item", "Qty", "Reason", "Value"], rows: wastage.map((w) => [String(w.item), `${num(w.quantity)} ${String(w.unit ?? "")}`, String(w.reason ?? ""), money(num(w.value))]) }],
      alerts: hygiene.length < 2 ? ["Hygiene checklist not done for both shifts"] : [],
    }, [...hygiene, ...wastage, ...gas, ...indents]);
  }

  // ---------------- Stores
  {
    const low = stock.filter((s) => s.low_stock === true || (num(s.min_quantity) > 0 && num(s.quantity) <= num(s.min_quantity)));
    const ins = moves.filter((m) => m.direction === "In");
    const outs = moves.filter((m) => m.direction === "Out");
    const poToday = today(pos, "updated_at");
    put("stores", {
      stats: [
        { label: "Stock in / out", value: `${ins.length} in · ${outs.length} out` },
        { label: "Goods received (purchases)", value: `${purchases.length} · ${money(sum(purchases, "amount"))}` },
        { label: "Purchase orders updated", value: poToday.length ? groupCount(poToday, "status") : "None" },
        { label: "Low stock items", value: String(low.length), tone: low.length ? "bad" : "good" },
        { label: "Indents waiting", value: String(indents.filter((i) => ["Requested", "Approved"].includes(String(i.status))).length) },
      ],
      tables: [
        { title: "Low stock", columns: ["Item", "In stock", "Minimum"], rows: low.map((s) => [String(s.item), `${num(s.quantity)} ${String(s.unit ?? "")}`, String(num(s.min_quantity))]) },
        { title: "Purchases", columns: ["Item", "Qty", "Vendor", "Amount"], rows: purchases.map((p) => [String(p.item ?? ""), `${num(p.quantity)} ${String(p.unit ?? "")}`, String(p.vendor ?? ""), money(num(p.amount))]) },
      ],
      alerts: low.length ? [`${count(low.length, "item")} below minimum stock`] : [],
    }, [...moves, ...purchases, ...poToday]);
  }

  // ---------------- Maintenance
  {
    const opened = today(ticketsMade, "created_at");
    const closed = ticketsOpen.filter((t) => dayOf(t.resolved_at) === date);
    const open = ticketsOpen.filter((t) => !["Done", "Verified"].includes(String(t.status)));
    const urgent = open.filter((t) => /high|urgent/i.test(String(t.priority)));
    const dueSvc = preventive.filter((p) => String(p.next_due) <= date);
    put("maintenance", {
      stats: [
        { label: "Issues reported today", value: String(opened.length) },
        { label: "Fixed today", value: String(closed.length), tone: closed.length ? "good" : undefined },
        { label: "Still open", value: `${open.length}${urgent.length ? ` · ${urgent.length} urgent` : ""}`, tone: urgent.length ? "bad" : undefined },
        { label: "Preventive service due", value: String(dueSvc.length), tone: dueSvc.length ? "bad" : undefined },
      ],
      tables: [{ title: "Open issues", columns: ["Issue", "Where", "Priority", "Status"], rows: open.slice(0, 30).map((t) => [String(t.title), String(t.location ?? ""), String(t.priority ?? ""), String(t.status)]) }],
      alerts: urgent.map((t) => `Urgent issue open: ${String(t.title)}`).concat(dueSvc.map((p) => `Service due: ${String(p.what)} ${String(p.asset_name ?? "")}`.trim())),
    }, opened);
  }

  // ---------------- Activities
  {
    const live = actBookings.filter((a) => String(a.status) !== "Cancelled");
    const done = live.filter((a) => String(a.status) === "Done");
    put("activities", {
      stats: [
        { label: "Activities booked", value: `${live.length} · ${sum(live, "people")} people` },
        { label: "Done", value: `${done.length} of ${live.length}` },
        { label: "Revenue", value: money(sum(live, "amount")) },
        { label: "Cancelled", value: String(actBookings.length - live.length) },
      ],
      tables: [{ title: "Activities", columns: ["Time", "Guest", "People", "Status", "Amount"], rows: actBookings.map((a) => [String(a.time ?? ""), String(a.guest_name), String(num(a.people)), String(a.status), money(num(a.amount))]) }],
      alerts: live.filter((a) => String(a.status) === "Booked").map((a) => `Activity not marked done: ${String(a.guest_name)} ${String(a.time ?? "")}`.trim()),
    }, actBookings);
  }

  // ---------------- Accounts
  {
    const received = sum(payments, "amount");
    const spent = sum(expenses, "amount");
    const pin = petty.filter((p) => p.kind === "Cash in");
    const pout = petty.filter((p) => p.kind === "Cash out");
    const rv = vouchers.filter((v) => v.vtype === "RV");
    const pv = vouchers.filter((v) => v.vtype === "PV");
    put("accounts", {
      stats: [
        { label: "Money received", value: money(received), tone: "good" },
        { label: "Received by mode", value: groupSum(payments, "mode", "amount") || "—" },
        { label: "Expenses paid", value: money(spent), tone: spent ? "bad" : undefined },
        { label: "Expenses by head", value: groupSum(expenses, "category", "amount") || "—" },
        { label: "Petty cash", value: `in ${money(sum(pin, "amount"))} · out ${money(sum(pout, "amount"))}` },
        { label: "Vouchers", value: `${rv.length} receipt · ${pv.length} payment` },
        { label: "Net for the day", value: money(received - spent), tone: received - spent < 0 ? "bad" : "good" },
      ],
      tables: [
        { title: "Payments received", columns: ["Mode", "Reference", "Amount"], rows: payments.map((p) => [String(p.mode ?? ""), String(p.reference ?? ""), money(num(p.amount))]) },
        { title: "Expenses", columns: ["Head", "Paid to", "Mode", "Amount"], rows: expenses.map((e) => [String(e.category ?? ""), String(e.vendor ?? ""), String(e.mode ?? ""), money(num(e.amount))]) },
      ],
      alerts: [],
    }, [...payments, ...expenses, ...petty]);
  }

  // ---------------- HR
  {
    const working = staff.filter((s) => !s.last_working_day || String(s.last_working_day) >= date);
    const by = (st: string) => attendance.filter((a) => a.status === st).length;
    const marked = new Set(attendance.map((a) => String(a.staff_id)));
    const missing = working.filter((s) => !marked.has(String(s.id)) && s.role !== "owner");
    const notice = working.filter((s) => s.last_working_day);
    const leaving = notice.filter((s) => String(s.last_working_day) === date);
    put("hr", {
      stats: [
        { label: "Team", value: count(working.length, "person", "people") },
        { label: "Attendance", value: `${by("P")} present · ${by("H")} half day · ${by("L")} leave · ${by("A")} absent` },
        { label: "Attendance not marked", value: String(missing.length), tone: missing.length ? "bad" : "good" },
        { label: "Rest periods given", value: String(rest.length) },
        { label: "On notice", value: `${notice.length}${leaving.length ? ` · ${leaving.length} last day today` : ""}` },
      ],
      tables: [{ title: "Attendance not marked", columns: ["Name", "Post"], rows: missing.map((s) => [String(s.name), String(s.designation ?? "")]) }],
      alerts: missing.length ? [`Attendance not marked for ${count(missing.length, "person", "people")}`] : [],
    }, rest);
  }

  // ---------------- Security
  {
    const g = today(gate, "time_in");
    const v = today(vehicles, "time_in");
    const gIn = gate.filter((x) => !x.time_out && dayOf(x.time_in) <= date);
    const vIn = vehicles.filter((x) => !x.time_out && dayOf(x.time_in) <= date);
    put("security", {
      stats: [
        { label: "Visitors", value: `${g.length} · ${sum(g, "people")} people` },
        { label: "Visitors still inside", value: String(gIn.length), tone: gIn.length ? "bad" : "good" },
        { label: "Vehicles", value: String(v.length) },
        { label: "Vehicles still inside", value: String(vIn.length) },
      ],
      tables: [{ title: "Gate register", columns: ["Time", "Visitor", "Purpose", "Out"], rows: g.map((x) => [timeOf(x.time_in), String(x.visitor_name), String(x.purpose ?? ""), x.time_out ? timeOf(x.time_out) : "Inside"]) }],
      alerts: gIn.map((x) => `Visitor not signed out: ${String(x.visitor_name)}`),
    }, [...g, ...v]);
  }

  return out;
}
