"use client";
/** Recipe: pick the menu dish, then ingredients from stock with quantities for the batch. */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CustomFormProps, FieldValues, Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { saveRecord } from "@/core/data/service";
import { formatMoney, formatNumber } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { recipeLines, type RecipeLine } from "./lines";

const blank = (): RecipeLine => ({ stock_id: null, item: "", unit: "", qty: 0, cost: 0 });

export function RecipeForm({ id, prefill, onSaved, onCancel }: CustomFormProps) {
  const user = useUser();
  const { toast } = useToast();
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const [v, setV] = useState<FieldValues | null>(null);
  const [lines, setLines] = useState<RecipeLine[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { rows: units } = useList("business-units", { filter: { active: true } });
  const unitId = String(v?.business_unit_id ?? "");
  const { rows: stock } = useList(unitId ? "stock" : null, { filter: { business_unit_id: unitId }, sort: { field: "item", dir: "asc" } });
  const { rows: menu } = useList(unitId ? "menu" : null, { filter: { business_unit_id: unitId }, sort: { field: "name", dir: "asc" } });
  const byId = useMemo(() => new Map(stock.map((s) => [s.id, s] as [string, Row])), [stock]);

  const prefillKey = JSON.stringify(prefill ?? {});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = id ? await getStore().get("recipes", id) : null;
        if (id && !row) throw new Error("Recipe not found");
        if (cancelled) return;
        if (row) {
          setV({ ...row });
          const ls = recipeLines(row);
          setLines(ls.length ? ls : [blank()]);
        } else setV({ portions: 1, active: true, business_unit_id: user.unitId ?? "", ...(JSON.parse(prefillKey) as FieldValues) });
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

  const portions = Math.max(1, Number(v.portions) || 1);
  const batch = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const perPortion = batch / portions;
  const price = Number(v.menu_price) || 0;
  const pct = price > 0 ? Math.round((perPortion / price) * 1000) / 10 : null;
  const setLine = (i: number, patch: Partial<RecipeLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const pickMenu = (mid: string) => {
    const m = menu.find((x) => x.id === mid);
    setV({ ...v, menu_id: mid || null, ...(m ? { name: v.name || m.name, menu_price: m.price } : {}) });
  };

  const save = async () => {
    const clean = lines.filter((l) => l.item.trim() && l.qty > 0);
    if (!String(v.name ?? "").trim()) return setError("Enter the dish name.");
    if (!clean.length) return setError("Add at least one ingredient with a quantity.");
    setSaving(true);
    setError(null);
    try {
      const row = await saveRecord("recipes", { ...v, lines: clean }, { store: getStore(), staffId }, id);
      toast("Recipe saved");
      onSaved(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Menu dish" help="Link it so served orders take these ingredients off stock">
          <Select value={String(v.menu_id ?? "")} onChange={(e) => pickMenu(e.target.value)}>
            <option value="">— not linked —</option>
            {menu.map((m) => (
              <option key={m.id} value={m.id}>
                {String(m.name)} · {formatMoney(m.price)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dish name" required>
          <Input value={String(v.name ?? "")} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="This batch makes (portions)" required>
          <Input type="number" min={1} value={String(v.portions ?? 1)} onChange={(e) => setV({ ...v, portions: Number(e.target.value) || 1 })} />
        </Field>
        <Field label="Selling price (₹)">
          <Input type="number" min={0} value={String(v.menu_price ?? "")} onChange={(e) => setV({ ...v, menu_price: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Ingredients for the whole batch</span>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
            <Field label="Stock item">
              <Select
                value={l.stock_id ?? ""}
                onChange={(e) => {
                  const s = byId.get(e.target.value);
                  setLine(i, s ? { stock_id: s.id, item: String(s.item), unit: String(s.unit ?? ""), cost: Number(s.cost_per_unit) || l.cost } : { stock_id: null });
                }}
                className="min-w-[200px]"
              >
                <option value="">— type below —</option>
                {stock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.item)} ({String(s.unit ?? "")})
                  </option>
                ))}
              </Select>
            </Field>
            {!l.stock_id && (
              <Field label="Item">
                <Input value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} placeholder="Salt, water…" />
              </Field>
            )}
            <Field label="Quantity">
              <Input type="number" inputMode="decimal" min={0} step="any" value={l.qty || ""} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} className="w-24" />
            </Field>
            <Field label="Unit">
              <Input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} className="w-20" placeholder="kg" />
            </Field>
            <Field label="₹ / unit">
              <Input type="number" inputMode="decimal" min={0} step="any" value={l.cost || ""} onChange={(e) => setLine(i, { cost: Number(e.target.value) || 0 })} className="w-24" />
            </Field>
            <span className="pb-2 text-sm text-slate-500">= {formatMoney(l.qty * l.cost, true)}</span>
            {lines.length > 1 && <Button variant="secondary" icon={Trash2} aria-label="Remove ingredient" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />}
          </div>
        ))}
        <Button variant="secondary" icon={Plus} onClick={() => setLines((ls) => [...ls, blank()])} className="self-start">
          Add ingredient
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-center">
        <div className="bg-background p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Batch cost</div>
          <div className="jd-serif text-2xl font-semibold">{formatMoney(batch)}</div>
        </div>
        <div className="bg-background p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Per portion</div>
          <div className="jd-serif text-2xl font-semibold">{formatMoney(perPortion, true)}</div>
        </div>
        <div className="bg-background p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Food cost</div>
          <div className={`jd-serif text-2xl font-semibold ${pct !== null && pct > 35 ? "text-red-600" : ""}`}>{pct === null ? "—" : `${formatNumber(pct)}%`}</div>
        </div>
      </div>

      <Field label="Method / notes">
        <Textarea value={String(v.method ?? "")} onChange={(e) => setV({ ...v, method: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.active !== false} onChange={(e) => setV({ ...v, active: e.target.checked })} className="h-5 w-5" />
        Take ingredients off stock when this dish is served
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={() => onCancel?.()}>
          Cancel
        </Button>
        <Button loading={saving} onClick={() => void save()}>
          Save recipe
        </Button>
      </div>
    </div>
  );
}
