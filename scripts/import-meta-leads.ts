/**
 * Daily Meta leads import (server-side, bun).
 *
 *   META_LEADS_CSV_URLS=https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>,…
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=…      (never expose this in the browser)
 *
 * Run: bun run import:meta   (bun loads .env / .env.local automatically)
 * Fetches every tab, parses with the shared parser, upserts customers by phone
 * and leads by external_id, fills blanks only, records an import_runs row.
 */
import { createClient } from "@supabase/supabase-js";
import { parseMetaLeads } from "../src/core/import/meta-leads";
import { importLeads } from "../src/core/import/run";
import { supabaseSink } from "../src/core/import/sinks";
import type { ImportedLead } from "../src/core/import/types";

const urls = (process.env.META_LEADS_CSV_URLS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!urls.length) fail("META_LEADS_CSV_URLS is empty (comma-separated CSV export URLs, one per sheet tab).");
if (!supabaseUrl || !serviceKey) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const all: ImportedLead[] = [];
const notes: string[] = [];
let rowsRead = 0;

for (const url of urls) {
  const label = url.replace(/^https?:\/\//, "").slice(0, 80);
  try {
    const res = await fetch(url, { redirect: "follow" });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("Got an HTML page instead of CSV — is the sheet shared as 'Anyone with the link' / published?");
    const { leads, headers, rows } = parseMetaLeads(text);
    rowsRead += rows;
    if (!leads.length && !headers.some((h) => /phone_number/i.test(h))) {
      notes.push(`Skipped ${label}: no phone_number column`);
      console.log(`– ${label}: skipped (no phone_number column)`);
      continue;
    }
    console.log(`✓ ${label}: ${rows} rows → ${leads.length} leads`);
    all.push(...leads);
  } catch (e) {
    notes.push(`Fetch failed ${label}: ${(e as Error).message}`);
    console.error(`✖ ${label}: ${(e as Error).message}`);
  }
}

const summary = await importLeads(all, supabaseSink(client), { source: "meta", label: ["Scheduled Meta import", ...notes].join("\n") });
summary.rows = rowsRead;
console.log("");
console.log("Meta leads import summary");
console.log(`  rows read          ${rowsRead}`);
console.log(`  customers created  ${summary.customersCreated}`);
console.log(`  leads created      ${summary.created}`);
console.log(`  leads updated      ${summary.updated}`);
console.log(`  skipped            ${summary.skipped}`);
console.log(`  errors             ${summary.errors}`);
for (const m of summary.messages) console.log(`  · ${m}`);
if (notes.length === urls.length && urls.length > 0) fail("Every sheet failed to load.");
process.exit(summary.errors ? 1 : 0);
