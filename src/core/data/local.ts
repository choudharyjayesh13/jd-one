/**
 * LocalStore: IndexedDB via `idb`. One object store per entity table. Works
 * fully offline on a single device; Settings can export everything as JSON.
 */
import { openDB, type IDBPDatabase } from "idb";
import type { Row, FieldValues } from "@/core/schema/types";
import { entities, getEntity } from "@/core/schema/registry";
import type { DataStore, ExportBundle, ListQuery } from "./types";
import { newId } from "./types";
import { applyQuery } from "./query";

const DB_NAME = "jd-one";
const DB_VERSION = 2; // v2: messages store

type Listener = () => void;

export class LocalStore implements DataStore {
  kind = "local" as const;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private listeners = new Map<string, Set<Listener>>();

  private db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          for (const e of entities) {
            if (!db.objectStoreNames.contains(e.table)) db.createObjectStore(e.table, { keyPath: "id" });
          }
        },
      });
    }
    return this.dbPromise;
  }

  private emit(entity: string) {
    this.listeners.get(entity)?.forEach((cb) => cb());
  }

  subscribe(entity: string, callback: Listener): () => void {
    if (!this.listeners.has(entity)) this.listeners.set(entity, new Set());
    this.listeners.get(entity)!.add(callback);
    return () => this.listeners.get(entity)?.delete(callback);
  }

  async list(entity: string, query?: ListQuery): Promise<Row[]> {
    const def = getEntity(entity);
    const db = await this.db();
    const rows = (await db.getAll(def.table)) as Row[];
    return applyQuery(rows, { sort: def.defaultSort, ...query }, def.searchFields);
  }

  async get(entity: string, id: string): Promise<Row | null> {
    const def = getEntity(entity);
    const db = await this.db();
    return ((await db.get(def.table, id)) as Row | undefined) ?? null;
  }

  async create(entity: string, data: FieldValues): Promise<Row> {
    const def = getEntity(entity);
    const db = await this.db();
    const now = new Date().toISOString();
    // Imports may carry the original created_at (e.g. Meta created_time).
    const row: Row = { ...data, id: (data.id as string) || newId(), created_at: (data.created_at as string) || now, updated_at: now };
    await db.put(def.table, row);
    this.emit(entity);
    return row;
  }

  async update(entity: string, id: string, patch: FieldValues): Promise<Row> {
    const def = getEntity(entity);
    const db = await this.db();
    const existing = (await db.get(def.table, id)) as Row | undefined;
    if (!existing) throw new Error(`${def.labelSingular} not found`);
    const row: Row = { ...existing, ...patch, id, updated_at: new Date().toISOString() };
    await db.put(def.table, row);
    this.emit(entity);
    return row;
  }

  async remove(entity: string, id: string): Promise<void> {
    const def = getEntity(entity);
    const db = await this.db();
    await db.delete(def.table, id);
    this.emit(entity);
  }

  async exportAll(): Promise<ExportBundle> {
    const db = await this.db();
    const tables: Record<string, Row[]> = {};
    for (const e of entities) tables[e.table] = (await db.getAll(e.table)) as Row[];
    return { app: "jd-one", version: 1, exportedAt: new Date().toISOString(), tables };
  }

  /** Merge-import: rows with the same id are replaced, others are added. */
  async importAll(bundle: ExportBundle): Promise<void> {
    const db = await this.db();
    for (const e of entities) {
      const rows = bundle.tables[e.table];
      if (!rows) continue;
      const tx = db.transaction(e.table, "readwrite");
      for (const r of rows) await tx.store.put(r);
      await tx.done;
      this.emit(e.name);
    }
  }

  /** Delete the given ids (used by "Clear demo data"). */
  async removeMany(table: string, ids: string[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(table, "readwrite");
    for (const id of ids) await tx.store.delete(id);
    await tx.done;
    const def = entities.find((e) => e.table === table);
    if (def) this.emit(def.name);
  }

  async clearAll(): Promise<void> {
    const db = await this.db();
    for (const e of entities) {
      await db.clear(e.table);
      this.emit(e.name);
    }
  }
}
