"use client";
/** /pipeline → Daily EOD: the "Daily Sales End-of-Day Report" sheet, live — team summary, stage-wise pipeline, each person's EOD. */
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, FilePlus2 } from "lucide-react";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Loading } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { formatMoney, todayISO } from "@/core/format";
import { newHref, viewHref } from "@/core/routes";
import { LEAD_STAGES, STAGE_GUIDE } from "@/modules/leads/options";

export function EodBoard() {
  const user = useUser();
  const me = (user.staff?.id as string | undefined) ?? "";
  const [date, setDate] = useState(todayISO());
  const { rows: leads, loading } = useList("leads");
  const { rows: staff } = useList("staff", { filter: { active: true } });
  const { rows: eods } = useList("sales-eod", { filter: { date } });
  const { rows: hist } = useList("lead-stage-history", { range: { changed_at: { gte: `${date}T00:00:00`, lte: `${date}T23:59:59` } } });

  if (loading) return <Loading />;
  const day = (v: unknown) => String(v ?? "").slice(0, 10) === date;
  const moved = (to: string) => new Set(hist.filter((h) => h.to_stage === to).map((h) => String(h.lead_id))).size;
  const open = leads.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const metrics = [
    { label: "New leads", v: leads.filter((l) => day(l.created_at)).length, hint: "received today" },
    { label: "Meta leads", v: leads.filter((l) => day(l.created_at) && l.source === "Meta Ads").length, hint: "from Meta ads" },
    { label: "Contacted", v: leads.filter((l) => day(l.last_contact)).length, hint: "last contact today" },
    { label: "Qualified", v: moved("Qualified"), hint: "moved to 04 today" },
    { label: "Awaiting approval", v: open.filter((l) => l.approval_status === "Pending").length, hint: "with Akshayraj" },
    { label: "Quotes shared", v: moved("Quote shared"), hint: "moved to 07 today" },
    { label: "Won today", v: leads.filter((l) => l.stage === "Won" && day(l.won_at ?? l.updated_at)).length, hint: "bookings confirmed" },
    { label: "Lost today", v: moved("Lost"), hint: "with reason" },
    { label: "Overdue follow-ups", v: open.filter((l) => l.next_follow_up && String(l.next_follow_up) < date).length, hint: "before today" },
  ];
  const sales = staff.filter((s) => ["marketing", "manager", "owner"].includes(String(s.role)));
  const mineDone = eods.find((e) => e.staff_id === me);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          Report date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-line px-2 py-1.5 text-sm" />
        </div>
        {me && (mineDone ? (
          <Link href={viewHref("sales-eod", mineDone.id)} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4" />My EOD submitted — view</Link>
        ) : (
          <Link href={newHref("sales-eod", { date, staff_id: me })} className="flex items-center gap-1 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white"><FilePlus2 className="h-4 w-4" />Fill my EOD report</Link>
        ))}
      </div>

      <section className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-line bg-white p-3 text-center shadow-sm">
            <div className={cn("text-2xl font-bold", m.label.startsWith("Overdue") && m.v ? "text-rose-600" : m.label.startsWith("Won") && m.v ? "text-emerald-600" : "text-navy")}>{m.v}</div>
            <div className="text-[11px] font-semibold text-slate-600">{m.label}</div>
            <div className="text-[10px] text-slate-400">{m.hint}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-navy">Stage-wise live pipeline</h2>
          <div className="space-y-1">
            {LEAD_STAGES.map((s) => {
              const n = leads.filter((l) => l.stage === s).length;
              return (
                <div key={s} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGE_GUIDE[s].color }} />
                  <span className="flex-1 text-slate-700">{STAGE_GUIDE[s].no} · {s}</span>
                  <b className="text-navy">{n}</b>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-navy">Team EOD — {date}</h2>
          <div className="space-y-2">
            {sales.map((s) => {
              const e = eods.find((x) => x.staff_id === s.id);
              return (
                <div key={s.id as string} className={cn("rounded-xl border p-3 text-sm", e ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy">{String(s.name)}</span>
                    {e ? (
                      <Link href={viewHref("sales-eod", e.id)} className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Submitted</Link>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock3 className="h-4 w-4" />Not submitted</span>
                    )}
                  </div>
                  {e && (
                    <>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
                        <span>📞 {String(e.calls_made ?? 0)} calls</span>
                        <span>💬 {String(e.whatsapp_sent ?? 0)} WA</span>
                        <span>🗣 {String(e.conversations ?? 0)} talks</span>
                        <span>📄 {String(e.quotes_shared ?? 0)} quotes</span>
                        <span>🏆 {String(e.bookings_confirmed ?? 0)} won · {formatMoney(e.booking_value)}</span>
                      </div>
                      {e.hot_leads ? <p className="mt-1 whitespace-pre-line text-xs text-slate-700">🔥 {String(e.hot_leads)}</p> : null}
                      {e.blockers ? <p className="mt-1 whitespace-pre-line text-xs text-rose-700">⛔ {String(e.blockers)}</p> : null}
                      {e.manager_review ? <p className="mt-1 whitespace-pre-line text-xs text-indigo-700">🛡 {String(e.manager_review)}</p> : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
