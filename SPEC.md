# JD One — JD Group staff operations app (spec v1, 27 Sep 2026)

Owner: Jayesh Choudhary (JD Group, Udaipur). Non-developer. English UI. Currency ₹ (Indian formatting), timezone Asia/Kolkata, dates dd-MMM-yyyy.

## Goal
One web app (PWA) at app.myjdgroup.com where ALL business forms are interconnected: a Lead becomes a Booking, a Booking produces Check-ins and Payments, Daily Reports roll up Sales/Attendance/Expenses, and the Dashboard reads everything. Phase 1 = staff only. Phase 2 = customers (bookings, membership) in the SAME app, so the architecture must support public routes + customer role later without a rewrite.

## Stack (future-proof, mainstream, typed)
- Next.js 16 (App Router) + React 19 + TypeScript (strict). Tailwind CSS 4. lucide-react icons. No UI kit lock-in: small own components (Button, Input, Select, Card, Table, Dialog, Toast).
- Data: Supabase (Postgres + Auth + Storage + RLS). `@supabase/supabase-js` v2.
- Static export (`output: 'export'`) so it deploys to GitHub Pages today and Vercel later with zero code change. `basePath` from env `NEXT_PUBLIC_BASE_PATH` (default ''), `trailingSlash: true`, `images.unoptimized: true`.
- PWA: `public/manifest.webmanifest`, icons (generate simple SVG→PNG 192/512 with a "JD" monogram, dark navy #0B1F3A + gold #C9A227), theme colour, `public/sw.js` (cache-first for app shell, network-first for data) registered from a client component.
- Package manager: bun (`bun install`, `bun run build`). Lockfile committed. ESLint via next config.

## Architecture (the part that makes upgrades cheap)
1. `src/core/schema/` — **entity registry**. Each module exports an `EntityDef` (name, label, icon, table, fields[], listColumns, relations, defaultSort, permissions). Field types: text, textarea, number, money, date, datetime, select(options), boolean, phone, email, relation(entity), file(image). Relations declare `many-to-one` (e.g. booking.lead_id → leads) and reverse lists (lead → bookings). Adding a new form = adding one EntityDef file + a SQL migration. No per-form UI code.
2. `src/core/data/` — `DataStore` interface: `list(entity, query)`, `get`, `create`, `update`, `remove`, `subscribe` (optional). Two implementations:
   - `SupabaseStore` (used when `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set).
   - `LocalStore` — IndexedDB (via `idb` package) so the app works TODAY on a device without a backend (Jayesh's Supabase projects are currently down). Same interface; includes JSON export/import (Settings page) so data can be migrated into Supabase later.
   The store is chosen once in `src/core/data/index.ts`; the UI never imports Supabase directly.
3. `src/core/ui/` — generic `EntityList` (table + search + filter by business unit + "New" button), `EntityForm` (renders fields from EntityDef, relation fields as searchable selects that can also "+ create new" inline, validation, save), `EntityDetail` (record + tabs of related records + actions). Mobile-first (staff on phones), works on desktop.
4. `src/modules/` — one folder per module, each with `entity.ts` (+ optional custom widgets). Modules v1:
   - `business-units` (seed: The Udaisarovar, Pronite, CPC – Choudhary Properties & Consultancy, JD Group HQ, Hotel Kirti Plaza, The Artist House, House of Beauty). Every other entity has `business_unit_id` (relation) and lists filter by it.
   - `staff` (name, phone, role: owner|manager|staff, business_unit, active, joined_on, salary). Auth user id link (`auth_user_id`, nullable).
   - `leads` (CRM): name, phone, email, source(Meta Ads|Google Ads|Website|Instagram|WhatsApp|Walk-in|Referral|Channel Partner|OTA|Event|Cold Call|Other), campaign, requirement, stay/visit dates, guests, qualification(Hot|Warm|Cold|Unqualified), stage(New|Contacted|Qualified|Proposal|Negotiation|Won|Lost|On Hold), assigned_to→staff, next_follow_up, lost_reason, notes. Actions: "Convert to booking" (prefills a booking with lead data and links lead_id; sets stage Won on confirm).
   - `activities` (lead_id, type call|whatsapp|meeting|site visit|email, summary, next_action, next_action_date, done_by→staff).
   - `bookings`: guest_name, phone, lead_id (optional), business_unit, check_in, check_out, unit_type(Lake View Cottage|Pool View Cottage|Family Suite|Camping|Glass House|Other), units, adults, children, meal_plan(EP|CP|MAP|AP), rate, total, advance, balance (computed), source(Direct|MMT/Goibibo|Booking.com|Airbnb|Agoda|Expedia|Walk-in|Corporate), status(Enquiry|Confirmed|Checked-in|Checked-out|Cancelled|No-show), special_requests. Reverse: payments, checkins.
   - `payments` (booking_id, date, amount, mode Cash|UPI|Card|Bank|OTA, reference, received_by→staff). Booking balance = total − Σpayments.
   - `checkins` (booking_id, actual_in, actual_out, id_proof_type, id_number(last 4 only), vehicle, room_numbers, notes, handled_by→staff). Action from booking: "Check in now" / "Check out now" updates booking.status.
   - `daily-reports`: date, business_unit, sales_cash, sales_online, sales_total(computed), occupancy_units, remarks, submitted_by→staff. One per unit per day (unique).
   - `attendance`: date, staff_id, status(P|A|H|L), remarks. Grid view for a month (rows staff, cols days) as a custom widget plus the generic form.
   - `expenses`: date, business_unit, amount, category(Utilities & power|Salaries & staff|Maintenance & hardware|Kitchen & food|Fuel & gas|Ads, marketing & hiring|Other), vendor, detail, paid_by→staff, mode, receipt(image file → Supabase Storage bucket `receipts`; LocalStore keeps a data URL).
   - `stock`: item, unit, quantity, min_quantity, business_unit, last_counted; low-stock flag.
   - `tasks`: title, business_unit, type(Maintenance|Housekeeping|Purchase|Follow-up|Other), priority, assigned_to→staff, due, status(Open|In progress|Done), notes, related booking (optional).
5. `src/app/` routes: `/login`, `/` (Dashboard: today's check-ins/outs, sales MTD vs target per unit, open leads + overdue follow-ups, low stock, open tasks, attendance today), `/[entity]` list, `/[entity]/new`, `/[entity]/[id]` detail/edit — generic pages driven by the registry (`generateStaticParams` for entity names; ids handled client-side with `?id=` query or a client router since static export cannot do dynamic ids → use `/[entity]/view?id=` pattern). `/settings` (business units, staff, targets per unit per month, data export/import, backend status, install app). `/attendance/grid` custom.
6. Auth & roles: with Supabase → email+password (staff invited by owner), `staff.auth_user_id` links; role gates (owner sees settings + all units; manager sees own unit; staff sees own unit forms). With LocalStore → simple 4-digit PIN gate stored locally (labelled "local mode – single device"). Design so a future `customer` role + public `/book` route can be added.
7. `supabase/schema.sql`: all tables above (uuid PK, created_at, updated_at trigger, created_by), FKs, indexes, `business_units` + `targets` (unit, month, target_amount), RLS: authenticated users with a `staff` row may read/write; owner role may delete; storage bucket `receipts`. Include seed inserts for business units and unit types. Idempotent (`if not exists`).
8. `src/core/format.ts` (₹ formatting en-IN, dates), `src/core/csv.ts` (export any list to CSV).
9. Config: `.env.example` with the two Supabase vars + `NEXT_PUBLIC_BASE_PATH`. README.md in plain language for Jayesh: what it is, how to open it, how to add staff, how to switch from local mode to shared mode (create Supabase project → run schema.sql → paste two keys → redeploy), how to add a new form (for a developer).
10. GitHub Actions `.github/workflows/pages.yml`: on push to main → bun install, `NEXT_PUBLIC_BASE_PATH=/jd-one bun run build`, upload `out/` → deploy to GitHub Pages. Add `public/.nojekyll`.

## Quality bar
- `bun run build` must pass with zero TypeScript errors; `bun run lint` clean or only warnings.
- Seed demo data in LocalStore on first run (3 leads, 2 bookings, today's daily report) so the app is not empty; a "Clear demo data" button in Settings.
- Every list has search; every form has required-field validation and a success toast; every relation renders as a link to the related record.
- Keep files small and named clearly; comments explain the "why". No secrets in the repo.

## Clarification from Jayesh (27 Sep 2026, during build)
- JD One is the INTERNAL app only: all staff, HR, Accounts, Finance and Marketing teams share ONE app and ONE dashboard. Guests/customers will get a DIFFERENT, separate app later — do NOT add customer routes/roles here.
- Roles (staff.role): owner | manager | hr | accounts | finance | marketing | staff. Team → module mapping:
  - HR: staff, attendance, tasks; dashboard cards = attendance today, staff count, joiners/leavers.
  - Accounts: expenses, payments, daily-reports; dashboard = today's cash/online, expenses MTD by category, receipts pending.
  - Finance: daily-reports, payments, expenses, targets, bookings (read); dashboard = sales MTD vs target per unit, op. profit MTD (sales − expenses), OTA vs direct split.
  - Marketing: leads, activities, business-units (read); dashboard = leads by source/creative this week, unassigned leads, overdue follow-ups, conversion.
  - Operations/staff: bookings, checkins, daily-reports, stock, tasks; dashboard = today's check-ins/outs, occupancy, low stock, open tasks.
  - Owner/manager: everything.
- Dashboard: one page, sections shown by role; owner sees all sections in a tabbed "Team view" switcher (HR / Accounts / Finance / Marketing / Operations) plus an "All" overview. Sidebar navigation grouped by team.
- Keep the generic engine; roles only filter which modules/cards appear (`EntityDef.teams: Team[]`).

## Clarification 2 (27 Sep 2026): CRM is part of this app — customer 360°
- New core entity `customers` (the CRM contact): name, phone (unique key; normalise to 10 digits), email, city, company, tags (multi: Family|Couple|Friends|Corporate|Wedding|Repeat|VIP|Agent), preferences (textarea: room type, meals, occasions), birthday/anniversary (optional), source of first contact, first_seen, notes, owner→staff (relationship owner).
- `leads`, `bookings`, `payments`, `activities`, `tasks` all get `customer_id` (relation). When a lead or booking is created with a phone, the app auto-matches an existing customer by phone or creates one (no duplicate contacts). The generic form shows the matched customer inline ("Existing customer: 3 stays, ₹42,000 spent") before saving.
- Customer detail = **360° view**: header with lifetime stats computed from linked records (total stays, nights, total spend, average rate/night, last visit, next booking, open leads, last activity, favourite unit type / meal plan, typical group size, typical booking window e.g. "books ~7 days ahead", weekday vs weekend preference); a chronological **timeline** merging activities, leads, bookings, payments, tasks; tabs for each; "Log activity" and "New booking" quick actions. This is what staff use to build the relationship.
- Marketing/Finance dashboards add: repeat-guest %, top 10 customers by spend, customers with no contact in 90 days (win-back list), birthdays/anniversaries this month.
- Settings → **Import CRM**: CSV/TSV import for the existing JD_Group_Sales_Marketing_CRM.xlsx Leads sheet and the Meta Leads sheet (map columns: name, phone, email, source, campaign, requirement, stage, qualification, assigned to, next follow-up, notes) → creates customers (dedupe by phone) + leads. Include a sample mapping for those two known layouts.
- `supabase/schema.sql`: add `customers` table, `customer_id` FKs, unique index on `customers.phone`, and a SQL view `customer_stats` (spend, stays, last_visit) so the 360° header is one query in Supabase mode; LocalStore computes the same in code.

## Clarification 3 (27 Sep 2026): automatic daily import of the Meta leads sheet
- Source: Google Sheet "Udaisarovar Meta Leads 2026" (owner arvind@digimoonmedia.com; tab "Campaign 1"; new tabs may appear per campaign — import ALL tabs whose header row contains `phone_number`). Access via a CSV export URL (`META_LEADS_CSV_URLS`, comma-separated, one per tab: `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>`; requires the sheet to be link-viewable or published — a one-time action by Jayesh/agency).
- Implement `scripts/import-meta-leads.ts` (run with `bun run import:meta`): fetch each CSV → parse (shared parser in `src/core/import/meta-leads.ts`, the SAME code the in-app Import CRM page uses) → for each row: normalise phone → upsert `customers` (by phone) → upsert `leads` keyed by `external_id` = Meta lead `id` (add `external_id` text unique column to leads + `external_source` = 'meta') so re-runs never duplicate; map ad_name/platform/campaign_name → campaign, when/who/stay option/guests → requirement + qualification (within_7_days → Hot, 15/30 → Warm), `Sales incharge` → assigned_to by fuzzy name match on staff, `Date visit` → notes, created_time (UTC−5) → created_at in IST, business unit = The Udaisarovar. Stage stays as in app if the lead already exists (never overwrite staff progress); only fill blanks.
- Writes go through the Supabase REST API with the **service-role key** (server-side only; env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Never ship that key to the browser.
- Scheduling: `.github/workflows/import-meta-leads.yml` — `schedule: cron '30 2 * * *'` (= 08:00 IST daily) + `workflow_dispatch`; uses repo secrets META_LEADS_CSV_URLS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; prints a summary (rows read / customers created / leads created / updated / skipped). Also provide `ops/launchd/com.jyc.jdone-meta-import.plist` as a fallback to run the same script from the Mac at 08:05 IST.
- Log each run into a `import_runs` table (source, started_at, rows, created, updated, errors) shown in Settings → Imports, so staff can see "last import: today 08:00, 4 new leads".
- Local mode: the scheduled import needs Supabase; in local mode the Settings page shows the manual CSV import only, with a note.

## Clarification 4 (27 Sep 2026): WhatsApp messages in the customer timeline
- New entity `messages`: customer_id, channel ('whatsapp'), account ('udaisarovar'|'pronite'|'personal' — which business WhatsApp line), direction ('in'|'out'), body, media_type, media_url (optional), sent_at, external_id (WhatsApp message id, unique with account), sender_phone, chat_jid. Read-only in the UI (no editing), listed on the customer 360° timeline with a WhatsApp icon and a "Reply on WhatsApp" link (`https://wa.me/91<phone>`); also a `/messages` inbox list filtered by account with unread/unmatched (no customer yet → one-click "Create customer").
- Source: the WhatsApp bridges already running on Jayesh's Mac (lharries/whatsapp-mcp): SQLite `~/whatsapp-mcp/whatsapp-bridge-udaisarovar/store/messages.db` (Udaisarovar line 8083), `~/whatsapp-mcp/whatsapp-bridge-pronite/store/messages.db` (Pronite 8081), `~/whatsapp-mcp/whatsapp-bridge/store/messages.db` (personal 8080). Tables: `messages(id, chat_jid, sender, content, timestamp, is_from_me, media_type, filename)`, `chats(jid, name)`. Direct chats have jid `<phone>@s.whatsapp.net`; skip `@g.us` groups, `@newsletter`, `status@broadcast`; live incoming DMs may arrive under `@lid` alias jids — map via `chats.name` or the phone in the jid when possible, else store unmatched.
- Implement `scripts/sync-whatsapp.ts` (bun + `bun:sqlite`): reads new rows since a checkpoint file (`~/.jdone/wa-sync-state.json`), normalises the phone, matches/creates `customers` (only for existing customers by default; env `WA_SYNC_CREATE_CUSTOMERS=true` to auto-create), upserts `messages` by (account, external_id) via Supabase REST with the service-role key. Runs every 5 minutes from a launchd plist `ops/launchd/com.jyc.jdone-wa-sync.plist` (Mac-side only — the bridges live there). Log to `~/.jdone/wa-sync.log`; record an `import_runs` row per run with source 'whatsapp'.
- Privacy: only direct customer chats on the business lines are synced by default (`WA_SYNC_ACCOUNTS=udaisarovar,pronite`); the personal line is opt-in.
- Local mode: not available (needs Supabase); Settings shows the note.
