"use client";
/** Daily F&B sales (/fb-sales/): a day's food & drink orders — total, by order type, top dishes. */
import { useMemo, useState } from "react";
import { addDays, formatDate, formatMoney, formatNumber, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Input } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";

export function FbSales() {
  const user = useUser();
  const [day, setDay] = useState(todayISO());
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows, loading } = useList("kots", { filter: unitFilter, range: { created_at: { gte: `${day}T00:00:00+05:30`, lte: `${addDays(day, 1)}T00:00:00+05:30` } } });
  const live = rows.filter((k) => k.status !== "Cancelled");
  const total = live.reduce((s, k) => s + (Number(k.amount) || 0), 0);
  const covers = live.reduce((s, k) => s + (Number(k.pax) || 0), 0);

  const byType = useMemo(() => {
    const m = new Map<string, { n: number; amt: number }>();
    for (const k of live) {
      const t = String(k.order_type ?? "Other");
      const cur = m.get(t) ?? { n: 0, amt: 0 };
      cur.n += 1;
      cur.amt += Number(k.amount) || 0;
      m.set(t, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].amt - a[1].amt);
  }, [live]);

  const dishes = useMemo(() => {
    const m = new Map<string, { qty: number; amt: number }>();
    for (const k of live) {
      if (!Array.isArray(k.lines)) continue;
      for (const l of k.lines as Record<string, unknown>[]) {
        const name = String(l.name ?? "");
        if (!name) continue;
        const cur = m.get(name) ?? { qty: 0, amt: 0 };
        cur.qty += Number(l.qty) || 0;
        cur.amt += Number(l.amount ?? (Number(l.qty) || 0) * (Number(l.rate) || 0)) || 0;
        m.set(name, cur);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1].amt - a[1].amt).slice(0, 15);
  }, [live]);

  return (
    <div>
      <PageHeader
        title="Daily F&B sales"
        subtitle={formatDate(day)}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDay(addDays(day, -1))}>
              ← Day
            </Button>
            <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-auto" />
            <Button variant="secondary" size="sm" onClick={() => setDay(addDays(day, 1))}>
              Day →
            </Button>
          </>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {[
              ["Sales", formatMoney(total)],
              ["Orders", String(live.length)],
              ["Covers", formatNumber(covers)],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 bg-background p-4">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{k}</span>
                <span className="jd-serif text-4xl font-semibold leading-none">{v}</span>
              </div>
            ))}
          </div>
          <section>
            <h2 className="jd-serif mb-1 text-2xl font-semibold">By order type</h2>
            <ul>
              {byType.map(([t, x]) => (
                <li key={t} className="flex justify-between border-t border-line py-2 text-sm">
                  <span>
                    {t} · {x.n} order{x.n === 1 ? "" : "s"}
                  </span>
                  <span className="font-medium">{formatMoney(x.amt)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="jd-serif mb-1 text-2xl font-semibold">Top dishes</h2>
            {dishes.length === 0 ? (
              <p className="text-sm text-slate-500">No orders.</p>
            ) : (
              <ul>
                {dishes.map(([n, x]) => (
                  <li key={n} className="flex justify-between border-t border-line py-2 text-sm">
                    <span>
                      {n} × {formatNumber(x.qty)}
                    </span>
                    <span className="font-medium">{formatMoney(x.amt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
