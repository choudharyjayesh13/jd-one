"use client";
/** Front desk helpers: the guest bill total, and check-in / check-out actions. */
import type { DataStore } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { saveRecord } from "@/core/data/service";
import { todayISO } from "@/core/format";
import { nightsBetween } from "@/modules/customers/stats";
import { roomLines, type RoomLine } from "@/modules/rooms/occupancy";

export const PAY_LATER_TAG = "[Pay at check-out]";

/** Same sums as the printed guest bill: rooms (+ GST on website bookings) + food & drinks − payments. */
export async function billFor(store: DataStore, b: Row): Promise<{ total: number; paid: number; balance: number; rooms: number; fnb: number }> {
  const [payments, kots] = await Promise.all([store.list("payments", { filter: { booking_id: b.id } }), store.list("kots", { filter: { booking_id: b.id } })]);
  const nights = nightsBetween(b.check_in, b.check_out);
  const lines = roomLines(b);
  const website = !!b.booking_ref;
  const rooms = lines.length ? lines.reduce((s, l) => s + l.rate * l.rooms * nights, 0) : Number(website ? (b.room_amount ?? b.total) : b.total) || 0;
  const tax = website ? Number(b.tax_amount ?? 0) : 0;
  const fnb = kots.filter((k) => k.status !== "Cancelled").reduce((s, k) => s + (Number(k.amount) || 0), 0);
  const total = rooms + tax + fnb;
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { total, paid, balance: total - paid, rooms: rooms + tax, fnb };
}

export interface CheckInInput {
  booking: Row;
  guestName: string;
  phone: string;
  idType: string;
  idNumber: string;
  roomIds: string[]; // one per booked room, in room-line order
  roomNames: string[];
  payChoice: "full" | "advance" | "later";
  amount: number;
  mode: string;
  reference: string;
  laterReason: string;
  laterApprovedBy: string;
  staffId: string | null;
}

/** Records the check-in: payment (if any), the check-in register line, rooms on the booking, status. */
export async function doCheckIn(store: DataStore, x: CheckInInput): Promise<void> {
  const ctx = { store, staffId: x.staffId };
  const b = x.booking;
  if (x.payChoice !== "later" && x.amount > 0) {
    await saveRecord("payments", { booking_id: b.id, date: todayISO(), amount: x.amount, mode: x.mode, reference: x.reference || null, received_by: x.staffId, notes: x.payChoice === "full" ? "Full payment at check-in" : "Advance at check-in" }, ctx);
  }
  // Rooms onto the booking (per category line).
  const lines = roomLines(b);
  let k = 0;
  const newLines: RoomLine[] = lines.map((l) => {
    const ids = Array.from({ length: l.rooms }, () => x.roomIds[k++] ?? null);
    return { ...l, room_ids: ids };
  });
  const roomNames = x.roomNames.filter(Boolean);
  const notes = x.payChoice === "later" ? `${PAY_LATER_TAG} ${x.laterReason}${x.laterApprovedBy ? ` · approved by ${x.laterApprovedBy}` : ""}` : null;
  await store.create("checkins", {
    booking_id: b.id,
    actual_in: new Date().toISOString(),
    id_proof_type: x.idType,
    id_number: x.idNumber.replace(/\s/g, "").slice(-4),
    room_numbers: roomNames.length ? roomNames.join(", ") : null,
    handled_by: x.staffId,
    notes,
    created_by: x.staffId,
  });
  await store.update("bookings", b.id, {
    status: "Checked-in",
    guest_name: x.guestName.trim() || b.guest_name,
    phone: x.phone.trim() || b.phone,
    ...(lines.length ? { room_lines: newLines } : {}),
    ...(x.roomIds[0] ? { room_id: x.roomIds[0] } : {}),
  });
}

/** Records the check-out: final payment (if any), time out, status, and the rooms go to "Dirty" for housekeeping. */
export async function doCheckOut(store: DataStore, b: Row, pay: { amount: number; mode: string; reference: string; note: string }, staffId: string | null): Promise<void> {
  const ctx = { store, staffId };
  if (pay.amount > 0) await saveRecord("payments", { booking_id: b.id, date: todayISO(), amount: pay.amount, mode: pay.mode, reference: pay.reference || null, received_by: staffId, notes: "Paid at check-out" }, ctx);
  const open = (await store.list("checkins", { filter: { booking_id: b.id } })).find((c) => !c.actual_out);
  const note = pay.note ? `Check-out: ${pay.note}` : null;
  if (open) await store.update("checkins", open.id, { actual_out: new Date().toISOString(), ...(note ? { notes: [open.notes, note].filter(Boolean).join("\n") } : {}) });
  else await store.create("checkins", { booking_id: b.id, actual_out: new Date().toISOString(), handled_by: staffId, notes: note, created_by: staffId });
  await store.update("bookings", b.id, { status: "Checked-out" });
  const ids = new Set([String(b.room_id ?? ""), ...roomLines(b).flatMap((l) => (l.room_ids ?? []).map(String))].filter((v) => v && v !== "null"));
  for (const id of ids) await store.update("rooms", id, { hk_status: "Dirty", dnd: false }).catch(() => undefined);
}
