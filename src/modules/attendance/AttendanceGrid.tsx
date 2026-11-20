"use client";
/**
 * Month grid: rows = staff, columns = days. Tapping a cell cycles
 * blank → P → A → H → L → blank and saves immediately.
 * Chairman / Director: tapping a cell opens the day instead – status, check-in and check-out time for any
 * date. The Director's changes go to the Chairman's "Director changes" list (database trigger).
 * Everyone who works here is listed, including group people (JD Group HQ), because everyone's salary runs on it.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { getStore } from "@/core/data";
import { currentMonth, formatDate, formatMonth, monthRange, calendarTodayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { listHref } from "@/core/routes";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import type { Row } from "@/core/schema/types";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { ATTENDANCE_STATUSES, ATTENDANCE_LABELS } from "./entity";

const CYCLE = ["", ...ATTENDANCE_STATUSES];
const cellTone: Record<string, string> = { P: "bg-emerald-100 text-emerald-800", A: "bg-red-100 text-red-800", H: "bg-amber-100 text-amber-800", L: "bg-sky-100 text-sky-800" };

export function AttendanceGrid() {
  const user = useUser();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [unit, setUnit] = useState(user.unitId ?? "");
  const { start, end, days } = monthRange(month);
  const { rows: units } = useList("business-units");
  const { rows: allStaff, loading } = useList("staff", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  // Group-level people (Director and others under "JD Group HQ") work across properties: show them under
  // every property's grid in their own section, so their attendance can be marked from any property.
  const hqIds = new Set(units.filter((u) => /\bhq\b|head ?office/i.test(String(u.name ?? ""))).map((u) => String(u.id)));
  const staff = allStaff.filter((s) => !unit || s.business_unit_id === unit);
  const hqStaff = unit && !hqIds.has(unit) ? allStaff.filter((s) => hqIds.has(String(s.business_unit_id ?? ""))) : [];
  const hqName = String(units.find((u) => hqIds.has(String(u.id)))?.name ?? "JD Group HQ");
  const { rows: entries, reload } = useList("attendance", { range: { date: { gte: start, lte: end } } });
  const today = calendarTodayISO();

  const byKey = useMemo(() => new Map(entries.map((e) => [`${e.staff_id}|${e.date}`, e])), [entries]);
  const dayList = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

  const [editing, setEditing] = useState<{ staff: Row; date: string } | null>(null);
  const tap = (s: Row, date: string) => (user.post ? setEditing({ staff: s, date }) : void cycle(String(s.id), date));
  const cycle = async (staffId: string, date: string) => {
    const existing = byKey.get(`${staffId}|${date}`);
    const next = CYCLE[(CYCLE.indexOf(String(existing?.status ?? "")) + 1) % CYCLE.length];
    try {
      const store = getStore();
      if (!next && existing) await store.remove("attendance", existing.id);
      else if (existing) await store.update("attendance", existing.id, { status: next });
      else await store.create("attendance", { staff_id: staffId, date, status: next, created_by: (user.staff?.id as string) ?? null });
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const totals = (staffId: string) => {
    const t: Record<string, number> = { P: 0, A: 0, H: 0, L: 0 };
    for (const d of dayList) {
      const s = String(byKey.get(`${staffId}|${d}`)?.status ?? "");
      if (s in t) t[s]++;
    }
    return t;
  };

  return (
    <div>
      <PageHeader
        title="Attendance grid"
        subtitle={
          <>
            {formatMonth(month)} · {user.post ? "tap a cell to set the day and its times." : "tap a cell to cycle P → A → H → L."}{" "}
            <Link href={listHref("attendance")} className="underline">
              List view
            </Link>
          </>
        }
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
            {!user.unitId && (
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto">
                <option value="">All units</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)}
                  </option>
                ))}
              </Select>
            )}
          </>
        }
      />
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600">
        {ATTENDANCE_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={cn("inline-block h-4 w-4 rounded text-center text-[10px] font-semibold leading-4", cellTone[s])}>{s}</span> {ATTENDANCE_LABELS[s]}
          </span>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Staff</th>
                {dayList.map((d) => (
                  <th key={d} className={cn("min-w-[30px] px-0.5 py-2 text-center font-medium text-slate-500", d === today && "bg-gold/20 text-navy")}>
                    {Number(d.slice(8))}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-slate-600">P/A/H/L</th>
              </tr>
            </thead>
            <tbody>
              {[...staff, ...(hqStaff.length ? [null] : []), ...hqStaff].map((s) => {
                if (!s)
                  return (
                    <tr key="hq-head" className="border-t-2 border-line bg-slate-50">
                      <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{hqName}</td>
                      <td colSpan={days + 1} />
                    </tr>
                  );
                const t = totals(s.id);
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1 font-medium text-navy">{String(s.name)}</td>
                    {dayList.map((d) => {
                      const st = String(byKey.get(`${s.id}|${d}`)?.status ?? "");
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button type="button" onClick={() => tap(s, d)} className={cn("h-7 w-7 rounded text-[11px] font-semibold", st ? cellTone[st] : "bg-slate-50 text-slate-300 hover:bg-slate-100", d > today && "opacity-60")} aria-label={`${s.name} ${d}`}>
                            {st || "·"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-2 text-center tabular-nums text-slate-600">
                      {t.P}/{t.A}/{t.H}/{t.L}
                    </td>
                  </tr>
                );
              })}
              {staff.length === 0 && hqStaff.length === 0 && (
                <tr>
                  <td colSpan={days + 2} className="px-3 py-6 text-center text-slate-500">
                    No active staff{unit ? " in this unit" : ""}. Add them under Staff.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <DayDialog
          staff={editing.staff}
          date={editing.date}
          entry={byKey.get(`${editing.staff.id}|${editing.date}`) ?? null}
          byStaffId={(user.staff?.id as string) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

const timeOf = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "");
const stamp = (date: string, hhmm: string) => (hhmm ? new Date(`${date}T${hhmm}:00+05:30`).toISOString() : null);

/** Chairman / Director: one person's day – status, check-in and check-out time – for any date. */
function DayDialog({ staff, date, entry, byStaffId, onClose, onSaved }: { staff: Row; date: string; entry: Row | null; byStaffId: string | null; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useToast();
  const [status, setStatus] = useState(String(entry?.status ?? "P"));
  const [inT, setInT] = useState(timeOf(entry?.checked_in_at));
  const [outT, setOutT] = useState(timeOf(entry?.checked_out_at));
  const [remarks, setRemarks] = useState(String(entry?.remarks ?? ""));
  const [busy, setBusy] = useState(false);
  const save = async (clear = false) => {
    if (!clear && inT && outT && outT < inT && !(await confirm("Check-out is before check-in. Save anyway (night shift)?", "Save"))) return;
    setBusy(true);
    try {
      const store = getStore();
      if (clear) {
        if (entry) await store.remove("attendance", entry.id);
      } else {
        const v = { status, checked_in_at: status === "P" || status === "H" ? stamp(date, inT) : null, checked_out_at: status === "P" || status === "H" ? stamp(date, outT) : null, remarks: remarks.trim() || null };
        if (entry) await store.update("attendance", entry.id, v);
        else await store.create("attendance", { staff_id: staff.id, date, created_by: byStaffId, ...v });
      }
      toast(`${String(staff.name)} · ${formatDate(date)} saved`, "success");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`${String(staff.name)} · ${formatDate(date)}`}>
      <div className="flex flex-col gap-4">
        <Field label="Day">
          <div className="grid grid-cols-4 gap-2">
            {ATTENDANCE_STATUSES.map((st) => (
              <button key={st} type="button" onClick={() => setStatus(st)} className={cn("rounded-lg border px-2 py-2 text-sm font-medium", status === st ? "border-navy bg-navy text-white" : "border-line bg-white text-navy")}>
                {ATTENDANCE_LABELS[st] ?? st}
              </button>
            ))}
          </div>
        </Field>
        {(status === "P" || status === "H") && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-in time">
              <Input type="time" value={inT} onChange={(e) => setInT(e.target.value)} />
            </Field>
            <Field label="Check-out time">
              <Input type="time" value={outT} onChange={(e) => setOutT(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Remark (optional)">
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          {entry ? (
            <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>
              Clear day
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
