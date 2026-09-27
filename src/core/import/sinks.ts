/** ImportSink implementations: the in-app DataStore and a service-role Supabase client. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataStore } from "@/core/data/types";
import type { FieldValues, Row } from "@/core/schema/types";
import type { ImportSink } from "./run";

/** Browser: goes through the active DataStore (local or Supabase-as-user). */
export function dataStoreSink(store: DataStore): ImportSink {
  return {
    async getCustomersByPhones(phones) {
      const set = new Set(phones);
      const all = await store.list("customers");
      return new Map(all.filter((c) => set.has(String(c.phone))).map((c) => [String(c.phone), c]));
    },
    createCustomer: (v) => store.create("customers", v),
    async getLeadsByExternalIds(ids) {
      const set = new Set(ids);
      const all = await store.list("leads");
      return new Map(all.filter((l) => l.external_id && set.has(String(l.external_id))).map((l) => [String(l.external_id), l]));
    },
    createLead: (v) => {
      const { created_at, ...rest } = v;
      return store.create("leads", created_at ? { ...rest, created_at } : rest);
    },
    updateLead: async (id, patch) => {
      await store.update("leads", id, patch);
    },
    listStaff: () => store.list("staff"),
    listBusinessUnits: () => store.list("business-units"),
    recordRun: async (run) => {
      await store.create("import-runs", run);
    },
  };
}

function chunk<T>(xs: T[], n = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Server-side script: service-role client (bypasses RLS; never in the browser). */
export function supabaseSink(client: SupabaseClient): ImportSink {
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };
  return {
    async getCustomersByPhones(phones) {
      const map = new Map<string, Row>();
      for (const part of chunk(phones)) {
        const { data, error } = await client.from("customers").select("*").in("phone", part);
        fail(error);
        for (const c of (data ?? []) as Row[]) map.set(String(c.phone), c);
      }
      return map;
    },
    async createCustomer(values: FieldValues) {
      const { data, error } = await client.from("customers").insert(values).select("*").single();
      fail(error);
      return data as Row;
    },
    async getLeadsByExternalIds(ids) {
      const map = new Map<string, Row>();
      for (const part of chunk(ids)) {
        const { data, error } = await client.from("leads").select("*").in("external_id", part);
        fail(error);
        for (const l of (data ?? []) as Row[]) map.set(String(l.external_id), l);
      }
      return map;
    },
    async createLead(values: FieldValues) {
      const { data, error } = await client.from("leads").insert(values).select("*").single();
      fail(error);
      return data as Row;
    },
    async updateLead(id, patch) {
      const { error } = await client.from("leads").update(patch).eq("id", id);
      fail(error);
    },
    async listStaff() {
      const { data, error } = await client.from("staff").select("*");
      fail(error);
      return (data ?? []) as Row[];
    },
    async listBusinessUnits() {
      const { data, error } = await client.from("business_units").select("*");
      fail(error);
      return (data ?? []) as Row[];
    },
    async recordRun(run) {
      const { error } = await client.from("import_runs").insert(run);
      fail(error);
    },
  };
}
