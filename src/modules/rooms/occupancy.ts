/** Shared occupancy maths for the availability calendar, room chart and dashboard. */
import type { Row } from "@/core/schema/types";

/** Booking statuses that hold inventory. */
export const HOLDING_STATUSES: readonly string[] = ["On hold", "Confirmed", "Checked-in"];

/** A booking occupies night `date` when check_in ≤ date < check_out. */
export function occupiesNight(b: Row, date: string): boolean {
  return HOLDING_STATUSES.includes(String(b.status)) && String(b.check_in) <= date && String(b.check_out) > date;
}

/** One room category of a booking (bookings.room_lines). A booking can hold several. */
export interface RoomLine {
  unit_type: string;
  rooms: number;
  adults: number;
  children: number;
  meal_plan: string;
  /** Rate per room per night. */
  rate: number;
  /** Physical rooms assigned, one per room (may be shorter than `rooms`). */
  room_ids?: (string | null)[];
}

export function roomLines(b: Row): RoomLine[] {
  const raw = b.room_lines;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      unit_type: String(l.unit_type ?? ""),
      rooms: Math.max(1, Number(l.rooms) || 1),
      adults: Number(l.adults) || 0,
      children: Number(l.children) || 0,
      meal_plan: String(l.meal_plan ?? "CP"),
      rate: Number(l.rate) || 0,
      room_ids: Array.isArray(l.room_ids) ? (l.room_ids as (string | null)[]) : [],
    }))
    .filter((l) => l.unit_type);
}

/**
 * One row per booked room. A booking with several room categories (room_lines)
 * becomes one row per room, each with its own unit_type and room_id; older
 * bookings stay as they are. `_line` / `_slot` say where a room assignment is stored.
 */
export type Stay = Row & { _bookingId: string; _line?: number; _slot?: number };
export function expandStays(bookings: Row[]): Stay[] {
  const out: Stay[] = [];
  for (const b of bookings) {
    const lines = roomLines(b);
    if (!lines.length) {
      out.push({ ...b, _bookingId: b.id });
      continue;
    }
    lines.forEach((l, li) => {
      for (let k = 0; k < l.rooms; k++) out.push({ ...b, unit_type: l.unit_type, units: 1, meal_plan: l.meal_plan, room_id: l.room_ids?.[k] ?? null, _bookingId: b.id, _line: li, _slot: k });
    });
  }
  return out;
}

/** Room lines with a room assigned (or cleared) for one stay; used when saving a room-chart assignment. */
export function withRoomAssigned(b: Row, line: number, slot: number, roomId: string | null): RoomLine[] {
  return roomLines(b).map((l, li) => {
    if (li !== line) return l;
    const ids = Array.from({ length: l.rooms }, (_, k) => l.room_ids?.[k] ?? null);
    ids[slot] = roomId;
    return { ...l, room_ids: ids };
  });
}

/** Short room label for lists: "2 × Lake View Cottage + 1 × Family Suite". */
export function roomsLabel(b: Row): string {
  const ls = roomLines(b);
  if (!ls.length) return String(b.unit_type ?? "");
  return ls.map((l) => `${l.rooms} × ${l.unit_type}`).join(" + ");
}

/** Units of a room type booked on a night. */
export function bookedUnits(bookings: Row[], unitType: string, date: string): number {
  return expandStays(bookings)
    .filter((b) => b.unit_type === unitType && occupiesNight(b, date))
    .reduce((s, b) => s + Number(b.units ?? 1), 0);
}

/** The booking (stay) assigned to a physical room on a night, if any. */
export function bookingForRoom(bookings: Row[], roomId: string, date: string): Row | undefined {
  return expandStays(bookings).find((b) => b.room_id === roomId && occupiesNight(b, date));
}

/** Rooms occupied on a night, across all room types. */
export function roomsOccupied(bookings: Row[], date: string): number {
  return expandStays(bookings)
    .filter((b) => occupiesNight(b, date))
    .reduce((s, b) => s + Number(b.units ?? 1), 0);
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
