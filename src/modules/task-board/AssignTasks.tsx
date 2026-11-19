"use client";
/**
 * HR → Assign tasks (/assign-tasks/). One place to give work to every staff member.
 * Who can use it: the Chairman, the Director, the Property Supervisor and the Task Manager
 * (a post the Chairman or Director gives to one person, chosen at the top of this page).
 * A task given here shows on that person's My Day under Today's tasks; they finish it with
 * a time-stamped photo, as before.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, UserCog } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { addDays, calendarTodayISO, formatDate } from "@/core/format";
import { viewHref } from "@/core/routes";
import { NoAccess } from "@/core/ui/AuthGate";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { useHoldsPost, useIsPropertySupervisor } from "@/modules/night-audit/access";

const TYPES = ["Routine", "Room making", "Cleaning", "Maintenance", "Housekeeping", "Purchase", "Follow-up", "Other"];
const PRIORITY_TONE: Record<string, string> = { High: "bg-red-500", Medium: "bg-amber-400", Low: "bg-emerald-400" };

export function useCanAssignTasks() {
  const user = useUser();
  const sup = useIsPropertySupervisor(user);
  const tm = useHoldsPost(user, "task_manager");
  return !!user.post || sup || tm;
}

export function AssignTasks() {
  const user = useUser();
  const { toast } = useToast();
  const allowed = useCanAssignTasks();
  const today = calendarTodayISO();
  const [view, setView] = useState<"today" | "overdue" | "upcoming">("today");
  const { rows: staffRows, loading } = useList("staff", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: tasks } = useList("tasks", { range: { due: { gte: addDays(today, -30), lte: addDays(today, 30) } } });
  const { rows: posts } = useList("org-posts", { filter: { post: "task_manager" } });
  const tmRow = posts[0];
  const [picking, setPicking] = useState(false);
  const [form, setForm] = useState({ title: "", who: [] as string[], due: today, priority: "Medium", type: "Other", points: "1", notes: "" });
  const [busy, setBusy] = useState(false);
  const staff = staffRows.filter((s) => s.role !== "owner");

  const inView = (t: Row) => {
    const due = String(t.due ?? "");
    if (view === "today") return due === today;
    if (view === "overdue") return due < today && t.status !== "Done";
    return due > today;
  };
  const byPerson = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const t of tasks.filter(inView)) m.set(String(t.assigned_to ?? ""), [...(m.get(String(t.assigned_to ?? "")) ?? []), t]);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, view, today]);

  if (!allowed) return <NoAccess />;

  const toggle = (id: string) => setForm((f) => ({ ...f, who: f.who.includes(id) ? f.who.filter((x) => x !== id) : [...f.who, id] }));
  const save = async () => {
    if (form.title.trim().length < 3) return toast("Write what has to be done", "error");
    if (!form.who.length) return toast("Choose at least one person", "error");
    setBusy(true);
    try {
      for (const id of form.who) {
        const s = staff.find((x) => x.id === id);
        await getStore().create("tasks", {
          title: form.title.trim(),
          business_unit_id: s?.business_unit_id ?? user.unitId,
          type: form.type,
          priority: form.priority,
          assigned_to: id,
          due: form.due || null,
          status: "Open",
          points: Number(form.points) || 1,
          notes: [form.notes.trim(), `Given by ${user.name}`].filter(Boolean).join("\n"),
          created_by: user.staff?.id ?? null,
        });
      }
      toast(`Task given to ${form.who.length} ${form.who.length === 1 ? "person" : "people"} – it is on their My Day`, "success");
      setForm((f) => ({ ...f, title: "", who: [], notes: "" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Assign tasks"
        subtitle="Give work to any staff member · it shows on their My Day"
        actions={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Task manager:</span>
            <span className="font-medium text-navy">{String(tmRow?.holder_name ?? "Not chosen")}</span>
            {!!user.post && (
              <Button size="sm" variant="secondary" icon={UserCog} onClick={() => setPicking(true)}>
                Change
              </Button>
            )}
          </div>
        }
      />

      {/* New task */}
      <section className="mb-6 rounded-xl border border-line bg-white p-5">
        <h2 className="jd-serif mb-3 text-xl font-semibold text-navy">New task</h2>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <Field label="What has to be done" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Deep clean Cottage 3 before 2 pm" />
          </Field>
          <Field label="By">
            <Input type="date" value={form.due} min={today} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {["High", "Medium", "Low"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium text-navy">
            Give to <span className="text-red-600">*</span> <span className="font-normal text-slate-500">· tap one or more · {form.who.length} chosen</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={cn("rounded-full border px-3 py-1.5 text-sm", form.who.includes(s.id) ? "border-[#17140f] bg-[#17140f] text-white" : "border-line bg-white text-slate-700 hover:border-slate-400")}
              >
                {String(s.name)}
                {s.designation ? <span className={cn("ml-1 text-xs", form.who.includes(s.id) ? "text-white/60" : "text-slate-400")}>· {String(s.designation).toLowerCase()}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px]">
          <Field label="Details (optional)">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <Field label="Points">
            <Input type="number" min={0} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={Plus} loading={busy} onClick={() => void save()}>
            Give task
          </Button>
        </div>
      </section>

      {/* Team */}
      <div className="mb-3 flex w-fit overflow-hidden rounded-lg border border-line bg-white text-sm">
        {(
          [
            ["today", "Today"],
            ["overdue", "Overdue"],
            ["upcoming", "Coming up"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={cn("h-9 px-4", view === k ? "bg-[#17140f] font-medium text-white" : "text-navy hover:bg-slate-50")}>
            {l}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {staff.map((s) => {
            const list = byPerson.get(s.id) ?? [];
            const done = list.filter((t) => t.status === "Done").length;
            return (
              <article key={s.id} className="rounded-xl border border-line bg-white p-4">
                <header className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy">{String(s.name)}</p>
                    <p className="truncate text-xs text-slate-500">{String(s.designation ?? "")}</p>
                  </div>
                  <span className={cn("shrink-0 text-xs", list.length && done === list.length ? "text-emerald-700" : "text-slate-500")}>
                    {list.length ? `${done} of ${list.length} done` : "No tasks"}
                  </span>
                </header>
                <ul className="flex flex-col gap-1.5">
                  {list.slice(0, 8).map((t) => (
                    <li key={t.id}>
                      <Link href={viewHref("tasks", t.id)} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_TONE[String(t.priority)] ?? "bg-slate-300")} />
                        <span className={cn("min-w-0 flex-1 truncate", t.status === "Done" ? "text-slate-400 line-through" : "text-slate-700")}>{String(t.title)}</span>
                        {view !== "today" && <span className="shrink-0 text-[11px] text-slate-400">{formatDate(t.due)}</span>}
                      </Link>
                    </li>
                  ))}
                  {list.length > 8 && <li className="px-1.5 text-xs text-slate-500">+{list.length - 8} more</li>}
                </ul>
                <button type="button" onClick={() => setForm((f) => ({ ...f, who: [s.id] }))} className="mt-2 text-xs font-medium text-[#9a7128] hover:underline">
                  + Task for {String(s.name).split(" ")[0]}
                </button>
              </article>
            );
          })}
        </div>
      )}
      {picking && tmRow && <PickManager row={tmRow} staff={staff} onClose={() => setPicking(false)} />}
    </div>
  );
}

function PickManager({ row, staff, onClose }: { row: Row; staff: Row[]; onClose: () => void }) {
  const { toast } = useToast();
  const [id, setId] = useState(String(staff.find((s) => String(s.email ?? "").toLowerCase() === String(row.email ?? "").toLowerCase())?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const s = staff.find((x) => x.id === id);
    if (s && !s.email) return toast(`${String(s.name)} has no login email yet`, "error");
    setBusy(true);
    try {
      await getStore().update("org-posts", row.id, { holder_name: s ? String(s.name) : null, email: s ? String(s.email).toLowerCase() : null });
      toast(s ? `${String(s.name)} is now the Task manager` : "No Task manager now", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Task manager">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">The Task manager can give tasks to every staff member from this page. The Chairman, the Director and the Property Supervisor can always do it.</p>
        <Field label="Person">
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Nobody</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {String(s.name)} {s.designation ? `· ${String(s.designation)}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
