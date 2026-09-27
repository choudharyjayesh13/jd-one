/**
 * SupabaseStore: Postgres through supabase-js. Row-level security in
 * supabase/schema.sql decides who may read/write; this class only translates
 * the DataStore calls. Image fields are uploaded to the `receipts` bucket.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Row, FieldValues } from "@/core/schema/types";
import { entities, getEntity } from "@/core/schema/registry";
import type { DataStore, ExportBundle, ListQuery } from "./types";

export const RECEIPTS_BUCKET = "receipts";

export class SupabaseStore implements DataStore {
  kind = "supabase" as const;
  readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  async list(entity: string, query?: ListQuery): Promise<Row[]> {
    const def = getEntity(entity);
    let q = this.client.from(def.table).select("*");
    if (query?.filter) {
      for (const [key, value] of Object.entries(query.filter)) {
        if (value === undefined) continue;
        q = value === null ? q.is(key, null) : q.eq(key, value);
      }
    }
    if (query?.range) {
      for (const [key, r] of Object.entries(query.range)) {
        if (r.gte !== undefined) q = q.gte(key, r.gte);
        if (r.lte !== undefined) q = q.lte(key, r.lte);
      }
    }
    if (query?.search && def.searchFields.length) {
      const term = query.search.replace(/[%,()]/g, " ").trim();
      if (term) q = q.or(def.searchFields.map((f) => `${f}.ilike.%${term}%`).join(","));
    }
    const sort = query?.sort ?? def.defaultSort;
    q = q.order(sort.field, { ascending: sort.dir === "asc", nullsFirst: false });
    if (query?.limit) q = q.limit(query.limit);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  }

  async get(entity: string, id: string): Promise<Row | null> {
    const def = getEntity(entity);
    const { data, error } = await this.client.from(def.table).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Row | null) ?? null;
  }

  async create(entity: string, data: FieldValues): Promise<Row> {
    const def = getEntity(entity);
    const values = await this.uploadFiles(entity, data);
    const { data: row, error } = await this.client.from(def.table).insert(values).select("*").single();
    if (error) throw new Error(error.message);
    return row as Row;
  }

  async update(entity: string, id: string, patch: FieldValues): Promise<Row> {
    const def = getEntity(entity);
    const values = await this.uploadFiles(entity, patch, id);
    const { data: row, error } = await this.client.from(def.table).update(values).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return row as Row;
  }

  async remove(entity: string, id: string): Promise<void> {
    const def = getEntity(entity);
    const { error } = await this.client.from(def.table).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  subscribe(entity: string, callback: () => void): () => void {
    const def = getEntity(entity);
    const channel = this.client
      .channel(`jd-one:${def.table}`)
      .on("postgres_changes", { event: "*", schema: "public", table: def.table }, () => callback())
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  async exportAll(): Promise<ExportBundle> {
    const tables: Record<string, Row[]> = {};
    for (const e of entities) {
      const { data, error } = await this.client.from(e.table).select("*");
      if (error) throw new Error(error.message);
      tables[e.table] = (data ?? []) as Row[];
    }
    return { app: "jd-one", version: 1, exportedAt: new Date().toISOString(), tables };
  }

  /** Upsert in dependency order so foreign keys resolve. */
  async importAll(bundle: ExportBundle): Promise<void> {
    for (const e of entities) {
      const rows = bundle.tables[e.table];
      if (!rows?.length) continue;
      const clean = rows.map((r) => stripUnknownColumns(e.name, r));
      const { error } = await this.client.from(e.table).upsert(clean, { onConflict: "id" });
      if (error) throw new Error(`${e.label}: ${error.message}`);
    }
  }

  /** Data-URL images (from the form) become Storage objects; the row keeps the public URL. */
  private async uploadFiles(entity: string, values: FieldValues, id?: string): Promise<FieldValues> {
    const def = getEntity(entity);
    const out = { ...values };
    for (const f of def.fields) {
      if (f.type !== "file") continue;
      const v = out[f.name];
      if (typeof v !== "string" || !v.startsWith("data:")) continue;
      const blob = await (await fetch(v)).blob();
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
      const path = `${def.table}/${id ?? crypto.randomUUID()}-${f.name}-${Date.now()}.${ext}`;
      const { error } = await this.client.storage.from(RECEIPTS_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      out[f.name] = this.client.storage.from(RECEIPTS_BUCKET).getPublicUrl(path).data.publicUrl;
    }
    return out;
  }
}

/** Keep only columns the table knows about (ignores helper keys from older exports). */
function stripUnknownColumns(entity: string, row: Row): Row {
  const def = getEntity(entity);
  const allowed = new Set(["id", "created_at", "updated_at", "created_by", ...def.fields.map((f) => f.name)]);
  const out: Row = { id: row.id, created_at: row.created_at, updated_at: row.updated_at };
  for (const [k, v] of Object.entries(row)) if (allowed.has(k)) out[k] = v;
  return out;
}
