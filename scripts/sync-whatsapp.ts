/**
 * WhatsApp → JD One message sync (runs on Jayesh's Mac, where the WhatsApp
 * bridges live). Reads new direct-chat rows from each bridge's SQLite store,
 * matches the phone to a JD One customer and upserts `messages` rows through
 * the Supabase REST API with the service-role key (never in the browser).
 *
 *   SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…
 *   WA_SYNC_ACCOUNTS=udaisarovar,pronite      (personal is opt-in)
 *   WA_SYNC_CREATE_CUSTOMERS=false            (true = create a customer for unknown numbers)
 *   WA_BRIDGE_ROOT=$HOME/whatsapp-mcp         (where the bridges are)
 *
 * Run: bun run sync:wa   — state in ~/.jdone/wa-sync-state.json, log to stdout.
 */
import { Database } from "bun:sqlite";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Account = "udaisarovar" | "pronite" | "personal";
const BRIDGE_DIRS: Record<Account, string> = {
  udaisarovar: "whatsapp-bridge-udaisarovar",
  pronite: "whatsapp-bridge-pronite",
  personal: "whatsapp-bridge",
};

const root = process.env.WA_BRIDGE_ROOT ?? join(homedir(), "whatsapp-mcp");
const accounts = (process.env.WA_SYNC_ACCOUNTS ?? "udaisarovar,pronite").split(",").map((s) => s.trim()).filter((s): s is Account => s in BRIDGE_DIRS);
const createCustomers = /^(1|true|yes)$/i.test(process.env.WA_SYNC_CREATE_CUSTOMERS ?? "");
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const stateDir = join(homedir(), ".jdone");
const statePath = join(stateDir, "wa-sync-state.json");

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
if (!accounts.length) fail("WA_SYNC_ACCOUNTS has no valid account (udaisarovar, pronite, personal).");

/** Last synced timestamp per account (ISO string as stored by the bridge). */
type State = Partial<Record<Account, string>>;
const state: State = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as State) : {};

/** Indian mobile → 10 digits; anything else → last 10 digits or "". */
function normPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length >= 10) return d.slice(-10);
  return "";
}

/** Phone from a direct-chat JID ("9198…@s.whatsapp.net"); @lid aliases carry no phone. */
function phoneFromJid(jid: string): string {
  if (!jid.endsWith("@s.whatsapp.net")) return "";
  return normPhone(jid.split("@")[0]);
}

interface BridgeRow {
  id: string;
  chat_jid: string;
  sender: string;
  content: string | null;
  timestamp: string;
  is_from_me: number;
  media_type: string | null;
  chat_name: string | null;
}

function readNew(account: Account, since: string | undefined): BridgeRow[] {
  const file = join(root, BRIDGE_DIRS[account], "store", "messages.db");
  if (!existsSync(file)) {
    console.log(`– ${account}: no store at ${file}`);
    return [];
  }
  const db = new Database(file, { readonly: true });
  try {
    // Direct chats only: skip groups, newsletters and status broadcasts.
    const rows = db
      .query<BridgeRow, [string]>(
        `select m.id, m.chat_jid, m.sender, m.content, m.timestamp, m.is_from_me, m.media_type, c.name as chat_name
           from messages m left join chats c on c.jid = m.chat_jid
          where m.timestamp > ?
            and m.chat_jid not like '%@g.us' and m.chat_jid not like '%@newsletter' and m.chat_jid <> 'status@broadcast'
          order by m.timestamp asc limit 2000`,
      )
      .all(since ?? "1970-01-01");
    return rows;
  } finally {
    db.close();
  }
}

const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: (process.env.SUPABASE_SCHEMA ?? process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "public") as "public" } });
const started = new Date().toISOString();
let read = 0, created = 0, customersCreated = 0, unmatched = 0, errors = 0;
const notes: string[] = [];

for (const account of accounts) {
  const rows = readNew(account, state[account]);
  read += rows.length;
  if (!rows.length) {
    console.log(`✓ ${account}: nothing new`);
    continue;
  }
  // Resolve phones → customers in one query per account.
  const phones = Array.from(new Set(rows.map((r) => phoneFromJid(r.chat_jid) || normPhone(r.chat_name ?? "")).filter(Boolean)));
  const customerByPhone = new Map<string, string>();
  if (phones.length) {
    const { data, error } = await client.from("customers").select("id, phone").in("phone", phones);
    if (error) fail(`customers lookup: ${error.message}`);
    for (const c of data ?? []) customerByPhone.set(String(c.phone), String(c.id));
  }
  const payload = [];
  for (const r of rows) {
    const phone = phoneFromJid(r.chat_jid) || normPhone(r.chat_name ?? "");
    let customerId = phone ? customerByPhone.get(phone) : undefined;
    if (!customerId && phone && createCustomers) {
      const { data, error } = await client
        .from("customers")
        .insert({ name: r.chat_name || `WhatsApp ${phone}`, phone, source: "WhatsApp", first_seen: r.timestamp })
        .select("id")
        .single();
      if (error) {
        errors++;
        notes.push(`create customer ${phone}: ${error.message}`);
      } else {
        customerId = String(data.id);
        customerByPhone.set(phone, customerId);
        customersCreated++;
      }
    }
    if (!customerId) unmatched++;
    payload.push({
      customer_id: customerId ?? null,
      channel: "whatsapp",
      account,
      direction: r.is_from_me ? "out" : "in",
      sent_at: new Date(r.timestamp).toISOString(),
      sender_phone: phone || null,
      sender_name: r.chat_name || null,
      body: r.content || null,
      media_type: r.media_type || null,
      chat_jid: r.chat_jid,
      external_id: r.id,
    });
  }
  // Upsert in chunks; (account, external_id) is unique so re-runs are safe.
  for (let i = 0; i < payload.length; i += 200) {
    const part = payload.slice(i, i + 200);
    const { error } = await client.from("messages").upsert(part, { onConflict: "account,external_id", ignoreDuplicates: true });
    if (error) {
      errors++;
      notes.push(`${account} upsert: ${error.message}`);
      console.error(`✖ ${account}: ${error.message}`);
      break;
    }
    created += part.length;
  }
  if (!errors) state[account] = rows[rows.length - 1].timestamp;
  console.log(`✓ ${account}: ${rows.length} new rows synced`);
}

mkdirSync(stateDir, { recursive: true });
writeFileSync(statePath, JSON.stringify(state, null, 2));

await client.from("import_runs").insert({
  source: "whatsapp",
  started_at: started,
  finished_at: new Date().toISOString(),
  rows: read,
  customers_created: customersCreated,
  created,
  updated: 0,
  skipped: unmatched,
  errors,
  message: ["WhatsApp sync", `accounts: ${accounts.join(", ")}`, `unmatched (no customer): ${unmatched}`, ...notes].join("\n"),
});

console.log(`\nWhatsApp sync: read ${read}, synced ${created}, customers created ${customersCreated}, unmatched ${unmatched}, errors ${errors}`);
process.exit(errors ? 1 : 0);
