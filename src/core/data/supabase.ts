import { mergeBundle } from "./merge";
/**
 * SupabaseStore: Postgres through supabase-js. Row-level security in
 * supabase/schema.sql decides who may read/write; this class only translates
 * the DataStore calls. Image fields are uploaded to the `receipts` bucket,
 * `files` fields (ticket photos/videos) to the `tickets` bucket.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Row, FieldValues, FileItem } from "@/core/schema/types";
import { entities, getEntity } from "@/core/schema/registry";
import type { DataStore, ExportBundle, ListQuery } from "./types";

export const RECEIPTS_BUCKET = "receipts";
export const TICKETS_BUCKET = "tickets";
/** Schema the app's tables live in ("jdone" when sharing a project with another app). */
export const SUPABASE_SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "public";

export class SupabaseStore implements DataStore {
  kind = "supabase" as const;
  readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    // NEXT_PUBLIC_SUPABASE_SCHEMA lets JD One share a Supabase project with another app (e.g. schema "jdone").
    this.client = createClient(url, anonKey, { db: { schema: SUPABASE_SCHEMA as "public" } });
  }

  async list(entity: string, query?: ListQuery): Promise<Row[]> {
    // Supabase returns at most 1,000 rows per request: page through until everything is loaded.
    if (query?.limit) return this.listPage(entity, query, 0, query.limit);
    const PAGE = 1000;
    const all: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = await this.listPage(entity, query, from, PAGE);
      all.push(...rows);
      if (rows.length < PAGE || from > 50000) break;
    }
    return all;
  }

  private async listPage(entity: string, query: ListQuery | undefined, from: number, size: number): Promise<Row[]> {
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
    const thenBy = query?.thenBy ?? (query?.sort ? undefined : def.secondarySort);
    if (thenBy) q = q.order(thenBy.field, { ascending: thenBy.dir === "asc", nullsFirst: false });
    q = q.order("id", { ascending: true });
    const { data, error } = await q.range(from, from + size - 1);
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
    return this.withoutMissingColumns(values, (v) => this.client.from(def.table).insert(v).select("*").single());
  }

  async update(entity: string, id: string, patch: FieldValues): Promise<Row> {
    const def = getEntity(entity);
    const values = await this.uploadFiles(entity, patch, id);
    return this.withoutMissingColumns(values, (v) => this.client.from(def.table).update(v).eq("id", id).select("*").single());
  }

  /**
   * A new app field whose database column is not there yet (the update SQL has
   * not been run) would fail the whole save. Drop that field and save the rest,
   * so everyday forms keep working; the field starts saving once the SQL is run.
   */
  private async withoutMissingColumns(
    values: FieldValues,
    run: (v: FieldValues) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<Row> {
    let v = { ...values };
    for (let i = 0; i < 8; i++) {
      const { data, error } = await run(v);
      if (!error) return data as Row;
      const col = /Could not find the '([^']+)' column/i.exec(error.message)?.[1] ?? /column "?([a-z_0-9]+)"? of relation .* does not exist/i.exec(error.message)?.[1];
      if (!col || !(col in v)) throw new Error(error.message);
      console.warn(`JD One: column "${col}" is not in the database yet (run the update SQL); saved without it.`);
      const next = { ...v };
      delete next[col];
      v = next;
    }
    throw new Error("Could not save: the database needs the latest update SQL.");
  }

  async remove(entity: string, id: string): Promise<void> {
    const def = getEntity(entity);
    const { error } = await this.client.from(def.table).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  private channelSeq = 0;
  subscribe(entity: string, callback: () => void): () => void {
    const def = getEntity(entity);
    // Unique channel per subscriber: supabase-js returns the SAME channel object for a
    // repeated name, and adding a listener after subscribe() throws (sidebar badge +
    // dashboard both watching "tickets" crashed the app on 29 Sep).
    const channel = this.client
      .channel(`jd-one:${def.table}:${++this.channelSeq}`)
      .on("postgres_changes", { event: "*", schema: SUPABASE_SCHEMA, table: def.table }, () => callback())
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
  async importAll(input: ExportBundle): Promise<void> {
    const [units, staffRows] = await Promise.all([this.list("business-units"), this.list("staff")]);
    const bundle = mergeBundle(input, { business_units: units, staff: staffRows });
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
      if (f.type === "file") {
        const v = out[f.name];
        if (typeof v !== "string" || !v.startsWith("data:")) continue;
        const blob = await (await fetch(v)).blob();
        const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
        const path = `${def.table}/${id ?? crypto.randomUUID()}-${f.name}-${Date.now()}.${ext}`;
        out[f.name] = await this.putObject(RECEIPTS_BUCKET, path, blob);
      } else if (f.type === "files") {
        // Multiple photos/videos: upload the new (data URL) ones, keep http(s) URLs as they are.
        const items = Array.isArray(out[f.name]) ? (out[f.name] as FileItem[]) : [];
        if (!items.some((it) => it.url.startsWith("data:"))) continue;
        const folder = `${def.table}/${id ?? crypto.randomUUID()}`;
        const uploaded: FileItem[] = [];
        for (const it of items) {
          if (!it.url.startsWith("data:")) {
            uploaded.push(it);
            continue;
          }
          const blob = await (await fetch(it.url)).blob();
          const ext = (it.name.split(".").pop() || blob.type.split("/")[1] || "bin").toLowerCase().replace("jpeg", "jpg").replace("quicktime", "mov");
          const url = await this.putObject(TICKETS_BUCKET, `${folder}/${crypto.randomUUID()}.${ext}`, blob);
          uploaded.push({ ...it, url, size: blob.size });
        }
        out[f.name] = uploaded;
      }
    }
    return out;
  }

  private async putObject(bucket: string, path: string, blob: Blob): Promise<string> {
    const { error } = await this.client.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}

/** Keep only columns the table knows about (ignores helper keys from older exports). */
function stripUnknownColumns(entity: string, row: Row): Row {
  const def = getEntity(entity);
  const allowed = new Set(["id", "created_at", "updated_at", "created_by", ...def.fields.filter((f) => !f.virtual).map((f) => f.name)]);
  const out: Row = { id: row.id, created_at: row.created_at, updated_at: row.updated_at };
  for (const [k, v] of Object.entries(row)) if (allowed.has(k)) out[k] = v;
  return out;
}
