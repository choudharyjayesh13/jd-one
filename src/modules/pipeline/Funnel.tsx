"use client";
/**
 * Sales funnel: how many leads REACHED each step (current stage or any stage in their history), this month or
 * all time, with step-to-step conversion. Lost / Nurture leads still count for the steps they reached.
 */
import { useState } from "react";
import { useList } from "@/core/ui/hooks";
import { cn } from "@/core/ui/cn";
import { todayISO } from "@/core/format";
import { LEAD_STAGES, STAGE_GUIDE } from "@/modules/leads/options";

const ORDER: Record<string, number> = Object.fromEntries(LEAD_STAGES.map((s, i) => [s, i]));
const OLD: Record<string, string> = { Proposal: "Quote shared", Negotiation: "Quote shared", "On Hold": "Nurture" };
const STEPS = ["New", "Contact attempted", "Contacted", "Qualified", "Quote shared", "Confirmation pending", "Won"] as const;
const LABEL: Record<string, string> = { New: "Leads in", "Contact attempted": "Contact attempted", Contacted: "Spoke to guest", Qualified: "Qualified", "Quote shared": "Quote shared", "Confirmation pending": "Ready to book", Won: "Won — booked" };

export function Funnel({ who }: { who: string }) {
  const { rows: leads } = useList("leads");
  const { rows: history } = useList("lead-stage-history");
  const [period, setPeriod] = useState<"month" | "all">("month");
  const month = todayISO().slice(0, 7);

  // furthest pipeline step each lead reached (ignoring Lost / Nurture, which are exits, not steps)
  const reached = new Map<string, number>();
  const bump = (id: string, stage: unknown) => {
    const s = OLD[String(stage)] ?? String(stage);
    const i = ORDER[s];
    if (i == null || s === "Lost" || s === "Nurture") return;
    reached.set(id, Math.max(reached.get(id) ?? 0, i));
  };
  for (const h of history) bump(String(h.lead_id), h.to_stage);
  const scoped = leads.filter((l) => (!who || l.assigned_to === who) && (period === "all" || String(l.created_at ?? "").slice(0, 7) === month));
  for (const l of scoped) bump(l.id, l.stage);

  const counts = STEPS.map((s) => scoped.filter((l) => (reached.get(l.id) ?? 0) >= ORDER[s]).length);
  const top = Math.max(counts[0], 1);
  const lost = scoped.filter((l) => l.stage === "Lost").length;
  const nurture = scoped.filter((l) => l.stage === "Nurture").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-navy to-indigo-700 px-4 py-3 text-white">
        <div>
          <h2 className="font-semibold">Sales funnel</h2>
          <p className="text-xs opacity-80">Call → qualify → approved quote → advance → won. Push every lead one step down today.</p>
        </div>
        <div className="flex rounded-xl bg-white/15 p-0.5 text-xs">
          {(["month", "all"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={cn("rounded-lg px-3 py-1", period === p ? "bg-white text-navy" : "text-white")}>{p === "month" ? "This month" : "All time"}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        {STEPS.map((s, i) => {
          const n = counts[i];
          const conv = i > 0 && counts[i - 1] > 0 ? Math.round((n / counts[i - 1]) * 100) : null;
          return (
            <div key={s} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-xs sm:w-36">
                <div className="font-semibold text-navy">{STAGE_GUIDE[s].no} · {LABEL[s]}</div>
              </div>
              <div className="flex flex-1 justify-center">
                <div className="flex h-8 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm transition-all duration-500" style={{ width: `${Math.max((n / top) * 100, 8)}%`, background: STAGE_GUIDE[s].color }}>{n}</div>
              </div>
              <div className={cn("w-12 shrink-0 text-right text-xs font-semibold", conv == null ? "" : conv >= 50 ? "text-emerald-600" : conv >= 25 ? "text-amber-600" : "text-rose-600")}>{conv != null ? `${conv}%` : ""}</div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-2 text-xs text-slate-500">
          <span>Lead → booking: <b className="text-navy">{counts[0] ? Math.round((counts[6] / counts[0]) * 100) : 0}%</b></span>
          <span>Quote → booking: <b className="text-navy">{counts[4] ? Math.round((counts[6] / counts[4]) * 100) : 0}%</b></span>
          <span>Lost: {lost}</span>
          <span>Nurture: {nurture}</span>
        </div>
      </div>
    </section>
  );
}
