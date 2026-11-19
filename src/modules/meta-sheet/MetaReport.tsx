"use client";
/**
 * Sales → Meta campaigns (/meta-report/). How each Meta campaign, ad and salesperson is doing,
 * counted from the leads that came in through the agency's sheet (leads.sheet_tab is set).
 * Seen by the Sales seats, the Chairman and the Director (the database only returns leads to them).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/core/auth/AuthProvider";
import { addDays, calendarTodayISO, formatMoney } from "@/core/format";
import type { Row } from "@/core/schema/types";
import { NoAccess } from "@/core/ui/AuthGate";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { canSeeLeads, useIsSalesSeat } from "@/modules/night-audit/access";
import { followUpStatus } from "@/modules/leads/entity";

const TALKED = ["Contacted", "Qualified", "Quote preparation", "Awaiting approval", "Quote shared", "Confirmation pending", "Won", "Nurture"];
const HOT = ["Qualified", "Quote preparation", "Awaiting approval", "Quote shared", "Confirmation pending"];
const PERIODS = [
  { id: "all", label: "All time" },
  { id: "month", label: "This month" },
  { id: "30", label: "Last 30 days" },
  { id: "7", label: "Last 7 days" },
] as const;

type Totals = { leads: number; notCalled: number; talked: number; hot: number; won: number; value: number; lost: number; overdue: number };

function count(rows: Row[]): Totals {
  const t: Totals = { leads: 0, notCalled: 0, talked: 0, hot: 0, won: 0, value: 0, lost: 0, overdue: 0 };
  for (const l of rows) {
    t.leads++;
    if (l.stage === "New" && !Number(l.call_attempts ?? 0)) t.notCalled++;
    if (TALKED.includes(String(l.stage))) t.talked++;
    if (HOT.includes(String(l.stage))) t.hot++;
    if (l.stage === "Won") {
      t.won++;
      t.value += Number(l.booking_value ?? l.package_proposed ?? 0);
    }
    if (l.stage === "Lost") t.lost++;
    if (followUpStatus(l) === "Overdue") t.overdue++;
  }
  return t;
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function group(rows: Row[], key: (l: Row) => string) {
  const m = new Map<string, Row[]>();
  for (const l of rows) {
    const k = key(l);
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return [...m.entries()].map(([name, list]) => ({ name, t: count(list) })).sort((a, b) => b.t.leads - a.t.leads);
}

export function MetaReport() {
  const user = useUser();
  const salesSeat = useIsSalesSeat(user);
  const allowed = canSeeLeads(user, salesSeat);
  const { rows: leads, loading } = useList("leads");
  const { rows: staff } = useList("staff");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("all");
  const today = calendarTodayISO();

  const rows = useMemo(() => {
    const from = period === "all" ? "" : period === "month" ? `${today.slice(0, 7)}-01` : addDays(today, -Number(period));
    return leads.filter((l) => l.sheet_tab && (!from || String(l.created_at ?? "").slice(0, 10) >= from));
  }, [leads, period, today]);

  if (loading) return <Loading />;
  if (!allowed) return <NoAccess />;

  const who = (id: unknown) => String(staff.find((s) => s.id === id)?.name ?? "Not given yet");
  const all = count(rows);
  const byTab = group(rows, (l) => String(l.sheet_tab));
  const byAd = group(rows, (l) => `${String(l.sheet_tab)} · ${String(l.ad_name ?? "Ad not named")}`);
  const byPerson = group(rows, (l) => who(l.assigned_to));
  const byPackage = group(rows, (l) => String(l.form_package ?? "Not chosen"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meta campaigns"
        subtitle="Leads from the agency's sheet · by campaign, ad and person"
        actions={
          <div className="flex rounded-lg border border-line bg-white p-0.5 text-sm">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={cn("rounded-md px-3 py-1.5", period === p.id ? "bg-navy text-white" : "text-slate-600 hover:text-navy")}>
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {rows.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-6 text-sm text-slate-600">
          No leads from the Meta sheet {period === "all" ? "yet" : "in this period"}. {user.post ? <>Connect the sheet from <Link href="/meta-sheet/" className="font-medium text-navy underline">Meta sheet link</Link>.</> : null}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Leads" value={String(all.leads)} />
            <Tile label="Not called yet" value={String(all.notCalled)} sub={pct(all.notCalled, all.leads)} warn={all.notCalled > 0} />
            <Tile label="Spoken to" value={pct(all.talked, all.leads)} sub={`${all.talked} leads`} />
            <Tile label="Hot + quoted" value={String(all.hot)} />
            <Tile label="Booked" value={String(all.won)} sub={`${pct(all.won, all.leads)} · ${formatMoney(all.value)}`} gold />
            <Tile label="Follow-ups overdue" value={String(all.overdue)} warn={all.overdue > 0} />
          </div>

          <Table title="By campaign" first="Campaign tab" rows={byTab} />
          <Table title="By ad" first="Ad" rows={byAd} />
          <Table title="By person" first="Person" rows={byPerson} />
          <Table title="By package chosen in the form" first="Package" rows={byPackage} />
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, warn, gold }: { label: string; value: string; sub?: string; warn?: boolean; gold?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-white px-4 py-3", gold ? "border-[#c9a54c]" : "border-line")}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", warn ? "text-rose-700" : "text-navy")}>{value}</div>
      {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Table({ title, first, rows }: { title: string; first: string; rows: { name: string; t: Totals }[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <h2 className="jd-serif border-b border-line px-5 py-3 text-lg font-semibold text-navy">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2 font-medium">{first}</th>
              <th className="px-3 py-2 text-right font-medium">Leads</th>
              <th className="px-3 py-2 text-right font-medium">Not called</th>
              <th className="px-3 py-2 text-right font-medium">Spoken to</th>
              <th className="px-3 py-2 text-right font-medium">Hot + quoted</th>
              <th className="px-3 py-2 text-right font-medium">Booked</th>
              <th className="px-3 py-2 text-right font-medium">Booking value</th>
              <th className="px-3 py-2 text-right font-medium">Lost</th>
              <th className="px-5 py-2 text-right font-medium">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, t }) => (
              <tr key={name} className="border-b border-line/60 last:border-0">
                <td className="px-5 py-2 font-medium text-navy">{name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.leads}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", t.notCalled ? "text-rose-700" : "text-slate-400")}>{t.notCalled}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(t.talked, t.leads)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.hot}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy">{t.won}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.value ? formatMoney(t.value) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{t.lost}</td>
                <td className={cn("px-5 py-2 text-right tabular-nums", t.overdue ? "text-rose-700" : "text-slate-400")}>{t.overdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
