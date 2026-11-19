"use client";
/**
 * Meal counts (/meal-counts/): how many guests eat breakfast, lunch and dinner
 * on a day, from the bookings' meal plans — so the kitchen can plan.
 *   Each night booked gives: CP → next morning's breakfast · MAP → that night's
 *   dinner + next breakfast · AP → dinner + next breakfast + next day's lunch.
 * So arrivals eat dinner (MAP/AP) and departures eat breakfast (and lunch on AP).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, formatDate, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Input } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { HOLDING_STATUSES, roomLines } from "@/modules/rooms/occupancy";
import type { Row } from "@/core/schema/types";

type Meal = "Breakfast" | "Lunch" | "Dinner";
const MEALS: Meal[] = ["Breakfast", "Lunch", "Dinner"];

interface Eater {
  booking: Row;
  room: string;
  adults: number;
  children: number;
  plan: string;
}

/** Guests (by room category) eating each meal on `day`. */
export function eatersOn(bookings: Row[], day: string): Record<Meal, Eater[]> {
  const out: Record<Meal, Eater[]> = { Breakfast: [], Lunch: [], Dinner: [] };
  for (const b of bookings) {
    if (!HOLDING_STATUSES.includes(String(b.status))) continue;
    const ci = String(b.check_in);
    const co = String(b.check_out);
    const lines = roomLines(b);
    const parts: Eater[] = lines.length
      ? lines.map((l) => ({ booking: b, room: `${l.rooms} × ${l.unit_type}`, adults: l.adults, children: l.children, plan: l.meal_plan }))
      : [{ booking: b, room: `${Number(b.units ?? 1) || 1} × ${String(b.unit_type ?? "")}`, adults: Number(b.adults ?? 0), children: Number(b.children ?? 0), plan: String(b.meal_plan ?? "CP") }];
    const nightBefore = ci < day && co >= day; // stayed last night → morning meals today
    const tonight = ci <= day && co > day; // stays tonight → dinner today
    for (const p of parts) {
      if (nightBefore && ["CP", "MAP", "AP"].includes(p.plan)) out.Breakfast.push(p);
      if (nightBefore && p.plan === "AP") out.Lunch.push(p);
      if (tonight && (p.plan === "MAP" || p.plan === "AP")) out.Dinner.push(p);
    }
  }
  return out;
}

export function MealCounts() {
  const user = useUser();
  const [day, setDay] = useState(todayISO());
  const { rows, loading } = useList("bookings", { filter: user.unitId ? { business_unit_id: user.unitId } : {}, range: { check_in: { lte: day }, check_out: { gte: day } } });
  const meals = useMemo(() => eatersOn(rows, day), [rows, day]);
  const count = (list: Eater[]) => list.reduce((s, e) => s + e.adults + e.children, 0);

  return (
    <div>
      <PageHeader
        title="Meal counts"
        subtitle="Guests eating each meal, from the bookings' meal plans. Add walk-in and event covers separately."
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
            {MEALS.map((m) => (
              <div key={m} className="flex flex-col gap-1 bg-background p-4">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{m}</span>
                <span className="jd-serif text-5xl font-semibold leading-none">{count(meals[m])}</span>
                <span className="text-xs text-slate-500">
                  {meals[m].reduce((s, e) => s + e.adults, 0)} adults · {meals[m].reduce((s, e) => s + e.children, 0)} children
                </span>
              </div>
            ))}
          </div>
          {MEALS.map((m) => (
            <section key={m}>
              <h2 className="jd-serif mb-1 text-2xl font-semibold">
                {m} · {formatDate(day)}
              </h2>
              {meals[m].length === 0 ? (
                <p className="text-sm text-slate-500">No in-house guests for {m.toLowerCase()}.</p>
              ) : (
                <ul className="flex flex-col">
                  {meals[m].map((e, i) => (
                    <li key={`${e.booking.id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">
                      <Link href={viewHref("bookings", e.booking.id)} className="font-medium hover:underline">
                        {String(e.booking.guest_name)}
                      </Link>
                      <span className="text-slate-500">
                        {e.room} · {e.plan} · {e.adults} adults{e.children ? ` · ${e.children} children` : ""}
                        {e.booking.special_requests ? ` · ${String(e.booking.special_requests).slice(0, 60)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
