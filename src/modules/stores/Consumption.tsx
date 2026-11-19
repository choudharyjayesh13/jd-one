"use client";
/**
 * Consumption report (/consumption/): for a month, everything that went out of
 * stock — per item and per reason (issued to departments, orders, wastage…) —
 * with value at the item's cost per unit, and what each department was issued.
 */
import { useMemo, useState } from "react";
import { currentMonth, formatMoney, formatMonth, formatNumber, monthRange } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Input } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { indentLines } from "@/modules/indents/entity";

export function Consumption() {
  const user = useUser();
  const [month, setMonth] = useState(currentMonth());
  const { start, end } = monthRange(month);
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows: moves, loading } = useList("stock-movements", { filter: { ...unitFilter, direction: "Out" }, range: { date: { gte: start, lte: end } } });
  const { rows: stock } = useList("stock", { filter: unitFilter });
  const { rows: indents } = useList("indents", { filter: unitFilter, range: { date: { gte: start, lte: end } } });

  const byItem = useMemo(() => {
    const m = new Map<string, { item: string; unit: string; cost: number; total: number; by: Record<string, number> }>();
    for (const mv of moves) {
      const s = stock.find((x) => x.id === mv.stock_id);
      const key = String(mv.stock_id);
      const cur = m.get(key) ?? { item: String(s?.item ?? "?"), unit: String(s?.unit ?? ""), cost: Number(s?.cost_per_unit) || 0, total: 0, by: {} };
      const q = Number(mv.quantity) || 0;
      cur.total += q;
      const src = String(mv.source ?? "Other");
      cur.by[src] = (cur.by[src] ?? 0) + q;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total * b.cost - a.total * a.cost);
  }, [moves, stock]);

  const sources = useMemo(() => Array.from(new Set(moves.map((m) => String(m.source ?? "Other")))).sort(), [moves]);
  const totalValue = byItem.reduce((s, r) => s + r.total * r.cost, 0);

  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    for (const ind of indents) {
      if (ind.status !== "Issued" && ind.status !== "Received") continue;
      let v = 0;
      for (const l of indentLines(ind)) {
        const s = l.stock_id ? stock.find((x) => x.id === l.stock_id) : undefined;
        v += (l.issued_qty ?? l.qty) * (Number(s?.cost_per_unit) || 0);
      }
      const d = String(ind.department ?? "Other");
      m.set(d, (m.get(d) ?? 0) + v);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [indents, stock]);

  return (
    <div>
      <PageHeader
        title="Consumption report"
        subtitle={`${formatMonth(month)} · stock that went out, valued at cost per unit · total ${formatMoney(totalValue)}`}
        actions={<Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" />}
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="jd-serif mb-2 text-2xl font-semibold">Issued to departments</h2>
            {byDept.length === 0 ? (
              <p className="text-sm text-slate-500">No stock requests issued this month.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {byDept.map(([d, v]) => (
                  <span key={d} className="rounded-full border border-line px-3 py-1.5 text-sm">
                    {d}: <b className="font-semibold">{formatMoney(v)}</b>
                  </span>
                ))}
              </div>
            )}
          </section>
          <section className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-3 py-2 font-medium">Item</th>
                  {sources.map((s) => (
                    <th key={s} className="px-3 py-2 text-right font-medium">
                      {s}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {byItem.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={sources.length + 3}>
                      Nothing went out of stock this month.
                    </td>
                  </tr>
                ) : (
                  byItem.map((r) => (
                    <tr key={r.item} className="border-t border-line">
                      <td className="px-3 py-2">
                        {r.item} <span className="text-slate-500">({r.unit})</span>
                      </td>
                      {sources.map((s) => (
                        <td key={s} className="px-3 py-2 text-right">
                          {r.by[s] ? formatNumber(r.by[s]) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-medium">{formatNumber(r.total)}</td>
                      <td className="px-3 py-2 text-right">{r.cost ? formatMoney(r.total * r.cost) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
