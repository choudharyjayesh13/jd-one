/**
 * Push a JD One JSON bundle (Settings → Export, or scripts/build-jd-bundle.ts)
 * straight into Supabase with the service-role key — no login needed. Upserts
 * by id in dependency order; business units and staff are merged by NAME so
 * seeds and existing rows are never duplicated.
 *
 *   bun run scripts/import-bundle.ts <bundle.json>
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mergeBundle } from "../src/core/data/merge";
import type { ExportBundle } from "../src/core/data/types";
import type { Row } from "../src/core/schema/types";

const file = process.argv[2];
if (!file) { console.error("usage: bun run scripts/import-bundle.ts <bundle.json>"); process.exit(1); }
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: (process.env.SUPABASE_SCHEMA ?? "public") as "public" } });

const ORDER = ["business_units", "staff", "customers", "leads", "activities", "bookings", "payments", "checkins", "daily_reports", "attendance", "expenses", "stock", "tasks", "targets", "import_runs", "messages", "candidates"];
// Columns that exist in the app but not in the table (computed client-side) are dropped.
const DROP: Record<string, string[]> = { daily_reports: ["sales_total"], bookings: ["paid", "balance"] };

const raw = JSON.parse(readFileSync(file, "utf8")) as ExportBundle;
const [{ data: units }, { data: staff }] = await Promise.all([client.from("business_units").select("*"), client.from("staff").select("*")]);
const bundle = mergeBundle(raw, { business_units: (units ?? []) as Row[], staff: (staff ?? []) as Row[] });

for (const table of ORDER) {
  const rows = bundle.tables[table];
  if (!rows?.length) continue;
  const clean = rows.map((r) => { const c = { ...r }; for (const k of DROP[table] ?? []) delete c[k]; return c; });
  let ok = 0;
  for (let i = 0; i < clean.length; i += 200) {
    const part = clean.slice(i, i + 200);
    const { error } = await client.from(table).upsert(part, { onConflict: "id" });
    if (error) { console.error(`✖ ${table}: ${error.message}`); process.exitCode = 1; break; }
    ok += part.length;
  }
  console.log(`✓ ${table}: ${ok} rows`);
}
