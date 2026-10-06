"use client";
/** /scoreboard: who did what today / this week / this month, ranked; plus the "Rapid service" tile. */
import { useEffect, useState } from "react";
import { RefreshCw, Trophy, Flame, Timer, Wrench, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Select } from "@/core/ui/Input";
import { Table, Th, Td } from "@/core/ui/Table";
import { useList } from "@/core/ui/hooks";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { photoOfDay } from "@/core/ui/property";
import { computeScoreboard, loadScoreboardData, medal, rapidService, PERIODS, type Period, type ScoreboardInput } from "./compute";

const WATCH = ["attendance", "tasks", "tickets", "leads", "activities", "staff"];

export function Scoreboard() {
  const user = useUser();
  const [period, setPeriod] = useState<Period>("today");
  const [unit, setUnit] = useState(user.unitId ?? "");
  const [data, setData] = useState<ScoreboardInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { rows: units } = useList("business-units");

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      loadScoreboardData(getStore(), period, unit || null)
        .then((d) => !cancelled && setData(d))
        .catch((e) => !cancelled && setError((e as Error).message));
    void load();
    const unsubs = WATCH.map((e) => getStore().subscribe?.(e, () => void load()));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
  }, [period, unit]);

  const result = data ? computeScoreboard(data) : null;
  const rapid = data ? rapidService(data.tickets.filter((t) => !unit || t.business_unit_id === unit)) : null;
  const me = (user.staff?.id as string | undefined) ?? null;

  const [showTable, setShowTable] = useState(false);
  const rows = result?.rows ?? [];
  const top = rows.filter((r) => r.score > 0).slice(0, 3);
  const maxScore = Math.max(1, ...rows.map((r) => r.score));
  const mine = rows.find((r) => r.staff.id === me) ?? null;
  const initials = (n: unknown) => String(n ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const podiumStyle = ["from-amber-300 to-yellow-500 text-navy", "from-slate-200 to-slate-400 text-navy", "from-orange-300 to-amber-700 text-white"];
  const podiumOrder = top.length === 3 ? [top[1], top[0], top[2]] : top;
  const podiumCols = top.length === 1 ? "grid-cols-1 max-w-xs mx-auto" : top.length === 2 ? "grid-cols-2 max-w-2xl mx-auto" : "grid-cols-3";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      {/* Banner */}
      <section className="relative overflow-hidden rounded-3xl text-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoOfDay(3).url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/80 to-navy/30" />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/70"><Trophy className="h-4 w-4 text-gold" /> Team scoreboard</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Who&apos;s leading {PERIODS.find((p) => p.id === period)?.label.toLowerCase()}</h1>
            <p className="mt-1 text-sm text-white/70">{data ? (data.start === data.end ? formatDate(data.start) : `${formatDate(data.start)} – ${formatDate(data.end)}`) : "…"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!user.unitId && (
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto max-w-[200px] text-navy">
                <option value="">All units</option>
                {units.map((u) => <option key={u.id} value={u.id}>{String(u.name)}</option>)}
              </Select>
            )}
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => loadScoreboardData(getStore(), period, unit || null).then(setData)}>Refresh</Button>
          </div>
        </div>
        <div className="relative flex gap-1 px-6 pb-6 sm:px-8">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", period === p.id ? "bg-gold text-navy" : "bg-white/10 text-white hover:bg-white/20")}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {error && <ErrorBox message={error} />}
      {!result || !rapid ? (
        <Loading label="Computing scores…" />
      ) : (
        <>
          {/* Podium */}
          {top.length === 0 && (
            <section className="rounded-2xl border-2 border-dashed border-gold/50 bg-gold/5 px-6 py-8 text-center">
              <div className="text-4xl">🏆</div>
              <p className="mt-2 font-semibold text-navy">The race hasn&apos;t started yet</p>
              <p className="text-sm text-slate-500">Mark attendance, finish tasks and fix tickets to get on the podium.</p>
            </section>
          )}
          {top.length > 0 && (
            <section className={cn("grid items-end gap-3 sm:gap-6", podiumCols)}>
              {podiumOrder.map((r) => {
                const place = r.rank;
                const height = place === 1 ? "pt-10 pb-6" : place === 2 ? "pt-6 pb-5" : "pt-4 pb-4";
                return (
                  <div key={r.staff.id} className={cn("flex flex-col items-center rounded-3xl bg-gradient-to-b px-3 text-center shadow-md", podiumStyle[Math.min(place, 3) - 1], height, r.staff.id === me && "ring-4 ring-navy/30")}>
                    <span className="text-3xl sm:text-4xl">{place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉"}</span>
                    <span className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-lg font-bold text-navy shadow sm:h-16 sm:w-16 sm:text-xl">{initials(r.staff.name)}</span>
                    <span className="mt-2 line-clamp-1 text-sm font-semibold sm:text-base">{String(r.staff.name)}</span>
                    <span className="text-xs opacity-80">{String(r.staff.designation ?? "")}</span>
                    <span className="mt-2 text-3xl font-black tabular-nums sm:text-4xl">{r.score}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">points</span>
                  </div>
                );
              })}
            </section>
          )}

          {/* Me */}
          {mine && (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-gold/60 bg-gold/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy text-base font-bold text-white">#{mine.rank}</span>
                <div>
                  <div className="font-semibold text-navy">Your position · {mine.score} points</div>
                  <div className="text-xs text-slate-600">
                    {mine.rank === 1 && mine.score > 0 ? "You are leading the team — keep it up! 🔥" : mine.score === 0 && (rows[0]?.score ?? 0) === 0 ? "Everyone starts at 0 — finish a task to take the lead" : `${Math.max(1, (rows[mine.rank - 2]?.score ?? mine.score) - mine.score + 1)} more point${Math.max(1, (rows[mine.rank - 2]?.score ?? mine.score) - mine.score + 1) === 1 ? "" : "s"} to move up a place`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white px-3 py-1 font-medium text-navy">✅ {mine.tasksDone} tasks</span>
                <span className="rounded-full bg-white px-3 py-1 font-medium text-navy">🛠️ {mine.ticketsResolved} tickets</span>
                <span className="rounded-full bg-white px-3 py-1 font-medium text-navy">🗓️ {mine.presentDays} present</span>
                {mine.tasksOverdue > 0 && <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">⚠️ {mine.tasksOverdue} overdue</span>}
              </div>
            </section>
          )}

          {/* Leaderboard */}
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-navy">Leaderboard</h2>
            {rows.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No active staff{unit ? " in this unit" : ""}.</p>
            ) : (
              <ol className="space-y-3">
                {rows.map((r) => (
                  <li key={r.staff.id} className={cn("flex items-center gap-4 rounded-xl border px-4 py-3", r.staff.id === me ? "border-gold bg-gold/5" : "border-line")}>
                    <span className="w-8 text-center text-lg font-bold tabular-nums text-slate-400">{medal(r.rank, r.score) || r.rank}</span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/10 text-sm font-bold text-navy">{initials(r.staff.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-navy">{String(r.staff.name)}<span className="ml-2 text-xs font-normal text-slate-500">{String(r.staff.designation ?? "")}</span></span>
                        <span className={cn("text-lg font-bold tabular-nums", r.score < 0 ? "text-red-600" : "text-navy")}>{r.score}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-gold to-amber-500" style={{ width: `${Math.max(2, (Math.max(0, r.score) / maxScore) * 100)}%` }} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        <span>✅ {r.tasksDone} tasks · {r.taskPoints} pts</span><span>🛠️ {r.ticketsResolved} tickets</span><span>🗓️ {r.presentDays} present · {r.onTimeDays} on time</span><span>🎯 {r.leadsWon} leads won</span>
                        {r.tasksOverdue > 0 && <span className="text-red-600">⚠️ {r.tasksOverdue} overdue</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Team + rapid service */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { icon: Flame, label: "Team score", value: result.totals.score, hint: `${rows.length} staff` },
              { icon: CheckCircle2, label: "Tasks done", value: result.totals.tasksDone, hint: `${result.totals.taskPoints} points` },
              { icon: Wrench, label: "Tickets resolved", value: result.totals.ticketsResolved, hint: result.totals.avgResolutionHours !== null ? `avg ${result.totals.avgResolutionHours} h to fix` : "—" },
              { icon: AlertTriangle, label: "Overdue tasks", value: result.totals.tasksOverdue, hint: result.totals.tasksOverdue ? "needs attention" : "all on time", bad: result.totals.tasksOverdue > 0 },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm">
                <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", t.bad ? "bg-red-50 text-red-600" : "bg-navy/5 text-navy")}><t.icon className="h-6 w-6" /></span>
                <div><div className="text-2xl font-bold tabular-nums text-navy">{t.value}</div><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</div><div className="text-xs text-slate-400">{t.hint}</div></div>
              </div>
            ))}
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy"><Timer className="h-5 w-5 text-gold" /> Rapid service</h2>
            <p className="mb-4 text-xs text-slate-500">Open maintenance tickets by age · how fast work starts</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[["Open", rapid.open, `${rapid.unassigned} unassigned`, rapid.unassigned ? "bad" : ""], ["Under 2 h", rapid.under2h, "fresh", "good"], ["Under 24 h", rapid.under24h, "", ""], ["Over 24 h", rapid.over24h, rapid.over24h ? "late" : "none late", rapid.over24h ? "bad" : "good"], ["First response", rapid.avgFirstResponseHours !== null ? `${rapid.avgFirstResponseHours} h` : "—", "avg", ""]].map(([l, v, h, tone]) => (
                <div key={String(l)} className={cn("rounded-xl px-4 py-3", tone === "bad" ? "bg-red-50" : tone === "good" ? "bg-emerald-50" : "bg-slate-50")}>
                  <div className={cn("text-2xl font-bold tabular-nums", tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-navy")}>{v}</div>
                  <div className="text-xs text-slate-600">{l}</div>{h ? <div className="text-[11px] text-slate-400">{h}</div> : null}
                </div>
              ))}
            </div>
          </section>

          <button type="button" onClick={() => setShowTable((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline">
            <ChevronDown className={cn("h-4 w-4 transition", showTable && "rotate-180")} /> {showTable ? "Hide" : "Show"} full details table
          </button>
          {showTable && (
            <Table>
              <thead><tr><Th>#</Th><Th>Staff</Th><Th className="text-right">Score</Th><Th className="text-right">Present</Th><Th className="text-right">On time</Th><Th className="text-right">Tasks done</Th><Th className="text-right">Points</Th><Th className="text-right">Overdue</Th><Th className="text-right">Tickets</Th><Th className="text-right">Avg fix (h)</Th><Th className="text-right">Leads won</Th><Th className="text-right">Activities</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staff.id} className={cn(r.staff.id === me && "bg-gold/10")}>
                    <Td className="tabular-nums">{medal(r.rank, r.score) || r.rank}</Td><Td className="font-medium text-navy">{String(r.staff.name)}</Td>
                    <Td className="text-right font-semibold tabular-nums">{r.score}</Td><Td className="text-right tabular-nums">{r.presentDays}</Td><Td className="text-right tabular-nums">{r.onTimeDays}</Td>
                    <Td className="text-right tabular-nums">{r.tasksDone}</Td><Td className="text-right tabular-nums">{r.taskPoints}</Td><Td className={cn("text-right tabular-nums", r.tasksOverdue > 0 && "text-red-600")}>{r.tasksOverdue}</Td>
                    <Td className="text-right tabular-nums">{r.ticketsResolved}</Td><Td className="text-right tabular-nums">{r.avgResolutionHours ?? "—"}</Td><Td className="text-right tabular-nums">{r.leadsWon}</Td><Td className="text-right tabular-nums">{r.activities}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="text-xs text-slate-500">Score = task points + 2 × tickets resolved + 5 × leads won + 1 per day present − overdue tasks. On time = checked in by 10:00 IST.</p>
        </>
      )}
    </div>
  );
}
