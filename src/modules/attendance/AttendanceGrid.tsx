"use client";
/**
 * Month grid: rows = staff, columns = days. Tapping a cell cycles
 * blank → P → A → H → L → blank and saves immediately.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { getStore } from "@/core/data";
import { currentMonth, formatMonth, monthRange, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { listHref } from "@/core/routes";
import { Input, Select } from "@/core/ui/Input";
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
  const { rows: staff, loading } = useList("staff", { filter: { ...(unit ? { business_unit_id: unit } : {}), active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: entries, reload } = useList("attendance", { range: { date: { gte: start, lte: end } } });
  const today = todayISO();

  const byKey = useMemo(() => new Map(entries.map((e) => [`${e.staff_id}|${e.date}`, e])), [entries]);
  const dayList = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

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
            {formatMonth(month)} · tap a cell to cycle P → A → H → L.{" "}
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
              {staff.map((s) => {
                const t = totals(s.id);
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1 font-medium text-navy">{String(s.name)}</td>
                    {dayList.map((d) => {
                      const st = String(byKey.get(`${s.id}|${d}`)?.status ?? "");
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button type="button" onClick={() => void cycle(s.id, d)} className={cn("h-7 w-7 rounded text-[11px] font-semibold", st ? cellTone[st] : "bg-slate-50 text-slate-300 hover:bg-slate-100", d > today && "opacity-60")} aria-label={`${s.name} ${d}`}>
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
              {staff.length === 0 && (
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
    </div>
  );
}
