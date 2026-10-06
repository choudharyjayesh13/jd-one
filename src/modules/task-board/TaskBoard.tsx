"use client";
/** /task-board — a clear, card-based board of tasks: Overdue · Today · Upcoming · Done. */
import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardList, Play, Plus, AlertTriangle, Undo2 } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { isAdmin } from "@/core/auth/access";
import { formatDate, todayISO } from "@/core/format";
import { newHref, viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { photoOfDay } from "@/core/ui/property";

const PRIORITY = {
  High: { bar: "bg-red-500", chip: "bg-red-50 text-red-700" },
  Medium: { bar: "bg-amber-400", chip: "bg-amber-50 text-amber-800" },
  Low: { bar: "bg-emerald-400", chip: "bg-emerald-50 text-emerald-700" },
} as Record<string, { bar: string; chip: string }>;

export function TaskBoard() {
  const user = useUser();
  const { toast } = useToast();
  const me = (user.staff?.id as string | undefined) ?? null;
  const manager = isAdmin(user.role);
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const today = todayISO();
  const { rows: all, reload } = useList("tasks", scope === "mine" && me ? { filter: { assigned_to: me } } : {});
  const { rows: staff } = useList("staff");
  const nameOf = (id: unknown) => String(staff.find((s) => s.id === id)?.name ?? "Unassigned");
  const weekAgo = new Date(new Date(today).getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const open = all.filter((t) => t.status !== "Done");
  const cols = [
    { id: "overdue", title: "Overdue", icon: AlertTriangle, tone: "text-red-600 bg-red-50", items: open.filter((t) => t.due && String(t.due) < today) },
    { id: "today", title: "Today", icon: ClipboardList, tone: "text-navy bg-gold/20", items: open.filter((t) => !t.due || String(t.due) === today) },
    { id: "upcoming", title: "Upcoming", icon: CalendarClock, tone: "text-navy bg-navy/5", items: open.filter((t) => t.due && String(t.due) > today).sort((a, b) => String(a.due).localeCompare(String(b.due))) },
    { id: "done", title: "Done (last 7 days)", icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50", items: all.filter((t) => t.status === "Done" && String(t.completed_at ?? "").slice(0, 10) >= weekAgo).sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))) },
  ];

  const setStatus = async (t: Row, status: string) => {
    try {
      await getStore().update("tasks", t.id, { status, completed_at: status === "Done" ? new Date().toISOString() : null });
      toast(status === "Done" ? `✅ Done: ${t.title} (+${Number(t.points ?? 1)} pt)` : status === "In progress" ? "Started" : "Moved back");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const card = (t: Row, col: string) => {
    const p = PRIORITY[String(t.priority ?? "Medium")] ?? PRIORITY.Medium;
    return (
      <li key={t.id} className="group relative overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <span className={cn("absolute inset-y-0 left-0 w-1.5", col === "done" ? "bg-emerald-400" : p.bar)} />
        <div className="space-y-3 py-4 pl-5 pr-4">
          <Link href={viewHref("tasks", t.id)} className={cn("block text-[15px] font-semibold leading-snug", col === "done" ? "text-slate-400 line-through" : "text-navy")}>{String(t.title)}</Link>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
            <span className={cn("rounded-full px-2 py-0.5", p.chip)}>{String(t.priority ?? "Medium")}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{String(t.type ?? "Task")}</span>
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-amber-800">⭐ {Number(t.points ?? 1)} pt</span>
            {t.due ? <span className={cn("rounded-full px-2 py-0.5", col === "overdue" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>📅 {formatDate(t.due)}</span> : null}
            {t.status === "In progress" && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">▶ In progress</span>}
          </div>
          {scope === "team" && <div className="text-xs text-slate-500">👤 {nameOf(t.assigned_to)}</div>}
          <div className="flex gap-2">
            {col === "done" ? (
              <button type="button" onClick={() => void setStatus(t, "Open")} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"><Undo2 className="h-3.5 w-3.5" /> Reopen</button>
            ) : (
              <>
                {t.status !== "In progress" && <button type="button" onClick={() => void setStatus(t, "In progress")} className="inline-flex items-center gap-1 rounded-lg bg-navy/5 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/10"><Play className="h-3.5 w-3.5" /> Start</button>}
                <button type="button" onClick={() => void setStatus(t, "Done")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Done</button>
              </>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl text-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoOfDay(1).url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/80 to-navy/30" />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <p className="text-sm text-white/70">Task board</p>
            <h1 className="mt-1 text-3xl font-bold">{scope === "mine" ? "My tasks" : "Team tasks"}</h1>
            <p className="mt-1 text-sm text-white/70">{cols[0].items.length} overdue · {cols[1].items.length} today · {cols[2].items.length} upcoming · {cols[3].items.length} done this week</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {manager && (
              <div className="flex rounded-full bg-white/10 p-1">
                {(["mine", "team"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setScope(s)} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", scope === s ? "bg-gold text-navy" : "text-white")}>{s === "mine" ? "My tasks" : "Whole team"}</button>
                ))}
              </div>
            )}
            <Link href={newHref("tasks", me && scope === "mine" ? { assigned_to: me } : undefined)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-gold"><Plus className="h-4 w-4" /> New task</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cols.map((c) => (
          <section key={c.id} className="rounded-2xl bg-slate-100/70 p-3">
            <header className="mb-3 flex items-center justify-between px-1">
              <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", c.tone)}><c.icon className="h-4 w-4" /> {c.title}</span>
              <span className="text-sm font-bold text-slate-500">{c.items.length}</span>
            </header>
            {c.items.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">{c.id === "overdue" ? "Nothing overdue 👏" : c.id === "done" ? "Finished tasks appear here" : "No tasks"}</p>
            ) : (
              <ul className="space-y-3">{c.items.slice(0, 40).map((t) => card(t, c.id))}</ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
