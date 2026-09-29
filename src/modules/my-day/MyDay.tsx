"use client";
/**
 * /my-day: the one page a staff member opens in the morning — attendance,
 * their tasks and tickets, today's numbers for their unit and their score.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Plus, Trophy, Wrench } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate, formatDateTime, todayISO } from "@/core/format";
import { listHref, newHref, viewHref } from "@/core/routes";
import { Badge } from "@/core/ui/Badge";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader, Stat } from "@/core/ui/Card";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { ATTENDANCE_LABELS } from "@/modules/attendance/entity";
import { isOpenTicket } from "@/modules/tickets/entity";
import { computeScoreboard, loadScoreboardData, medal, type ScoreRow } from "@/modules/scoreboard/compute";

export function MyDay() {
  const user = useUser();
  const { toast } = useToast();
  const me = (user.staff?.id as string | undefined) ?? null;
  const unitId = user.unitId ?? ((user.staff?.business_unit_id as string | undefined) || null);
  const today = todayISO();
  const [now, setNow] = useState(new Date());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", priority: "Medium", due: today });
  const [score, setScore] = useState<ScoreRow | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { rows: attendance } = useList(me ? "attendance" : null, { filter: { date: today, staff_id: me } });
  const { rows: tasks, reload: reloadTasks } = useList(me ? "tasks" : null, { filter: { assigned_to: me } });
  const { rows: tickets } = useList("tickets");
  const { rows: bookings } = useList("bookings", { filter: unitId ? { business_unit_id: unitId } : {} });
  const { rows: reports } = useList("daily-reports", { filter: unitId ? { business_unit_id: unitId } : {}, sort: { field: "date", dir: "desc" }, limit: 1 });
  const { rows: units } = useList("business-units");

  // My score today (same maths as the scoreboard).
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const load = () =>
      loadScoreboardData(getStore(), "today", null)
        .then((d) => !cancelled && setScore(computeScoreboard(d).rows.find((r) => r.staff.id === me) ?? null))
        .catch(() => undefined);
    void load();
    const unsubs = ["attendance", "tasks", "tickets", "leads", "activities"].map((e) => getStore().subscribe?.(e, () => void load()));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
  }, [me]);

  const att = attendance[0] ?? null;
  const myTasks = tasks.filter((t) => t.status !== "Done" && (!t.due || String(t.due) <= today)).sort((a, b) => String(a.due ?? "9").localeCompare(String(b.due ?? "9")));
  const myTickets = tickets.filter((t) => isOpenTicket(t) && (t.reported_by === me || t.assigned_to === me));
  const arrivals = bookings.filter((b) => b.check_in === today && (b.status === "Confirmed" || b.status === "Enquiry"));
  const departures = bookings.filter((b) => b.check_out === today && b.status === "Checked-in");
  const inHouse = bookings.filter((b) => b.status === "Checked-in");
  const report = reports[0] ?? null;
  const unitName = String(units.find((u) => u.id === unitId)?.name ?? "all units");

  const markDone = async (t: Row, done: boolean) => {
    try {
      await getStore().update("tasks", t.id, { status: done ? "Done" : "Open", completed_at: done ? new Date().toISOString() : null });
      if (done) toast(`Done: ${t.title}`);
      await reloadTasks();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const addTask = async () => {
    if (!draft.title.trim()) return toast("Give the task a title", "error");
    try {
      await getStore().create("tasks", {
        title: draft.title.trim(),
        business_unit_id: unitId,
        type: "Other",
        priority: draft.priority,
        assigned_to: me,
        due: draft.due || null,
        status: "Open",
        points: 1,
        created_by: me,
      });
      setDraft({ title: "", priority: "Medium", due: today });
      setAdding(false);
      toast("Task added");
      await reloadTasks();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`Good ${now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`}
        subtitle={
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-navy">{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span>{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          </span>
        }
      />

      {!me && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your login is not linked to a staff record, so tasks, tickets and score cannot be shown for you.{user.role === "owner" ? " In local mode choose “Preview the app as” under Settings." : " Ask HR to link your staff record."}
        </div>
      )}

      {/* Attendance */}
      <Card>
        <CardHeader
          title="Attendance"
          subtitle={att ? `${ATTENDANCE_LABELS[String(att.status)] ?? att.status} today${att.checked_in_at ? ` · in ${formatDateTime(att.checked_in_at).slice(-8)}` : ""}${att.checked_out_at ? ` · out ${formatDateTime(att.checked_out_at).slice(-8)}` : ""}` : "Not marked yet today"}
          action={
            <Link href="/attendance/checkin/">
              <Button size="sm" icon={Camera} variant={att?.checked_in_at ? "secondary" : "primary"}>
                {att?.checked_in_at ? (att.checked_out_at ? "Attendance" : "Check out") : "Mark attendance"}
              </Button>
            </Link>
          }
        />
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader
          title={`My tasks today${myTasks.length ? ` (${myTasks.length})` : ""}`}
          subtitle="Due today, overdue or undated"
          action={
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding((a) => !a)} disabled={!me}>
              Add task
            </Button>
          }
        />
        <CardBody className="p-0">
          {adding && (
            <form
              className="grid grid-cols-1 gap-2 border-b border-line bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void addTask();
              }}
            >
              <Input autoFocus placeholder="What needs doing?" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              <Select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className="sm:w-32">
                {["High", "Medium", "Low"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
              <Input type="date" value={draft.due} onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))} className="sm:w-40" />
              <Button type="submit" icon={Plus}>
                Add
              </Button>
            </form>
          )}
          {myTasks.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">{me ? "Nothing due today. Enjoy the calm or add a task." : "—"}</p>
          ) : (
            <ul className="divide-y divide-line">
              {myTasks.map((t) => {
                const overdue = t.due && String(t.due) < today;
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-navy" checked={false} onChange={() => void markDone(t, true)} aria-label={`Mark ${t.title} done`} />
                    <Link href={viewHref("tasks", t.id)} className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-navy">{String(t.title)}</span>
                      <span className={overdue ? "text-xs text-red-600" : "text-xs text-slate-500"}>
                        {t.due ? `${overdue ? "Overdue · " : ""}due ${formatDate(t.due)}` : "No due date"} · {String(t.type ?? "")} · {Number(t.points ?? 1)} pt
                      </span>
                    </Link>
                    <Badge value={t.priority} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Tickets */}
      <Card>
        <CardHeader
          title={`My tickets${myTickets.length ? ` (${myTickets.length})` : ""}`}
          subtitle="Open tickets I reported or am assigned"
          action={
            <Link href={newHref("tickets", me ? { reported_by: me } : undefined)}>
              <Button size="sm" variant="secondary" icon={Wrench}>
                New ticket
              </Button>
            </Link>
          }
        />
        <CardBody className="p-0">
          {myTickets.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No open tickets.</p>
          ) : (
            <ul className="divide-y divide-line">
              {myTickets.map((t) => (
                <li key={t.id}>
                  <Link href={viewHref("tickets", t.id)} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-navy">{String(t.title)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {String(t.category ?? "")}
                        {t.location ? ` · ${t.location}` : ""} · {t.assigned_to === me ? "assigned to me" : "reported by me"} · {formatDateTime(t.created_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Badge value={t.priority} />
                      <Badge value={t.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Today's numbers */}
      <Card>
        <CardHeader title="Today's numbers" subtitle={unitName} action={<Link href={listHref("bookings")} className="text-xs text-navy hover:underline">Bookings</Link>} />
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Arrivals" value={arrivals.length} />
          <Stat label="Departures" value={departures.length} />
          <Stat label="In house" value={inHouse.length} hint="bookings checked in" />
          <Stat label="Occupancy" value={report?.occupancy_units != null ? String(report.occupancy_units) : "—"} hint={report ? `units · report of ${formatDate(report.date)}` : "no daily report yet"} />
        </CardBody>
      </Card>

      {/* Score */}
      <Card>
        <CardHeader
          title="My score today"
          subtitle="Task points + 2 × tickets + 5 × leads won + present − overdue"
          action={
            <Link href="/scoreboard/" className="inline-flex items-center gap-1 text-xs text-navy hover:underline">
              <Trophy className="h-3.5 w-3.5" /> Scoreboard
            </Link>
          }
        />
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Score" value={score ? `${medal(score.rank, score.score)} ${score.score}`.trim() : "—"} hint={score ? `rank #${score.rank}` : undefined} tone={score && score.score > 0 ? "good" : "neutral"} />
          <Stat label="Tasks done" value={score?.tasksDone ?? 0} hint={`${score?.taskPoints ?? 0} points`} />
          <Stat label="Tickets resolved" value={score?.ticketsResolved ?? 0} />
          <Stat label="Overdue" value={score?.tasksOverdue ?? 0} tone={score?.tasksOverdue ? "bad" : "good"} />
        </CardBody>
      </Card>
    </div>
  );
}
