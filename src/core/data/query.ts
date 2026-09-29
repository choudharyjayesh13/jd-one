/** In-memory query helpers shared by LocalStore (and demo/import code). */
import type { Row } from "@/core/schema/types";
import type { ListQuery } from "./types";

export function applyQuery(rows: Row[], query: ListQuery | undefined, searchFields: string[]): Row[] {
  let out = rows;
  if (query?.filter) {
    for (const [key, value] of Object.entries(query.filter)) {
      if (value === undefined) continue;
      out = out.filter((r) => (r[key] ?? null) === (value ?? null));
    }
  }
  if (query?.range) {
    for (const [key, r] of Object.entries(query.range)) {
      out = out.filter((row) => {
        const v = row[key] as string | number | null | undefined;
        if (v === null || v === undefined) return false;
        if (r.gte !== undefined && v < r.gte) return false;
        if (r.lte !== undefined && v > r.lte) return false;
        return true;
      });
    }
  }
  if (query?.search) {
    const q = query.search.toLowerCase();
    out = out.filter((r) => searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(q)));
  }
  if (query?.sort) {
    const keys = [query.sort, ...(query.thenBy ? [query.thenBy] : [])];
    out = [...out].sort((a, b) => {
      for (const { field, dir } of keys) {
        const m = dir === "asc" ? 1 : -1;
        const x = a[field] as string | number | null | undefined;
        const y = b[field] as string | number | null | undefined;
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return x < y ? -m : m;
      }
      return 0;
    });
  }
  if (query?.limit) out = out.slice(0, query.limit);
  return out;
}
