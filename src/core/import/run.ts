/**
 * The import engine: dedupes customers by phone, upserts leads by external_id,
 * fills blanks only (never overwrites staff-set stage), records an import_runs
 * row. Backend-agnostic through the ImportSink interface.
 */
import type { FieldValues, Row } from "@/core/schema/types";
import type { ImportedLead, ImportSummary } from "./types";

export interface ImportSink {
  getCustomersByPhones(phones: string[]): Promise<Map<string, Row>>;
  createCustomer(values: FieldValues): Promise<Row>;
  getLeadsByExternalIds(ids: string[]): Promise<Map<string, Row>>;
  createLead(values: FieldValues): Promise<Row>;
  updateLead(id: string, patch: FieldValues): Promise<void>;
  listStaff(): Promise<Row[]>;
  listBusinessUnits(): Promise<Row[]>;
  recordRun(run: FieldValues): Promise<void>;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** "Gaurav" matches "Gaurav Saini"; "saini g" matches too. */
export function fuzzyStaff(staff: Row[], name: string | null | undefined): Row | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  const exact = staff.find((s) => norm(s.name) === n);
  if (exact) return exact;
  const tokens = String(name).toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 3);
  const scored = staff
    .map((s) => ({ s, score: tokens.filter((t) => String(s.name).toLowerCase().includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.s ?? null;
}

export function matchUnit(units: Row[], name: string | null | undefined, fallbackName = "The Udaisarovar"): Row | null {
  const n = norm(name);
  const byName = (x: string) => units.find((u) => norm(u.name) === norm(x) || norm(u.short_code) === norm(x));
  if (n) {
    const hit = byName(String(name)) ?? units.find((u) => norm(u.name).includes(n) || n.includes(norm(u.short_code)));
    if (hit) return hit;
  }
  return byName(fallbackName) ?? units[0] ?? null;
}

export interface ImportOptions {
  source: string;
  staffId?: string | null;
  /** Only used for the summary line. */
  label?: string;
}

export async function importLeads(items: ImportedLead[], sink: ImportSink, opts: ImportOptions): Promise<ImportSummary> {
  const started = new Date().toISOString();
  const summary: ImportSummary = { rows: items.length, customersCreated: 0, created: 0, updated: 0, skipped: 0, errors: 0, messages: [] };
  const [staff, units] = await Promise.all([sink.listStaff(), sink.listBusinessUnits()]);
  const phones = Array.from(new Set(items.map((i) => i.customer.phone).filter(Boolean)));
  const customers = await sink.getCustomersByPhones(phones);
  const extIds = Array.from(new Set(items.map((i) => i.external_id).filter((x): x is string => Boolean(x))));
  const existingLeads = await sink.getLeadsByExternalIds(extIds);
  const seenExt = new Set<string>();

  for (const item of items) {
    try {
      const phone = item.customer.phone;
      let customerId: string | null = null;
      if (phone) {
        let c = customers.get(phone);
        if (!c) {
          c = await sink.createCustomer({
            name: item.customer.name,
            phone,
            email: item.customer.email ?? null,
            city: item.customer.city ?? null,
            company: item.customer.company ?? null,
            first_source: item.lead.source,
            first_seen: (item.created_at ?? started).slice(0, 10),
            tags: [],
            created_by: opts.staffId ?? null,
          });
          customers.set(phone, c);
          summary.customersCreated++;
        }
        customerId = c.id;
      }
      const assignee = fuzzyStaff(staff, item.assigned_to_name);
      const unit = matchUnit(units, item.business_unit_name);
      const values: FieldValues = {
        ...item.lead,
        customer_id: customerId,
        assigned_to: assignee?.id ?? null,
        business_unit_id: unit?.id ?? null,
        external_id: item.external_id,
        external_source: item.external_source,
      };
      if (item.external_id) {
        if (seenExt.has(item.external_id)) {
          summary.skipped++;
          continue;
        }
        seenExt.add(item.external_id);
        const existing = existingLeads.get(item.external_id);
        if (existing) {
          // Fill blanks only: staff progress (stage, assignee, follow-ups) wins.
          const patch: FieldValues = {};
          for (const [k, v] of Object.entries(values)) {
            if (k === "stage" || v === null || v === undefined || v === "") continue;
            const cur = existing[k];
            if (cur === null || cur === undefined || cur === "") patch[k] = v;
          }
          if (Object.keys(patch).length) {
            await sink.updateLead(existing.id, patch);
            summary.updated++;
          } else summary.skipped++;
          continue;
        }
      }
      const created = await sink.createLead({ ...values, created_at: item.created_at ?? undefined, created_by: opts.staffId ?? null });
      if (item.external_id) existingLeads.set(item.external_id, created);
      summary.created++;
    } catch (e) {
      summary.errors++;
      if (summary.messages.length < 20) summary.messages.push(`${item.lead.name || item.customer.phone}: ${(e as Error).message}`);
    }
  }

  try {
    await sink.recordRun({
      source: opts.source,
      started_at: started,
      finished_at: new Date().toISOString(),
      rows: summary.rows,
      customers_created: summary.customersCreated,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      errors: summary.errors,
      message: [opts.label, ...summary.messages].filter(Boolean).join("\n") || null,
      created_by: opts.staffId ?? null,
    });
  } catch (e) {
    summary.messages.push(`Could not record import run: ${(e as Error).message}`);
  }
  return summary;
}
