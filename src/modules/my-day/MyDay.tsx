"use client";
/**
 * /my-day — the staff home. Spacious, card-based: welcome + attendance, quick actions,
 * today's tasks, upcoming tasks, my role (job description, 5 KPIs, 5 KRAs), tickets,
 * today's numbers and my score.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Camera, CalendarClock, ChefHat, ClipboardList, Plus, QrCode, ShoppingCart, Target, Trophy, Wrench, Briefcase, Flag } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate, formatDateTime, todayISO } from "@/core/format";
import { listHref, newHref, viewHref } from "@/core/routes";
import { Badge } from "@/core/ui/Badge";
import { Button } from "@/core/ui/Button";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { PropertyStrip, photoOfDay } from "@/core/ui/property";
import { CompleteTaskDialog } from "@/core/ui/CompleteTask";
import { AwardsBanner } from "@/modules/rewards/AwardsBanner";
import { INCENTIVES } from "@/modules/rewards/rewards";
import { activeRest, phaseAt, pretty, routineOf, shiftsOf } from "@/modules/attendance/shifts";
import { ATTENDANCE_LABELS } from "@/modules/attendance/entity";
import { isOpenTicket } from "@/modules/tickets/entity";
import { computeScoreboard, loadScoreboardData, medal, type ScoreRow } from "@/modules/scoreboard/compute";

/* ---------- small building blocks ---------- */
function Panel({ title, icon: Icon, action, children, className, subtitle }: { title: string; icon: React.ComponentType<{ className?: string }>; action?: ReactNode; children: ReactNode; className?: string; subtitle?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-white shadow-sm", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/5 text-navy"><Icon className="h-5 w-5" /></span>
          <div>
            <h2 className="text-base font-semibold text-navy">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="px-5 pb-5 pt-4 sm:px-6">{children}</div>
    </section>
  );
}
function Tile({ label, value, hint, tone = "navy", icon: Icon, href }: { label: string; value: ReactNode; hint?: string; tone?: "navy" | "gold" | "green" | "red"; icon: React.ComponentType<{ className?: string }>; href?: string }) {
  const tones = { navy: "bg-navy/5 text-navy", gold: "bg-gold/15 text-amber-800", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-600" } as const;
  const inner = (
    <div className="flex h-full items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tones[tone])}><Icon className="h-6 w-6" /></span>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums text-navy">{value}</div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
function Numbered({ items, empty }: { items: (string | null | undefined)[]; empty: string }) {
  return (
    <ol className="space-y-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", t ? "bg-gold text-navy" : "bg-slate-100 text-slate-400")}>{i + 1}</span>
          <span className={cn("pt-1 text-sm leading-snug", t ? "text-slate-800" : "italic text-slate-400")}>{t || empty}</span>
        </li>
      ))}
    </ol>
  );
}
const dayLabel = (iso: string, today: string) => {
  const d = new Date(iso + "T00:00:00"), t = new Date(today + "T00:00:00");
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

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
  const [completing, setCompleting] = useState<Row | null>(null);
  const routineMade = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { rows: meRows } = useList(me ? "staff" : null, { filter: { id: me } });
  const { rows: attendance } = useList(me ? "attendance" : null, { filter: { date: today, staff_id: me } });
  const { rows: tasks, reload: reloadTasks } = useList(me ? "tasks" : null, { filter: { assigned_to: me } });
  const { rows: tickets } = useList("tickets");
  const { rows: bookings } = useList("bookings", { filter: unitId ? { business_unit_id: unitId } : {} });
  const { rows: reports } = useList("daily-reports", { filter: unitId ? { business_unit_id: unitId } : {}, sort: { field: "date", dir: "desc" }, limit: 1 });
  const { rows: units } = useList("business-units");
  const { rows: rests } = useList(me ? "rest-periods" : null, { filter: { date: today, staff_id: me } });
  const { rows: allStaff } = useList("staff");
  const { rows: payRows } = useList(me ? "staff-pay" : null, { filter: { staff_id: me } });
  const pay = payRows[0] ?? null;

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

  const profile: Row = meRows[0] ?? user.staff ?? ({} as Row);
  const att = attendance[0] ?? null;
  const routine = routineOf(profile);
  const shifts = shiftsOf(profile);
  const phase = phaseAt(profile, now);
  const rest = activeRest(rests, now);
  const restBy = rest ? String(allStaff.find((x) => x.id === rest.assigned_by)?.name ?? "your leader") : "";

  // Turn the daily routine into today's tasks once a day, so each one is completed with a stamped photo.
  useEffect(() => {
    if (!me || routineMade.current || !meRows[0] || routine.length === 0) return;
    routineMade.current = true;
    const existing = new Set(tasks.filter((t) => t.due === today && t.routine_key).map((t) => String(t.routine_key)));
    const missing = routine.filter((r) => !existing.has(`${r.time ?? ""}|${r.text}`));
    if (!missing.length) return;
    void Promise.all(
      missing.map((r) =>
        getStore().create("tasks", { title: r.text, business_unit_id: unitId, type: "Routine", priority: "Medium", assigned_to: me, due: today, status: "Open", points: 1, routine_key: `${r.time ?? ""}|${r.text}`, notes: r.time ? `Daily routine · ${r.time}` : "Daily routine", created_by: me }),
      ),
    ).then(() => reloadTasks()).catch(() => undefined);
  }, [me, meRows, routine, tasks, today, unitId, reloadTasks]);
  const open = tasks.filter((t) => t.status !== "Done");
  const myTasks = open.filter((t) => !t.due || String(t.due) <= today).sort((a, b) => String(a.due ?? "9").localeCompare(String(b.due ?? "9")));
  const upcoming = open.filter((t) => t.due && String(t.due) > today).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const upcomingByDay = upcoming.reduce<Record<string, Row[]>>((acc, t) => ((acc[String(t.due)] ??= []).push(t), acc), {});
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const myTickets = tickets.filter((t) => isOpenTicket(t) && (t.reported_by === me || t.assigned_to === me));
  const arrivals = bookings.filter((b) => b.check_in === today && (b.status === "Confirmed" || b.status === "Enquiry"));
  const departures = bookings.filter((b) => b.check_out === today && b.status === "Checked-in");
  const inHouse = bookings.filter((b) => b.status === "Checked-in");
  const report = reports[0] ?? null;
  const unitName = String(units.find((u) => u.id === unitId)?.name ?? "JD Group");
  const kpis = [1, 2, 3, 4, 5].map((i) => profile[`kpi_${i}`] as string | null);
  const kras = [1, 2, 3, 4, 5].map((i) => profile[`kra_${i}`] as string | null);
  const hour = now.getHours();

  const markDone = (t: Row) => setCompleting(t);
  const addTask = async () => {
    if (!draft.title.trim()) return toast("Give the task a title", "error");
    try {
      await getStore().create("tasks", { title: draft.title.trim(), business_unit_id: unitId, type: "Other", priority: draft.priority, assigned_to: me, due: draft.due || null, status: "Open", points: 1, created_by: me });
      setDraft({ title: "", priority: "Medium", due: today });
      setAdding(false);
      toast("Task added");
      await reloadTasks();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const taskRow = (t: Row, showDue: boolean) => {
    const overdue = t.due && String(t.due) < today;
    return (
      <li key={t.id} className="flex items-center gap-4 rounded-xl border border-line px-4 py-3.5 transition hover:border-navy/20 hover:bg-slate-50">
        <button type="button" onClick={() => markDone(t)} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700" aria-label={`Complete ${t.title}`}>📸 Complete</button>
        <Link href={viewHref("tasks", t.id)} className="min-w-0 flex-1">
          <span className="block font-medium text-navy">{String(t.title)}</span>
          <span className={cn("text-xs", overdue ? "font-medium text-red-600" : "text-slate-500")}>
            {showDue ? (t.due ? `${overdue ? "Overdue · " : ""}due ${formatDate(t.due)}` : "No due date") + " · " : ""}
            {String(t.type ?? "Task")} · {Number(t.points ?? 1)} pt
          </span>
        </Link>
        <Badge value={t.priority} />
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      {/* Welcome */}
      <section className="relative overflow-hidden rounded-3xl text-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoOfDay().url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-navy/95 via-navy/80 to-navy/40" />
        <div className="relative p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/70">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, {user.name.split(" ")[0]} 👋</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {profile.designation ? <span className="rounded-full bg-white/10 px-3 py-1">{String(profile.designation)}</span> : null}
              <span className="rounded-full bg-white/10 px-3 py-1">{unitName}</span>
              <span className="rounded-full bg-gold/90 px-3 py-1 font-semibold capitalize text-navy">{user.role}</span>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-4xl font-bold tabular-nums sm:text-5xl">{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
            <p className="mt-1 text-sm text-white/70">
              {att ? `${ATTENDANCE_LABELS[String(att.status)] ?? att.status}${att.checked_in_at ? ` · in ${formatDateTime(att.checked_in_at).slice(-8)}` : ""}${att.checked_out_at ? ` · out ${formatDateTime(att.checked_out_at).slice(-8)}` : ""}` : "Attendance not marked yet"}
            </p>
          </div>
        </div>
        <Link href="/attendance/checkin/" className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-6 py-4 text-base font-semibold text-navy shadow transition hover:brightness-105 sm:w-auto sm:inline-flex">
          <Camera className="h-5 w-5" /> {att?.checked_in_at ? (att.checked_out_at ? "View attendance" : "Check out") : "Mark attendance with selfie"}
        </Link>
        <p className="mt-4 text-xs text-white/60">📍 {photoOfDay().caption} · The Udaisarovar</p>
        </div>
      </section>

      {!me && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Your login is not linked to a staff record yet, so your tasks and role cannot be shown. Please ask the office to link it.
        </div>
      )}

      {rest && (
        <section className="flex items-center gap-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4">
          <span className="text-4xl">🌿</span>
          <div>
            <div className="text-lg font-semibold text-emerald-800">You are on rest time until {pretty(String(rest.end_time))}</div>
            <div className="text-sm text-emerald-700">{rest.note ? `${String(rest.note)} · ` : ""}given by {restBy}</div>
          </div>
        </section>
      )}

      {/* Daily task sheet */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-navy">📋 My daily task sheet</h2>
            <p className="text-xs text-slate-500">Your day every day — complete each job with a photo. If you are free, your leader may give you rest time.</p>
          </div>
          <span className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white">
            {phase === "before" ? `Day starts ${pretty(shifts.s1[0])}` : phase === "shift1" ? "Now: Shift 1" : phase === "break" ? "Now: Lunch & rest break" : phase === "shift2" ? "Now: Shift 2" : "Day finished"}
          </span>
        </header>
        <div className="grid gap-3 p-5 sm:p-6 md:grid-cols-3">
          {[
            { key: "s1", title: `Shift 1 · ${pretty(shifts.s1[0])} – ${pretty(shifts.s1[1])}`, active: phase === "shift1", items: open.concat(tasks.filter((t) => t.status === "Done" && t.due === today)).filter((t) => t.due === today && (!String(t.routine_key ?? "").split("|")[0] || String(t.routine_key).split("|")[0] < shifts.s1[1])) },
            { key: "br", title: `Break · ${pretty(shifts.s1[1])} – ${pretty(shifts.s2[0])}`, active: phase === "break", items: [] as Row[] },
            { key: "s2", title: `Shift 2 · ${pretty(shifts.s2[0])} – ${pretty(shifts.s2[1])}`, active: phase === "shift2", items: open.concat(tasks.filter((t) => t.status === "Done" && t.due === today)).filter((t) => t.due === today && String(t.routine_key ?? "").split("|")[0] >= shifts.s1[1]) },
          ].map((b) => (
            <div key={b.key} className={cn("rounded-2xl border-2 p-4", b.active ? "border-gold bg-gold/5" : "border-line", b.key === "br" && "bg-emerald-50/60")}>
              <div className="mb-3 flex items-center justify-between text-sm font-semibold text-navy">{b.title}{b.active && <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-navy">NOW</span>}</div>
              {b.key === "br" ? (
                <div className="space-y-2 text-sm text-emerald-800">
                  <p>🍽️ Lunch and rest — recharge for the evening.</p>
                  {rests.map((r) => <p key={r.id} className="rounded-lg bg-white px-3 py-2 text-xs">🌿 Extra rest {pretty(String(r.start_time))}–{pretty(String(r.end_time))}{r.note ? ` · ${r.note}` : ""}</p>)}
                </div>
              ) : b.items.length === 0 ? (
                <p className="text-xs text-slate-400">{routine.length ? "No jobs in this shift" : "Your daily routine will be added by your leader"}</p>
              ) : (
                <ul className="space-y-2">
                  {b.items.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="w-12 shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">{String(t.routine_key ?? "").split("|")[0] ? pretty(String(t.routine_key).split("|")[0]) : "today"}</span>
                      <span className={cn("min-w-0 flex-1 text-sm", t.status === "Done" ? "text-slate-400 line-through" : "text-navy")}>{String(t.title)}</span>
                      {t.status === "Done" ? <span className="text-emerald-600">✅</span> : <button type="button" onClick={() => markDone(t)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">📸 Done</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <AwardsBanner me={me} />

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={ClipboardList} href="/task-board/" label="Tasks today" value={myTasks.length} hint={myTasks.some((t) => t.due && String(t.due) < today) ? "some overdue" : "due today or earlier"} tone={myTasks.length ? "gold" : "green"} />
        <Tile icon={CalendarClock} href="/task-board/" label="Upcoming (7 days)" value={upcoming.filter((t) => String(t.due) <= in7).length} hint={upcoming.length ? `${upcoming.length} planned in total` : "nothing planned yet"} />
        <Tile icon={Wrench} label="Open tickets" value={myTickets.length} tone={myTickets.length ? "red" : "green"} href={listHref("tickets")} />
        <Tile icon={Trophy} label="My score today" value={score ? `${medal(score.rank, score.score)} ${score.score}`.trim() : "—"} hint={score ? `rank #${score.rank}` : undefined} tone="green" href="/scoreboard/" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: newHref("kots"), label: "New KOT order", icon: ChefHat },
          { href: "/pay-qr/", label: "Scan to pay QR", icon: QrCode },
          { href: newHref("purchases"), label: "Add purchase", icon: ShoppingCart },
          { href: "/report-issue/", label: "Report an issue", icon: Wrench },
        ].map((a) => (
          <Link key={a.label} href={a.href} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-4 text-sm font-medium text-navy shadow-sm transition hover:border-gold hover:shadow-md">
            <a.icon className="h-5 w-5 text-gold" /> {a.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {/* Today */}
          <Panel
            title={`Today's tasks${myTasks.length ? ` · ${myTasks.length}` : ""}`}
            subtitle="Due today, overdue or without a date — tick to complete"
            icon={ClipboardList}
            action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding((a) => !a)} disabled={!me}>Add</Button>}
          >
            {adding && (
              <form className="mb-4 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => { e.preventDefault(); void addTask(); }}>
                <Input autoFocus placeholder="What needs doing?" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
                <Select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className="sm:w-32">
                  {["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
                </Select>
                <Input type="date" value={draft.due} onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))} className="sm:w-40" />
                <Button type="submit" icon={Plus}>Add</Button>
              </form>
            )}
            {myTasks.length === 0 ? (
              <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700">{me ? "All clear for today 🎉" : "—"}</p>
            ) : (
              <ul className="space-y-2.5">{myTasks.map((t) => taskRow(t, true))}</ul>
            )}
          </Panel>

          {/* Upcoming */}
          <Panel title="Upcoming tasks" subtitle="Planned for you by your manager" icon={CalendarClock}>
            {upcoming.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No upcoming tasks yet.</p>
            ) : (
              <div className="space-y-5">
                {Object.entries(upcomingByDay).slice(0, 10).map(([day, list]) => (
                  <div key={day}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>{dayLabel(day, today)}</span><span className="h-px flex-1 bg-line" /><span>{formatDate(day)}</span>
                    </div>
                    <ul className="space-y-2.5">{list.map((t) => taskRow(t, false))}</ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Tickets */}
          <Panel title={`My tickets${myTickets.length ? ` · ${myTickets.length}` : ""}`} subtitle="Open issues I reported or am fixing" icon={Wrench}>
            {myTickets.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No open tickets.</p>
            ) : (
              <ul className="space-y-2.5">
                {myTickets.map((t) => (
                  <li key={t.id}>
                    <Link href={viewHref("tickets", t.id)} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3.5 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy">{String(t.title)}</span>
                        <span className="block truncate text-xs text-slate-500">{String(t.category ?? "")}{t.location ? ` · ${t.location}` : ""} · {formatDateTime(t.created_at)}</span>
                      </span>
                      <span className="flex shrink-0 gap-1"><Badge value={t.priority} /><Badge value={t.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/* My role */}
          <Panel title="My role" subtitle="Job description, KPIs and KRAs" icon={Briefcase} className="border-gold/40">
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Job description</h3>
                <p className={cn("whitespace-pre-line rounded-xl px-4 py-3 text-sm leading-relaxed", profile.job_description ? "bg-slate-50 text-slate-800" : "bg-slate-50 italic text-slate-400")}>
                  {(profile.job_description as string) || "Your job description will be added by management."}
                </p>
              </div>
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Target className="h-4 w-4 text-gold" /> My KPIs · how I&apos;m measured</h3>
                <Numbered items={kpis} empty="To be set by management" />
              </div>
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Flag className="h-4 w-4 text-gold" /> My KRAs · what I&apos;m responsible for</h3>
                <Numbered items={kras} empty="To be set by management" />
              </div>
            </div>
          </Panel>

          {/* My pay & rewards */}
          <Panel title="My pay & rewards" subtitle="Only you can see this" icon={Trophy} className="border-emerald-200">
            <div className="space-y-5">
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Monthly salary</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-navy">{pay?.monthly_salary != null ? `₹${Number(pay.monthly_salary).toLocaleString("en-IN")}` : "To be set"}</div>
                <div className="text-xs text-slate-500">{pay?.role_in_plan ? String(pay.role_in_plan) : "Your pay grade will be added by management"}</div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Earn more — bonus & incentives</h3>
                <ul className="space-y-2">
                  {INCENTIVES.map((x) => (
                    <li key={x.title} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
                      <span className="text-xl">{x.emoji}</span>
                      <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-navy">{x.title}</div><div className="text-xs text-slate-500">{x.rule}</div></div>
                      <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-1 text-xs font-bold text-amber-800">+₹{x.amount.toLocaleString("en-IN")}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-slate-400">Draft scheme — final amounts are decided by management.</p>
              </div>
            </div>
          </Panel>

          {/* Today's numbers */}
          <Panel title="Today at the property" subtitle={unitName} icon={CalendarClock} action={<Link href={listHref("bookings")} className="text-xs font-medium text-navy hover:underline">Bookings</Link>}>
            <div className="grid grid-cols-2 gap-3">
              {[["Arrivals", arrivals.length], ["Departures", departures.length], ["In house", inHouse.length], ["Occupancy", report?.occupancy_units != null ? String(report.occupancy_units) : "—"]].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-2xl font-bold tabular-nums text-navy">{v}</div>
                  <div className="text-xs text-slate-500">{l}</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Score */}
          <Panel title="My score today" subtitle="Task points + 2 × tickets + 5 × leads won + present − overdue" icon={Trophy} action={<Link href="/scoreboard/" className="text-xs font-medium text-navy hover:underline">Scoreboard</Link>}>
            <div className="grid grid-cols-2 gap-3">
              {[["Score", score ? score.score : "—"], ["Tasks done", score?.tasksDone ?? 0], ["Tickets resolved", score?.ticketsResolved ?? 0], ["Overdue", score?.tasksOverdue ?? 0]].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className={cn("text-2xl font-bold tabular-nums", l === "Overdue" && Number(v) > 0 ? "text-red-600" : "text-navy")}>{v}</div>
                  <div className="text-xs text-slate-500">{l}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <PropertyStrip />
      <CompleteTaskDialog task={completing} personName={String(profile.name ?? user.name)} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); void reloadTasks(); }} />
    </div>
  );
}
