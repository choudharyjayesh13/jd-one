/**
 * DataStore: the only way the UI reads/writes records. Two implementations
 * (LocalStore = IndexedDB, SupabaseStore = Postgres) share this interface so
 * switching backends is a config change, not a rewrite.
 */
import type { Row, FieldValues } from "@/core/schema/types";

export interface ListQuery {
  /** Free-text search across the entity's searchFields. */
  search?: string;
  /** Exact-match filters, e.g. { business_unit_id: "..." }. null matches null. */
  filter?: Record<string, unknown>;
  /** Inclusive range filters on a field, e.g. { date: { gte: "2026-09-01", lte: "2026-09-30" } }. */
  range?: Record<string, { gte?: string | number; lte?: string | number }>;
  sort?: { field: string; dir: "asc" | "desc" };
  /** Secondary sort applied when `sort` ties. */
  thenBy?: { field: string; dir: "asc" | "desc" };
  limit?: number;
}

export type StoreKind = "local" | "supabase";

export type ExportBundle = {
  app: "jd-one";
  version: 1;
  exportedAt: string;
  tables: Record<string, Row[]>;
};

export interface DataStore {
  kind: StoreKind;
  list(entity: string, query?: ListQuery): Promise<Row[]>;
  get(entity: string, id: string): Promise<Row | null>;
  create(entity: string, data: FieldValues): Promise<Row>;
  update(entity: string, id: string, patch: FieldValues): Promise<Row>;
  remove(entity: string, id: string): Promise<void>;
  /** Notifies when records of an entity change (same-tab for local, realtime for Supabase). */
  subscribe?(entity: string, callback: () => void): () => void;
  /** JSON export/import so local data can be moved into Supabase later. */
  exportAll(): Promise<ExportBundle>;
  importAll(bundle: ExportBundle): Promise<void>;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
