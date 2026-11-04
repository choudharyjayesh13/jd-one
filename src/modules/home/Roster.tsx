"use client";
/**
 * HR → Shift roster (/roster/). A week at a glance: every staff member's shifts for each day.
 * A day follows the person's usual shifts (set on their staff record) unless HR changes it
 * here – to other timings or a day off. My Day shows each person their shift from this roster.
 */
import { leaveOn } from "@/modules/leave/entity";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { moduleLevel } from "@/core/auth/access";
import { addDays, calendarTodayISO } from "@/core/format";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { cn } from "@/core/ui/cn";
import { pretty, shiftsOf } from "@/modules/attendance/shifts";

const weekStart = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7)); // Monday
};
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const short = (t: string) => pretty(t).replace(":00", "").replace(" ", "");

/** The shifts a person works on `date`: the roster entry if there is one, else their usual shifts. */
export function shiftsForDay(staff: Row | null | undefined, roster: Row | null | undefined) {
  const usual = shiftsOf(staff);
  if (!roster) return { off: false, changed: false, ...usual };
  if (roster.off) return { off: true, changed: true, ...usual };
  const r = shiftsOf({ ...staff, ...Object.fromEntries(["shift1_start", "shift1_end", "shift2_start", "shift2_end"].map((k) => [k, roster[k] || staff?.[k]])) } as Row);
  return { off: false, changed: true, ...r };
}

export function Roster() {
  const user = useUser();
  const { toast } = useToast();
  const [start, setStart] = useState(weekStart(calendarTodayISO()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const { rows: staffRows, loading } = useList("staff", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: roster, error, reload } = useList("shift-roster", { range: { date: { gte: days[0], lte: days[6] } } });
  const { rows: leaves } = useList("leave-requests", { filter: { status: "Approved" }, range: { date_to: { gte: days[0] } } });
  const [edit, setEdit] = useState<{ staff: Row; date: string; row: Row | null } | null>(null);
  const [form, setForm] = useState({ off: false, s1a: "", s1b: "", s2a: "", s2b: "", note: "", week: false });
  const [busy, setBusy] = useState(false);

  const lvl = moduleLevel("attendance");
  const canEdit = !!user.post || (lvl === null ? ["owner", "manager", "hr"].includes(user.role) : lvl >= 2);
  const canView = canEdit || (lvl ?? 1) >= 1;
  if (!canView) return <NoAccess />;

  const staff = staffRows.filter((s) => s.role !== "owner");
  const cell = (sid: string, date: string) => roster.find((r) => String(r.staff_id) === sid && String(r.date) === date) ?? null;

  const open = (s: Row, date: string) => {
    if (!canEdit) return;
    const row = cell(s.id, date);
    const sh = shiftsForDay(s, row);
    setForm({ off: sh.off, s1a: sh.s1[0], s1b: sh.s1[1], s2a: sh.s2[0], s2b: sh.s2[1], note: String(row?.note ?? ""), week: false });
    setEdit({ staff: s, date, row });
  };

  const save = async (mode: "save" | "usual") => {
    if (!edit) return;
    setBusy(true);
    try {
      const store = getStore();
      const targets = form.week ? days : [edit.date];
      for (const date of targets) {
        const row = cell(edit.staff.id, date);
        if (mode === "usual") {
          if (row) await store.remove("shift-roster", row.id);
          continue;
        }
        const payload = { staff_id: edit.staff.id, date, off: form.off, shift1_start: form.off ? null : form.s1a, shift1_end: form.off ? null : form.s1b, shift2_start: form.off ? null : form.s2a || null, shift2_end: form.off ? null : form.s2b || null, note: form.note.trim() || null };
        if (row) await store.update("shift-roster", row.id, payload);
        else await store.create("shift-roster", payload);
      }
      await reload();
      setEdit(null);
      toast("Roster saved.", "success");
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Shift roster" subtitle="Each person's shifts, day by day · tap a day to change it" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-navy">
          {dayName(days[0])} – {dayName(days[6])}
        </span>
        <Button variant="secondary" size="sm" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {start !== weekStart(calendarTodayISO()) && (
          <Button variant="ghost" size="sm" onClick={() => setStart(weekStart(calendarTodayISO()))}>
            This week
          </Button>
        )}
      </div>
      {error && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">The roster table is not in the database yet – everyone follows their usual shifts. Run the latest database update to make changes.</p>}
      {loading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium">Staff</th>
                {days.map((d) => (
                  <th key={d} className={cn("px-2 py-2 text-center font-medium", d === calendarTodayISO() && "text-navy")}>
                    {dayName(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2">
                    <span className="block font-medium text-navy">{String(s.name)}</span>
                    <span className="block text-xs text-slate-500">{String(s.designation ?? "")}</span>
                  </td>
                  {days.map((d) => {
                    const sh = shiftsForDay(s, cell(s.id, d));
                    const lv = leaveOn(leaves, s.id, d);
                    if (lv)
                      return (
                        <td key={d} className="px-1.5 py-1.5 text-center">
                          <span title={String(lv.reason ?? "")} className="block w-full rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1.5 text-[11px] font-medium leading-tight text-amber-800">
                            {String(lv.kind) === "Half day" ? "Half day" : "On leave"}
                          </span>
                        </td>
                      );
                    return (
                      <td key={d} className="px-1.5 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => open(s, d)}
                          className={cn(
                            "w-full rounded-md border px-1.5 py-1.5 text-[11px] leading-tight",
                            sh.off ? "border-slate-200 bg-slate-100 text-slate-500" : sh.changed ? "border-[#d4bf96] bg-[#faf5ea] text-navy" : "border-transparent text-slate-600 hover:border-line",
                          )}
                        >
                          {sh.off ? (
                            "Off"
                          ) : (
                            <>
                              {short(sh.s1[0])}–{short(sh.s1[1])}
                              <br />
                              {short(sh.s2[0])}–{short(sh.s2[1])}
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Plain = usual shifts from the staff record · gold = changed for that day · grey = day off.</p>

      {edit && (
        <Dialog open onClose={() => setEdit(null)} title={`${String(edit.staff.name)} · ${dayName(edit.date)}`}>
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm text-navy">
              <input type="checkbox" className="h-4 w-4 accent-[#17140f]" checked={form.off} onChange={(e) => setForm((f) => ({ ...f, off: e.target.checked }))} /> Day off
            </label>
            {!form.off && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Shift 1 starts">
                  <Input type="time" value={form.s1a} onChange={(e) => setForm((f) => ({ ...f, s1a: e.target.value }))} />
                </Field>
                <Field label="Shift 1 ends">
                  <Input type="time" value={form.s1b} onChange={(e) => setForm((f) => ({ ...f, s1b: e.target.value }))} />
                </Field>
                <Field label="Shift 2 starts">
                  <Input type="time" value={form.s2a} onChange={(e) => setForm((f) => ({ ...f, s2a: e.target.value }))} />
                </Field>
                <Field label="Shift 2 ends">
                  <Input type="time" value={form.s2b} onChange={(e) => setForm((f) => ({ ...f, s2b: e.target.value }))} />
                </Field>
              </div>
            )}
            <Field label="Note (optional)">
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Covering for Sunder" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-[#17140f]" checked={form.week} onChange={(e) => setForm((f) => ({ ...f, week: e.target.checked }))} /> Apply to the whole week
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              {edit.row && (
                <Button variant="ghost" loading={busy} onClick={() => void save("usual")}>
                  Back to usual shifts
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button loading={busy} onClick={() => void save("save")}>
                Save
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
