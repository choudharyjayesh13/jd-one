/** Shared occupancy maths for the availability calendar, room chart and dashboard. */
import type { Row } from "@/core/schema/types";

/** Booking statuses that hold inventory. */
export const HOLDING_STATUSES: readonly string[] = ["Confirmed", "Checked-in"];

/** A booking occupies night `date` when check_in ≤ date < check_out. */
export function occupiesNight(b: Row, date: string): boolean {
  return HOLDING_STATUSES.includes(String(b.status)) && String(b.check_in) <= date && String(b.check_out) > date;
}

/** Units of a room type booked on a night. */
export function bookedUnits(bookings: Row[], unitType: string, date: string): number {
  return bookings.filter((b) => b.unit_type === unitType && occupiesNight(b, date)).reduce((s, b) => s + Number(b.units ?? 1), 0);
}

/** The booking assigned to a physical room on a night, if any. */
export function bookingForRoom(bookings: Row[], roomId: string, date: string): Row | undefined {
  return bookings.find((b) => b.room_id === roomId && occupiesNight(b, date));
}

/** yyyy-mm-dd list from `start` for `n` days. */
export function dayList(start: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export function weekday(iso: string): string {
  return WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}
export function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6 || d === 5;
}
