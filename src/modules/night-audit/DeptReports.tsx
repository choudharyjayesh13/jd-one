"use client";
/**
 * Reports → Department reports (/reports/day/). Nobody types a report: the system builds
 * each department's operations report from everything entered that day by every ID in
 * the department (check-ins, bookings, KOTs, cleaning, stock, payments…). At night the
 * person on duty opens it, checks it and presses "Send report" (a remark is optional);
 * the report is saved as it was and goes into the night audit.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, FilePlus2, Eye, RefreshCw } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { addDays, formatDate, formatDateTime, todayISO } from "@/core/format";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input, Textarea } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { REPORT_DEPARTMENTS, collectDay, deptTitle, type Section } from "./collect";
import { SectionView, canNightAudit, reportDepartments } from "./ReportView";
import { useCanAssignReports } from "./access";

export function DeptReports() {
  const user = useUser();
  const { toast } = useToast();
  const [date, setDate] = useState(todayISO());
  const { rows: reports, loading, reload } = useList("dept-reports", { filter: { date } });
  const { rows: staff } = useList("staff");
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, String(s.name)])), [staff]);
  const mine = reportDepartments(user);
  const canAssign = useCanAssignReports(user);
  const [open, setOpen] = useState<{ dept: string; section: Section | null; existing: Row | null; view: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!mine.length)
    return canAssign ? (
      <div className="mx-auto mt-16 max-w-md text-center">
        <p className="mb-4 text-sm text-slate-600">No report duty is set for you. Assign who sends which report in Report duty.</p>
        <Link href="/reports/duty/">
          <Button>Open Report duty</Button>
        </Link>
      </div>
    ) : (
      <NoAccess />
    );
  const byDept = new Map(reports.map((r) => [String(r.department), r]));

  const start = async (dept: string, view: boolean) => {
    const existing = byDept.get(dept) ?? null;
    setNote(String(existing?.notes ?? ""));
    if (view && existing) {
      setOpen({ dept, section: (existing.data as Section) ?? null, existing, view: true });
      return;
    }
    setOpen({ dept, section: null, existing, view: false });
    const data = await collectDay(date, user.unitId);
    setOpen((o) => (o && o.dept === dept ? { ...o, section: data[dept] ?? null } : o));
  };

  const submit = async () => {
    if (!open?.section) return;
    setBusy(true);
    try {
      const payload = {
        date,
        department: open.dept,
        data: open.section,
        notes: note.trim() || null,
        submitted_by: user.staff?.id ?? null,
        submitted_at: new Date().toISOString(),
        business_unit_id: user.unitId,
      };
      if (open.existing) await getStore().update("dept-reports", open.existing.id, payload);
      else await getStore().create("dept-reports", payload);
      toast(`${deptTitle(open.dept)} report sent for ${formatDate(date)}.`, "success");
      setOpen(null);
      await reload();
    } catch (e) {
      toast(`Could not send: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const depts = REPORT_DEPARTMENTS.filter((d) => mine.includes(d.id));
  const done = depts.filter((d) => byDept.has(d.id)).length;

  return (
    <div>
      <PageHeader
        title="Department reports"
        subtitle={`Made by the system from the day's entries · ${done} of ${depts.length} sent`}
        actions={
          <div className="flex gap-2">
            {canAssign && (
              <Link href="/reports/duty/">
                <Button variant="secondary">Report duty</Button>
              </Link>
            )}
            {canNightAudit(user) && (
              <Link href="/night-audit/">
                <Button variant="secondary">Night audit</Button>
              </Link>
            )}
          </div>
        }
      />
      <DateBar date={date} setDate={setDate} />

      {loading ? (
        <Loading />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {depts.map((d) => {
            const r = byDept.get(d.id);
            return (
              <li key={d.id} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="jd-serif text-xl font-semibold text-navy">{d.title}</p>
                    {r ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Sent by {staffName.get(String(r.submitted_by)) ?? "—"} · {formatDateTime(r.submitted_at)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-amber-700">Not sent yet</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r && (
                    <Button size="sm" variant="secondary" icon={Eye} onClick={() => void start(d.id, true)}>
                      Sent report
                    </Button>
                  )}
                  <Button size="sm" icon={r ? RefreshCw : FilePlus2} onClick={() => void start(d.id, false)}>
                    {r ? "Send again (latest)" : "Open & send report"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Dialog open wide onClose={() => setOpen(null)} title={`${deptTitle(open.dept)} · ${formatDate(date)}`}>
          {!open.section ? (
            <Loading />
          ) : (
            <div className="flex flex-col gap-4">
              <SectionView s={open.section} note={open.view ? String(open.existing?.notes ?? "") || undefined : undefined} />
              {!open.view && (
                <>
                  <p className="text-xs text-slate-500">This report is made by the system from everything entered today in {deptTitle(open.dept)}. Check it and send.</p>
                  <Field label="Remark (optional)">
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only if something needs explaining, e.g. Room 4 AC not cooling – ticket raised." />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setOpen(null)}>
                      Cancel
                    </Button>
                    <Button loading={busy} onClick={() => void submit()}>
                      Send report
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

export function DateBar({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const today = todayISO();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className="w-auto" />
      <Button variant="secondary" size="sm" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      {date !== today && (
        <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
          Today
        </Button>
      )}
    </div>
  );
}
