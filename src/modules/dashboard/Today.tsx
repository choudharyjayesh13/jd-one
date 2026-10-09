"use client";
/**
 * Today — one daily report for the owner/manager: money in & out, orders, bookings, who came to work,
 * and a single activity feed of everything staff and guests did on the chosen day (IST).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getStore } from "@/core/data";
import type { DataStore } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { formatMoney, todayISO } from "@/core/format";
import { viewHref } from "@/core/routes";
import { Loading } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";

type Kind = "money" | "guests" | "staff" | "sales" | "kitchen" | "property";
interface Ev {
  at: string; // ISO timestamp
  kind: Kind;
  icon: string;
  title: string;
  detail?: string;
  staff?: string | null;
  amount?: number;
  flow?: "in" | "out";
  entity: string;
  id: string;
}
interface DayData {
  events: Ev[];
  received: number;
  spent: number;
  kotCount: number;
  kotValue: number;
  newBookings: number;
  bookingValue: number;
  arrivals: number;
  departures: number;
  present: number;
  staffTotal: number;
  contacts: number;
  failed: string[];
}

const KINDS: { id: Kind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "money", label: "💰 Money" },
  { id: "guests", label: "🛎️ Guests & bookings" },
  { id: "staff", label: "👥 Staff" },
  { id: "sales", label: "📞 Sales" },
  { id: "kitchen", label: "🍽️ Kitchen" },
  { id: "property", label: "🏡 Property" },
];

const num = (v: unknown) => Number(v ?? 0) || 0;
const s = (v: unknown) => (v == null ? "" : String(v));
const isInflow = (kind: unknown) => /in|receive|top/i.test(s(kind));
const shiftDay = (day: string, d: number) => {
  const t = new Date(day + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
const timeIST = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const join = (...parts: unknown[]) => parts.map(s).filter(Boolean).join(" · ");

async function loadDay(store: DataStore, day: string): Promise<DayData> {
  const from = `${day}T00:00:00+05:30`;
  const to = `${day}T23:59:59.999+05:30`;
  const within = (field: string) => ({ range: { [field]: { gte: from, lte: to } } });
  const onDay = { filter: { date: day } };
  const failed: string[] = [];
  const get = async (entity: string, q: object) => {
    try {
      return await store.list(entity, q);
    } catch {
      if (!failed.includes(entity)) failed.push(entity);
      return [] as Row[];
    }
  };
  const [staff, attendance, payments, bookingsNew, arrivals, departures, kots, expenses, petty, purchases, salary, stockMv, activities, leadsNew, leadsTouched, tasksDone, ticketsNew, ticketsDone, hk, reports, customers, payReqs, checkinsIn, checkinsOut] =
    await Promise.all([
      get("staff", {}),
      get("attendance", onDay),
      get("payments", onDay),
      get("bookings", within("created_at")),
      get("bookings", { filter: { check_in: day } }),
      get("bookings", { filter: { check_out: day } }),
      get("kots", within("created_at")),
      get("expenses", onDay),
      get("petty-cash", onDay),
      get("purchases", onDay),
      get("salary-payments", onDay),
      get("stock-movements", within("created_at")),
      get("activities", within("at")),
      get("leads", within("created_at")),
      get("leads", within("updated_at")),
      get("tasks", within("completed_at")),
      get("tickets", within("created_at")),
      get("tickets", within("resolved_at")),
      get("housekeeping-reports", onDay),
      get("daily-reports", onDay),
      get("customers", within("created_at")),
      get("payment-requests", within("created_at")),
      get("checkins", within("actual_in")),
      get("checkins", within("actual_out")),
    ]);
  const names = new Map(staff.map((r) => [r.id, s(r.name)]));
  const nm = (id: unknown) => (id ? names.get(String(id)) ?? null : null);
  const guestOf = new Map([...bookingsNew, ...arrivals, ...departures].map((b) => [b.id, s(b.guest_name)]));
  const at = (r: Row, f = "created_at") => s(r[f] || r.created_at || `${day}T09:00:00+05:30`);
  const ev: Ev[] = [];
  const push = (e: Ev) => ev.push(e);

  for (const a of attendance) {
    const who = nm(a.staff_id) ?? "Staff";
    if (a.checked_in_at) push({ at: s(a.checked_in_at), kind: "staff", icon: "🟢", title: `${who} checked in`, detail: s(a.status) || undefined, staff: nm(a.staff_id), entity: "attendance", id: a.id });
    else push({ at: at(a), kind: "staff", icon: "📝", title: `${who} marked ${s(a.status) || "attendance"}`, staff: nm(a.staff_id), entity: "attendance", id: a.id });
    if (a.checked_out_at) push({ at: s(a.checked_out_at), kind: "staff", icon: "🔴", title: `${who} checked out`, staff: nm(a.staff_id), entity: "attendance", id: a.id });
  }
  for (const p of payments)
    push({ at: at(p), kind: "money", icon: "💵", title: `Payment received ${formatMoney(p.amount)}`, detail: join(p.mode, p.booking_id ? guestOf.get(String(p.booking_id)) : "", p.reference), staff: nm(p.received_by), amount: num(p.amount), flow: "in", entity: "payments", id: p.id });
  for (const b of bookingsNew)
    push({ at: at(b), kind: "guests", icon: "📅", title: `New booking: ${s(b.guest_name)}`, detail: join(b.unit_type, `${s(b.check_in)} → ${s(b.check_out)}`, b.meal_plan, b.total ? formatMoney(b.total) : "", b.source, b.status), staff: s(b.booked_by) || null, entity: "bookings", id: b.id });
  for (const b of arrivals)
    if (b.status !== "Cancelled")
      push({ at: `${day}T12:00:00+05:30`, kind: "guests", icon: "🧳", title: `Arriving: ${s(b.guest_name)}`, detail: join(b.unit_type, b.meal_plan, b.adults ? `${s(b.adults)} adults` : "", num(b.balance) ? `balance ${formatMoney(b.balance)}` : ""), entity: "bookings", id: b.id });
  for (const b of departures)
    if (b.status !== "Cancelled") push({ at: `${day}T10:00:00+05:30`, kind: "guests", icon: "👋", title: `Departing: ${s(b.guest_name)}`, detail: s(b.unit_type) || undefined, entity: "bookings", id: b.id });
  for (const c of checkinsIn) push({ at: s(c.actual_in), kind: "guests", icon: "🔑", title: "Guest checked in", detail: join(c.room_numbers, c.vehicle), staff: nm(c.handled_by), entity: "checkins", id: c.id });
  for (const c of checkinsOut) push({ at: s(c.actual_out), kind: "guests", icon: "🚪", title: "Guest checked out", detail: s(c.room_numbers) || undefined, staff: nm(c.handled_by), entity: "checkins", id: c.id });
  for (const c of customers) push({ at: at(c), kind: "guests", icon: "🆕", title: `New guest ${s(c.customer_no)}: ${s(c.name)}`, detail: s(c.first_source) || undefined, entity: "customers", id: c.id });
  for (const k of kots)
    push({ at: at(k), kind: "kitchen", icon: "🍽️", title: `Order ${s(k.kot_no)} · ${s(k.table_or_room) || s(k.order_type)}`, detail: join(s(k.items).replace(/\n/g, ", "), k.amount ? formatMoney(k.amount) : "", k.status, k.source === "Guest app" ? "Guest App" : ""), staff: nm(k.taken_by), entity: "kots", id: k.id });
  for (const e of expenses)
    push({ at: at(e), kind: "money", icon: "🧾", title: `Expense ${formatMoney(e.amount)} · ${s(e.category)}`, detail: join(e.description || e.vendor, e.mode), staff: nm(e.paid_by), amount: num(e.amount), flow: "out", entity: "expenses", id: e.id });
  for (const p of petty)
    push({ at: at(p), kind: "money", icon: isInflow(p.kind) ? "📥" : "📤", title: `Petty cash ${s(p.kind)} ${formatMoney(p.amount)}`, detail: join(p.purpose, p.paid_to), staff: nm(p.handled_by), amount: num(p.amount), flow: isInflow(p.kind) ? undefined : "out", entity: "petty-cash", id: p.id });
  for (const p of purchases)
    push({ at: at(p), kind: "kitchen", icon: "🛒", title: `Purchase: ${s(p.item)} ${formatMoney(p.amount)}`, detail: join(p.quantity ? `${s(p.quantity)} ${s(p.unit)}` : "", p.vendor, p.payment_mode), staff: nm(p.bought_by), amount: num(p.amount), flow: "out", entity: "purchases", id: p.id });
  for (const p of salary)
    push({ at: at(p), kind: "money", icon: "💼", title: `${s(p.kind) || "Salary"} paid ${formatMoney(p.amount)} to ${s(p.staff_name)}`, detail: join(p.salary_month, p.mode), amount: num(p.amount), flow: "out", entity: "salary-payments", id: p.id });
  for (const m of stockMv)
    push({ at: at(m), kind: "kitchen", icon: m.direction === "In" ? "📦" : "📉", title: `Stock ${s(m.direction)}: ${s(m.quantity)}`, detail: join(m.source, m.note), staff: nm(m.staff_id), entity: "stock-movements", id: m.id });
  for (const a of activities)
    push({ at: s(a.at), kind: "sales", icon: a.type === "whatsapp" ? "💬" : a.type === "meeting" || a.type === "site visit" ? "🤝" : "📞", title: `${s(a.type) || "call"}: ${s(a.summary).slice(0, 120)}`, detail: a.next_action ? `Next: ${s(a.next_action)}${a.next_action_date ? ` (${s(a.next_action_date)})` : ""}` : undefined, staff: nm(a.done_by), entity: "activities", id: a.id });
  const newLeadIds = new Set(leadsNew.map((l) => l.id));
  for (const l of leadsNew) push({ at: at(l), kind: "sales", icon: "🎯", title: `New lead: ${s(l.name)}`, detail: join(l.source, l.qualification, l.stage), staff: nm(l.assigned_to), entity: "leads", id: l.id });
  for (const l of leadsTouched)
    if (!newLeadIds.has(l.id)) push({ at: at(l, "updated_at"), kind: "sales", icon: "✏️", title: `Lead updated: ${s(l.name)}`, detail: join(l.stage, l.qualification, l.follow_up_status), staff: nm(l.assigned_to), entity: "leads", id: l.id });
  for (const t of tasksDone) push({ at: s(t.completed_at), kind: "property", icon: "✅", title: `Task done: ${s(t.title)}`, detail: s(t.type) || undefined, staff: nm(t.assigned_to), entity: "tasks", id: t.id });
  for (const t of ticketsNew) push({ at: at(t), kind: "property", icon: "🛠️", title: `Issue reported: ${s(t.title)}`, detail: join(t.location, t.priority, t.status), staff: nm(t.reported_by), entity: "tickets", id: t.id });
  for (const t of ticketsDone) push({ at: s(t.resolved_at), kind: "property", icon: "🔧", title: `Issue fixed: ${s(t.title)}`, detail: t.cost ? formatMoney(t.cost) : undefined, staff: nm(t.assigned_to), entity: "tickets", id: t.id });
  for (const h of hk) push({ at: at(h), kind: "property", icon: "🧹", title: `Housekeeping: ${s(h.task) || "room"} · ${s(h.status)}`, staff: nm(h.cleaned_by), entity: "housekeeping-reports", id: h.id });
  for (const r of reports)
    push({ at: at(r), kind: "money", icon: "📊", title: `Daily report · sales ${formatMoney(r.sales_total)}`, detail: join(r.sales_cash ? `cash ${formatMoney(r.sales_cash)}` : "", r.sales_online ? `online ${formatMoney(r.sales_online)}` : "", r.occupancy_units ? `${s(r.occupancy_units)} rooms` : ""), staff: nm(r.submitted_by), entity: "daily-reports", id: r.id });
  for (const p of payReqs) push({ at: at(p), kind: "money", icon: "📨", title: `Payment request ${formatMoney(p.amount)} to ${s(p.guest_name)}`, detail: s(p.status) || undefined, staff: nm(p.requested_by), entity: "payment-requests", id: p.id });

  ev.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const sum = (rows: Row[], f: string) => rows.reduce((t, r) => t + num(r[f]), 0);
  return {
    events: ev,
    received: sum(payments, "amount"),
    spent: sum(expenses, "amount") + sum(purchases, "amount") + sum(salary, "amount") + sum(petty.filter((p) => !isInflow(p.kind)), "amount"),
    kotCount: kots.length,
    kotValue: sum(kots, "amount"),
    newBookings: bookingsNew.length,
    bookingValue: sum(bookingsNew, "total"),
    arrivals: arrivals.filter((b) => b.status !== "Cancelled").length,
    departures: departures.filter((b) => b.status !== "Cancelled").length,
    present: new Set(attendance.filter((a) => a.checked_in_at || /present|half/i.test(s(a.status))).map((a) => s(a.staff_id))).size,
    staffTotal: staff.filter((r) => r.active !== false).length,
    contacts: activities.length,
    failed,
  };
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "in" | "out" }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", tone === "in" ? "text-emerald-600" : tone === "out" ? "text-rose-600" : "text-navy")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** The "Today" dashboard tab: daily report + one activity feed (owner / manager). */
export function TodaySection() {
  const [day, setDay] = useState(todayISO);
  const [data, setData] = useState<{ day: string; d: DayData } | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [who, setWho] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () => loadDay(getStore(), day).then((d) => !cancelled && setData({ day, d }));
    void load();
    const unsubs = ["payments", "kots", "attendance", "bookings", "expenses", "activities", "leads", "tasks", "purchases", "petty-cash"].map((e) => getStore().subscribe?.(e, () => void load()));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
  }, [day]);

  const d = data?.day === day ? data.d : null;
  const byStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of d?.events ?? []) if (e.staff) m.set(e.staff, (m.get(e.staff) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [d]);
  const shown = (d?.events ?? []).filter((e) => (kind === "all" || e.kind === kind) && (!who || e.staff === who));
  const today = todayISO();
  const isToday = day === today;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDay(shiftDay(day, -1))} className="rounded-lg border border-line bg-white p-2" aria-label="Previous day">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm" />
        <button type="button" disabled={isToday} onClick={() => setDay(shiftDay(day, 1))} className="rounded-lg border border-line bg-white p-2 disabled:opacity-40" aria-label="Next day">
          <ChevronRight className="h-4 w-4" />
        </button>
        {!isToday && (
          <button type="button" onClick={() => setDay(today)} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white">
            Today
          </button>
        )}
        <span className="text-sm text-slate-500">{new Date(day + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
      </div>

      {!d ? (
        <Loading label="Loading the day…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Money received" value={formatMoney(d.received)} tone="in" hint="payments logged" />
            <Tile label="Money spent" value={formatMoney(d.spent)} tone="out" hint="expenses, purchases, salary, petty cash" />
            <Tile label="Net cash" value={formatMoney(d.received - d.spent)} tone={d.received - d.spent >= 0 ? "in" : "out"} hint="received − spent" />
            <Tile label="Food orders" value={`${d.kotCount} · ${formatMoney(d.kotValue)}`} hint="KOTs incl. Guest App" />
            <Tile label="New bookings" value={`${d.newBookings} · ${formatMoney(d.bookingValue)}`} hint={`${d.arrivals} arriving · ${d.departures} departing`} />
            <Tile label="Staff present" value={`${d.present} / ${d.staffTotal}`} hint="from app attendance" />
            <Tile label="Sales contacts" value={String(d.contacts)} hint="calls, WhatsApp, meetings" />
            <Tile label="Activities" value={String(d.events.length)} hint="everything logged" />
          </div>

          {byStaff.length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Who did what · tap a name to filter</h3>
              <div className="flex flex-wrap gap-2">
                {byStaff.map(([name, n]) => (
                  <button key={name} type="button" onClick={() => setWho(who === name ? "" : name)} className={cn("rounded-full border px-3 py-1 text-sm", who === name ? "border-navy bg-navy text-white" : "border-line bg-slate-50 text-slate-700")}>
                    {name} <b>{n}</b>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-navy">
                {isToday ? "Today's activity" : "Activity"} {who && <span className="text-sm font-normal text-slate-500">· {who}</span>}
              </h3>
              <div className="flex gap-1 overflow-x-auto">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" onClick={() => setKind(k.id)} className={cn("whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold", kind === k.id ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600")}>
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            {!shown.length ? (
              <p className="py-6 text-center text-sm text-slate-500">Nothing logged{kind !== "all" || who ? " for this filter" : ""} on this day yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {shown.map((e, i) => (
                  <li key={`${e.entity}-${e.id}-${i}`}>
                    <Link href={viewHref(e.entity, e.id)} className="flex gap-3 py-2.5 hover:bg-slate-50">
                      <span className="w-16 shrink-0 pt-0.5 text-right text-xs font-semibold text-slate-500">{timeIST(e.at)}</span>
                      <span className="text-lg leading-6">{e.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-navy">{e.title}</span>
                        {(e.detail || e.staff) && <span className="block truncate text-xs text-slate-500">{join(e.detail, e.staff ? `by ${e.staff}` : "")}</span>}
                      </span>
                      {e.flow && (
                        <span className={cn("shrink-0 text-sm font-bold", e.flow === "in" ? "text-emerald-600" : "text-rose-600")}>
                          {e.flow === "in" ? "+" : "−"}
                          {formatMoney(e.amount)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {d.failed.length > 0 && <p className="mt-3 text-xs text-slate-400">Not visible with your login: {d.failed.join(", ")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
