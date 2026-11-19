"use client";
/**
 * Prep list (/prep-list/) for a day:
 *  1. covers per meal from the bookings (same rules as Meal counts),
 *  2. dishes the kitchen usually makes — average per day over the last 7 days of KOTs,
 *  3. the ingredients those dishes need (from Recipes) against what is in stock.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, formatDate, formatNumber, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { listHref, newHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Input } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { eatersOn } from "./MealCounts";
import { recipeLines } from "@/modules/recipes/lines";

const DAYS = 7;

export function PrepList() {
  const user = useUser();
  const [day, setDay] = useState(todayISO());
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const from = addDays(day, -DAYS);
  const { rows: bookings } = useList("bookings", { filter: unitFilter, range: { check_in: { lte: day }, check_out: { gte: day } } });
  const { rows: kots, loading } = useList("kots", { filter: unitFilter, range: { created_at: { gte: `${from}T00:00:00+05:30`, lte: `${day}T00:00:00+05:30` } } });
  const { rows: recipes } = useList("recipes", { filter: unitFilter });
  const { rows: stock } = useList("stock", { filter: unitFilter });

  const covers = useMemo(() => {
    const m = eatersOn(bookings, day);
    const n = (k: "Breakfast" | "Lunch" | "Dinner") => m[k].reduce((s, e) => s + e.adults + e.children, 0);
    return { Breakfast: n("Breakfast"), Lunch: n("Lunch"), Dinner: n("Dinner") };
  }, [bookings, day]);

  // Average portions per day of each dish over the last 7 days.
  const dishes = useMemo(() => {
    const qty = new Map<string, { name: string; qty: number }>();
    for (const k of kots) {
      if (k.status === "Cancelled" || !Array.isArray(k.lines)) continue;
      for (const raw of k.lines as Record<string, unknown>[]) {
        const id = String(raw.item_id ?? raw.name ?? "");
        if (!id) continue;
        const cur = qty.get(id) ?? { name: String(raw.name ?? ""), qty: 0 };
        cur.qty += Number(raw.qty) || 0;
        qty.set(id, cur);
      }
    }
    return Array.from(qty.entries())
      .map(([id, d]) => ({ id, name: d.name, perDay: Math.round((d.qty / DAYS) * 10) / 10 }))
      .filter((d) => d.perDay > 0)
      .sort((a, b) => b.perDay - a.perDay);
  }, [kots]);

  // Ingredients for the expected dishes (recipes linked to the menu dish).
  const needs = useMemo(() => {
    const need = new Map<string, { item: string; unit: string; qty: number; stockId: string | null }>();
    for (const d of dishes) {
      const r = recipes.find((x) => x.menu_id === d.id);
      if (!r) continue;
      const portions = Math.max(1, Number(r.portions) || 1);
      for (const l of recipeLines(r)) {
        const key = l.stock_id ?? l.item;
        const cur = need.get(key) ?? { item: l.item, unit: l.unit, qty: 0, stockId: l.stock_id };
        cur.qty += (l.qty / portions) * d.perDay;
        need.set(key, cur);
      }
    }
    return Array.from(need.values()).sort((a, b) => a.item.localeCompare(b.item));
  }, [dishes, recipes]);

  const inStock = (id: string | null) => (id ? Number(stock.find((s) => s.id === id)?.quantity ?? 0) : null);
  const noRecipe = dishes.filter((d) => !recipes.some((r) => r.menu_id === d.id));

  return (
    <div>
      <PageHeader
        title="Prep list"
        subtitle={`For ${formatDate(day)} · guest covers from bookings, dishes from the last ${DAYS} days of orders`}
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
            {(["Breakfast", "Lunch", "Dinner"] as const).map((m) => (
              <div key={m} className="flex flex-col gap-1 bg-background p-4">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{m} covers</span>
                <span className="jd-serif text-4xl font-semibold leading-none">{covers[m]}</span>
              </div>
            ))}
          </div>

          <section>
            <h2 className="jd-serif mb-1 text-2xl font-semibold">Dishes to prepare (usual per day)</h2>
            {dishes.length === 0 ? (
              <p className="text-sm text-slate-500">No orders in the last {DAYS} days.</p>
            ) : (
              <ul className="grid gap-x-6 sm:grid-cols-2">
                {dishes.slice(0, 30).map((d) => (
                  <li key={d.id} className="flex justify-between gap-3 border-t border-line py-2 text-sm">
                    <span>{d.name}</span>
                    <span className="font-medium">{formatNumber(d.perDay)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="jd-serif mb-1 text-2xl font-semibold">Ingredients needed</h2>
            {needs.length === 0 ? (
              <p className="text-sm text-slate-500">
                Add recipes to see ingredients.{" "}
                <Link href={newHref("recipes")} className="underline">
                  New recipe
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col">
                {needs.map((n) => {
                  const have = inStock(n.stockId);
                  const short = have !== null && have < n.qty;
                  return (
                    <li key={n.item} className="flex flex-wrap justify-between gap-3 border-t border-line py-2 text-sm">
                      <span>{n.item}</span>
                      <span className={cn(short ? "font-medium text-red-600" : "text-slate-600")}>
                        need {formatNumber(Math.round(n.qty * 100) / 100)} {n.unit}
                        {have !== null ? ` · in stock ${formatNumber(have)}` : ""}
                        {short ? " · request from Stores" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {noRecipe.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                No recipe yet for: {noRecipe.slice(0, 12).map((d) => d.name).join(", ")}
                {noRecipe.length > 12 ? "…" : ""}.{" "}
                <Link href={listHref("recipes")} className="underline">
                  Recipes
                </Link>
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
