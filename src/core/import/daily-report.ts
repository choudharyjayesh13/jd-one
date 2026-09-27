/**
 * Parser for the WhatsApp "JD group Daily Reports" message the resort GM posts
 * every morning. Layout (stable since 2026):
 *
 *   Attendance & Reported Date
 *     13/09/2026 Today
 *   Sales till yesterday -  Rs/- 177275
 *   Yesterday sale:- 2220
 *   Cash:- 700
 *   Online:- 1520
 *   Harish Bairwa [GM] - (P)- 14
 *   Narendra  [Chief]-(A)
 *   Total cottage occupied - 4
 *   Achieved :  174495
 *
 * "Yesterday sale" belongs to the day BEFORE the reported date; attendance and
 * occupancy belong to the reported date itself.
 */
export interface ParsedAttendance {
  name: string;
  designation: string | null;
  status: "P" | "A" | "H" | "L";
}

export interface ParsedDailyReport {
  /** Date the report was made (attendance/occupancy date), ISO yyyy-mm-dd. */
  reportedDate: string;
  /** Date the sales figures refer to (reportedDate − 1 day). */
  salesDate: string;
  salesCash: number | null;
  salesOnline: number | null;
  salesTotal: number | null;
  salesMtd: number | null;
  occupancyUnits: number | null;
  attendance: ParsedAttendance[];
  remarks: string;
}

const num = (s: string | undefined) => {
  if (s == null) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function isoMinusOne(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Skips admin-office lines (owner/family marked "Present") — only resort staff lines carry [Role] (P). */
const STAFF_LINE = /^\s*([A-Za-z][A-Za-z .']+?)\s*\[([^\]]*)\]\s*[-–:]*\s*\(\s*([PpAaHhLl])\s*\)/;
/** Older layout (Jun–Aug 2026): "Gaurav saini  GM    (P)", "Kailash. Waiter.   (P)", "Shakti singh. Chief. (P)". */
const ROLE_WORDS = "GM|General Manager|Manager|Housekeeping|Houskeping|House keeping|Helper|Kitchen helper|Waiter|Driver|Chief|Chef|Cook|Guard|Security|Front office|Reception|Sales";
const STAFF_LINE_OLD = new RegExp(`^\\s*([A-Za-z][A-Za-z. ']+?)[.\\s]+(${ROLE_WORDS})\\.?\\s*[-–:]*\\s*\\(\\s*([PpAaHhLl])\\s*\\)`, "i");

/** Returns null when the text is not a daily report (no reported date + no sales line). */
export function parseDailyReport(text: string): ParsedDailyReport | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const dateM = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:Today)?/i);
  const yesterday = text.match(/Yesterday\s*sale\s*:?-?\s*(?:Rs\/?-?)?\s*([\d,]+)/i);
  if (!dateM || !yesterday) return null;
  const [, dd, mm, yyyy] = dateM;
  const reportedDate = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const cash = text.match(/\bCash\s*:?-?\s*(?:Rs\/?-?)?\s*([\d,]+)/i);
  const online = text.match(/\bOnline\s*:?-?\s*(?:Rs\/?-?)?\s*([\d,]+)/i);
  const mtd = text.match(/Sales\s*till\s*yesterday\s*-?\s*(?:Rs\/?-?)?\s*([\d,]+)/i);
  const occ = text.match(/Total\s*cottage\s*occupied\s*-?\s*([\d]+)/i);
  const attendance: ParsedAttendance[] = [];
  for (const l of lines) {
    const m = l.match(STAFF_LINE) ?? l.match(STAFF_LINE_OLD);
    if (!m) continue;
    const name = m[1].replace(/[.]+$/, "").replace(/\s+/g, " ").trim();
    if (!name || /sir|ma.?am/i.test(name)) continue;
    attendance.push({ name, designation: m[2].trim() || null, status: m[3].toUpperCase() as ParsedAttendance["status"] });
  }
  const salesTotal = num(yesterday[1]);
  const salesCash = num(cash?.[1]);
  const salesOnline = num(online?.[1]);
  return {
    reportedDate,
    salesDate: isoMinusOne(reportedDate),
    salesCash: salesCash ?? (salesTotal != null && salesOnline != null ? salesTotal - salesOnline : null),
    salesOnline: salesOnline ?? (salesTotal != null && salesCash != null ? salesTotal - salesCash : null),
    salesTotal,
    salesMtd: num(mtd?.[1]),
    occupancyUnits: occ ? num(occ[1]) : null,
    attendance,
    remarks: `From WhatsApp daily report of ${dd}/${mm}/${yyyy}${mtd ? ` · MTD ₹${mtd[1]}` : ""}`,
  };
}

/** Normalise a staff display name for matching ("sunder" ≈ "Sunder", "Narendra  " ≈ "Narendra"). */
export function staffKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

/** "Harish Bairwa" matches "Harish"; "Aasharam Keer" matches "Aasharam". */
export function matchStaffName(existing: { id: string; name: unknown }[], name: string): string | null {
  const k = staffKey(name);
  if (!k) return null;
  const exact = existing.find((s) => staffKey(String(s.name)) === k);
  if (exact) return exact.id;
  const first = k.split(/(?=[A-Z])/)[0];
  const hit = existing.find((s) => staffKey(String(s.name)).startsWith(first) || k.startsWith(staffKey(String(s.name))));
  return hit?.id ?? null;
}
