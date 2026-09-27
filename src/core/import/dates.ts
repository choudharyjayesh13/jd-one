/** Tolerant date parsing for spreadsheet exports (dd/mm/yyyy, dd-MMM-yyyy, ISO, Excel serials). */
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
const ok = (y: number, m: number, d: number) => (y >= 1900 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

/** Returns yyyy-mm-dd or null. Day-first is assumed for numeric dd/mm/yyyy (Indian sheets). */
export function parseSheetDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return ok(y, +m[2], +m[1]);
  }
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,4})[\s-,]*(\d{2,4})/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return ok(y, MONTHS[m[2].toLowerCase()], +m[1]);
  }
  m = /^([A-Za-z]{3,4})[\s-]+(\d{1,2})[\s,]+(\d{4})/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return ok(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Meta's created_time arrives either with an offset ("2026-09-20T02:31:45-0500")
 * or without one, in which case the sheet is in UTC−5 (per the agency setup).
 * Returns an ISO UTC timestamp; the app displays it in IST.
 */
export function parseMetaTimestamp(raw: unknown): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(" ", "T");
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (!hasOffset) {
    const date = parseSheetDate(s);
    const time = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (!date) return null;
    s = `${date}T${time ? `${pad(+time[1])}:${time[2]}:${time[3] ?? "00"}` : "00:00:00"}-05:00`;
  } else s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
