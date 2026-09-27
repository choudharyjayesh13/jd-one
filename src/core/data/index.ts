/**
 * Chooses the backend once. The UI imports `getStore()` and never talks to
 * Supabase or IndexedDB directly.
 */
import type { DataStore, StoreKind } from "./types";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const storeKind: StoreKind = SUPABASE_URL && SUPABASE_ANON_KEY ? "supabase" : "local";

let store: DataStore | null = null;

export function getStore(): DataStore {
  if (!store) {
    store = storeKind === "supabase" ? new SupabaseStore(SUPABASE_URL, SUPABASE_ANON_KEY) : new LocalStore();
  }
  return store;
}

export function getSupabaseClient() {
  const s = getStore();
  return s instanceof SupabaseStore ? s.client : null;
}

export function getLocalStore(): LocalStore | null {
  const s = getStore();
  return s instanceof LocalStore ? s : null;
}

export type { DataStore, ListQuery, ExportBundle } from "./types";
