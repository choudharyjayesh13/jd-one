"use client";
/** /scoreboard: who did what today / this week / this month, ranked; plus the "Rapid service" tile. */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader, Stat } from "@/core/ui/Card";
import { Select } from "@/core/ui/Input";
import { Table, Th, Td } from "@/core/ui/Table";
import { useList } from "@/core/ui/hooks";
import { Loading, ErrorBox, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scoreboard"
        subtitle={data ? (data.start === data.end ? formatDate(data.start) : `${formatDate(data.start)} – ${formatDate(data.end)}`) : undefined}
        actions={
          <>
            {!user.unitId && (
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto max-w-[200px]">
                <option value="">All units</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => loadScoreboardData(getStore(), period, unit || null).then(setData)}>
              Refresh
            </Button>
          </>
        }
      />
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium", period === p.id ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100")}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {!result || !rapid ? (
        <Loading label="Computing scores…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Team score" value={result.totals.score} hint={`${result.rows.length} staff`} />
            <Stat label="Tasks done" value={result.totals.tasksDone} hint={`${result.totals.taskPoints} points`} />
            <Stat label="Tickets resolved" value={result.totals.ticketsResolved} hint={result.totals.avgResolutionHours !== null ? `avg ${result.totals.avgResolutionHours} h` : "—"} />
            <Stat label="Overdue tasks" value={result.totals.tasksOverdue} tone={result.totals.tasksOverdue ? "bad" : "good"} />
          </div>

          <Card>
            <CardHeader title="Rapid service" subtitle="Open tickets by age · how fast work starts" />
            <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Open tickets" value={rapid.open} hint={`${rapid.unassigned} unassigned`} tone={rapid.unassigned ? "bad" : "neutral"} />
              <Stat label="< 2 h" value={rapid.under2h} tone="good" />
              <Stat label="< 24 h" value={rapid.under24h} tone={rapid.under24h ? "neutral" : "good"} />
              <Stat label="> 24 h" value={rapid.over24h} tone={rapid.over24h ? "bad" : "good"} />
              <Stat label="Avg first response" value={rapid.avgFirstResponseHours !== null ? `${rapid.avgFirstResponseHours} h` : "—"} hint="created → work started" />
            </CardBody>
          </Card>

          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Staff</Th>
                <Th className="text-right">Score</Th>
                <Th className="text-right">Present</Th>
                <Th className="text-right">On time</Th>
                <Th className="text-right">Tasks done</Th>
                <Th className="text-right">Points</Th>
                <Th className="text-right">Overdue</Th>
                <Th className="text-right">Tickets</Th>
                <Th className="text-right">Avg fix (h)</Th>
                <Th className="text-right">Leads won</Th>
                <Th className="text-right">Activities</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 && (
                <tr>
                  <Td className="text-center text-slate-500">—</Td>
                  <Td className="text-slate-500">No active staff{unit ? " in this unit" : ""}.</Td>
                </tr>
              )}
              {result.rows.map((r) => (
                <tr key={r.staff.id} className={cn(r.staff.id === me && "bg-gold/10")}>
                  <Td className="tabular-nums">
                    {medal(r.rank, r.score) || r.rank}
                  </Td>
                  <Td className="font-medium text-navy">
                    {String(r.staff.name)}
                    {r.staff.designation ? <span className="block text-xs font-normal text-slate-500">{String(r.staff.designation)}</span> : null}
                  </Td>
                  <Td className={cn("text-right font-semibold tabular-nums", r.score < 0 ? "text-red-600" : "text-navy")}>{r.score}</Td>
                  <Td className="text-right tabular-nums">{r.presentDays}</Td>
                  <Td className="text-right tabular-nums">{r.onTimeDays}</Td>
                  <Td className="text-right tabular-nums">{r.tasksDone}</Td>
                  <Td className="text-right tabular-nums">{r.taskPoints}</Td>
                  <Td className={cn("text-right tabular-nums", r.tasksOverdue > 0 && "text-red-600")}>{r.tasksOverdue}</Td>
                  <Td className="text-right tabular-nums">{r.ticketsResolved}</Td>
                  <Td className="text-right tabular-nums">{r.avgResolutionHours ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{r.leadsWon}</Td>
                  <Td className="text-right tabular-nums">{r.activities}</Td>
                </tr>
              ))}
              {result.rows.length > 0 && (
                <tr className="bg-slate-50 font-semibold">
                  <Td />
                  <Td>Team total</Td>
                  <Td className="text-right tabular-nums">{result.totals.score}</Td>
                  <Td className="text-right tabular-nums">{result.totals.presentDays}</Td>
                  <Td className="text-right tabular-nums">{result.totals.onTimeDays}</Td>
                  <Td className="text-right tabular-nums">{result.totals.tasksDone}</Td>
                  <Td className="text-right tabular-nums">{result.totals.taskPoints}</Td>
                  <Td className="text-right tabular-nums">{result.totals.tasksOverdue}</Td>
                  <Td className="text-right tabular-nums">{result.totals.ticketsResolved}</Td>
                  <Td className="text-right tabular-nums">{result.totals.avgResolutionHours ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{result.totals.leadsWon}</Td>
                  <Td className="text-right tabular-nums">{result.totals.activities}</Td>
                </tr>
              )}
            </tbody>
          </Table>
          <p className="text-xs text-slate-500">Score = task points + 2 × tickets resolved + 5 × leads won + 1 per day present − overdue tasks. On time = checked in by 10:00 IST (Mark attendance).</p>
        </>
      )}
    </div>
  );
}
