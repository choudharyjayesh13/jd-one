/**
 * Bundle merge: when an imported bundle contains business units or staff whose
 * NAME already exists here (e.g. a data bundle built on another machine), reuse
 * the existing record and rewrite every reference, so imports never create a
 * second "The Udaisarovar" or a duplicate "Harish Bairwa".
 */
import type { ExportBundle } from "./types";
import type { Row } from "@/core/schema/types";

const REF_FIELDS = ["business_unit_id", "staff_id", "submitted_by", "paid_by", "assigned_to", "done_by", "received_by", "handled_by", "interviewer", "owner_id", "created_by"];
const key = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function mergeBundle(bundle: ExportBundle, existing: { business_units: Row[]; staff: Row[] }): ExportBundle {
  const idMap = new Map<string, string>();
  const tables: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(bundle.tables)) {
    if (table !== "business_units" && table !== "staff") {
      tables[table] = rows;
      continue;
    }
    const byName = new Map(existing[table].map((r) => [key(r.name), r]));
    tables[table] = [];
    for (const r of rows) {
      const hit = byName.get(key(r.name));
      if (hit && hit.id !== r.id) {
        idMap.set(r.id, hit.id);
        // Fill blanks on the existing record (designation, phone, joined_on…) without overwriting.
        const patch: Row = { ...hit };
        for (const [k, v] of Object.entries(r)) if (k !== "id" && (patch[k] == null || patch[k] === "") && v != null && v !== "") patch[k] = v;
        tables[table].push(patch);
      } else tables[table].push(r);
    }
  }
  if (idMap.size) {
    for (const rows of Object.values(tables))
      for (const r of rows) for (const f of REF_FIELDS) if (typeof r[f] === "string" && idMap.has(r[f] as string)) r[f] = idMap.get(r[f] as string);
  }
  return { ...bundle, tables };
}
