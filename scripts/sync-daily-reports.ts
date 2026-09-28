/**
 * WhatsApp daily report → JD One (shared mode). Runs on the Mac (bridges live
 * there). Reads new "JD group Daily Reports" messages since a checkpoint,
 * parses them and upserts daily_reports (date+unit) and attendance (date+staff),
 * creating unknown staff as active staff of The Udaisarovar.
 *
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (server-side only)
 *   WA_BRIDGE_ROOT=$HOME/whatsapp-mcp
 * Run: bun run sync:reports   — state in ~/.jdone/reports-sync-state.json
 */
import { Database } from "bun:sqlite";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { matchStaffName, parseDailyReport } from "../src/core/import/daily-report";

const GROUP = "120363401132241475@g.us";
const root = process.env.WA_BRIDGE_ROOT ?? join(homedir(), "whatsapp-mcp");
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const stateDir = join(homedir(), ".jdone");
const statePath = join(stateDir, "reports-sync-state.json");
if (!supabaseUrl || !serviceKey) {
  console.error("✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const state: { since?: string } = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const db = new Database(join(root, "whatsapp-bridge", "store", "messages.db"), { readonly: true });
const rows = db
  .query<{ id: string; content: string; timestamp: string }, [string, string]>("select id, content, timestamp from messages where chat_jid = ? and timestamp > ? and content like '%Yesterday%sale%' order by timestamp asc")
  .all(GROUP, state.since ?? "2026-09-01");
db.close();

const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: (process.env.SUPABASE_SCHEMA ?? process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "public") as "public" } });
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const { data: units, error: ue } = await client.from("business_units").select("id, name, short_code");
fail(ue);
const UDS = (units ?? []).find((u) => u.short_code === "UDS" || /udaisarovar/i.test(String(u.name)))?.id;
if (!UDS) throw new Error("Business unit 'The Udaisarovar' not found — run schema.sql seeds first.");
const { data: staffRows, error: se } = await client.from("staff").select("id, name");
fail(se);
const staff = (staffRows ?? []) as { id: string; name: string }[];

let reports = 0, att = 0, created = 0, errors = 0;
const started = new Date().toISOString();
for (const m of rows) {
  const r = parseDailyReport(m.content);
  if (!r) continue;
  if (r.salesTotal != null) {
    const { error } = await client.from("daily_reports").upsert(
      { date: r.salesDate, business_unit_id: UDS, sales_cash: r.salesCash ?? 0, sales_online: r.salesOnline ?? 0, remarks: r.remarks },
      { onConflict: "date,business_unit_id" },
    );
    if (error) { errors++; console.error(`✖ report ${r.salesDate}: ${error.message}`); } else reports++;
  }
  if (r.occupancyUnits != null) await client.from("daily_reports").update({ occupancy_units: r.occupancyUnits }).eq("date", r.reportedDate).eq("business_unit_id", UDS);
  for (const a of r.attendance) {
    let id = matchStaffName(staff, a.name);
    if (!id) {
      const { data, error } = await client.from("staff").insert({ name: a.name, role: "staff", business_unit_id: UDS, designation: a.designation, active: true, joined_on: r.reportedDate, notes: "Auto-created from WhatsApp daily report" }).select("id, name").single();
      if (error) { errors++; console.error(`✖ staff ${a.name}: ${error.message}`); continue; }
      staff.push(data as { id: string; name: string }); id = data.id; created++;
    }
    const { error } = await client.from("attendance").upsert({ date: r.reportedDate, staff_id: id, status: a.status }, { onConflict: "date,staff_id" });
    if (error) { errors++; console.error(`✖ attendance ${a.name} ${r.reportedDate}: ${error.message}`); } else att++;
  }
  if (!errors) state.since = m.timestamp;
}
mkdirSync(stateDir, { recursive: true });
writeFileSync(statePath, JSON.stringify(state));
await client.from("import_runs").insert({ source: "daily-reports", started_at: started, finished_at: new Date().toISOString(), rows: rows.length, customers_created: 0, created: reports, updated: att, skipped: 0, errors, message: `WhatsApp daily reports → ${reports} reports, ${att} attendance marks, ${created} new staff` });
console.log(`Daily reports sync: ${rows.length} messages → ${reports} reports, ${att} attendance marks, ${created} new staff, ${errors} errors`);
process.exit(errors ? 1 : 0);
