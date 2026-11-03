"use client";
/** New / edit stock request: pick items from stock (or type one), enter quantities. */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CustomFormProps, FieldValues, Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { saveRecord } from "@/core/data/service";
import { formatNumber, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { INDENT_DEPARTMENTS, indentLines, type IndentLine } from "./entity";

const blank = (): IndentLine => ({ stock_id: null, item: "", unit: "", qty: 1 });

export function IndentForm({ id, prefill, onSaved, onCancel }: CustomFormProps) {
  const user = useUser();
  const { toast } = useToast();
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const [v, setV] = useState<FieldValues | null>(null);
  const [lines, setLines] = useState<IndentLine[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { rows: units } = useList("business-units", { filter: { active: true } });
  const unitId = String(v?.business_unit_id ?? "");
  const { rows: stock } = useList(unitId ? "stock" : null, { filter: { business_unit_id: unitId }, sort: { field: "item", dir: "asc" } });

  const prefillKey = JSON.stringify(prefill ?? {});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = id ? await getStore().get("indents", id) : null;
        if (id && !row) throw new Error("Stock request not found");
        if (cancelled) return;
        if (row) {
          setV({ ...row });
          const ls = indentLines(row);
          setLines(ls.length ? ls : [blank()]);
        } else {
          setV({ date: todayISO(), department: "Kitchen", status: "Requested", requested_by: staffId, business_unit_id: user.unitId ?? "", ...(JSON.parse(prefillKey) as FieldValues) });
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, prefillKey, staffId, user.unitId]);

  useEffect(() => {
    if (v && !v.business_unit_id && units.length) setV((x) => ({ ...x, business_unit_id: (units.find((u) => /udaisarovar/i.test(String(u.name))) ?? units[0]).id }));
  }, [v, units]);

  const byId = useMemo(() => new Map(stock.map((s) => [s.id, s] as [string, Row])), [stock]);

  if (loadError) return <ErrorBox message={loadError} />;
  if (!v) return <Loading />;
  const locked = !!id && v.status !== "Requested";

  const setLine = (i: number, patch: Partial<IndentLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, sid: string) => {
    const s = byId.get(sid);
    setLine(i, s ? { stock_id: sid, item: String(s.item), unit: String(s.unit ?? "") } : { stock_id: null });
  };

  const save = async () => {
    const clean = lines.filter((l) => l.item.trim() && l.qty > 0);
    if (!clean.length) return setError("Add at least one item with a quantity.");
    if (!v.business_unit_id) return setError("Choose the property.");
    setSaving(true);
    setError(null);
    try {
      const row = await saveRecord("indents", { ...v, lines: clean, status: v.status ?? "Requested" }, { store: getStore(), staffId }, id);
      toast(id ? "Stock request updated" : "Stock request sent to Stores");
      onSaved(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {locked && <p className="rounded-lg border border-line px-3 py-2 text-sm">This request is already {String(v.status).toLowerCase()} — items can no longer be changed.</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="For department" required>
          <Select value={String(v.department ?? "Kitchen")} onChange={(e) => setV({ ...v, department: e.target.value })} disabled={locked}>
            {INDENT_DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required>
          <Input type="date" value={String(v.date ?? "")} onChange={(e) => setV({ ...v, date: e.target.value })} disabled={locked} />
        </Field>
        <Field label="Needed by">
          <Input type="date" value={String(v.needed_by ?? "")} onChange={(e) => setV({ ...v, needed_by: e.target.value || null })} disabled={locked} />
        </Field>
        {!user.unitId && (
          <Field label="Property" required>
            <Select value={unitId} onChange={(e) => setV({ ...v, business_unit_id: e.target.value })} disabled={locked}>
              <option value="">Select…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {String(u.name)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Items</span>
        {lines.map((l, i) => {
          const s = l.stock_id ? byId.get(l.stock_id) : undefined;
          return (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
              <Field label="From stock">
                <Select value={l.stock_id ?? ""} onChange={(e) => pick(i, e.target.value)} disabled={locked} className="min-w-[200px]">
                  <option value="">— type below —</option>
                  {stock.map((x) => (
                    <option key={x.id} value={x.id}>
                      {String(x.item)} ({formatNumber(x.quantity)} {String(x.unit ?? "")})
                    </option>
                  ))}
                </Select>
              </Field>
              {!l.stock_id && (
                <Field label="Item">
                  <Input value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} disabled={locked} placeholder="Paneer, oil, tissue…" />
                </Field>
              )}
              <Field label="Quantity">
                <Input type="number" inputMode="decimal" min={0} step="any" value={l.qty || ""} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} disabled={locked} className="w-24" />
              </Field>
              <Field label="Unit">
                <Input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} disabled={locked} className="w-24" placeholder="kg" />
              </Field>
              {s && Number(s.quantity ?? 0) < l.qty && <span className="pb-2 text-xs text-red-600">Only {formatNumber(s.quantity)} in stock</span>}
              {!locked && lines.length > 1 && <Button variant="secondary" icon={Trash2} aria-label="Remove item" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />}
            </div>
          );
        })}
        {!locked && (
          <Button variant="secondary" icon={Plus} onClick={() => setLines((ls) => [...ls, blank()])} className="self-start">
            Add item
          </Button>
        )}
      </div>

      <Field label="Notes">
        <Textarea value={String(v.notes ?? "")} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="For tonight's wedding dinner…" />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={() => onCancel?.()}>
          Cancel
        </Button>
        {!locked && (
          <Button loading={saving} onClick={() => void save()}>
            {id ? "Save" : "Send to Stores"}
          </Button>
        )}
      </div>
    </div>
  );
}
