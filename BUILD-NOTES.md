# Build notes — 27 Sep 2026

Built by Claude for Jayesh Choudhary from `SPEC.md` (v1 + clarifications 1–4). Bun 1.3.14, Next.js 16, React 19, TypeScript strict, Tailwind 4.

## What is in the box
- `src/core/schema` — EntityDef types + registry (16 entities: business-units, staff, customers, leads, activities, bookings, payments, checkins, daily-reports, attendance, expenses, stock, tasks, targets, import-runs, messages).
- `src/core/data` — `DataStore` interface, `LocalStore` (IndexedDB via idb, DB v2), `SupabaseStore`, demo seed, query helpers, service layer (hooks, unique checks).
- `src/core/ui` — generic EntityList / EntityForm / EntityDetail, Dialog, Toast, Badge, Button, FieldValue, relation selects with inline "+ new", CSV export.
- `src/core/import` — CSV parser, Meta-leads parser, CRM-workbook parser, import engine (`run.ts`: dedupe customers by phone, upsert leads by `external_id`, fill blanks only), sinks (DataStore + service-role Supabase).
- `src/core/auth` — PIN gate (local mode) / Supabase email+password (shared mode), roles and team visibility.
- `src/modules/*` — one folder per form; custom widgets: `attendance/AttendanceGrid`, `customers/Customer360` (stats + merged timeline incl. WhatsApp), `dashboard` (team sections + owner "Team view" switcher), `settings` (business units, staff, targets, export/import, Import CRM, Imports log, backend status).
- `src/app` — `/`, `/login`, `/[entity]`, `/[entity]/new`, `/[entity]/view?id=`, `/attendance/grid`, `/settings`. Static export with `basePath` from `NEXT_PUBLIC_BASE_PATH`.
- `supabase/schema.sql` — all tables, updated_at triggers, RLS (`is_staff()` / `is_owner()`), `customer_stats` view, `receipts` bucket, seeds. Idempotent.
- `scripts/import-meta-leads.ts` (+ `.github/workflows/import-meta-leads.yml`, cron 08:00 IST) and `scripts/sync-whatsapp.ts` (+ `ops/launchd/com.jyc.jdone-wa-sync.plist`, every 5 min on the Mac). `ops/launchd/com.jyc.jdone-meta-import.plist` is the Mac fallback for the Meta import.
- PWA: `public/manifest.webmanifest`, icons, `public/sw.js`. `.github/workflows/pages.yml` deploys `out/` to GitHub Pages on push to main.

## Verified
- `NEXT_PUBLIC_BASE_PATH=/jd-one bun run build` → clean static export; `bun run lint` → clean; `bunx tsc --noEmit` → clean.
- Import engine: re-import keeps staff-set stage, refills blanks, skips duplicates (checked by the build agent).
- `sync-whatsapp.ts` parses and fails cleanly without env; needs a Supabase project to run end to end.

## Known gaps / next
- Both of Jayesh's Supabase projects were unreachable on 27 Sep, so shared mode is untested against a live database — run `schema.sql` on a fresh project and smoke-test.
- The WhatsApp sync can only match `@lid` alias chats when the bridge stored a chat name that contains the phone; unmatched messages are kept with `customer_id = null` and shown in `/messages`.
- Receipt images in local mode are stored as data URLs (fine for a few hundred; move to Supabase Storage in shared mode).
- No automated UI tests yet; add Playwright smoke tests once shared mode is live.
