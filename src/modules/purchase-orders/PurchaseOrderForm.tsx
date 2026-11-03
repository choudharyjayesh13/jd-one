"use client";
/** Purchase order: vendor, then items (from stock or typed) with quantity and rate. */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CustomFormProps, FieldValues, Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { saveRecord } from "@/core/data/service";
import { formatMoney, formatNumber, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { PURCHASE_CATEGORIES } from "@/modules/purchases/entity";
import { poLines, type PoLine } from "./entity";

const blank = (): PoLine => ({ stock_id: null, item: "", unit: "", qty: 1, rate: 0 });

export function PurchaseOrderForm({ id, prefill, onSaved, onCancel }: CustomFormProps) {
  const user = useUser();
  const { toast } = useToast();
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const [v, setV] = useState<FieldValues | null>(null);
  const [lines, setLines] = useState<PoLine[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { rows: units } = useList("business-units", { filter: { active: true } });
  const { rows: vendors } = useList("vendors", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const unitId = String(v?.business_unit_id ?? "");
  const { rows: stock } = useList(unitId ? "stock" : null, { filter: { business_unit_id: unitId }, sort: { field: "item", dir: "asc" } });
  const byId = useMemo(() => new Map(stock.map((s) => [s.id, s] as [string, Row])), [stock]);

  const prefillKey = JSON.stringify(prefill ?? {});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = id ? await getStore().get("purchase-orders", id) : null;
        if (id && !row) throw new Error("Purchase order not found");
        if (cancelled) return;
        if (row) {
          setV({ ...row });
          const ls = poLines(row);
          setLines(ls.length ? ls : [blank()]);
        } else setV({ date: todayISO(), status: "Draft", category: "Grocery & dry ration", business_unit_id: user.unitId ?? "", ...(JSON.parse(prefillKey) as FieldValues) });
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, prefillKey, user.unitId]);

  useEffect(() => {
    if (v && !v.business_unit_id && units.length) setV((x) => ({ ...x, business_unit_id: (units.find((u) => /udaisarovar/i.test(String(u.name))) ?? units[0]).id }));
  }, [v, units]);

  if (loadError) return <ErrorBox message={loadError} />;
  if (!v) return <Loading />;
  const locked = !!id && (v.status === "Received" || v.status === "Cancelled");
  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const setLine = (i: number, patch: Partial<PoLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const lowStock = stock.filter((s) => s.low_stock === true);

  const save = async () => {
    const clean = lines.filter((l) => l.item.trim() && l.qty > 0);
    if (!clean.length) return setError("Add at least one item with a quantity.");
    setSaving(true);
    setError(null);
    try {
      const row = await saveRecord("purchase-orders", { ...v, lines: clean }, { store: getStore(), staffId }, id);
      toast("Purchase order saved");
      onSaved(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {locked && <p className="rounded-lg border border-line px-3 py-2 text-sm">This order is {String(v.status).toLowerCase()} and can no longer be changed.</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Vendor">
          <Select
            value={String(v.vendor_id ?? "")}
            disabled={locked}
            onChange={(e) => {
              const ven = vendors.find((x) => x.id === e.target.value);
              setV({ ...v, vendor_id: e.target.value || null, vendor_name: ven ? ven.name : v.vendor_name });
            }}
          >
            <option value="">— choose —</option>
            {vendors.map((x) => (
              <option key={x.id} value={x.id}>
                {String(x.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" required>
          <Select value={String(v.category ?? "")} onChange={(e) => setV({ ...v, category: e.target.value })} disabled={locked}>
            {PURCHASE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Expected on">
          <Input type="date" value={String(v.expected_on ?? "")} onChange={(e) => setV({ ...v, expected_on: e.target.value || null })} disabled={locked} />
        </Field>
      </div>

      {!locked && lowStock.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Low stock:</span>
          {lowStock.map((s) => (
            <button
              key={s.id}
              type="button"
              className="h-9 rounded-full border border-line px-3 hover:border-gold"
              onClick={() =>
                setLines((ls) => [...ls.filter((l) => l.item.trim()), { stock_id: s.id, item: String(s.item), unit: String(s.unit ?? ""), qty: Math.max(1, Number(s.min_quantity ?? 1) * 2 - Number(s.quantity ?? 0)), rate: Number(s.cost_per_unit) || 0 }])
              }
            >
              + {String(s.item)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
            <Field label="Stock item">
              <Select
                value={l.stock_id ?? ""}
                disabled={locked}
                onChange={(e) => {
                  const s = byId.get(e.target.value);
                  setLine(i, s ? { stock_id: s.id, item: String(s.item), unit: String(s.unit ?? ""), rate: Number(s.cost_per_unit) || l.rate } : { stock_id: null });
                }}
                className="min-w-[200px]"
              >
                <option value="">— type below —</option>
                {stock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.item)} ({formatNumber(s.quantity)} {String(s.unit ?? "")} in stock)
                  </option>
                ))}
              </Select>
            </Field>
            {!l.stock_id && (
              <Field label="Item">
                <Input value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} disabled={locked} />
              </Field>
            )}
            <Field label="Quantity">
              <Input type="number" inputMode="decimal" min={0} step="any" value={l.qty || ""} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} disabled={locked} className="w-24" />
            </Field>
            <Field label="Unit">
              <Input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} disabled={locked} className="w-20" />
            </Field>
            <Field label="Rate (₹)">
              <Input type="number" inputMode="decimal" min={0} step="any" value={l.rate || ""} onChange={(e) => setLine(i, { rate: Number(e.target.value) || 0 })} disabled={locked} className="w-24" />
            </Field>
            <span className="pb-2 text-sm text-slate-500">= {formatMoney(l.qty * l.rate)}</span>
            {!locked && lines.length > 1 && <Button variant="secondary" icon={Trash2} aria-label="Remove item" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />}
          </div>
        ))}
        {!locked && (
          <Button variant="secondary" icon={Plus} onClick={() => setLines((ls) => [...ls, blank()])} className="self-start">
            Add item
          </Button>
        )}
      </div>
      <div className="flex items-baseline justify-end gap-3">
        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</span>
        <span className="jd-serif text-3xl font-semibold">{formatMoney(total)}</span>
      </div>
      <Field label="Notes">
        <Textarea value={String(v.notes ?? "")} onChange={(e) => setV({ ...v, notes: e.target.value })} disabled={locked} />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={() => onCancel?.()}>
          Cancel
        </Button>
        {!locked && (
          <Button loading={saving} onClick={() => void save()}>
            Save order
          </Button>
        )}
      </div>
    </div>
  );
}
