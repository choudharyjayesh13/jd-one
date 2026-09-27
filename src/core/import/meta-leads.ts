/**
 * Meta (Facebook/Instagram) lead-form export → ImportedLead. Shared by the
 * scheduled script and the Settings → Import CRM page.
 */
import { findHeader, parseDelimited } from "./csv";
import { parseMetaTimestamp, parseSheetDate } from "./dates";
import { normalizePhone } from "@/core/phone";
import type { ImportedLead } from "./types";

export const META_SOURCE = "meta";
export const META_BUSINESS_UNIT = "The Udaisarovar";

export function isMetaSheet(headers: string[]): boolean {
  return Boolean(findHeader(headers, "phone_number")) && Boolean(findHeader(headers, "created_time") || findHeader(headers, "full_name"));
}

/** Maps Meta's "when are you planning" answers to a qualification. */
export function qualificationFromTiming(when: string | undefined): string | null {
  const w = (when ?? "").toLowerCase();
  if (!w) return null;
  if (/within[_\s]*7|7[_\s]*days|this[_\s]*week/.test(w)) return "Hot";
  if (/15|30|this[_\s]*month|next[_\s]*month/.test(w)) return "Warm";
  if (/not[_\s]*sure|later|just[_\s]*(exploring|browsing)/.test(w)) return "Cold";
  return "Warm";
}

/** Meta's lead_status column → app stage (only used for brand-new leads). */
export function stageFromLeadStatus(status: string | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (/won|convert|booked|confirmed/.test(s)) return "Won";
  if (/lost|not interested|junk|invalid|spam/.test(s)) return "Lost";
  if (/proposal|quote/.test(s)) return "Proposal";
  if (/negotiat/.test(s)) return "Negotiation";
  if (/qualif|interested|hot/.test(s)) return "Qualified";
  if (/contact|called|whatsapp|follow/.test(s)) return "Contacted";
  if (/hold/.test(s)) return "On Hold";
  return "New";
}

const clean = (s: string | undefined) => (s ?? "").replace(/_/g, " ").trim();

export function metaRowToLead(row: Record<string, string>, headers: string[]): ImportedLead | null {
  const col = (...names: string[]) => {
    const h = findHeader(headers, ...names);
    return h ? row[h] : undefined;
  };
  const phone = normalizePhone(col("phone_number", "phone"));
  const name = clean(col("full_name", "name")) || (phone ? `Meta lead ${phone.slice(-4)}` : "");
  if (!phone && !name) return null;
  const email = clean(col("email")) || null;
  const created = parseMetaTimestamp(col("created_time", "created"));
  // Ids are kept verbatim (underscores matter); answers get underscores turned into spaces.
  const id = (col("id", "lead_id", "leadgen_id") ?? "").trim() || (created && phone ? `${created.slice(0, 10)}-${phone}` : null);
  const ad = clean(col("ad_name"));
  const platform = clean(col("platform"));
  const campaign = clean(col("campaign_name"));
  const who = clean(col("who_are_you_planning_this_stay_with"));
  const when = clean(col("when_are_you_planning_to_visit_udaipur"));
  const stay = clean(col("which_stay_option_interests_you"));
  const planning = clean(col("what_are_you_planning"));
  const guests = clean(col("how_many_guests_are_you_planning_for"));
  const status = clean(col("lead_status"));
  const incharge = clean(col("sales incharge", "sales_incharge"));
  const dateVisit = clean(col("date visit", "date_visit"));
  const guestsNum = Number((guests.match(/\d+/) ?? [])[0]);

  const requirementParts = [stay && `Stay: ${stay}`, planning && `Occasion: ${planning}`, who && `With: ${who}`, when && `When: ${when}`, guests && `Guests: ${guests}`].filter(Boolean);
  const notesParts = [dateVisit && `Date visit: ${dateVisit}`, status && `Meta status: ${status}`, platform && `Platform: ${platform}`].filter(Boolean);

  return {
    external_id: id ? `meta:${id}` : null,
    external_source: META_SOURCE,
    created_at: created,
    customer: { name, phone, email },
    lead: {
      name,
      phone,
      email,
      source: "Meta Ads",
      campaign: [campaign, ad].filter(Boolean).join(" / ") || null,
      requirement: requirementParts.join(" · ") || null,
      visit_from: parseSheetDate(dateVisit),
      guests: Number.isFinite(guestsNum) && guestsNum > 0 ? guestsNum : null,
      qualification: qualificationFromTiming(when),
      stage: stageFromLeadStatus(status),
      notes: notesParts.join("\n") || null,
    },
    assigned_to_name: incharge || null,
    business_unit_name: META_BUSINESS_UNIT,
  };
}

/** Parse a whole Meta CSV export (one tab) into leads. */
export function parseMetaLeads(text: string): { leads: ImportedLead[]; headers: string[]; rows: number } {
  const { headers, rows } = parseDelimited(text);
  if (!isMetaSheet(headers)) return { leads: [], headers, rows: rows.length };
  const leads = rows.map((r) => metaRowToLead(r, headers)).filter((x): x is ImportedLead => Boolean(x));
  return { leads, headers, rows: rows.length };
}
