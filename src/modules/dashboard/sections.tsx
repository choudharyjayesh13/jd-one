"use client";
/** One component per team; the Dashboard picks which to show by role / tab. */
import { formatDate, formatMoney, monthRange } from "@/core/format";
import { Stat } from "@/core/ui/Card";
import { listHref, viewHref } from "@/core/routes";
import { ATTENDANCE_LABELS } from "@/modules/attendance/entity";
import { Section, RecordList, KeyValue, Progress } from "./widgets";
import {
  arrivalsToday,
  bookingsThisMonth,
  departuresToday,
  groupBy,
  inHouse,
  leadsThisWeek,
  leadsWonThisMonth,
  lowStock,
  openLeads,
  openTasks,
  openTickets,
  otaSplit,
  teamPerformance,
  overdueFollowUps,
  salesMTDByUnit,
  sum,
  unassignedLeads,
  type DashboardData,
} from "./data";
import Link from "next/link";
import { medal } from "@/modules/scoreboard/compute";

const unitName = (d: DashboardData, id: unknown) => String(d.units.find((u) => u.id === id)?.name ?? "—");
const staffName = (d: DashboardData, id: unknown) => String(d.staff.find((s) => s.id === id)?.name ?? "—");

export function OperationsSection({ d }: { d: DashboardData }) {
  const arrivals = arrivalsToday(d);
  const departures = departuresToday(d);
  const house = inHouse(d);
  const low = lowStock(d);
  const tasks = openTasks(d);
  const tickets = openTickets(d);
  const perf = teamPerformance(d);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Arrivals today" value={arrivals.length} />
        <Stat label="Departures today" value={departures.length} />
        <Stat label="In house" value={`${house.length} bookings`} hint={`${sum(house, "units")} units occupied`} />
        <Stat label="Open tasks" value={tasks.length} tone={tasks.some((t) => t.due && String(t.due) < d.today) ? "bad" : "neutral"} />
        <Stat label="Open tickets" value={tickets.length} hint={`${perf.rapid.over24h} older than 24 h`} tone={perf.rapid.over24h ? "bad" : "neutral"} />
      </div>
      <Section title="Team performance (this month)" href="/scoreboard/">
        {perf.top.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">No points scored yet this month — done tasks, resolved tickets, won leads and attendance all count.</p>
        ) : (
          <KeyValue rows={perf.top.map((r) => ({ label: `${medal(r.rank, r.score)} ${String(r.staff.name)}`, hint: `${r.tasksDone} tasks · ${r.ticketsResolved} tickets · ${r.presentDays} days`, value: `${r.score} pts` }))} />
        )}
        <p className="border-t border-line px-4 py-2 text-xs text-slate-500">
          {tickets.length} open ticket{tickets.length === 1 ? "" : "s"} · {perf.rapid.unassigned} unassigned · avg first response {perf.rapid.avgFirstResponseHours ?? "—"} h
        </p>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Today's check-ins" href={listHref("bookings")}>
          <RecordList entity="bookings" rows={arrivals} primary={(r) => String(r.guest_name)} secondary={(r) => `${r.unit_type} · ${unitName(d, r.business_unit_id)} · balance ${formatMoney(r.balance)}`} badge={(r) => r.status} empty="No arrivals today" />
        </Section>
        <Section title="Today's check-outs" href={listHref("bookings")}>
          <RecordList entity="bookings" rows={departures} primary={(r) => String(r.guest_name)} secondary={(r) => `${r.unit_type} · balance ${formatMoney(r.balance)}`} badge={(r) => r.status} empty="No departures today" />
        </Section>
        <Section title="Low stock" href={listHref("stock")}>
          <RecordList entity="stock" rows={low} primary={(r) => String(r.item)} secondary={(r) => `${r.quantity} ${r.unit} (min ${r.min_quantity}) · ${unitName(d, r.business_unit_id)}`} empty="All stock above minimum" />
        </Section>
        <Section title="Open tasks" href={listHref("tasks")}>
          <RecordList entity="tasks" rows={tasks} primary={(r) => String(r.title)} secondary={(r) => `${r.type} · due ${formatDate(r.due)} · ${staffName(d, r.assigned_to)}`} badge={(r) => r.priority} empty="No open tasks" />
        </Section>
        <Section title="Open tickets" href={listHref("tickets")}>
          <RecordList entity="tickets" rows={tickets} primary={(r) => String(r.title)} secondary={(r) => `${r.category}${r.location ? ` · ${r.location}` : ""} · ${staffName(d, r.assigned_to)}`} badge={(r) => r.priority} empty="No open tickets" />
        </Section>
      </div>
    </div>
  );
}

export function MarketingSection({ d }: { d: DashboardData }) {
  const week = leadsThisWeek(d);
  const overdue = overdueFollowUps(d);
  const unassigned = unassignedLeads(d);
  const conv = leadsWonThisMonth(d);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open leads" value={openLeads(d).length} />
        <Stat label="New this week" value={week.length} />
        <Stat label="Overdue follow-ups" value={overdue.length} tone={overdue.length ? "bad" : "good"} />
        <Stat label="Conversion (month)" value={conv.created ? `${Math.round((conv.won / conv.created) * 100)}%` : "—"} hint={`${conv.won} won of ${conv.created} new`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Leads this week by source">
          <KeyValue rows={groupBy(week, "source").map((g) => ({ label: g.key, value: g.count }))} />
        </Section>
        <Section title="Leads this week by campaign / creative">
          <KeyValue rows={groupBy(week, "campaign").map((g) => ({ label: g.key, value: g.count }))} />
        </Section>
        <Section title="Overdue follow-ups" href={listHref("leads")}>
          <RecordList entity="leads" rows={overdue} primary={(r) => String(r.name)} secondary={(r) => `Due ${formatDate(r.next_follow_up)} · ${staffName(d, r.assigned_to)}`} badge={(r) => r.stage} empty="Nothing overdue" />
        </Section>
        <Section title="Unassigned leads" href={listHref("leads")}>
          <RecordList entity="leads" rows={unassigned} primary={(r) => String(r.name)} secondary={(r) => `${r.source} · ${formatDate(String(r.created_at).slice(0, 10))}`} badge={(r) => r.qualification} empty="Every open lead has an owner" />
        </Section>
      </div>
      <CrmSection d={d} />
    </div>
  );
}

export function CrmSection({ d }: { d: DashboardData }) {
  const c = d.crm;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Customers" value={c.customers} />
        <Stat label="Guests who stayed" value={c.guestsWithStay} />
        <Stat label="Repeat-guest %" value={c.repeatGuestPct === null ? "—" : `${c.repeatGuestPct}%`} hint="2+ stays ÷ guests who stayed" />
        <Stat label="Win-back list" value={c.winBack.length} hint="no contact in 90 days" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Top customers by spend" href={listHref("customers")}>
          <KeyValue rows={c.topBySpend.map((t) => ({ label: <Link href={viewHref("customers", t.customer.id)}>{String(t.customer.name)}</Link>, hint: `${t.stays} stays`, value: formatMoney(t.spend) }))} />
        </Section>
        <Section title="Win-back (90 days no contact)" href={listHref("customers")}>
          <RecordList entity="customers" rows={c.winBack.map((w) => w.customer)} primary={(r) => String(r.name)} secondary={(r) => `Last contact ${formatDate(c.winBack.find((w) => w.customer.id === r.id)?.lastContact) ?? "never"} · ${r.phone}`} empty="Everyone contacted recently" />
        </Section>
        <Section title="Birthdays & anniversaries this month">
          <KeyValue rows={c.celebrations.map((x) => ({ label: <Link href={viewHref("customers", x.customer.id)}>{String(x.customer.name)}</Link>, hint: x.kind, value: formatDate(x.date) }))} />
        </Section>
      </div>
    </div>
  );
}

export function AccountsSection({ d }: { d: DashboardData }) {
  const todays = d.reportsMonth.filter((r) => r.date === d.today);
  const byCat = groupBy(d.expensesMonth, "category");
  const pending = d.expensesMonth.filter((e) => !e.receipt);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cash today" value={formatMoney(sum(todays, "sales_cash"))} />
        <Stat label="Online today" value={formatMoney(sum(todays, "sales_online"))} />
        <Stat label="Payments this month" value={formatMoney(sum(d.paymentsMonth, "amount"))} hint={`${d.paymentsMonth.length} receipts`} />
        <Stat label="Receipts pending" value={pending.length} hint="expenses without a photo" tone={pending.length ? "bad" : "good"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Today's reports" href={listHref("daily-reports")}>
          <RecordList entity="daily-reports" rows={todays} primary={(r) => unitName(d, r.business_unit_id)} secondary={(r) => `Cash ${formatMoney(r.sales_cash)} · Online ${formatMoney(r.sales_online)}`} empty="No daily report submitted yet today" />
        </Section>
        <Section title="Expenses MTD by category" href={listHref("expenses")}>
          <KeyValue rows={byCat.map((g) => ({ label: g.key, hint: `${g.count}`, value: formatMoney(g.amount) }))} />
        </Section>
        <Section title="Receipts pending" href={listHref("expenses")}>
          <RecordList entity="expenses" rows={pending} primary={(r) => `${r.vendor} · ${formatMoney(r.amount)}`} secondary={(r) => `${formatDate(r.date)} · ${r.category} · ${staffName(d, r.paid_by)}`} empty="Every expense has a receipt" />
        </Section>
        <Section title="Payments by mode (month)">
          <KeyValue rows={groupBy(d.paymentsMonth, "mode").map((g) => ({ label: g.key, hint: `${g.count}`, value: formatMoney(g.amount) }))} />
        </Section>
      </div>
    </div>
  );
}

export function FinanceSection({ d }: { d: DashboardData }) {
  const perUnit = salesMTDByUnit(d).filter((u) => u.sales || u.target);
  const sales = sum(d.reportsMonth, "sales_total");
  const expenses = sum(d.expensesMonth, "amount");
  const split = otaSplit(d);
  const { start, end } = monthRange(d.month);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sales MTD" value={formatMoney(sales)} hint={`${formatDate(start)} – ${formatDate(end)}`} />
        <Stat label="Expenses MTD" value={formatMoney(expenses)} />
        <Stat label="Op. profit MTD" value={formatMoney(sales - expenses)} tone={sales - expenses >= 0 ? "good" : "bad"} />
        <Stat label="OTA vs direct" value={`${split.ota} / ${split.direct}`} hint={`${formatMoney(split.otaAmount)} OTA · ${formatMoney(split.directAmount)} direct`} />
      </div>
      <Section title="Sales MTD vs target per unit" href="/settings/">
        {perUnit.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">No sales or targets this month. Set targets in Settings.</p>
        ) : (
          <ul className="divide-y divide-line">
            {perUnit.map((u) => (
              <li key={u.unit.id} className="px-4 py-3 text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="font-medium text-navy">{String(u.unit.name)}</span>
                  <span className="tabular-nums text-slate-700">
                    {formatMoney(u.sales)} / {u.target ? formatMoney(u.target) : "no target"} {u.pct !== null && <span className="text-slate-500">({u.pct}%)</span>}
                  </span>
                </div>
                <Progress pct={u.pct} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Bookings this month by source" href={listHref("bookings")}>
          <KeyValue rows={groupBy(bookingsThisMonth(d), "source").map((g) => ({ label: g.key, hint: `${g.count}`, value: formatMoney(g.amount) }))} />
        </Section>
        <Section title="Top customers by spend" href={listHref("customers")}>
          <KeyValue rows={d.crm.topBySpend.map((t) => ({ label: <Link href={viewHref("customers", t.customer.id)}>{String(t.customer.name)}</Link>, hint: `${t.stays} stays`, value: formatMoney(t.spend) }))} />
        </Section>
      </div>
    </div>
  );
}

export function HrSection({ d }: { d: DashboardData }) {
  const active = d.staff.filter((s) => s.active !== false && !s.left_on);
  const marked = new Map(d.attendanceToday.map((a) => [String(a.staff_id), String(a.status)]));
  const counts = { P: 0, A: 0, H: 0, L: 0 };
  for (const s of marked.values()) if (s in counts) counts[s as keyof typeof counts]++;
  const missing = active.filter((s) => !marked.has(s.id));
  const { start } = monthRange(d.month);
  const joiners = d.staff.filter((s) => s.joined_on && String(s.joined_on) >= start);
  const leavers = d.staff.filter((s) => s.left_on && String(s.left_on) >= start);
  const pipeline = d.candidates.filter((c) => !["Hired", "Rejected"].includes(String(c.stage)));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active staff" value={active.length} />
        <Stat label="Present today" value={counts.P} hint={`${counts.A} absent · ${counts.H} half · ${counts.L} leave`} tone="good" />
        <Stat label="Not marked" value={missing.length} tone={missing.length ? "bad" : "good"} />
        <Stat label="Joiners / leavers" value={`${joiners.length} / ${leavers.length}`} hint="this month" />
        <Stat label="Hiring pipeline" value={pipeline.length} hint={`${d.candidates.filter((c) => c.stage === "Offer").length} at offer stage`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Attendance today" href="/attendance/grid/">
          <KeyValue rows={active.map((s) => ({ label: String(s.name), hint: String(s.designation ?? ""), value: marked.has(s.id) ? ATTENDANCE_LABELS[marked.get(s.id)!] ?? marked.get(s.id) : "—" }))} />
        </Section>
        <Section title="Hiring pipeline" href={listHref("candidates")}>
          <RecordList entity="candidates" rows={pipeline} primary={(r) => String(r.name)} secondary={(r) => `${r.position ?? ""}${r.interview_on ? ` · interview ${formatDate(r.interview_on)}` : ""}`} badge={(r) => r.stage} empty="No open candidates — add one under HR → Hiring" />
        </Section>
        <Section title="Joiners & leavers this month" href={listHref("staff")}>
          <RecordList entity="staff" rows={[...joiners, ...leavers]} primary={(r) => String(r.name)} secondary={(r) => (r.left_on && String(r.left_on) >= start ? `Left ${formatDate(r.left_on)}` : `Joined ${formatDate(r.joined_on)}`)} badge={(r) => r.role} empty="No changes this month" />
        </Section>
      </div>
    </div>
  );
}

export function OverviewSection({ d }: { d: DashboardData }) {
  const sales = sum(d.reportsMonth, "sales_total");
  const expenses = sum(d.expensesMonth, "amount");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sales MTD" value={formatMoney(sales)} />
        <Stat label="Expenses MTD" value={formatMoney(expenses)} />
        <Stat label="Arrivals / departures" value={`${arrivalsToday(d).length} / ${departuresToday(d).length}`} hint="today" />
        <Stat label="Open leads" value={openLeads(d).length} hint={`${overdueFollowUps(d).length} overdue`} tone={overdueFollowUps(d).length ? "bad" : "neutral"} />
        <Stat label="Low stock" value={lowStock(d).length} tone={lowStock(d).length ? "bad" : "good"} />
        <Stat label="Open tasks" value={openTasks(d).length} />
        <Stat label="Present today" value={d.attendanceToday.filter((a) => a.status === "P").length} hint={`of ${d.staff.filter((s) => s.active !== false).length} staff`} />
        <Stat label="Repeat-guest %" value={d.crm.repeatGuestPct === null ? "—" : `${d.crm.repeatGuestPct}%`} />
      </div>
      <FinanceSection d={d} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Today's check-ins" href={listHref("bookings")}>
          <RecordList entity="bookings" rows={arrivalsToday(d)} primary={(r) => String(r.guest_name)} secondary={(r) => `${r.unit_type} · balance ${formatMoney(r.balance)}`} badge={(r) => r.status} empty="No arrivals today" />
        </Section>
        <Section title="Overdue follow-ups" href={listHref("leads")}>
          <RecordList entity="leads" rows={overdueFollowUps(d)} primary={(r) => String(r.name)} secondary={(r) => `Due ${formatDate(r.next_follow_up)}`} badge={(r) => r.stage} empty="Nothing overdue" />
        </Section>
      </div>
    </div>
  );
}
