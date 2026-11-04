"use client";
/**
 * HR → Leave requests (/leave/). Every employee can ask for a weekly off, monthly off, leave,
 * half day or emergency leave, with a reason, and see the answer here and on My Day.
 * HR, the Property Supervisor, the Director and the Chairman approve or reject. Leave counts
 * only once it is approved; the roster then shows it. Nobody approves their own request
 * (the database checks this too).
 */
import { useMemo, useState } from "react";
import { CalendarPlus, Check, X } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { addDays, calendarTodayISO, formatDate, formatDateTime } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input, Textarea } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { EmptyState, ErrorBox, Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { useIsPropertySupervisor } from "@/modules/night-audit/access";
import { LEAVE_HINT, LEAVE_KINDS } from "./entity";

const TONE: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-800 ring-amber-200",
  Approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
  Cancelled: "bg-slate-50 text-slate-500 ring-slate-200",
};
export function LeaveStatus({ status }: { status: string }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", TONE[status] ?? TONE.Pending)}>{status === "Pending" ? "Waiting for approval" : status}</span>;
}

export function useCanApproveLeave() {
  const user = useUser();
  const sup = useIsPropertySupervisor(user);
  return !!user.post || user.role === "hr" || sup;
}

const daysOf = (from: string, to: string, kind: string) => (kind === "Half day" ? 0.5 : Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
const when = (r: Row) => (r.date_from === r.date_to ? formatDate(r.date_from) : `${formatDate(r.date_from)} → ${formatDate(r.date_to)}`);

export function LeavePage() {
  const user = useUser();
  const { toast, confirm } = useToast();
  const me = user.staff?.id ?? null;
  const approver = useCanApproveLeave();
  const [tab, setTab] = useState<"mine" | "approve" | "all">("mine");
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState<{ row: Row; to: "Approved" | "Rejected" } | null>(null);
  const { rows: mine, loading, error } = useList(me ? "leave-requests" : null, { filter: { staff_id: me }, sort: { field: "date_from", dir: "desc" }, limit: 100 });
  const { rows: all } = useList(approver ? "leave-requests" : null, { sort: { field: "date_from", dir: "desc" }, limit: 300 });
  const { rows: staff } = useList("staff");
  const name = useMemo(() => new Map(staff.map((s) => [s.id, String(s.name)])), [staff]);
  const post = useMemo(() => new Map(staff.map((s) => [s.id, String(s.designation ?? s.role ?? "")])), [staff]);
  const pending = all.filter((r) => r.status === "Pending" && String(r.staff_id) !== me);

  const cancel = async (r: Row) => {
    if (!(await confirm("Cancel this request?", "Cancel request"))) return;
    try {
      await getStore().update("leave-requests", r.id, { status: "Cancelled" });
      toast("Request cancelled");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const list = tab === "mine" ? mine : tab === "approve" ? pending : all;

  return (
    <div>
      <PageHeader
        title="Leave requests"
        subtitle="Ask for a day off or leave · it counts only after approval"
        actions={
          me ? (
            <Button icon={CalendarPlus} onClick={() => setAsking(true)}>
              Ask for leave
            </Button>
          ) : null
        }
      />
      {approver && (
        <div className="mb-4 flex w-fit overflow-hidden rounded-lg border border-line bg-white text-sm">
          {(
            [
              ["mine", "My requests", 0],
              ["approve", "To approve", pending.length],
              ["all", "All requests", 0],
            ] as const
          ).map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex h-9 items-center gap-2 px-4", tab === k ? "bg-[#17140f] font-medium text-white" : "text-navy hover:bg-slate-50")}>
              {l}
              {n > 0 && <span className="rounded-full bg-[#ee8122] px-1.5 text-[10px] font-semibold leading-4 text-white">{n}</span>}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <ErrorBox message={/relation|does not exist|schema cache/i.test(error) ? "Leave requests need a one-time database update (Settings → Database setup)." : error} />
      ) : loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title={tab === "approve" ? "Nothing waiting for approval" : tab === "mine" ? "You have not asked for leave yet" : "No leave requests yet"} hint={tab === "mine" ? "Tap Ask for leave to send a request." : undefined} />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => {
            const own = String(r.staff_id) === me;
            return (
              <li key={r.id} className="rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {!own || tab !== "mine" ? (
                      <p className="font-medium text-navy">
                        {name.get(String(r.staff_id)) ?? "—"} <span className="text-sm font-normal text-slate-500">· {post.get(String(r.staff_id)) ?? ""}</span>
                      </p>
                    ) : null}
                    <p className="jd-serif text-lg font-semibold text-navy">
                      {String(r.kind)} · {when(r)}
                      <span className="ml-2 font-sans text-sm font-normal text-slate-500">
                        {Number(r.days) === 0.5 ? "half day" : `${Number(r.days)} day${Number(r.days) === 1 ? "" : "s"}`}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{String(r.reason ?? "")}</p>
                    {r.status !== "Pending" && r.status !== "Cancelled" && (
                      <p className="mt-1.5 text-xs text-slate-500">
                        {String(r.status)} by {name.get(String(r.decided_by)) ?? "—"} · {formatDateTime(r.decided_at)}
                        {r.decision_note ? ` · “${String(r.decision_note)}”` : ""}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">Asked {formatDateTime(r.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <LeaveStatus status={String(r.status)} />
                    {r.status === "Pending" && approver && !own && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" icon={X} onClick={() => setDeciding({ row: r, to: "Rejected" })}>
                          Reject
                        </Button>
                        <Button size="sm" icon={Check} onClick={() => setDeciding({ row: r, to: "Approved" })}>
                          Approve
                        </Button>
                      </div>
                    )}
                    {r.status === "Pending" && own && (
                      <button type="button" onClick={() => void cancel(r)} className="text-xs text-slate-500 underline hover:text-navy">
                        Cancel request
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-slate-500">HR, the Property Supervisor, the Director or the Chairman approves. Without approval the day is not a holiday.</p>

      {asking && me && <AskDialog staffId={me} unitId={user.unitId} onClose={() => setAsking(false)} />}
      {deciding && <DecideDialog row={deciding.row} to={deciding.to} who={name.get(String(deciding.row.staff_id)) ?? ""} onClose={() => setDeciding(null)} />}
    </div>
  );
}

function AskDialog({ staffId, unitId, onClose }: { staffId: string; unitId: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const today = calendarTodayISO();
  const [kind, setKind] = useState<string>("Leave");
  const [from, setFrom] = useState(addDays(today, 1));
  const [to, setTo] = useState(addDays(today, 1));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const single = kind === "Half day" || kind === "Weekly off";
  const end = single ? from : to < from ? from : to;
  const days = daysOf(from, end, kind);
  const ok = reason.trim().length >= 3 && !!from && (kind === "Emergency" || from >= today);

  const send = async () => {
    setBusy(true);
    try {
      await getStore().create("leave-requests", { staff_id: staffId, kind, date_from: from, date_to: end, days, reason: reason.trim(), status: "Pending", business_unit_id: unitId });
      toast("Request sent. You will see the answer here and on My Day.", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Ask for leave">
      <div className="flex flex-col gap-4">
        <Field label="What do you need?" required plain>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LEAVE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => (setKind(k), k === "Emergency" && setFrom(today), k === "Emergency" && setTo(today))}
                className={cn("rounded-lg border px-3 py-2 text-left", kind === k ? "border-[#17140f] bg-[#17140f] text-white" : "border-line hover:border-slate-400")}
              >
                <span className="block text-sm font-medium">{k}</span>
                <span className={cn("block text-[11px]", kind === k ? "text-white/70" : "text-slate-500")}>{LEAVE_HINT[k]}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={single ? "Date" : "From"} required>
            <Input type="date" value={from} min={kind === "Emergency" ? undefined : today} onChange={(e) => e.target.value && (setFrom(e.target.value), to < e.target.value && setTo(e.target.value))} />
          </Field>
          {!single && (
            <Field label="To" required>
              <Input type="date" value={end} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {days === 0.5 ? "Half day" : `${days} day${days === 1 ? "" : "s"}`} · {formatDate(from)}
          {end !== from ? ` → ${formatDate(end)}` : ""}
        </p>
        <Field label="Reason" required help="Why and for what – your approver reads this.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sister's wedding in Jaipur" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!ok} onClick={() => void send()}>
            Send request
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DecideDialog({ row, to, who, onClose }: { row: Row; to: "Approved" | "Rejected"; who: string; onClose: () => void }) {
  const user = useUser();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (to === "Rejected" && note.trim().length < 3) return toast("Write why it is rejected", "error");
    setBusy(true);
    try {
      await getStore().update("leave-requests", row.id, { status: to, decision_note: note.trim() || null, decided_by: user.staff?.id ?? null, decided_at: new Date().toISOString() });
      toast(`${who}: ${to === "Approved" ? "leave approved" : "request rejected"}`, "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`${to === "Approved" ? "Approve" : "Reject"} · ${who}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          {String(row.kind)} · {when(row)} · {String(row.reason ?? "")}
        </p>
        <Field label={to === "Rejected" ? "Why rejected" : "Note (optional)"} required={to === "Rejected"}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={to === "Rejected" ? "e.g. Full house that weekend" : "e.g. Enjoy, hand over keys to Ravi"} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={to === "Rejected" ? "danger" : "primary"} loading={busy} onClick={() => void save()}>
            {to === "Approved" ? "Approve" : "Reject"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** My Day: today's approved leave and answers from the last week. */
export function LeaveNotice() {
  const user = useUser();
  const me = user.staff?.id ?? null;
  const today = calendarTodayISO();
  const { rows } = useList(me ? "leave-requests" : null, { filter: { staff_id: me }, range: { date_to: { gte: addDays(today, -1) } }, sort: { field: "date_from", dir: "asc" }, limit: 20 });
  const { rows: staff } = useList(rows.length ? "staff" : null);
  if (!rows.length) return null;
  const name = (id: unknown) => String(staff.find((s) => s.id === id)?.name ?? "");
  const shown = rows.filter((r) => r.status !== "Cancelled").slice(0, 3);
  if (!shown.length) return null;
  return (
    <section className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Your leave</h2>
        <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/leave/`} className="text-xs font-medium text-[#9a7128] hover:underline">
          Open
        </a>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-navy">
              <b className="font-medium">{String(r.kind)}</b> · {when(r)}
              {r.status === "Approved" && String(r.date_from) <= today && String(r.date_to) >= today ? <span className="ml-2 text-emerald-700">· you are on leave today</span> : null}
              {r.status !== "Pending" && r.decided_by ? <span className="ml-2 text-xs text-slate-500">by {name(r.decided_by)}</span> : null}
            </span>
            <LeaveStatus status={String(r.status)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
