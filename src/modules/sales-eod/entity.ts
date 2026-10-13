import { ClipboardCheck } from "lucide-react";
import { defineEntity, type FieldValues, type LiveHint } from "@/core/schema/types";
import type { DataStore } from "@/core/data/types";
import { todayISO } from "@/core/format";

/** Counts this person's day from the app (leads + stage history) and fills empty boxes. */
export async function salesDayCounts(store: DataStore, staffId: string, date: string) {
  const [leads, hist] = await Promise.all([
    store.list("leads", { filter: { assigned_to: staffId } }),
    store.list("lead-stage-history", { range: { changed_at: { gte: `${date}T00:00:00`, lte: `${date}T23:59:59` } } }),
  ]);
  const mine = new Set(leads.map((l) => l.id));
  const moved = (to: string[]) => new Set(hist.filter((h) => mine.has(String(h.lead_id)) && to.includes(String(h.to_stage))).map((h) => String(h.lead_id))).size;
  const won = leads.filter((l) => l.stage === "Won" && String(l.won_at ?? l.updated_at ?? "").slice(0, 10) === date);
  return {
    leads_assigned: leads.filter((l) => String(l.created_at ?? "").slice(0, 10) === date).length,
    conversations: leads.filter((l) => String(l.last_contact ?? "").slice(0, 10) === date).length,
    qualified: moved(["Qualified"]),
    quotes_prepared: moved(["Quote preparation", "Awaiting approval"]),
    quotes_shared: moved(["Quote shared"]),
    followups_done: leads.filter((l) => String(l.last_contact ?? "").slice(0, 10) === date && l.stage !== "New").length,
    bookings_confirmed: won.length,
    booking_value: won.reduce((a, l) => a + Number(l.booking_value ?? l.package_proposed ?? l.budget ?? 0), 0),
    overdue: leads.filter((l) => l.stage !== "Won" && l.stage !== "Lost" && l.next_follow_up && String(l.next_follow_up) < date).length,
  };
}

async function eodHint(values: FieldValues, store: DataStore): Promise<LiveHint | null> {
  const staffId = String(values.staff_id ?? "");
  if (!staffId) return null;
  const c = await salesDayCounts(store, staffId, String(values.date ?? todayISO()));
  const empty = (f: string) => values[f] == null || values[f] === "" || Number(values[f]) === 0;
  const patch: FieldValues = {};
  for (const f of ["leads_assigned", "conversations", "qualified", "quotes_prepared", "quotes_shared", "followups_done", "bookings_confirmed", "booking_value"] as const) {
    if (empty(f) && c[f]) patch[f] = c[f];
  }
  return {
    message: `From the app today: ${c.leads_assigned} new leads, ${c.conversations} contacted, ${c.quotes_shared} quotes shared, ${c.bookings_confirmed} won${c.overdue ? ` · ⚠ ${c.overdue} follow-ups overdue` : ""}. Add your calls & WhatsApps.`,
    tone: c.overdue ? "warning" : "success",
    patch: Object.keys(patch).length ? patch : undefined,
  };
}

/** Each sales person's end-of-day report; Akshayraj adds the decision-maker review. */
export const salesEod = defineEntity({
  name: "sales-eod",
  label: "Sales EOD report",
  labelSingular: "Sales EOD report",
  icon: ClipboardCheck,
  table: "sales_eod_reports",
  teams: ["marketing"],
  unitField: "business_unit_id",
  titleField: "date",
  searchFields: ["hot_leads", "blockers", "tomorrow_priorities"],
  defaultSort: { field: "date", dir: "desc" },
  unique: [["date", "staff_id"]],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "staff_id", label: "Sales person", type: "relation", entity: "staff", required: true, defaultToMe: true },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units" },
    { name: "leads_assigned", label: "New leads assigned", type: "number", min: 0 },
    { name: "calls_made", label: "Calls made", type: "number", min: 0, required: true },
    { name: "whatsapp_sent", label: "WhatsApp messages sent", type: "number", min: 0 },
    { name: "conversations", label: "Two-way conversations", type: "number", min: 0 },
    { name: "qualified", label: "Requirements qualified", type: "number", min: 0 },
    { name: "quotes_prepared", label: "Quotes prepared", type: "number", min: 0 },
    { name: "quotes_shared", label: "Quotes shared (approved only)", type: "number", min: 0 },
    { name: "followups_done", label: "Follow-ups completed", type: "number", min: 0 },
    { name: "bookings_confirmed", label: "Bookings confirmed", type: "number", min: 0 },
    { name: "booking_value", label: "Booking value (₹)", type: "money", min: 0 },
    { name: "hot_leads", label: "Hot leads for tomorrow", type: "textarea", wide: true, placeholder: "Name – what's needed to close" },
    { name: "blockers", label: "Blockers / need help", type: "textarea", wide: true },
    { name: "tomorrow_priorities", label: "Tomorrow's top 3 priorities", type: "textarea", wide: true },
    { name: "manager_review", label: "Akshayraj's review", type: "textarea", wide: true, help: "Decision-maker notes: approvals, revisions, leads to close personally" },
  ],
  listColumns: ["date", "staff_id", "calls_made", "conversations", "quotes_shared", "bookings_confirmed", "booking_value"],
  liveHint: { watch: ["staff_id", "date"], compute: eodHint },
});
