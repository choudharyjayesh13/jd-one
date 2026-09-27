/**
 * One-time: build a JD One data bundle from Jayesh's existing records so the
 * app starts with real history. Sources:
 *   • WhatsApp "JD group Daily Reports" (personal bridge SQLite) → daily_reports + attendance + staff roster
 *   • Apple Notes "Udaisarovar Expense Register" export (markdown, optional) → expenses
 * Output: an ExportBundle JSON (import via Settings → Import JSON backup, in
 * local OR shared mode). Ids are deterministic (hash of source keys), so
 * re-running and re-importing never duplicates.
 *
 *   bun run bundle:jd -- --since 2026-06-01 --notes /path/all-notes.md --out ~/Desktop/jd-one-data.json
 */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseDailyReport, staffKey } from "../src/core/import/daily-report";
import { BUSINESS_UNIT_SEED } from "../src/modules/business-units/entity";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
const since = args.get("since") ?? "2026-06-01";
const notesPath = args.get("notes");
const out = args.get("out") ?? join(homedir(), "Desktop", "jd-one-data.json");
const dbPath = args.get("db") ?? join(homedir(), "whatsapp-mcp", "whatsapp-bridge", "store", "messages.db");
const GROUP = "120363401132241475@g.us"; // JD group Daily Reports

const uuid = (...parts: string[]) => {
  const h = createHash("sha1").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const now = new Date().toISOString();
const base = (id: string, created = now) => ({ id, created_at: created, updated_at: now, created_by: null });

const units = BUSINESS_UNIT_SEED.map((u) => ({ ...base(uuid("unit", u.name)), ...u, active: true }));
const UDS = units.find((u) => u.short_code === "UDS")!.id;

// ---- Daily reports ---------------------------------------------------------
type Msg = { id: string; content: string; timestamp: string };
const db = new Database(dbPath, { readonly: true });
const msgs = db
  .query<Msg, [string, string]>("select id, content, timestamp from messages where chat_jid = ? and timestamp >= ? and content like '%Yesterday%sale%' order by timestamp asc")
  .all(GROUP, since);
db.close();

const DESIGNATION: Record<string, string> = { gm: "General Manager", chief: "Chef", chef: "Chef", cook: "Cook", waiter: "Waiter", houskeping: "Housekeeping", housekeeping: "Housekeeping", "house keeping": "Housekeeping", helper: "Helper", "kitchen helper": "Kitchen helper", driver: "Driver", guard: "Security guard", security: "Security guard" };
const staffByKey = new Map<string, { id: string; name: string; designation: string | null; first: string; last: string; roles: Set<string> }>();
const reports = new Map<string, Record<string, unknown>>();
const attendance = new Map<string, Record<string, unknown>>();

for (const m of msgs) {
  const r = parseDailyReport(m.content);
  if (!r) continue;
  if (r.salesTotal != null)
    reports.set(r.salesDate, {
      ...base(uuid("report", UDS, r.salesDate), m.timestamp),
      date: r.salesDate,
      business_unit_id: UDS,
      sales_cash: r.salesCash ?? 0,
      sales_online: r.salesOnline ?? 0,
      sales_total: r.salesTotal,
      occupancy_units: null,
      submitted_by: null,
      remarks: r.remarks,
    });
  const occ = r.occupancyUnits;
  if (occ != null) {
    const existing = reports.get(r.reportedDate);
    if (existing) existing.occupancy_units = occ;
  }
  for (const a of r.attendance) {
    const k = staffKey(a.name).replace(/bairwa$/, "").replace(/keer$/, ""); // "Harish Bairwa" and "Harish" are one person
    let s = staffByKey.get(k);
    if (!s) {
      s = { id: uuid("staff", k), name: a.name, designation: null, first: r.reportedDate, last: r.reportedDate, roles: new Set() };
      staffByKey.set(k, s);
    }
    if (a.name.length > s.name.length) s.name = a.name;
    if (a.designation) s.roles.add(a.designation.toLowerCase().trim());
    if (r.reportedDate < s.first) s.first = r.reportedDate;
    if (r.reportedDate > s.last) s.last = r.reportedDate;
    attendance.set(`${r.reportedDate}|${s.id}`, { ...base(uuid("att", s.id, r.reportedDate), m.timestamp), date: r.reportedDate, staff_id: s.id, status: a.status, remarks: null });
  }
}

const today = now.slice(0, 10);
const staff = Array.from(staffByKey.values()).map((s) => {
  const roleKey = Array.from(s.roles).pop() ?? "";
  const designation = DESIGNATION[roleKey] ?? (roleKey ? roleKey[0].toUpperCase() + roleKey.slice(1) : null);
  const stillHere = (Date.parse(today) - Date.parse(s.last)) / 86_400_000 <= 30; // text reports stopped for a while (photos instead)
  const name = s.name.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    ...base(s.id),
    name,
    phone: null,
    email: null,
    role: designation === "General Manager" ? "manager" : "staff",
    business_unit_id: UDS,
    designation,
    active: stillHere,
    joined_on: s.first,
    left_on: stillHere ? null : s.last,
    salary: null,
    auth_user_id: null,
    notes: `Roster built from WhatsApp daily reports (${s.first} → ${s.last}). Add phone/salary.`,
  };
});

// ---- Expenses from the Apple Notes register export -------------------------
const CATS = ["Utilities & power", "Salaries & staff", "Maintenance & hardware", "Kitchen & food", "Fuel & gas", "Ads, marketing & hiring", "Other"];
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const expenses: Record<string, unknown>[] = [];
if (notesPath && existsSync(notesPath)) {
  const text = readFileSync(notesPath, "utf8");
  const section = text.split(/^# /m).find((s) => s.startsWith("Udaisarovar Expense Register")) ?? "";
  let year = "2026";
  for (const line of section.split("\n")) {
    const hdr = line.match(/\b(20\d\d)\b/);
    if (/^[A-Z]{3,9} 20\d\d/.test(line.trim()) && hdr) year = hdr[1];
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    const dm = cells[1].match(/^(\d{1,2})\s+([A-Za-z]{3})/);
    const amount = Number(cells[3].replace(/[^\d.]/g, ""));
    if (!dm || !amount) continue;
    const cat = CATS.find((c) => c.toLowerCase() === cells[4].toLowerCase()) ?? "Other";
    const date = `${year}-${MONTHS[dm[2].toLowerCase()] ?? "01"}-${dm[1].padStart(2, "0")}`;
    const detail = cells[2];
    const vendor = detail.split(/ – | - |,|\(/)[0].slice(0, 60) || "Expense";
    expenses.push({ ...base(uuid("exp", date, detail, String(amount))), date, business_unit_id: UDS, amount, category: cat, vendor, detail, paid_by: null, mode: /upi|imps|paytm|phonepe|neft|bank/i.test(detail) ? "UPI" : "Cash", receipt: null });
  }
}

const bundle = {
  app: "jd-one",
  version: 1,
  exportedAt: now,
  tables: {
    business_units: units,
    staff,
    daily_reports: Array.from(reports.values()),
    attendance: Array.from(attendance.values()),
    expenses,
  },
};
writeFileSync(out, JSON.stringify(bundle, null, 1));
console.log(`Bundle → ${out}`);
console.log(`  reports parsed     ${msgs.length} messages → ${reports.size} daily reports (${since} onwards)`);
console.log(`  staff              ${staff.length}: ${staff.map((s) => `${s.name}${s.active ? "" : " (left)"}`).join(", ")}`);
console.log(`  attendance rows    ${attendance.size}`);
console.log(`  expenses           ${expenses.length}`);
