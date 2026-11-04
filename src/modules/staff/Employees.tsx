"use client";
/**
 * HR → Employees (/employees/). Everyone on the team with their status:
 * Working · On notice (leaves on a date) · Left / Removed.
 *
 * Leaving is a process, not a delete:
 *  - HR ticks one or more people → "Record resignation": resignation date + notice
 *    period (7 days, 15 days or 1 month). Access ends by itself after the last working day.
 *  - A resignation can be withdrawn while the person is still working.
 *  - "Remove now" (access ends today) is only for the Chairman and the Director.
 * The database enforces the same rules (jdone.guard_staff_exit), so nobody can skip them.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserMinus, Undo2, Ban, UserPlus, KeyRound } from "lucide-react";
import { PasswordDialog } from "./PasswordDialog";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { moduleLevel } from "@/core/auth/access";
import { addDays, formatDate, todayISO } from "@/core/format";
import { newHref, viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { ErrorBox, Loading, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";

type Status = "working" | "notice" | "left";
const NOTICE = [
  { days: 7, label: "7 days" },
  { days: 15, label: "15 days" },
  { days: 30, label: "1 month (30 days)" },
];
const REASONS = ["Resigned", "Asked to leave", "Contract / season ended", "Absconding (not reporting)", "Other"];

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function statusOf(r: Row, today: string): Status {
  if (!r.active) return "left";
  const lwd = r.last_working_day ? String(r.last_working_day) : "";
  if (lwd && lwd < today) return "left";
  return lwd ? "notice" : "working";
}

function initials(name: unknown) {
  return String(name ?? "")
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Employees() {
  const user = useUser();
  const { toast, confirm } = useToast();
  const today = todayISO();
  const { rows, loading, error, reload } = useList("staff");
  const [tab, setTab] = useState<Status>("working");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "resign" | "remove">(null);
  const [busy, setBusy] = useState(false);
  const [pwFor, setPwFor] = useState<Row | null>(null);
  const { rows: posts } = useList("org-posts");
  const chairmanEmail = String(posts.find((p) => p.post === "chairman")?.email ?? "").toLowerCase();
  /** Chairman: everyone. Director: everyone except the Chairman. Nobody else. */
  const canSetPassword = (r: Row) => !!user.post && !!r.auth_user_id && (user.post === "chairman" || !chairmanEmail || String(r.email ?? "").toLowerCase() !== chairmanEmail);

  const isPost = !!user.post; // Chairman or Director
  const staffLevel = moduleLevel("staff");
  const canProcess = isPost || (staffLevel === null ? ["owner", "manager", "hr"].includes(user.role) : staffLevel >= 2);

  // Close exits whose last working day has passed (the database also stops their login on its own).
  useEffect(() => {
    if (!canProcess) return;
    const due = rows.filter((r) => r.active && r.last_working_day && String(r.last_working_day) < today);
    if (!due.length) return;
    void Promise.all(
      due.map((r) => getStore().update("staff", r.id, { active: false, left_on: r.last_working_day, exit_status: "Left" }).catch(() => undefined)),
    ).then(() => reload());
  }, [rows, today, canProcess, reload]);

  const counts = useMemo(() => {
    const c = { working: 0, notice: 0, left: 0 } as Record<Status, number>;
    for (const r of rows) c[statusOf(r, today)]++;
    return c;
  }, [rows, today]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => statusOf(r, today) === tab)
      .filter((r) => !s || [r.name, r.designation, r.phone].some((v) => String(v ?? "").toLowerCase().includes(s)))
      .sort((a, b) =>
        tab === "notice"
          ? String(a.last_working_day).localeCompare(String(b.last_working_day))
          : tab === "left"
            ? String(b.left_on ?? "").localeCompare(String(a.left_on ?? ""))
            : String(a.name).localeCompare(String(b.name)),
      );
  }, [rows, tab, q, today]);

  useEffect(() => setPicked(new Set()), [tab]);
  const pickedRows = list.filter((r) => picked.has(r.id));
  const allPicked = list.length > 0 && pickedRows.length === list.length;
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const self = (r: Row) => r.id === user.staff?.id;

  const run = async (label: string, fn: (r: Row) => Promise<unknown>, targets: Row[]) => {
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const r of targets) {
      try {
        await fn(r);
        ok++;
      } catch (e) {
        failed.push(`${String(r.name)}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    setDialog(null);
    setPicked(new Set());
    await reload();
    if (ok) toast(`${label} – ${ok} ${ok === 1 ? "person" : "people"}.`, "success");
    if (failed.length) toast(failed.join("\n"), "error");
  };

  const withdraw = async () => {
    if (!(await confirm(`Withdraw the resignation of ${pickedRows.map((r) => r.name).join(", ")}? They stay on the team.`, "Withdraw resignation"))) return;
    await run(
      "Resignation withdrawn",
      (r) =>
        getStore().update("staff", r.id, {
          exit_status: null,
          resigned_on: null,
          notice_days: null,
          last_working_day: null,
          exit_reason: null,
          notes: `${r.notes ? `${String(r.notes)}\n` : ""}${formatDate(today)}: resignation withdrawn by ${user.name}.`,
        }),
      pickedRows,
    );
  };

  const rejoin = async () => {
    if (!(await confirm(`Bring back ${pickedRows.map((r) => r.name).join(", ")}? Their login works again.`, "Re-join"))) return;
    await run(
      "Re-joined",
      (r) =>
        getStore().update("staff", r.id, {
          active: true,
          left_on: null,
          exit_status: null,
          resigned_on: null,
          notice_days: null,
          last_working_day: null,
          exit_reason: null,
          notes: `${r.notes ? `${String(r.notes)}\n` : ""}${formatDate(today)}: re-joined (by ${user.name}).`,
        }),
      pickedRows,
    );
  };

  const tabs: { id: Status; label: string }[] = [
    { id: "working", label: "Working" },
    { id: "notice", label: "On notice" },
    { id: "left", label: "Left" },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Team list · resignation and notice period · leaving"
        actions={
          canProcess ? (
            <Link href={newHref("staff")}>
              <Button variant="secondary" icon={UserPlus}>
                Add employee
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn("h-10 rounded-full border px-4 text-sm", tab === t.id ? "border-navy bg-navy font-medium text-white" : "border-line text-slate-600 hover:border-slate-400")}
          >
            {t.label} <span className={cn("ml-1", tab === t.id ? "text-white/70" : "text-slate-400")}>{counts[t.id]}</span>
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, post, phone" className="pl-9" />
        </label>
      </div>

      {canProcess && picked.size > 0 && (
        <div className="sticky top-[64px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#e7dcc4] bg-[#faf5ea] px-3 py-2">
          <span className="mr-auto text-sm font-medium text-navy">{picked.size} selected</span>
          {tab === "working" && (
            <Button size="sm" icon={UserMinus} onClick={() => setDialog("resign")} disabled={pickedRows.some(self)}>
              Record resignation
            </Button>
          )}
          {tab === "notice" && (
            <Button size="sm" variant="secondary" icon={Undo2} onClick={() => void withdraw()} loading={busy}>
              Withdraw resignation
            </Button>
          )}
          {tab === "left" && isPost && (
            <Button size="sm" variant="secondary" icon={Undo2} onClick={() => void rejoin()} loading={busy}>
              Re-join
            </Button>
          )}
          {tab !== "left" && isPost && (
            <Button size="sm" variant="danger" icon={Ban} onClick={() => setDialog("remove")} disabled={pickedRows.some(self)}>
              Remove now
            </Button>
          )}
        </div>
      )}

      {error ? (
        <ErrorBox message={error} />
      ) : loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-slate-500">
          {tab === "notice" ? "Nobody is serving notice." : tab === "left" ? "Nobody has left yet." : "No employees match."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {canProcess && (
            <label className="flex items-center gap-3 border-b border-line bg-slate-50 px-4 py-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <input type="checkbox" className="h-4 w-4 accent-[#17140f]" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((r) => r.id)))} />
              Select all
            </label>
          )}
          <ul>
            {list.map((r) => {
              const lwd = r.last_working_day ? String(r.last_working_day) : "";
              const left = lwd ? daysBetween(today, lwd) : 0;
              return (
                <li key={r.id} className={cn("flex items-center gap-3 border-b border-line px-4 py-3 last:border-0", picked.has(r.id) && "bg-[#faf5ea]")}>
                  {canProcess && <input type="checkbox" aria-label={`Select ${String(r.name)}`} className="h-4 w-4 shrink-0 accent-[#17140f]" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />}
                  <span className="jd-serif flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d7aa60] font-semibold text-[#9a7128]">{initials(r.name) || "–"}</span>
                  <Link href={viewHref("staff", r.id)} className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-navy">{String(r.name)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {String(r.designation ?? r.role ?? "")}
                      {r.phone ? ` · ${String(r.phone)}` : ""}
                      {r.joined_on ? ` · joined ${formatDate(r.joined_on)}` : ""}
                    </span>
                  </Link>
                  {tab !== "left" && canSetPassword(r) && (
                    <button type="button" onClick={() => setPwFor(r)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-navy hover:border-[#c08a3a] hover:bg-[#faf5ea]">
                      <KeyRound className="h-3.5 w-3.5" /> Password
                    </button>
                  )}
                  <span className="shrink-0 text-right text-xs">
                    {tab === "working" && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">Working</span>}
                    {tab === "notice" && (
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                          {left <= 0 ? "Last day today" : `${left} day${left === 1 ? "" : "s"} left`}
                        </span>
                        <span className="text-slate-500">Last day {formatDate(lwd)}</span>
                      </span>
                    )}
                    {tab === "left" && (
                      <span className="flex flex-col items-end gap-0.5">
                        <span className={cn("rounded-full px-2.5 py-1 font-medium", r.exit_status === "Removed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
                          {r.exit_status === "Removed" ? "Removed" : "Left"}
                        </span>
                        <span className="text-slate-500">{r.left_on || lwd ? formatDate(r.left_on ?? lwd) : ""}</span>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        HR records a resignation with a notice period of 7 days, 15 days or 1 month; the login stops by itself after the last working day.
        Only the Chairman and the Director can remove someone immediately.
      </p>

      {pwFor && <PasswordDialog person={pwFor} onClose={() => setPwFor(null)} />}
      {dialog === "resign" && (
        <ResignDialog
          people={pickedRows}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(v) =>
            void run(
              "Resignation recorded",
              (r) =>
                getStore().update("staff", r.id, {
                  exit_status: "Notice period",
                  resigned_on: v.resignedOn,
                  notice_days: v.days,
                  last_working_day: addDays(v.resignedOn, v.days),
                  exit_reason: v.reason,
                  notes: `${r.notes ? `${String(r.notes)}\n` : ""}${formatDate(today)}: ${v.reason} on ${formatDate(v.resignedOn)}, ${v.days}-day notice, last day ${formatDate(addDays(v.resignedOn, v.days))} (recorded by ${user.name}).${v.note ? ` ${v.note}` : ""}`,
                }),
              pickedRows,
            )
          }
        />
      )}
      {dialog === "remove" && (
        <RemoveDialog
          people={pickedRows}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(reason) =>
            void run(
              "Removed",
              (r) =>
                getStore().update("staff", r.id, {
                  active: false,
                  left_on: today,
                  exit_status: "Removed",
                  last_working_day: null,
                  exit_reason: reason,
                  notes: `${r.notes ? `${String(r.notes)}\n` : ""}${formatDate(today)}: removed immediately by ${user.name} (${user.post === "director" ? "Director" : "Chairman"}). Reason: ${reason}`,
                }),
              pickedRows,
            )
          }
        />
      )}
    </div>
  );
}

function names(people: Row[]) {
  return people.map((p) => String(p.name)).join(", ");
}

function ResignDialog({ people, busy, onClose, onSave }: { people: Row[]; busy: boolean; onClose: () => void; onSave: (v: { resignedOn: string; days: number; reason: string; note: string }) => void }) {
  const today = todayISO();
  const [resignedOn, setResignedOn] = useState(today);
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState(REASONS[0]!);
  const [note, setNote] = useState("");
  const lastDay = addDays(resignedOn, days);
  const pastLastDay = lastDay < today;
  return (
    <Dialog open onClose={onClose} title="Record resignation">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">{names(people)}</p>
        <Field label="Resignation date" required>
          <Input type="date" value={resignedOn} max={today} onChange={(e) => setResignedOn(e.target.value || today)} />
        </Field>
        <Field label="Notice period" required plain>
          <div className="grid grid-cols-3 gap-2">
            {NOTICE.map((n) => (
              <button
                key={n.days}
                type="button"
                onClick={() => setDays(n.days)}
                className={cn("min-h-11 rounded-md border px-2 text-sm", days === n.days ? "border-navy bg-navy font-medium text-white" : "border-line text-slate-700 hover:border-slate-400")}
              >
                {n.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Reason" required>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Handover, dues to settle, keys/uniform to return…" />
        </Field>
        <div className={cn("rounded-lg border px-3 py-2 text-sm", pastLastDay ? "border-red-200 bg-red-50 text-red-700" : "border-[#e7dcc4] bg-[#faf5ea] text-navy")}>
          {pastLastDay ? (
            "This last working day has already passed. Pick a later resignation date or a longer notice period."
          ) : (
            <>
              Last working day: <b>{formatDate(lastDay)}</b>. Their login stops after this day.
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={pastLastDay} onClick={() => onSave({ resignedOn, days, reason, note: note.trim() })}>
            Record resignation
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RemoveDialog({ people, busy, onClose, onSave }: { people: Row[]; busy: boolean; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onClose={onClose} title="Remove immediately">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          <b>{names(people)}</b> will be removed today and can no longer sign in. Their past records stay. You can bring them back later from the Left tab.
        </p>
        <Field label="Reason" required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this person being removed today?" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => onSave(reason.trim())}>
            Remove now
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
