"use client";
/**
 * Administration → Edit approvals (/edit-approvals/).
 * Entries such as vouchers, payments, expenses and bills are final once saved. A change asked
 * by staff waits here; the Director or Chairman approves (the change is applied) or rejects.
 * Staff see their own requests and the answer on the same page.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { getStore } from "@/core/data";
import { saveRecord } from "@/core/data/service";
import type { Row } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDateTime } from "@/core/format";
import { viewHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { EmptyState, Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";

type Change = { field: string; label: string; from: string; to: string };
const TONE: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-800 ring-amber-200",
  Approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
  Cancelled: "bg-slate-50 text-slate-500 ring-slate-200",
};

export function EditApprovals() {
  const user = useUser();
  const { toast, confirm } = useToast();
  const approver = !!user.post;
  const me = user.staff?.id ?? null;
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const { rows, loading } = useList("edit-requests", { sort: { field: "created_at", dir: "desc" }, limit: 200 });
  const { rows: staff } = useList("staff");
  const name = useMemo(() => new Map(staff.map((s) => [s.id, String(s.name)])), [staff]);
  const [deciding, setDeciding] = useState<{ row: Row; to: "Approved" | "Rejected" } | null>(null);
  const mine = rows.filter((r) => String(r.requested_by) === me);
  const list = approver ? (tab === "pending" ? rows.filter((r) => r.status === "Pending") : rows) : mine;

  const cancel = async (r: Row) => {
    if (!(await confirm("Cancel this request?", "Cancel request"))) return;
    await getStore().update("edit-requests", r.id, { status: "Cancelled" }).catch((e: Error) => toast(e.message, "error"));
  };

  return (
    <div>
      <PageHeader title="Edit approvals" subtitle="Saved entries are final · changes need the Director or Chairman" />
      {approver && (
        <div className="mb-4 flex w-fit overflow-hidden rounded-lg border border-line bg-white text-sm">
          {(
            [
              ["pending", "Waiting", rows.filter((r) => r.status === "Pending").length],
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
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title={approver && tab === "pending" ? "Nothing waiting for approval" : "No edit requests"} hint="When someone asks to change a saved entry, it shows here." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => {
            const changes = (Array.isArray(r.changes) ? r.changes : []) as Change[];
            let what = String(r.entity);
            try {
              what = getEntity(String(r.entity)).labelSingular;
            } catch {
              /* unknown entity */
            }
            return (
              <li key={r.id} className="rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={viewHref(String(r.entity), String(r.record_id))} className="jd-serif text-lg font-semibold text-navy hover:underline">
                      {String(r.record_label || what)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      Asked by {name.get(String(r.requested_by)) ?? "—"} · {formatDateTime(r.created_at)}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", TONE[String(r.status)] ?? TONE.Pending)}>{r.status === "Pending" ? "Waiting for approval" : String(r.status)}</span>
                </div>
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-sm">
                  {changes.map((c) => (
                    <li key={c.field} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2">
                      <span className="text-slate-600">{c.label}</span>
                      <span className="text-right">
                        <span className="text-slate-400 line-through">{c.from}</span> → <b className="font-medium text-navy">{c.to}</b>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="text-slate-500">Why: </span>
                  {String(r.reason ?? "")}
                </p>
                {r.status !== "Pending" && r.decided_by ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {String(r.status)} by {name.get(String(r.decided_by)) ?? "—"} · {formatDateTime(r.decided_at)}
                    {r.decision_note ? ` · “${String(r.decision_note)}”` : ""}
                  </p>
                ) : null}
                {r.status === "Pending" && (
                  <div className="mt-3 flex justify-end gap-2">
                    {approver ? (
                      <>
                        <Button size="sm" variant="secondary" icon={X} onClick={() => setDeciding({ row: r, to: "Rejected" })}>
                          Reject
                        </Button>
                        <Button size="sm" icon={Check} onClick={() => setDeciding({ row: r, to: "Approved" })}>
                          Approve &amp; change
                        </Button>
                      </>
                    ) : String(r.requested_by) === me ? (
                      <button type="button" onClick={() => void cancel(r)} className="text-xs text-slate-500 underline hover:text-navy">
                        Cancel request
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {deciding && <Decide row={deciding.row} to={deciding.to} onClose={() => setDeciding(null)} />}
    </div>
  );
}

function Decide({ row, to, onClose }: { row: Row; to: "Approved" | "Rejected"; onClose: () => void }) {
  const user = useUser();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (to === "Rejected" && note.trim().length < 3) return toast("Write why it is rejected", "error");
    setBusy(true);
    try {
      const store = getStore();
      if (to === "Approved") {
        const entity = String(row.entity);
        const existing = await store.get(entity, String(row.record_id));
        if (!existing) throw new Error("The entry no longer exists.");
        const patch = (row.patch && typeof row.patch === "object" ? row.patch : {}) as Record<string, unknown>;
        await saveRecord(entity, { ...existing, ...patch }, { store, staffId: user.staff?.id ?? null }, String(row.record_id));
      }
      await store.update("edit-requests", row.id, { status: to, decided_by: user.staff?.id ?? null, decided_at: new Date().toISOString(), decision_note: note.trim() || null });
      toast(to === "Approved" ? "Approved – the entry is changed" : "Rejected", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={to === "Approved" ? "Approve the change" : "Reject the change"}>
      <div className="flex flex-col gap-4">
        <Field label={to === "Rejected" ? "Why rejected" : "Note (optional)"} required={to === "Rejected"}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={to === "Rejected" ? "danger" : "primary"} loading={busy} onClick={() => void save()}>
            {to === "Approved" ? "Approve & change" : "Reject"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
