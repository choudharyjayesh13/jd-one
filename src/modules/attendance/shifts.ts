/** Two-shift day helpers: 07:00–13:00 · 1-hour break (bath & personal work) · 14:00–22:00 by default (per staff on the Staff record). */
import type { Row } from "@/core/schema/types";

export const DEFAULT_SHIFTS = { s1: ["07:00", "13:00"], s2: ["14:00", "22:00"] } as const;
const norm = (v: unknown, d: string) => (/^\d{1,2}:\d{2}$/.test(String(v ?? "").trim()) ? String(v).trim().padStart(5, "0") : d);
export function shiftsOf(s: Row | null | undefined) {
  return {
    s1: [norm(s?.shift1_start, DEFAULT_SHIFTS.s1[0]), norm(s?.shift1_end, DEFAULT_SHIFTS.s1[1])] as [string, string],
    s2: [norm(s?.shift2_start, DEFAULT_SHIFTS.s2[0]), norm(s?.shift2_end, DEFAULT_SHIFTS.s2[1])] as [string, string],
  };
}
export const hhmm = (d: Date) => d.toTimeString().slice(0, 5);
export const pretty = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "am" : "pm"}`;
};
export type Phase = "before" | "shift1" | "break" | "shift2" | "after";
export function phaseAt(s: Row | null | undefined, now: Date): Phase {
  const { s1, s2 } = shiftsOf(s);
  const t = hhmm(now);
  if (t < s1[0]) return "before";
  if (t < s1[1]) return "shift1";
  if (t < s2[0]) return "break";
  if (t < s2[1]) return "shift2";
  return "after";
}
/** The rest period covering "now", if any. */
export function activeRest(rests: Row[], now: Date): Row | null {
  const t = hhmm(now);
  return rests.find((r) => String(r.start_time) <= t && t < String(r.end_time)) ?? null;
}
/** Parse the staff "daily routine": lines like "07:00 Pool check". */
export function routineOf(s: Row | null | undefined): { time: string | null; text: string }[] {
  return String(s?.daily_routine ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d{1,2}[:.]\d{2})\s*[-–:]?\s*(.*)$/);
      return m ? { time: m[1].replace(".", ":").padStart(5, "0"), text: m[2] } : { time: null, text: l };
    });
}
/** Next punch in the two-shift day. */
export function nextPunch(att: Row | null): { field: string; selfie: string; label: string } | null {
  if (!att?.checked_in_at) return { field: "checked_in_at", selfie: "selfie", label: "Start shift 1" };
  if (!att.checked_out_at) return { field: "checked_out_at", selfie: "selfie_out", label: "End shift 1 · go on break" };
  if (!att.shift2_in_at) return { field: "shift2_in_at", selfie: "selfie_shift2_in", label: "Start shift 2" };
  if (!att.shift2_out_at) return { field: "shift2_out_at", selfie: "selfie_shift2_out", label: "End shift 2 · finish the day" };
  return null;
}
