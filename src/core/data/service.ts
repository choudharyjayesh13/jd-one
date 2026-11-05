/**
 * Record service: validation + unique checks + module hooks around the store.
 * Forms and actions call these instead of the raw store so business rules
 * (e.g. booking balance) run no matter which backend is active.
 */
import type { EntityDef, FieldValues, Row, HookContext } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import type { DataStore } from "./types";

export type ValidationErrors = Record<string, string>;

const PHONE_RE = /^[+\d][\d\s-]{6,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field-level validation used by EntityForm. */
export function validate(def: EntityDef, values: FieldValues): ValidationErrors {
  const errors: ValidationErrors = {};
  for (const f of def.fields) {
    if (f.computed || f.readOnly) continue;
    const v = values[f.name];
    const empty = v === undefined || v === null || v === "";
    if (f.required && empty) {
      errors[f.name] = "Required";
      continue;
    }
    if (empty) continue;
    if (f.type === "phone" && !PHONE_RE.test(String(v))) errors[f.name] = "Enter a valid phone number";
    if (f.type === "email" && !EMAIL_RE.test(String(v))) errors[f.name] = "Enter a valid email";
    if ((f.type === "number" || f.type === "money") && Number.isNaN(Number(v))) errors[f.name] = "Enter a number";
    if (f.min !== undefined && Number(v) < f.min) errors[f.name] = `Minimum ${f.min}`;
    if (f.max !== undefined && Number(v) > f.max) errors[f.name] = `Maximum ${f.max}`;
  }
  return errors;
}

/** Convert form values to what the store expects (numbers, nulls, computed). */
export function normalize(def: EntityDef, values: FieldValues): FieldValues {
  const out: FieldValues = {};
  for (const f of def.fields) {
    if (f.virtual) continue;
    let v = values[f.name];
    if (f.computed) v = f.computed(values);
    if (v === "" || v === undefined) v = null;
    if ((f.type === "number" || f.type === "money") && v !== null) v = Number(v);
    if (f.type === "boolean") v = Boolean(v);
    if (f.type === "multiselect" || f.type === "files") v = Array.isArray(v) ? v : [];
    if (f.type === "text" || f.type === "textarea" || f.type === "phone" || f.type === "email") {
      if (typeof v === "string") v = v.trim() || null;
    }
    out[f.name] = v;
  }
  return out;
}

async function checkUnique(def: EntityDef, store: DataStore, values: FieldValues, id?: string) {
  for (const combo of def.unique ?? []) {
    const filter: Record<string, unknown> = {};
    for (const k of combo) filter[k] = values[k] ?? null;
    // Optional keys (e.g. external_id) are unique only when present.
    if (Object.values(filter).every((v) => v === null)) continue;
    const clash = (await store.list(def.name, { filter })).find((r) => r.id !== id);
    if (clash) {
      const labels = combo.map((k) => def.fields.find((f) => f.name === k)?.label ?? k).join(" + ");
      throw new Error(`A ${def.labelSingular.toLowerCase()} with the same ${labels} already exists.`);
    }
  }
}

export async function saveRecord(entity: string, raw: FieldValues, ctx: HookContext, id?: string): Promise<Row> {
  const def = getEntity(entity);
  let values = normalize(def, raw);
  if (def.hooks?.beforeSave) values = await def.hooks.beforeSave(values, ctx, id);
  await checkUnique(def, ctx.store, values, id);
  if (id) {
    const previous = await ctx.store.get(entity, id);
    const row = await ctx.store.update(entity, id, values);
    if (previous) await def.hooks?.afterUpdate?.(row, previous, ctx);
    return row;
  }
  const row = await ctx.store.create(entity, { ...values, created_by: ctx.staffId ?? null });
  await def.hooks?.afterCreate?.(row, ctx);
  return row;
}

export async function deleteRecord(entity: string, id: string, ctx: HookContext): Promise<void> {
  const def = getEntity(entity);
  const existing = await ctx.store.get(entity, id);
  await ctx.store.remove(entity, id);
  if (existing) await def.hooks?.afterRemove?.(existing, ctx);
}

/** Display label of a record (its titleField, with sensible fallbacks). */
export function recordTitle(def: EntityDef, row: Row | null | undefined): string {
  if (!row) return "";
  const v = row[def.titleField];
  if (v !== null && v !== undefined && v !== "") return String(v);
  return `${def.labelSingular} ${row.id.slice(0, 8)}`;
}
