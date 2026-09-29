# JD One — JD Group staff app

One internal web app for every JD Group team (operations, marketing, accounts, finance, HR). All forms are connected: a **Lead** becomes a **Booking**, a booking has **Payments** and **Check-ins**, every **Customer** has a 360° page with their full history (stays, spend, WhatsApp messages, calls, tasks), and the **Dashboard** reads all of it. Guests and customers will get a separate app later; this one is for staff only.

## Open it

- On GitHub Pages: `https://choudharyjayesh13.github.io/jd-one/` (later `https://app.myjdgroup.com`).
- On a phone: open the link in Chrome/Safari → *Add to Home Screen*. It installs like an app and works offline for the screens you have opened.
- First sign-in: in **local mode** the app asks you to set a 4-digit PIN. In **shared mode** staff sign in with the email + password you create for them in Supabase.

## Two modes

| | Local mode (today) | Shared mode (when the database is set up) |
|---|---|---|
| Where data lives | In the browser of the device you use | In a Supabase (Postgres) database, shared by everyone |
| Who sees it | Only that device | All staff, live, on any phone/laptop |
| Daily Meta-lead import, WhatsApp sync | Not available (manual CSV import only) | Automatic |
| Move data across | Settings → **Export** JSON, then Settings → **Import** in shared mode | — |

### Switching to shared mode (one-time, ~15 minutes)

1. Create a project at supabase.com (free tier is fine). Note the **Project URL**, the **anon key** and the **service_role key** (Settings → API).
2. In the Supabase SQL editor, paste and run `supabase/schema.sql` from this repo. It creates every table, security rules and the `receipts` storage bucket.
3. Create staff logins in Supabase → Authentication → Users (email + password). Then in JD One → Settings → Staff, add each person with the same email and their role (owner, manager, hr, accounts, finance, marketing, staff).
4. Put the URL and anon key where the app is built: GitHub repo → Settings → Secrets and variables → Actions → add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Push (or re-run the "Deploy to GitHub Pages" workflow). The app now runs in shared mode.
5. Export your local data (Settings → Export) and import it once in shared mode.

## Automatic imports

- **Meta ad leads, daily at 08:00 IST** — the GitHub workflow `import-meta-leads.yml` reads the agency's Google Sheet and adds new leads (matched to customers by phone, never duplicated, never overwriting a stage your team set). Needs three repo secrets: `META_LEADS_CSV_URLS` (the sheet's CSV export link(s), the sheet must be shared "Anyone with the link – Viewer" or published), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Run it by hand from the Actions tab any time. Results appear in Settings → Imports.
- **WhatsApp messages, every 5 minutes** — `scripts/sync-whatsapp.ts` runs on the Mac that hosts the WhatsApp bridges and copies customer chats from the Udaisarovar and Pronite lines into each customer's timeline. Install with the launchd file in `ops/launchd/` after creating `.env.local` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- **Existing CRM workbook** — Settings → Import CRM accepts the Leads sheet of `JD_Group_Sales_Marketing_CRM.xlsx` (export it as CSV) and the Meta leads sheet, with column mapping presets.

## For a developer

- Stack: Next.js 16 (App Router, static export) · React 19 · TypeScript strict · Tailwind 4 · Supabase JS · `idb` for the local IndexedDB store. Package manager: **bun**.
- `bun install` · `bun run dev` · `NEXT_PUBLIC_BASE_PATH=/jd-one bun run build` (static site in `out/`) · `bun run lint` · `bun run import:meta` · `bun run sync:wa`.
- **Adding a form = one file.** Create `src/modules/<name>/entity.ts` with an `EntityDef` (fields, relations, list columns, teams, permissions, hooks) and add it to `src/core/schema/registry.ts`; add the matching table to `supabase/schema.sql` (and bump `DB_VERSION` in `src/core/data/local.ts`). List, form, detail, search, CSV export, role visibility and dashboard grouping come from the generic engine in `src/core/ui`.
- The UI never touches Supabase directly; it talks to the `DataStore` interface (`src/core/data`). `LocalStore` and `SupabaseStore` implement it.
- Spec and decisions: `SPEC.md`. Build notes: `BUILD-NOTES.md`.

## Your existing reports and staff (added 27 Sep 2026)

- **HR → Hiring**: add candidates (position, stage Applied → Screening → Interview → Offer → Hired), then press **Mark as hired** — the staff record is created and attendance/salary start from the joining date. The HR dashboard shows the open pipeline.
- **History bundle**: `bun run bundle:jd -- --since 2026-06-01 --notes <expense-register-export.md> --out ~/Desktop/jd-one-data.json` builds a JSON file from the WhatsApp daily reports (sales, occupancy, attendance, staff roster) and the expense register. Import it in **Settings → Import JSON backup**. Business units and staff are matched by name, so importing twice never duplicates.
- **Ongoing daily reports** (shared mode): `bun run sync:reports` parses new WhatsApp daily-report messages into Daily reports + Attendance every 30 minutes (`ops/launchd/com.jyc.jdone-reports-sync.plist`). Unknown staff names are created automatically under The Udaisarovar so new hires appear as soon as they are on the report.

## Mark attendance from a phone (added 28 Sep 2026)

Sidebar → **Mark attendance** (`/attendance/checkin/`). Staff pick their name, take a selfie (front camera), the page captures the exact time and GPS position, and **Check in** writes all of it onto today's attendance row (status P). **Check out** adds the leaving time and a second selfie. If the business unit has latitude/longitude set (Settings → Business units), the page shows the distance from the property and flags check-ins outside the attendance radius (default 300 m). Every entry keeps: time in/out, selfies, latitude, longitude, GPS accuracy, distance, on-site flag, and the phone's device string. Location needs HTTPS and the user's permission; GitHub Pages and app.myjdgroup.com are both HTTPS.

## Shared mode is ON (28 Sep 2026)

JD One runs on the Supabase project **JD hospitality app** (`cyimbgjzxxxszjadxpgv`), in its own schema `jdone` (the old Udaisarovar app's tables in `public` are untouched). Keys live in `.env.local` on the Mac (never committed). Deploy with `bun run deploy:pages` — the build bakes in the public URL and anon key.

- **Logins:** Supabase → Authentication → Users → *Add user* (email + password, auto-confirm). A staff record with the same email links automatically on first sign-in (trigger `jdone.link_staff_on_signup`). Roles come from the Staff record.
- **Data:** `bun run scripts/import-bundle.ts <bundle.json>` pushes a JSON bundle server-side (used 28 Sep for the Jun–Sep history).
- **Mac jobs installed:** `com.jyc.jdone-wa-sync` (WhatsApp → customer timeline, every 5 min) and `com.jyc.jdone-reports-sync` (daily report → reports + attendance, every 30 min). Logs in `~/.jdone/`.
- **Pending:** Meta leads scheduled import needs `META_LEADS_CSV_URLS` (sheet shared "anyone with link") and the GitHub `workflow` scope, or the Mac fallback plist.

## Staff sign-up, My Day, Scoreboard and Tickets (added 29 Sep 2026)

Run `supabase/migrations/2026-09-29-signup-tickets.jdone.sql` once in the Supabase SQL editor (schema `jdone`) before deploying this version. Both full schema files (`schema.sql`, `schema.jdone.sql`) already include the same statements for fresh projects.

- **Staff create their own login.** Login screen → **Create account** (name, phone, email, password, designation, business unit). They confirm their email, sign in and see *Pending approval* until HR approves them. **HR → Staff** shows a *Pending sign-ups* card (count badge in the sidebar) with **Approve** (choose role, unit, designation — the staff record is created and linked to their login, joining date today) or **Reject** (with a note they can see). Owner, manager and HR can approve. Staff you add yourself under Staff *with their email* still link automatically at sign-up (`jdone.link_staff_on_signup`) and skip approval.
- **My Day** (`/my-day/`, first in the sidebar for role *staff*): live clock, today's attendance with the *Mark attendance* button, my tasks due today/overdue with a tick box to finish them and *Add task* inline, my open tickets, today's arrivals/departures/occupancy for my unit, and my score today.
- **Scoreboard** (`/scoreboard/`, under Operations, all roles): Today / This week / This month, per unit. One row per active staff member: days present, on time (checked in by 10:00), tasks done + points, overdue tasks, tickets resolved + average fix time, leads won, activities logged, and a **score** = task points + 2 × tickets resolved + 5 × leads won + 1 per present day − overdue tasks, with 🥇🥈🥉 and a team total. The *Rapid service* tile shows open tickets by age (< 2 h, < 24 h, > 24 h) and average first response (created → work started). The Operations dashboard shows the top 3 and open-ticket count.
- **Tickets** (Operations / HR → Tickets, open-count badge): maintenance requests with category, location, priority, **photos and videos** (taken on the phone or picked from the gallery; photos are shrunk to 1280 px, videos must be under 25 MB), reporter, assignee, due date and cost. Buttons on a ticket: **Start work**, **Mark done** (asks for resolution notes and after-photos), **Verify**. Assigning a ticket creates a task "Ticket: …" in that person's My Day; closing the ticket closes the task. Files go to the `tickets` storage bucket in shared mode (data stays in the browser in local mode, so keep videos short there).
- Tasks now have **Points** (default 1, counted when done) and a *Completed* time set automatically.
