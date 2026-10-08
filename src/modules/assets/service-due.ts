/** Service-due arithmetic shared by the asset form, the log hooks and the summary tiles. */
import type { FieldValues } from "../../core/schema/types";
import { addDays, todayISO } from "../../core/format";

/** Days / km before the due point at which a service shows as "due soon". */
export const DUE_SOON_DAYS = 7;
export const DUE_SOON_KM = 300;

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Next service date/km from the last service and the asset's intervals. */
export function nextService(v: FieldValues): { next_service_date: string | null; next_service_km: number | null } {
  const lastDate = v.last_service_date && /^\d{4}-\d{2}-\d{2}$/.test(String(v.last_service_date)) ? String(v.last_service_date) : null;
  const months = num(v.service_interval_months);
  const lastKm = num(v.last_service_km);
  const everyKm = num(v.service_interval_km);
  return {
    next_service_date: lastDate && months ? addMonths(lastDate, months) : null,
    next_service_km: lastKm !== null && everyKm ? lastKm + everyKm : null,
  };
}

export type DueState = "overdue" | "soon" | "ok" | "unknown";

/** Whether an asset's service is overdue / due soon, by date or by km, whichever comes first. */
export function serviceState(a: FieldValues, today = todayISO()): { state: DueState; reason: string } {
  const date = a.next_service_date && /^\d{4}-\d{2}-\d{2}$/.test(String(a.next_service_date)) ? String(a.next_service_date) : null;
  const dueKm = num(a.next_service_km);
  const odo = num(a.odometer_km);
  if (!date && dueKm === null) return { state: "unknown", reason: "No service record yet" };
  if ((date && date < today) || (dueKm !== null && odo !== null && odo >= dueKm)) {
    return { state: "overdue", reason: date && date < today ? `was due ${date}` : `due at ${dueKm} km, now ${odo} km` };
  }
  if ((date && date <= addDays(today, DUE_SOON_DAYS)) || (dueKm !== null && odo !== null && dueKm - odo <= DUE_SOON_KM)) {
    return { state: "soon", reason: date && date <= addDays(today, DUE_SOON_DAYS) ? `due ${date}` : `${dueKm! - odo!} km left` };
  }
  return { state: "ok", reason: date ? `next ${date}` : `next at ${dueKm} km` };
}

/** Raise the asset's odometer if a log reports a higher reading (never lowers it). */
export function higherOdometer(current: unknown, reading: unknown): number | null {
  const c = num(current), r = num(reading);
  if (r === null) return null;
  return c === null || r > c ? r : null;
}
