"use client";
/**
 * Generic form rendered from an EntityDef. Handles defaults, prefill from the
 * URL, business-unit scoping, validation, inline "+ New" for relations and
 * module hooks (via saveRecord).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import type { EntityDef, FieldDef, FieldValues, LiveHint, Row } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { getStore } from "@/core/data";
import { saveRecord, validate, type ValidationErrors } from "@/core/data/service";
import { formatMoney, formatNumber } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { Button } from "./Button";
import { Field, Input, Select, Textarea } from "./Input";
import { RelationSelect } from "./RelationSelect";
import { FileInput } from "./FileInput";
import { Dialog } from "./Dialog";
import { Loading, ErrorBox } from "./misc";
import { useToast } from "./Toast";

interface Props {
  entity: string;
  /** Edit an existing record. */
  id?: string;
  /** Prefilled values (e.g. from a "Convert to booking" action). */
  prefill?: FieldValues;
  /** Fields that must not be changed (shown disabled). */
  locked?: string[];
  onSaved: (row: Row) => void;
  onCancel?: () => void;
  submitLabel?: string;
  children?: ReactNode;
}

function initialValues(def: EntityDef, existing: Row | null, prefill: FieldValues | undefined, unitId: string | null, staffId: string | null): FieldValues {
  const v: FieldValues = {};
  for (const f of def.fields) {
    let d = typeof f.default === "function" ? (f.default as () => unknown)() : f.default;
    if (d === undefined) d = f.type === "boolean" ? false : "";
    v[f.name] = d;
  }
  if (def.unitField && unitId) v[def.unitField] = unitId;
  // Sensible default: "done by / received by" defaults to the signed-in staff.
  for (const f of def.fields) if (f.type === "relation" && f.entity === "staff" && staffId && !v[f.name]) v[f.name] = staffId;
  if (existing) for (const f of def.fields) v[f.name] = existing[f.name] ?? (f.type === "boolean" ? false : "");
  if (prefill) for (const [k, val] of Object.entries(prefill)) if (def.fields.some((f) => f.name === k)) v[k] = val;
  return v;
}

export function EntityForm({ entity, id, prefill, locked = [], onSaved, onCancel, submitLabel, children }: Props) {
  const def = getEntity(entity);
  const user = useUser();
  const { toast } = useToast();
  const [values, setValues] = useState<FieldValues | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inlineCreate, setInlineCreate] = useState<FieldDef | null>(null);
  const [hint, setHint] = useState<LiveHint | null>(null);
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const prefillKey = JSON.stringify(prefill ?? {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = id ? await getStore().get(entity, id) : null;
        if (id && !existing) throw new Error(`${def.labelSingular} not found`);
        if (!cancelled) setValues(initialValues(def, existing, JSON.parse(prefillKey) as FieldValues, user.unitId, staffId));
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, id, def, prefillKey, user.unitId, staffId]);

  // Live hint (e.g. "Existing customer: 3 stays") recomputed when watched fields change.
  const watched = def.liveHint ? JSON.stringify(def.liveHint.watch.map((w) => values?.[w] ?? null)) : "";
  useEffect(() => {
    if (!def.liveHint || !values) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const h = await def.liveHint!.compute(values, getStore());
        if (cancelled) return;
        setHint(h);
        if (h?.patch) setValues((prev) => ({ ...prev!, ...h.patch }));
      } catch {
        /* hint is best-effort */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, def]);

  const lockedSet = useMemo(() => new Set([...locked, ...(def.unitField && user.unitId ? [def.unitField] : [])]), [locked, def.unitField, user.unitId]);

  if (loadError) return <ErrorBox message={loadError} />;
  if (!values) return <Loading />;

  const set = (name: string, v: unknown) => setValues((prev) => ({ ...prev!, [name]: v }));

  const submit = async () => {
    const errs = validate(def, values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast("Please fix the highlighted fields", "error");
      return;
    }
    setSaving(true);
    try {
      const row = await saveRecord(entity, values, { store: getStore(), staffId }, id);
      toast(`${def.labelSingular} ${id ? "updated" : "saved"}`);
      onSaved(row);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: FieldDef) => {
    if (f.hidden) return null;
    if (f.readOnly && !id) return null; // e.g. balance — kept by hooks
    const disabled = saving || lockedSet.has(f.name) || Boolean(f.readOnly);
    const v = values[f.name];
    const invalid = Boolean(errors[f.name]);
    let control: ReactNode;
    if (f.computed) {
      const c = f.computed(values);
      control = <Input readOnly value={f.type === "money" ? formatMoney(c) : f.type === "number" ? formatNumber(c) : String(c ?? "")} className="bg-slate-50" />;
    } else {
      switch (f.type) {
        case "textarea":
          control = <Textarea value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} invalid={invalid} placeholder={f.placeholder} />;
          break;
        case "number":
        case "money":
          control = (
            <Input
              type="number"
              inputMode="decimal"
              value={v === null || v === undefined ? "" : String(v)}
              onChange={(e) => set(f.name, e.target.value)}
              disabled={disabled}
              invalid={invalid}
              min={f.min}
              max={f.max}
              step={f.step ?? (f.type === "money" ? 1 : "any")}
              placeholder={f.placeholder ?? (f.type === "money" ? "₹" : undefined)}
            />
          );
          break;
        case "date":
          control = <Input type="date" value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} invalid={invalid} />;
          break;
        case "datetime":
          control = <Input type="datetime-local" value={String(v ?? "").slice(0, 16)} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} invalid={invalid} />;
          break;
        case "select":
          control = (
            <Select value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} invalid={invalid}>
              <option value="">{f.placeholder ?? "Select…"}</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          );
          break;
        case "multiselect": {
          const arr = Array.isArray(v) ? (v as string[]) : [];
          control = (
            <div className="flex flex-wrap gap-2">
              {f.options?.map((o) => {
                const on = arr.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={disabled}
                    onClick={() => set(f.name, on ? arr.filter((x) => x !== o) : [...arr, o])}
                    className={on ? "rounded-full bg-navy px-3 py-1 text-xs font-medium text-white" : "rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          );
          break;
        }
        case "boolean":
          control = (
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-navy" checked={Boolean(v)} onChange={(e) => set(f.name, e.target.checked)} disabled={disabled} />
              {f.help ?? "Yes"}
            </label>
          );
          break;
        case "relation":
          control = (
            <RelationSelect
              entity={f.entity!}
              value={(v as string) || null}
              onChange={(idv) => set(f.name, idv)}
              disabled={disabled}
              invalid={invalid}
              placeholder={f.placeholder}
              onCreateNew={() => setInlineCreate(f)}
            />
          );
          break;
        case "file":
          control = <FileInput value={(v as string) || null} onChange={(d) => set(f.name, d)} disabled={disabled} />;
          break;
        case "phone":
          control = <Input type="tel" inputMode="tel" value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} invalid={invalid} placeholder={f.placeholder ?? "+91…"} />;
          break;
        case "email":
          control = <Input type="email" inputMode="email" value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} invalid={invalid} placeholder={f.placeholder} />;
          break;
        default:
          control = <Input value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} invalid={invalid} placeholder={f.placeholder} />;
      }
    }
    return (
      <Field key={f.name} label={f.label} required={f.required} error={errors[f.name]} help={f.type === "boolean" ? undefined : f.help} wide={f.wide || f.type === "textarea" || f.type === "file"}>
        {control}
      </Field>
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {hint && (
        <div
          className={
            hint.tone === "success"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              : hint.tone === "warning"
                ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                : "rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800"
          }
        >
          {hint.message}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{def.fields.map(renderField)}</div>
      {children}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" icon={Save} loading={saving}>
          {submitLabel ?? (id ? "Save changes" : `Save ${def.labelSingular.toLowerCase()}`)}
        </Button>
      </div>

      {/* "+ New" from a relation picker opens the related entity's form inline. */}
      <Dialog open={Boolean(inlineCreate)} onClose={() => setInlineCreate(null)} title={inlineCreate ? `New ${getEntity(inlineCreate.entity!).labelSingular.toLowerCase()}` : ""} wide>
        {inlineCreate && (
          <EntityForm
            entity={inlineCreate.entity!}
            onSaved={(row) => {
              set(inlineCreate.name, row.id);
              setInlineCreate(null);
            }}
            onCancel={() => setInlineCreate(null)}
          />
        )}
      </Dialog>
    </form>
  );
}
