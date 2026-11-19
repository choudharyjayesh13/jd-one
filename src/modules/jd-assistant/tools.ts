/**
 * JD's hands. Every tool JD calls runs here, in the staff member's own
 * browser, through the same checks as the app's own screens:
 *   - canRead / canCreate / canUpdate / canDelete (Team access levels, or the
 *     old role rules; Chairman and Director have everything),
 *   - business-unit scoping (staff tied to a unit only see and write that unit),
 *   - saveRecord / deleteRecord (validation, unique checks, module hooks,
 *     change log), and the database's own row-level security.
 * So JD can never do more than the person could do by hand.
 */
import type { AuthUser } from "@/core/auth/AuthProvider";
import { canCreate, canDelete, canRead, canUpdate, moduleLevel } from "@/core/auth/access";
import { getStore } from "@/core/data";
import { deleteRecord, recordTitle, saveRecord, validate } from "@/core/data/service";
import { entities, findEntity } from "@/core/schema/registry";
import type { EntityDef, FieldValues, Row } from "@/core/schema/types";

export interface ToolEnv {
  user: AuthUser;
  navigate: (path: string) => void;
  /** Ask the person to confirm on screen; resolves false when they decline. */
  confirm: (message: string) => Promise<boolean>;
}

type Input = Record<string, unknown>;

/** Modules this person may at least view, with what they may do. Sent to JD as its catalogue. */
export function catalogue(user: AuthUser): string {
  return entities
    .filter((e) => canRead(user.role, e))
    .map((e) => {
      const can = ["view"];
      if (canCreate(user.role, e)) can.push("add");
      if (canUpdate(user.role, e)) can.push("edit");
      if (canDelete(user.role, e)) can.push("delete");
      return `- ${e.name} — ${e.label} — ${can.join(", ")}`;
    })
    .join("\n");
}

class NotAllowed extends Error {}

function entityFor(user: AuthUser, name: unknown, need: "read" | "create" | "update" | "delete"): EntityDef {
  const def = findEntity(String(name ?? ""));
  if (!def || !canRead(user.role, def)) throw new NotAllowed(`Not allowed: this login cannot open "${String(name)}".`);
  const ok = need === "read" || (need === "create" ? canCreate : need === "update" ? canUpdate : canDelete)(user.role, def);
  if (!ok) throw new NotAllowed(`Not allowed: this login can only view ${def.label}, not ${need} entries.`);
  return def;
}

/** Records outside the person's business unit are treated as not found. */
function inScope(user: AuthUser, def: EntityDef, row: Row | null): row is Row {
  if (!row) return false;
  if (!def.unitField || !user.unitId) return true;
  const v = row[def.unitField];
  return v === null || v === undefined || v === user.unitId;
}

const relationCache = new Map<string, Map<string, string>>();
async function titleOf(entity: string, id: string): Promise<string | null> {
  const def = findEntity(entity);
  if (!def) return null;
  let m = relationCache.get(entity);
  if (!m) relationCache.set(entity, (m = new Map()));
  if (m.has(id)) return m.get(id)!;
  try {
    const row = await getStore().get(entity, id);
    const t = row ? recordTitle(def, row) : null;
    if (t) m.set(id, t);
    return t;
  } catch {
    return null;
  }
}

/** Short, readable rows for JD: no file blobs, relations shown as names. */
async function compact(def: EntityDef, row: Row, only?: string[], withRelations = false): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { id: row.id };
  const fields = def.fields.filter((f) => !f.virtual && (!only?.length || only.includes(f.name)));
  for (const f of fields) {
    let v = row[f.name];
    if (v === null || v === undefined || v === "") continue;
    if (f.type === "files" || f.type === "file") {
      v = Array.isArray(v) ? `${v.length} file(s)` : "1 file";
    } else if (typeof v === "string" && v.startsWith("data:")) {
      v = "[file]";
    } else if (typeof v === "string" && v.length > 400) {
      v = v.slice(0, 400) + "…";
    }
    out[f.name] = v;
    if (withRelations && f.type === "relation" && f.entity && typeof v === "string") {
      const t = await titleOf(f.entity, v);
      if (t) out[`${f.name}__name`] = t;
    }
  }
  if (!only?.length) out.created_at = row.created_at;
  return out;
}

function describe(def: EntityDef) {
  return {
    entity: def.name,
    label: def.label,
    title_field: def.titleField,
    search_fields: def.searchFields,
    default_sort: def.defaultSort,
    fields: def.fields
      .filter((f) => !f.virtual && !f.computed)
      .map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        ...(f.required ? { required: true } : {}),
        ...(f.options ? { options: f.options } : {}),
        ...(f.entity ? { relation_to: f.entity } : {}),
        ...(f.readOnly ? { read_only: true } : {}),
        ...(f.help ? { help: f.help } : {}),
      })),
  };
}

/** Keep only real, editable fields; file fields cannot be filled by JD. */
function cleanValues(def: EntityDef, values: unknown): FieldValues {
  const v = (values && typeof values === "object" ? values : {}) as FieldValues;
  const out: FieldValues = {};
  const unknown: string[] = [];
  for (const [k, val] of Object.entries(v)) {
    const f = def.fields.find((x) => x.name === k);
    if (!f) unknown.push(k);
    else if (f.virtual || f.computed || f.readOnly || f.type === "files" || f.type === "file") continue;
    else out[k] = val;
  }
  if (unknown.length) throw new Error(`Unknown field(s) for ${def.name}: ${unknown.join(", ")}. Call describe_module first.`);
  return out;
}

export async function runTool(name: string, input: Input, env: ToolEnv): Promise<{ ok: boolean; result: unknown; summary: string }> {
  const { user } = env;
  const store = getStore();
  const ctx = { store, staffId: (user.staff?.id as string | undefined) ?? null };
  try {
    switch (name) {
      case "describe_module": {
        const def = entityFor(user, input.entity, "read");
        return { ok: true, result: describe(def), summary: `Looked at ${def.label}` };
      }
      case "list_records": {
        const def = entityFor(user, input.entity, "read");
        const filter = { ...((input.filter as Record<string, unknown>) ?? {}) };
        if (def.unitField && user.unitId) filter[def.unitField] = user.unitId;
        const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 200);
        const sort = (input.sort as { field: string; dir: "asc" | "desc" } | undefined)?.field ? (input.sort as { field: string; dir: "asc" | "desc" }) : def.defaultSort;
        const rows = await store.list(def.name, {
          search: (input.search as string) || undefined,
          filter,
          range: (input.range as Record<string, { gte?: string; lte?: string }>) ?? undefined,
          sort,
          limit: limit + 1,
        });
        const more = rows.length > limit;
        const only = Array.isArray(input.fields) ? (input.fields as string[]) : undefined;
        const out = await Promise.all(rows.slice(0, limit).map((r) => compact(def, r, only, rows.length <= 30)));
        return { ok: true, result: { count: out.length, more_available: more, rows: out }, summary: `Searched ${def.label} · ${out.length}${more ? "+" : ""} found` };
      }
      case "get_record": {
        const def = entityFor(user, input.entity, "read");
        const row = await store.get(def.name, String(input.id));
        if (!inScope(user, def, row)) return { ok: false, result: "Not found", summary: `${def.labelSingular} not found` };
        return { ok: true, result: await compact(def, row, undefined, true), summary: `Opened ${def.labelSingular}: ${recordTitle(def, row)}` };
      }
      case "create_record": {
        const def = entityFor(user, input.entity, "create");
        const values = cleanValues(def, input.values);
        if (def.unitField && user.unitId) values[def.unitField] = user.unitId;
        for (const f of def.fields) {
          if (values[f.name] !== undefined || f.default === undefined) continue;
          values[f.name] = typeof f.default === "function" ? (f.default as () => unknown)() : f.default;
        }
        for (const f of def.fields) if (f.type === "relation" && f.entity === "staff" && f.defaultToMe !== false && ctx.staffId && !values[f.name]) values[f.name] = ctx.staffId;
        const missing = def.fields.filter((f) => f.required && !f.readOnly && !f.virtual && (values[f.name] === undefined || values[f.name] === null || values[f.name] === ""));
        if (missing.length) return { ok: false, result: `Missing required: ${missing.map((f) => `${f.name} (${f.label})`).join(", ")}. Ask the person for these.`, summary: "Needs more details" };
        const errs = validate(def, values);
        if (Object.keys(errs).length) return { ok: false, result: `Please fix: ${JSON.stringify(errs)}`, summary: "Needs correction" };
        const row = await saveRecord(def.name, values, ctx);
        return { ok: true, result: { saved: true, id: row.id, record: await compact(def, row) }, summary: `Added ${def.labelSingular}: ${recordTitle(def, row)}` };
      }
      case "update_record": {
        const def = entityFor(user, input.entity, "update");
        const id = String(input.id);
        const existing = await store.get(def.name, id);
        if (!inScope(user, def, existing)) return { ok: false, result: "Not found", summary: `${def.labelSingular} not found` };
        const values = cleanValues(def, input.values);
        if (def.unitField && user.unitId) delete values[def.unitField];
        const merged = { ...existing, ...values };
        const errs = validate(def, merged);
        if (Object.keys(errs).length) return { ok: false, result: `Please fix: ${JSON.stringify(errs)}`, summary: "Needs correction" };
        const row = await saveRecord(def.name, merged, ctx, id);
        return { ok: true, result: { saved: true, changed: Object.keys(values), record: await compact(def, row) }, summary: `Updated ${def.labelSingular}: ${recordTitle(def, row)}` };
      }
      case "delete_record": {
        const def = entityFor(user, input.entity, "delete");
        const id = String(input.id);
        const existing = await store.get(def.name, id);
        if (!inScope(user, def, existing)) return { ok: false, result: "Not found", summary: `${def.labelSingular} not found` };
        const yes = await env.confirm(`Delete ${def.labelSingular} "${recordTitle(def, existing)}"?${input.reason ? `\n\n${String(input.reason)}` : ""}`);
        if (!yes) return { ok: false, result: "The person chose not to delete it.", summary: "Delete cancelled" };
        await deleteRecord(def.name, id, ctx);
        return { ok: true, result: { deleted: true }, summary: `Deleted ${def.labelSingular}: ${recordTitle(def, existing)}` };
      }
      case "open_page": {
        let path = String(input.path ?? "/");
        if (!path.startsWith("/")) path = "/" + path;
        const first = path.split(/[/?]/).filter(Boolean)[0];
        const def = first ? findEntity(first) : undefined;
        if (def && !canRead(user.role, def)) throw new NotAllowed(`Not allowed: this login cannot open ${def.label}.`);
        if (!def && first && moduleLevel(first) === 0) throw new NotAllowed("Not allowed: this login cannot open that page.");
        env.navigate(path);
        return { ok: true, result: `Opened ${path}`, summary: `Opened ${path}` };
      }
      default:
        return { ok: false, result: `Unknown tool ${name}`, summary: "Unknown action" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, result: e instanceof NotAllowed ? msg : `Error: ${msg}`, summary: e instanceof NotAllowed ? "Not allowed for this login" : "Could not complete" };
  }
}
