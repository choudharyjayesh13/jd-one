"use client";
/**
 * Reports → Report duty (/reports/duty/). The Director, the Chairman and the Property
 * Supervisor tick who sends which department's end-of-day report, and who runs the
 * night audit (the night auditor can send every department's report).
 * Stored in jdone.staff_access as "report-<department>" and "night-audit" (level 2).
 */
import { useMemo, useState } from "react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Loading, PageHeader } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { cn } from "@/core/ui/cn";
import { NIGHT_AUDIT_KEY, REPORT_DEPARTMENTS, reportKey, useCanAssignReports } from "./access";

const KEYS = [NIGHT_AUDIT_KEY, ...REPORT_DEPARTMENTS.map((d) => reportKey(d.id))];

export function ReportDuty() {
  const user = useUser();
  const { toast } = useToast();
  const canAssign = useCanAssignReports(user);
  const { rows: staffRows, loading } = useList("staff", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: access, reload } = useList("staff-access");
  const [draft, setDraft] = useState<Record<string, Set<string>> | null>(null);
  const [busy, setBusy] = useState(false);

  const staff = staffRows.filter((s) => s.role !== "owner");
  const saved = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of access) if (KEYS.includes(String(r.module)) && Number(r.level) >= 2) (m[String(r.staff_id)] ??= new Set()).add(String(r.module));
    return m;
  }, [access]);
  const cur = draft ?? saved;
  const has = (sid: string, key: string) => !!cur[sid]?.has(key);
  const dirty = draft !== null;

  const toggle = (sid: string, key: string) =>
    setDraft((d) => {
      const base = d ?? Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, new Set(v)]));
      const set = new Set(base[sid] ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...base, [sid]: set };
    });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const store = getStore();
      for (const s of staff) {
        const want = draft[s.id] ?? new Set<string>();
        const mine = access.filter((r: Row) => String(r.staff_id) === s.id);
        for (const key of KEYS) {
          const row = mine.find((r) => String(r.module) === key);
          if (want.has(key) && !row) await store.create("staff-access", { staff_id: s.id, module: key, level: 2, created_by: user.staff?.id ?? null });
          else if (want.has(key) && row && Number(row.level) < 2) await store.update("staff-access", row.id, { level: 2 });
          else if (!want.has(key) && row) await store.remove("staff-access", row.id);
        }
      }
      await reload();
      setDraft(null);
      toast("Report duty saved.", "success");
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!canAssign) return <NoAccess />;

  return (
    <div>
      <PageHeader
        title="Report duty"
        subtitle="Who sends which department's report at night, and who closes the day (night audit)"
        actions={
          <div className="flex gap-2">
            {dirty && (
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Undo
              </Button>
            )}
            <Button loading={busy} disabled={!dirty} onClick={() => void save()}>
              Save
            </Button>
          </div>
        }
      />
      <p className="mb-4 text-sm text-slate-600">
        Tick <b>Night audit</b> for the person who closes the day – they can send every department&apos;s report. Tick single departments for everyone else.
        Only the Director, the Chairman and the Property Supervisor can change this.
      </p>
      {loading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium">Staff</th>
                <th className="px-2 py-2 text-center font-semibold text-navy">Night audit</th>
                {REPORT_DEPARTMENTS.map((d) => (
                  <th key={d.id} className="px-2 py-2 text-center font-medium">
                    {d.title.replace(" (Kitchen)", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const auditor = has(s.id, NIGHT_AUDIT_KEY);
                return (
                  <tr key={s.id} className={cn("border-b border-line last:border-0", auditor && "bg-[#faf5ea]")}>
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-2">
                      <span className="block font-medium text-navy">{String(s.name)}</span>
                      <span className="block text-xs text-slate-500">{String(s.designation ?? "")}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" aria-label={`${String(s.name)} – night audit`} className="h-5 w-5 accent-[#17140f]" checked={auditor} onChange={() => toggle(s.id, NIGHT_AUDIT_KEY)} />
                    </td>
                    {REPORT_DEPARTMENTS.map((d) => (
                      <td key={d.id} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${String(s.name)} – ${d.title}`}
                          className="h-4 w-4 accent-[#17140f] disabled:opacity-40"
                          checked={auditor || has(s.id, reportKey(d.id))}
                          disabled={auditor}
                          onChange={() => toggle(s.id, reportKey(d.id))}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
