"use client";
/**
 * New check-in (step by step) and check-out, used by Check-in, Staying and Arrivals.
 *
 * Check-in: 1 Booking · 2 Guest & ID (ID type and number are required) · 3 Rooms · 4 Payment.
 * Payment at check-in: Full payment (the whole balance) or Advance (part of it). A guest who
 * will pay everything at check-out is allowed only with a reason and the name of the manager
 * who approved it – the stay is then marked "Pay at check-out" on Staying and in the night audit.
 *
 * Check-out: shows the bill (rooms + food & drinks − paid), takes the balance, closes the stay,
 * sends the rooms to housekeeping as Dirty, and opens the bill for Print / PDF.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate, formatMoney, todayISO } from "@/core/format";
import { newHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { Loading } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { bookingForRoom, roomLines, roomsLabel } from "@/modules/rooms/occupancy";
import { billFor, doCheckIn, doCheckOut } from "./desk";

const MODES = ["UPI", "Cash", "Card", "Bank", "OTA"];
const ID_TYPES = ["Aadhaar", "Passport", "Driving licence", "Voter ID", "PAN", "Other"];

function Steps({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="mb-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((l, i) => (
        <li key={l} className="flex flex-col gap-1.5">
          <span className={cn("h-1 rounded-full", i <= step ? "bg-[#a9802f]" : "bg-slate-200")} />
          <span className={cn("text-[10px] uppercase tracking-[0.14em]", i === step ? "font-medium text-navy" : "text-slate-400")}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

export function CheckInDialog({ onClose, onDone, preset, unit }: { onClose: () => void; onDone: () => void; preset?: Row | null; unit?: string }) {
  const user = useUser();
  const { toast } = useToast();
  const today = todayISO();
  const u = unit ?? user.unitId ?? "";
  const unitFilter = u ? { business_unit_id: u } : {};
  const { rows: candidates, loading } = useList("bookings", { filter: unitFilter, range: { check_in: { gte: today.slice(0, 8) + "01", lte: today } } });
  const { rows: liveBookings } = useList("bookings", { filter: unitFilter, range: { check_out: { gte: today } } });
  const { rows: staff } = useList("staff", { filter: { active: true } });
  const [step, setStep] = useState(preset ? 1 : 0);
  const [b, setB] = useState<Row | null>(preset ?? null);
  const { rows: rooms } = useList(b ? "rooms" : null, { filter: { ...(b?.business_unit_id ? { business_unit_id: b.business_unit_id } : {}), active: true }, sort: { field: "sort_order", dir: "asc" } });
  const [f, setF] = useState({ guestName: "", phone: "", idType: "Aadhaar", idNumber: "", payChoice: "full" as "full" | "advance" | "later", amount: 0, mode: "UPI", reference: "", laterReason: "", laterApprovedBy: "" });
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [bill, setBill] = useState<{ total: number; paid: number; balance: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const arrivals = candidates.filter((x) => ["Confirmed", "On hold"].includes(String(x.status))).sort((a, c) => String(c.check_in).localeCompare(String(a.check_in)));

  useEffect(() => {
    if (!b) return;
    setF((x) => ({ ...x, guestName: String(b.guest_name ?? ""), phone: String(b.phone ?? "") }));
    const lines = roomLines(b);
    const pre = lines.length ? lines.flatMap((l) => Array.from({ length: l.rooms }, (_, i) => String(l.room_ids?.[i] ?? ""))) : [String(b.room_id ?? "")];
    setRoomIds(pre);
    void billFor(getStore(), b).then((x) => {
      setBill(x);
      setF((y) => ({ ...y, amount: Math.max(0, x.balance) }));
    });
  }, [b]);

  // One slot per booked room, with its category.
  const slots = useMemo(() => {
    if (!b) return [] as { type: string }[];
    const lines = roomLines(b);
    return lines.length ? lines.flatMap((l) => Array.from({ length: l.rooms }, () => ({ type: l.unit_type }))) : [{ type: String(b.unit_type ?? "") }];
  }, [b]);
  const freeFor = (type: string, idx: number) =>
    rooms.filter((r) => String(r.unit_type) === type && String(r.status) !== "Out of order" && (!bookingForRoom(liveBookings.filter((x) => x.id !== b?.id && String(x.status) === "Checked-in"), r.id, today) || roomIds[idx] === r.id) && !roomIds.some((id, j) => j !== idx && id === r.id));

  const idOk = f.idNumber.replace(/\s/g, "").length >= 4 && !!f.idType;
  const roomsOk = rooms.length === 0 || roomIds.every(Boolean);
  const payOk = f.payChoice === "later" ? f.laterReason.trim().length >= 3 && !!f.laterApprovedBy : f.payChoice === "full" ? (bill ? bill.balance <= 0 || f.amount >= bill.balance : false) : f.amount > 0;

  const finish = async () => {
    if (!b) return;
    setBusy(true);
    try {
      await doCheckIn(getStore(), {
        booking: b,
        guestName: f.guestName,
        phone: f.phone,
        idType: f.idType,
        idNumber: f.idNumber,
        roomIds,
        roomNames: roomIds.map((id) => String(rooms.find((r) => r.id === id)?.name ?? "")),
        payChoice: f.payChoice,
        amount: f.payChoice === "later" ? 0 : f.amount,
        mode: f.mode,
        reference: f.reference,
        laterReason: f.laterReason,
        laterApprovedBy: f.laterApprovedBy,
        staffId: user.staff?.id ?? null,
      });
      toast(`${f.guestName} checked in.`, "success");
      onDone();
      onClose();
    } catch (e) {
      toast(`Could not check in: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const managers = staff.filter((s) => ["owner", "manager"].includes(String(s.role)));

  return (
    <Dialog open wide onClose={onClose} title="New check-in">
      <Steps step={step} labels={["Booking", "Guest & ID", "Rooms", "Payment"]} />
      {step === 0 && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <Loading />
          ) : arrivals.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-600">No booking is waiting to check in today.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {arrivals.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => (setB(x), setStep(1))} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                    <span>
                      <span className="block font-medium text-navy">{String(x.guest_name)}</span>
                      <span className="block text-xs text-slate-500">
                        {roomsLabel(x)} · {formatDate(x.check_in)} → {formatDate(x.check_out)}
                        {String(x.check_in) < today ? " · arrival date passed" : ""}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">{formatMoney(x.balance)} due</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-slate-600">
            Walk-in guest without a booking?{" "}
            <Link href={newHref("bookings", { source: "Walk-in", check_in: today })} className="font-medium text-[#9a7128] underline">
              Make the booking first
            </Link>
            , then check in from here.
          </p>
        </div>
      )}

      {step === 1 && b && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guest name" required>
            <Input value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
          </Field>
          <Field label="Phone" required>
            <Input value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="ID proof" required>
            <Select value={f.idType} onChange={(e) => setF({ ...f, idType: e.target.value })}>
              {ID_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="ID number" required help="Needed to continue. Only the last 4 digits are kept.">
            <Input value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value })} placeholder="e.g. XXXX XXXX 1234" />
          </Field>
          <div className="text-xs text-slate-500 sm:col-span-2">
            {roomsLabel(b)} · {formatDate(b.check_in)} → {formatDate(b.check_out)} · {String(b.meal_plan ?? "")}
          </div>
        </div>
      )}

      {step === 2 && b && (
        <div className="flex flex-col gap-3">
          {rooms.length === 0 ? (
            <p className="text-sm text-slate-600">No rooms are set up for this property – you can continue.</p>
          ) : (
            slots.map((s, i) => (
              <Field key={i} label={`Room ${i + 1} · ${s.type}`} required>
                <Select value={roomIds[i] ?? ""} onChange={(e) => setRoomIds((ids) => ids.map((v, j) => (j === i ? e.target.value : v)))}>
                  <option value="">Choose a room…</option>
                  {freeFor(s.type, i).map((r) => (
                    <option key={r.id} value={r.id}>
                      {String(r.name)}
                      {String(r.hk_status) === "Dirty" ? " (not cleaned yet)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ))
          )}
        </div>
      )}

      {step === 3 && b && (
        <div className="flex flex-col gap-4">
          {!bill ? (
            <Loading />
          ) : (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-slate-50 p-3 text-center text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Bill</div>
                <div className="font-medium text-navy">{formatMoney(bill.total)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Paid</div>
                <div className="font-medium text-emerald-700">{formatMoney(bill.paid)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Balance</div>
                <div className={cn("font-medium", bill.balance > 0 ? "text-red-700" : "text-emerald-700")}>{formatMoney(bill.balance)}</div>
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                { id: "full", label: "Full payment", hint: "The whole balance now" },
                { id: "advance", label: "Advance", hint: "Part now, rest at check-out" },
                { id: "later", label: "Pay at check-out", hint: "Needs a reason and approval" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setF({ ...f, payChoice: o.id, amount: o.id === "full" ? Math.max(0, bill?.balance ?? 0) : o.id === "advance" ? 0 : 0 })}
                className={cn("rounded-lg border px-3 py-2.5 text-left", f.payChoice === o.id ? "border-navy bg-navy text-white" : "border-line hover:border-slate-400")}
              >
                <span className="block text-sm font-medium">{o.label}</span>
                <span className={cn("block text-xs", f.payChoice === o.id ? "text-white/70" : "text-slate-500")}>{o.hint}</span>
              </button>
            ))}
          </div>
          {f.payChoice !== "later" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Amount received" required>
                <Input type="number" min={1} value={f.amount || ""} onChange={(e) => setF({ ...f, amount: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Mode" required>
                <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  {MODES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Reference">
                <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="UPI ref / receipt no." />
              </Field>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Why at check-out?" required>
                <Textarea rows={2} value={f.laterReason} onChange={(e) => setF({ ...f, laterReason: e.target.value })} placeholder="e.g. Company will pay on departure" />
              </Field>
              <Field label="Approved by" required>
                <Select value={f.laterApprovedBy} onChange={(e) => setF({ ...f, laterApprovedBy: e.target.value })}>
                  <option value="">Choose…</option>
                  {managers.map((m) => (
                    <option key={m.id}>{String(m.name)}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {f.payChoice === "full" && bill && bill.balance > 0 && f.amount < bill.balance && <p className="text-xs text-red-700">Full payment means the whole balance of {formatMoney(bill.balance)}.</p>}
        </div>
      )}

      <div className="mt-6 flex justify-between gap-2">
        <Button variant="secondary" onClick={() => (step === 0 || (preset && step === 1) ? onClose() : setStep(step - 1))}>
          {step === 0 || (preset && step === 1) ? "Cancel" : "Back"}
        </Button>
        {step === 1 && (
          <Button disabled={!idOk || !f.guestName.trim() || !f.phone.trim()} onClick={() => setStep(2)}>
            Next
          </Button>
        )}
        {step === 2 && (
          <Button disabled={!roomsOk} onClick={() => setStep(3)}>
            Next
          </Button>
        )}
        {step === 3 && (
          <Button loading={busy} disabled={!payOk || !idOk} onClick={() => void finish()}>
            Check in
          </Button>
        )}
      </div>
    </Dialog>
  );
}

export function CheckOutDialog({ booking, onClose, onDone }: { booking: Row; onClose: () => void; onDone: () => void }) {
  const user = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [bill, setBill] = useState<{ total: number; paid: number; balance: number; rooms: number; fnb: number } | null>(null);
  const [p, setP] = useState({ amount: 0, mode: "UPI", reference: "", leaveDue: false, note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void billFor(getStore(), booking).then((x) => {
      setBill(x);
      setP((y) => ({ ...y, amount: Math.max(0, x.balance) }));
    });
  }, [booking]);

  const ok = bill && (bill.balance <= 0 || (p.leaveDue ? p.note.trim().length >= 3 : p.amount >= bill.balance));
  const finish = async () => {
    setBusy(true);
    try {
      await doCheckOut(getStore(), booking, { amount: p.leaveDue ? Math.min(p.amount, bill?.balance ?? 0) : p.amount, mode: p.mode, reference: p.reference, note: p.leaveDue ? `Balance left due: ${p.note}` : "" }, user.staff?.id ?? null);
      toast(`${String(booking.guest_name)} checked out. Opening the bill…`, "success");
      onDone();
      router.push(`/guest-bill/?id=${booking.id}`);
    } catch (e) {
      toast(`Could not check out: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Check out · ${String(booking.guest_name)}`}>
      {!bill ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="divide-y divide-line rounded-lg border border-line text-sm">
            {[
              ["Rooms", formatMoney(bill.rooms)],
              ["Food & drinks", formatMoney(bill.fnb)],
              ["Total bill", formatMoney(bill.total)],
              ["Paid", formatMoney(bill.paid)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-3 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-navy">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2">
              <dt className="font-medium text-navy">Balance</dt>
              <dd className={cn("font-semibold", bill.balance > 0 ? "text-red-700" : "text-emerald-700")}>{formatMoney(bill.balance)}</dd>
            </div>
          </dl>
          {bill.balance > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Amount received" required>
                  <Input type="number" min={0} value={p.amount || ""} onChange={(e) => setP({ ...p, amount: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Mode">
                  <Select value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value })}>
                    {MODES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reference">
                  <Input value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-[#17140f]" checked={p.leaveDue} onChange={(e) => setP({ ...p, leaveDue: e.target.checked })} /> Guest leaves with a balance due (company / credit)
              </label>
              {p.leaveDue && (
                <Field label="Reason and who approved" required>
                  <Textarea rows={2} value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} placeholder="e.g. Corporate credit – approved by Harish" />
                </Field>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!ok} onClick={() => void finish()}>
              Check out &amp; print bill
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
