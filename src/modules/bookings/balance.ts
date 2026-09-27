/** Booking balance = total − Σ payments. Re-run whenever either side changes. */
import type { DataStore } from "@/core/data/types";

export async function paidForBooking(store: DataStore, bookingId: string): Promise<number> {
  const payments = await store.list("payments", { filter: { booking_id: bookingId } });
  return payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
}

export async function recomputeBalance(store: DataStore, bookingId: string): Promise<void> {
  const booking = await store.get("bookings", bookingId);
  if (!booking) return;
  const paid = await paidForBooking(store, bookingId);
  const balance = Number(booking.total ?? 0) - paid;
  if (Number(booking.balance) !== balance || Number(booking.paid) !== paid) await store.update("bookings", bookingId, { balance, paid });
}
