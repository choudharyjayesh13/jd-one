"use client";
/**
 * HR → Staff: sign-up requests waiting for approval. Approve creates the staff
 * row (linked to the login) and marks the request Approved; Reject stores a note.
 */
import { useState } from "react";
import { Check, X, UserRoundPlus } from "lucide-react";
import { ALL_ROLES, type Row } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { getStore } from "@/core/data";
import { useAuth, useUser } from "@/core/auth/AuthProvider";
import { canUpdate } from "@/core/auth/access";
import { formatDateTime, todayISO } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { RelationSelect } from "@/core/ui/RelationSelect";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";

export function PendingSignups() {
  const user = useUser();
  const { mode } = useAuth();
  const { toast } = useToast();
  const def = getEntity("signup-requests");
  const allowed = canUpdate(user.role, def);
  const { rows, reload } = useList("signup-requests", { filter: { status: "Pending" } });
  const { rows: units } = useList("business-units");
  const [approving, setApproving] = useState<Row | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [form, setForm] = useState({ role: "staff", business_unit_id: "", designation: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Sign-ups only exist in shared mode; keep the page clean in local mode.
  if (mode === "local" && rows.length === 0) return null;

  const unitName = (id: unknown) => String(units.find((u) => u.id === id)?.name ?? "—");
  const me = (user.staff?.id as string | undefined) ?? null;

  const openApprove = (r: Row) => {
    setForm({ role: "staff", business_unit_id: String(r.business_unit_id ?? ""), designation: String(r.designation ?? "") });
    setApproving(r);
  };

  const approve = async () => {
    if (!approving) return;
    if (!form.business_unit_id) return toast("Choose a business unit", "error");
    setBusy(true);
    try {
      const store = getStore();
      const staff = await store.create("staff", {
        name: approving.name,
        phone: approving.phone ?? null,
        email: approving.email ?? null,
        role: form.role,
        business_unit_id: form.business_unit_id,
        designation: form.designation || null,
        active: true,
        joined_on: todayISO(),
        auth_user_id: approving.auth_user_id ?? null,
        notes: `Self sign-up approved ${todayISO()}`,
        created_by: me,
      });
      await store.update("signup-requests", approving.id, { status: "Approved", decided_by: me, decided_at: new Date().toISOString(), business_unit_id: form.business_unit_id, designation: form.designation || null });
      toast(`${approving.name} approved — they can sign in now (${staff.role})`);
      setApproving(null);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusy(true);
    try {
      await getStore().update("signup-requests", rejecting.id, { status: "Rejected", note: note.trim() || null, decided_by: me, decided_at: new Date().toISOString() });
      toast(`${rejecting.name} rejected`);
      setRejecting(null);
      setNote("");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader title={`Pending sign-ups${rows.length ? ` (${rows.length})` : ""}`} subtitle="People who created their own login and are waiting for approval" />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">No pending sign-ups.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-navy">
                    {String(r.name)} {r.designation ? <span className="font-normal text-slate-500">· {String(r.designation)}</span> : null}
                  </div>
                  <div className="text-xs text-slate-500">
                    {String(r.email ?? "")} {r.phone ? `· ${r.phone}` : ""} · {unitName(r.business_unit_id)} · {formatDateTime(r.requested_at ?? r.created_at)}
                  </div>
                </div>
                {allowed ? (
                  <div className="flex gap-2">
                    <Button size="sm" icon={Check} onClick={() => openApprove(r)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" icon={X} onClick={() => setRejecting(r)}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Owner, manager or HR can approve</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Dialog open={Boolean(approving)} onClose={() => setApproving(null)} title={`Approve ${String(approving?.name ?? "")}`}>
        <div className="space-y-3">
          <Field label="Role" required>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Business unit" required>
            <RelationSelect entity="business-units" value={form.business_unit_id || null} onChange={(id) => setForm((f) => ({ ...f, business_unit_id: id ?? "" }))} />
          </Field>
          <Field label="Designation">
            <Input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} placeholder="Front office, Chef…" />
          </Field>
          <p className="text-xs text-slate-500">A staff record is created with today as joining date, linked to their login. They get full access for the role.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setApproving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button icon={UserRoundPlus} loading={busy} onClick={() => void approve()}>
              Approve & create staff
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={Boolean(rejecting)} onClose={() => setRejecting(null)} title={`Reject ${String(rejecting?.name ?? "")}`}>
        <div className="space-y-3">
          <Field label="Note (shown to them)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Not a JD Group employee / please use your work email" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon={X} loading={busy} onClick={() => void reject()}>
              Reject
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
