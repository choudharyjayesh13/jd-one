"use client";
/** Sales funnel: how many leads reached each step (this month or all time) and the conversion from step to step. */
import { useState } from "react";
import { useList } from "@/core/ui/hooks";
import { cn } from "@/core/ui/cn";
import { todayISO } from "@/core/format";

/** A lead in a later stage has passed every earlier stage. On Hold / Lost count only toward "New". */
const STEPS = [
  { label: "New leads", stages: ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "On Hold", "Won", "Lost"], tip: "Every enquiry that came in" },
  { label: "Contacted", stages: ["Contacted", "Qualified", "Proposal", "Negotiation", "Won"], tip: "We spoke to them" },
  { label: "Qualified", stages: ["Qualified", "Proposal", "Negotiation", "Won"], tip: "Real requirement, dates & budget known" },
  { label: "Proposal / quote", stages: ["Proposal", "Negotiation", "Won"], tip: "Rates & package sent" },
  { label: "Negotiation", stages: ["Negotiation", "Won"], tip: "Discussing price / advance" },
  { label: "Won — booked", stages: ["Won"], tip: "Advance paid, booking made" },
] as const;

const COLORS = ["bg-slate-500", "bg-sky-600", "bg-indigo-600", "bg-violet-600", "bg-amber-500", "bg-emerald-600"];

export function Funnel({ who }: { who: string }) {
  const { rows: leads } = useList("leads");
  const [period, setPeriod] = useState<"month" | "all">("month");
  const month = todayISO().slice(0, 7);
  const scoped = leads.filter((l) => (!who || l.assigned_to === who) && (period === "all" || String(l.created_at ?? "").slice(0, 7) === month));
  const counts = STEPS.map((s) => scoped.filter((l) => (s.stages as readonly string[]).includes(String(l.stage))).length);
  const top = Math.max(counts[0], 1);
  const lost = scoped.filter((l) => l.stage === "Lost").length;

  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-navy">Sales funnel</h2>
          <p className="text-xs text-slate-500">Move every lead down the funnel: call → qualify → send quote → close with advance.</p>
        </div>
        <div className="flex rounded-xl border border-line p-0.5 text-xs">
          {(["month", "all"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={cn("rounded-lg px-3 py-1", period === p ? "bg-navy text-white" : "text-slate-600")}>{p === "month" ? "This month" : "All time"}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {STEPS.map((s, i) => {
          const n = counts[i];
          const conv = i > 0 && counts[i - 1] > 0 ? Math.round((n / counts[i - 1]) * 100) : null;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-xs text-slate-600 sm:w-40">
                <div className="font-semibold text-navy">{s.label}</div>
                <div className="hidden text-[10px] text-slate-400 sm:block">{s.tip}</div>
              </div>
              <div className="flex flex-1 justify-center">
                <div className={cn("flex h-8 items-center justify-center rounded-lg text-sm font-bold text-white transition-all", COLORS[i])} style={{ width: `${Math.max((n / top) * 100, 8)}%` }}>{n}</div>
              </div>
              <div className="w-14 shrink-0 text-right text-xs text-slate-500">{conv != null ? `${conv}%` : ""}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Overall conversion: <b className="text-navy">{counts[0] ? Math.round((counts[5] / counts[0]) * 100) : 0}%</b> of leads booked · Lost: {lost}
      </p>
    </section>
  );
}
