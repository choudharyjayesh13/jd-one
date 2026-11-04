"use client";
/** Shared pieces for department reports and the night audit: who may do what, and how a section looks. */
import { AlertTriangle } from "lucide-react";
import { cn } from "@/core/ui/cn";
import type { Section } from "./collect";
export { canNightAudit, reportDepartments } from "./access";

export function SectionView({ s, note, by, compact }: { s: Section; note?: string; by?: string; compact?: boolean }) {
  return (
    <section className="break-inside-avoid-page rounded-xl border border-line bg-white p-4 print:rounded-none print:border-0 print:border-t print:px-0 sm:p-5">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="jd-serif text-2xl font-semibold text-navy">{s.title}</h3>
        {by && <span className="text-xs text-slate-500">{by}</span>}
      </header>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {s.stats.map((st) => (
          <div key={st.label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-line pb-1.5">
            <dt className="text-sm text-slate-500">{st.label}</dt>
            <dd className={cn("text-right text-sm font-medium", st.tone === "bad" ? "text-red-700" : st.tone === "good" ? "text-emerald-700" : "text-navy")}>{st.value}</dd>
          </div>
        ))}
      </dl>
      {s.alerts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {s.alerts.map((a) => (
            <li key={a} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {a}
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="mt-3 whitespace-pre-line rounded-lg border border-[#e7dcc4] bg-[#faf5ea] px-3 py-2 text-sm text-navy">
          <span className="mr-1 font-medium">Note:</span>
          {note}
        </p>
      )}
      {!compact &&
        s.tables
          .filter((t) => t.rows.length > 0)
          .map((t) => (
            <div key={t.title} className="mt-4 overflow-x-auto">
              <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                {t.title} ({t.rows.length})
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-slate-500">
                    {t.columns.map((c) => (
                      <th key={c} className="py-1 pr-3 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      {r.map((c, j) => (
                        <td key={j} className="py-1 pr-3 align-top text-slate-700">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
    </section>
  );
}
