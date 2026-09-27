/**
 * Generic column-mapped import (used for the JD_Group_Sales_Marketing_CRM
 * "Leads" sheet and any similar CSV). Presets pre-fill the mapping.
 */
import { findHeader } from "./csv";
import { parseSheetDate } from "./dates";
import { normalizePhone } from "@/core/phone";
import { LEAD_QUALIFICATIONS, LEAD_SOURCES, LEAD_STAGES } from "@/modules/leads/options";
import type { ColumnMapping, ImportedLead, TargetField } from "./types";
import { isMetaSheet } from "./meta-leads";

export interface ImportPreset {
  id: string;
  label: string;
  source: string;
  detect: (headers: string[]) => boolean;
  /** target field → candidate header names (first match wins). */
  columns: Partial<Record<TargetField, string[]>>;
}

export const PRESETS: ImportPreset[] = [
  {
    id: "jd-crm",
    label: "JD Group Sales & Marketing CRM – Leads sheet",
    source: "jd-crm",
    detect: (h) => Boolean(findHeader(h, "Lead ID")) && Boolean(findHeader(h, "Contact Name")),
    columns: {
      external_id: ["Lead ID"],
      created_at: ["Date Added"],
      business_unit: ["Business Unit"],
      name: ["Contact Name", "Name"],
      budget: ["Deal Value", "Budget"],
      company: ["Company"],
      phone: ["Phone / WhatsApp", "Phone"],
      email: ["Email"],
      city: ["City"],
      source: ["Lead Source"],
      campaign: ["Campaign / Ad Name", "Campaign"],
      requirement: ["Requirement / Interest", "Requirement"],
      assigned_to: ["Assigned To"],
      stage: ["Stage"],
      qualification: ["Qualification"],
      last_contact: ["Last Contact Date"],
      next_follow_up: ["Next Follow-up Date"],
      lost_reason: ["Lost Reason"],
      notes: ["Notes / Remarks", "Notes"],
    },
  },
  {
    id: "meta",
    label: "Meta Leads sheet (Facebook / Instagram lead form)",
    source: "meta",
    detect: isMetaSheet,
    columns: {
      external_id: ["id"],
      created_at: ["created_time"],
      name: ["full_name"],
      phone: ["phone_number"],
      email: ["email"],
      campaign: ["ad_name"],
      assigned_to: ["Sales incharge"],
      stage: ["lead_status"],
    },
  },
  {
    id: "generic",
    label: "Generic (map columns yourself)",
    source: "csv",
    detect: () => true,
    columns: { name: ["name", "contact name", "guest"], phone: ["phone", "mobile", "whatsapp"], email: ["email"], source: ["source"], notes: ["notes", "remarks"] },
  },
];

export function detectPreset(headers: string[]): ImportPreset {
  return PRESETS.find((p) => p.detect(headers)) ?? PRESETS[PRESETS.length - 1];
}

export function mappingForPreset(preset: ImportPreset, headers: string[]): ColumnMapping {
  const m: ColumnMapping = {};
  for (const [field, candidates] of Object.entries(preset.columns) as [TargetField, string[]][]) {
    const h = findHeader(headers, ...candidates);
    if (h) m[field] = h;
  }
  return m;
}

function pickOption(value: string | undefined, options: readonly string[], fallback: string | null): string | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return options.find((o) => o.toLowerCase() === v) ?? options.find((o) => v.includes(o.toLowerCase()) || o.toLowerCase().includes(v)) ?? fallback;
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && value.replace(/[^\d]/g, "") !== "" ? n : null;
}

/** Map one CSV row with a column mapping into an ImportedLead. */
export function mapRow(row: Record<string, string>, mapping: ColumnMapping, sourceLabel: string): ImportedLead | null {
  const get = (f: TargetField) => (mapping[f] ? row[mapping[f]!] : undefined);
  const phone = normalizePhone(get("phone"));
  const name = (get("name") ?? "").trim();
  if (!phone && !name) return null;
  const ext = (get("external_id") ?? "").trim();
  const createdDate = parseSheetDate(get("created_at"));
  const source = pickOption(get("source"), LEAD_SOURCES, sourceLabel === "meta" ? "Meta Ads" : "Other")!;
  return {
    external_id: ext ? `${sourceLabel}:${ext}` : createdDate && phone ? `${sourceLabel}:${createdDate}-${phone}` : null,
    external_source: sourceLabel,
    created_at: createdDate ? `${createdDate}T09:00:00+05:30` : null,
    customer: { name: name || `Guest ${phone.slice(-4)}`, phone, email: get("email") || null, city: get("city") || null, company: get("company") || null },
    lead: {
      name: name || `Guest ${phone.slice(-4)}`,
      phone,
      email: get("email") || null,
      source,
      campaign: get("campaign") || null,
      requirement: get("requirement") || null,
      visit_from: parseSheetDate(get("visit_from")),
      visit_to: parseSheetDate(get("visit_to")),
      guests: num(get("guests")),
      budget: num(get("budget")),
      qualification: pickOption(get("qualification"), LEAD_QUALIFICATIONS, null),
      stage: pickOption(get("stage"), LEAD_STAGES, "New"),
      next_follow_up: parseSheetDate(get("next_follow_up")),
      last_contact: parseSheetDate(get("last_contact")),
      lost_reason: get("lost_reason") || null,
      notes: get("notes") || null,
    },
    assigned_to_name: get("assigned_to") || null,
    business_unit_name: get("business_unit") || null,
  };
}
