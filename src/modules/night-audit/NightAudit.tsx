"use client";
/**
 * Reports → Night audit (/night-audit/). Front Office (or the Chairman / Director)
 * closes the day: checks what still needs attention, sees which departments have
 * submitted their report, adds a note and presses "Close day". The whole day is
 * saved as one report (summary + every department) to print / save as PDF / share.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, MoonStar } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate, formatDateTime, todayISO } from "@/core/format";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Field, Textarea } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { cn } from "@/core/ui/cn";
import { REPORT_DEPARTMENTS, collectDay, type DayData } from "./collect";
import { SectionView, canNightAudit } from "./ReportView";
import { DateBar } from "./DeptReports";

export function NightAudit() {
  const user = useUser();
  const { toast, confirm } = useToast();
  const [date, setDate] = useState(todayISO());
  const { rows: audits, loading: aLoading, reload } = useList("night-audits", { sort: { field: "date", dir: "desc" }, limit: 60 });
  const { rows: reports } = useList("dept-reports", { filter: { date } });
  const { rows: staff } = useList("staff");
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, String(s.name)])), [staff]);
  const [data, setData] = useState<DayData | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = audits.find((a) => String(a.date) === date) ?? null;

  useEffect(() => {
    setData(null);
    if (closed) return;
    let live = true;
    void collectDay(date, user.unitId).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [date, closed, user.unitId]);

  if (!canNightAudit(user)) return <NoAccess />;

  const byDept = new Map(reports.map((r) => [String(r.department), r]));
  const missing = REPORT_DEPARTMENTS.filter((d) => !byDept.has(d.id));
  const warnings = data ? REPORT_DEPARTMENTS.flatMap((d) => (data[d.id]?.alerts ?? []).map((a) => ({ dept: d.title, text: a }))) : [];

  const close = async () => {
    if (!data) return;
    const issues = warnings.length + missing.length;
    if (issues && !(await confirm(`${issues} item${issues === 1 ? "" : "s"} still need attention (see the list). Close the day anyway? The report keeps these warnings.`, "Close day"))) return;
    setBusy(true);
    try {
      // Department notes go into the audit as they were when the day was closed.
      const notes: Record<string, { notes: string; by: string; at: string }> = {};
      for (const r of reports) notes[String(r.department)] = { notes: String(r.notes ?? ""), by: staffName.get(String(r.submitted_by)) ?? "", at: String(r.submitted_at ?? "") };
      await getStore().create("night-audits", {
        date,
        data: { sections: data, deptNotes: notes, missing: missing.map((d) => d.title) },
        warnings: warnings.map((w) => `${w.dept}: ${w.text}`),
        notes: note.trim() || null,
        closed_by: user.staff?.id ?? null,
        closed_at: new Date().toISOString(),
        business_unit_id: user.unitId,
      });
      toast(`Night audit closed for ${formatDate(date)}.`, "success");
      await reload();
    } catch (e) {
      toast(`Could not close the day: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Night audit"
        subtitle="Close the day · one report for all departments"
        actions={
          <Link href="/reports/day/">
            <Button variant="secondary" icon={FileText}>
              Department reports
            </Button>
          </Link>
        }
      />
      <DateBar date={date} setDate={setDate} />

      {closed ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 font-medium text-emerald-800">
            <CheckCircle2 className="h-5 w-5" /> Day closed · {formatDate(date)}
          </p>
          <p className="text-sm text-emerald-900">
            Closed by {staffName.get(String(closed.closed_by)) ?? "—"} at {formatDateTime(closed.closed_at)}
          </p>
          <div>
            <Link href={`/night-audit/view/?date=${date}`}>
              <Button icon={MoonStar}>Open the night audit report</Button>
            </Link>
          </div>
        </div>
      ) : !data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="jd-serif mb-2 text-2xl font-semibold text-navy">Department reports</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {REPORT_DEPARTMENTS.map((d) => {
                const r = byDept.get(d.id);
                return (
                  <li key={d.id} className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm", r ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60")}>
                    <span className="font-medium text-navy">{d.title}</span>
                    <span className={cn("text-xs", r ? "text-emerald-700" : "text-amber-700")}>{r ? staffName.get(String(r.submitted_by)) ?? "Submitted" : "Not submitted"}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="jd-serif mb-2 flex items-center gap-2 text-2xl font-semibold text-navy">
              Checks before closing {warnings.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-sm font-medium text-amber-800">{warnings.length}</span>}
            </h2>
            {warnings.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Everything is in order.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {warnings.map((w, i) => (
                  <li key={i} className="flex gap-2 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <b className="font-medium">{w.dept}:</b> {w.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="rounded-xl border border-line bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium text-navy">Preview today&apos;s figures (all departments)</summary>
            <div className="mt-3 flex flex-col gap-3">
              {REPORT_DEPARTMENTS.map((d) => data[d.id] && <SectionView key={d.id} s={data[d.id]!} note={String(byDept.get(d.id)?.notes ?? "") || undefined} compact />)}
            </div>
          </details>

          <section className="rounded-xl border border-line bg-white p-4">
            <Field label="Night auditor's note" help="Summary of the day, cash handed over, anything for the morning team.">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="mt-3 flex justify-end">
              <Button icon={MoonStar} loading={busy} onClick={() => void close()}>
                Close day &amp; create night audit
              </Button>
            </div>
          </section>
        </div>
      )}

      <section className="mt-8">
        <h2 className="jd-serif mb-2 text-2xl font-semibold text-navy">Past night audits</h2>
        {aLoading ? (
          <Loading />
        ) : audits.length === 0 ? (
          <p className="text-sm text-slate-500">No day has been closed yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-line bg-white">
            {audits.map((a: Row) => (
              <li key={a.id} className="border-b border-line last:border-0">
                <Link href={`/night-audit/view/?date=${String(a.date)}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className="font-medium text-navy">{formatDate(a.date)}</span>
                  <span className="text-xs text-slate-500">
                    {staffName.get(String(a.closed_by)) ?? "—"} · {Array.isArray(a.warnings) ? `${(a.warnings as unknown[]).length} warnings` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
