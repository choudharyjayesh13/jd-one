"use client";
/**
 * Back-dating for the Chairman and the Director: on screens that normally stamp "now" (guest check-in,
 * check-out, staff attendance) they can pick any date and time instead. Everything the Director changes
 * is written to the Chairman's "Director changes" list by the database (trigger zz_log_director_change).
 */
import { useUser } from "@/core/auth/AuthProvider";
import { Field, Input } from "@/core/ui/Input";

const IST = "Asia/Kolkata";

/** Now as a value for <input type="datetime-local"> in India time. */
export function nowLocalInput(): string {
  const d = new Date();
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

/** "2026-11-10T14:30" (India time) → ISO timestamp. Empty → undefined (use now). */
export function localInputToISO(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}:00+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** The India date (YYYY-MM-DD) of an ISO timestamp. */
export function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: IST });
}

/** The date-and-time picker shown only to the Chairman and the Director. */
export function BackdateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const user = useUser();
  if (!user.post) return null;
  return (
    <div className="rounded-lg border border-dashed border-[#c9a54c] bg-[#fdf9ef] p-3">
      <Field label={label} help={user.post === "director" ? "Director only. Change it for a past entry – the Chairman is told about it." : "Chairman / Director only. Change it for a past entry."}>
        <Input type="datetime-local" value={value} max={nowLocalInput()} onChange={(e) => onChange(e.target.value)} />
      </Field>
    </div>
  );
}
