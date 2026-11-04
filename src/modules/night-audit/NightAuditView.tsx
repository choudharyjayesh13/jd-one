"use client";
/**
 * The closed day as one document (/night-audit/view/?date=…): summary first, then every
 * department with its figures and note. Print → "Save as PDF" gives the report file;
 * "Share" sends the summary to WhatsApp.
 */
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Printer, Send, AlertTriangle } from "lucide-react";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate, formatDateTime } from "@/core/format";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { ErrorBox, Loading } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { REPORT_DEPARTMENTS, type DayData } from "./collect";
import { SectionView, canNightAudit } from "./ReportView";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The headline numbers for the cover page and the WhatsApp message. */
function headline(d: DayData): { label: string; value: string }[] {
  const pick = (dept: string, label: string) => d[dept]?.stats.find((s) => s.label === label)?.value ?? "—";
  return [
    { label: "Occupancy tonight", value: pick("front-office", "Occupancy tonight") },
    { label: "Arrivals", value: pick("front-office", "Arrivals") },
    { label: "Departures", value: pick("front-office", "Departures") },
    { label: "New bookings", value: pick("reservations", "New bookings") },
    { label: "F&B orders", value: pick("fb-service", "Orders (KOT)") },
    { label: "Activities", value: pick("activities", "Revenue") },
    { label: "Money received", value: pick("accounts", "Money received") },
    { label: "Expenses paid", value: pick("accounts", "Expenses paid") },
    { label: "Net for the day", value: pick("accounts", "Net for the day") },
    { label: "Attendance", value: pick("hr", "Attendance") },
  ];
}

export function NightAuditView() {
  const user = useUser();
  const date = useSearchParams().get("date") ?? "";
  const { rows, loading, error } = useList("night-audits", { filter: { date } });
  const { rows: staff } = useList("staff");
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, String(s.name)])), [staff]);
  if (!canNightAudit(user)) return <NoAccess />;
  if (loading) return <Loading />;
  const a = rows[0];
  if (error || !a) return <ErrorBox message={error ?? "No night audit for this date."} />;
  const payload = (a.data ?? {}) as { sections?: DayData; deptNotes?: Record<string, { notes: string; by: string; at: string }>; missing?: string[] };
  const sections = payload.sections ?? {};
  const notes = payload.deptNotes ?? {};
  const warnings = Array.isArray(a.warnings) ? (a.warnings as string[]) : [];
  const top = headline(sections);
  const closer = staffName.get(String(a.closed_by)) ?? "—";

  const share = async () => {
    const text = [
      `*Night audit – The Udaisarovar – ${formatDate(date)}*`,
      ...top.map((h) => `${h.label}: ${h.value}`),
      warnings.length ? `\n⚠ ${warnings.length} item(s) open` : "",
      a.notes ? `\nNote: ${String(a.notes)}` : "",
      `\nClosed by ${closer}`,
      `${window.location.origin}${BASE}/night-audit/view/?date=${date}`,
    ]
      .filter(Boolean)
      .join("\n");
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) await nav.share({ text }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button icon={Printer} variant="secondary" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
        <Button icon={Send} onClick={() => void share()}>
          Share on WhatsApp
        </Button>
      </div>

      <header className="flex items-center gap-4 rounded-xl border border-line bg-white p-5 print:border-0 print:p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE}/brands/udaisarovar.webp`} alt="" className="h-16 w-16 rounded-full" />
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Night audit report</p>
          <h1 className="jd-serif text-3xl font-semibold text-navy">The Udaisarovar · {formatDate(date)}</h1>
          <p className="text-xs text-slate-500">
            Closed by {closer} · {formatDateTime(a.closed_at)}
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-line bg-white p-5 print:border-0 print:p-0">
        <h2 className="jd-serif mb-3 text-2xl font-semibold text-navy">Summary</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {top.map((h) => (
            <div key={h.label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-line pb-1.5">
              <dt className="text-sm text-slate-500">{h.label}</dt>
              <dd className="text-right text-sm font-medium text-navy">{h.value}</dd>
            </div>
          ))}
        </dl>
        {a.notes ? <p className="mt-4 whitespace-pre-line rounded-lg border border-[#e7dcc4] bg-[#faf5ea] px-3 py-2 text-sm text-navy"><b className="font-medium">Night auditor: </b>{String(a.notes)}</p> : null}
        {warnings.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-500">Open at closing ({warnings.length})</p>
            <ul className="flex flex-col gap-1 text-sm text-amber-900">
              {warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        {payload.missing && payload.missing.length > 0 && <p className="mt-3 text-sm text-slate-500">No department report from: {payload.missing.join(", ")}.</p>}
      </section>

      {REPORT_DEPARTMENTS.map((d) => {
        const s = sections[d.id];
        if (!s) return null;
        const n = notes[d.id];
        return <SectionView key={d.id} s={s} note={n?.notes || undefined} by={n ? (n.by ? `Report by ${n.by}` : "Department report submitted") : "No department report"} />;
      })}
    </div>
  );
}
