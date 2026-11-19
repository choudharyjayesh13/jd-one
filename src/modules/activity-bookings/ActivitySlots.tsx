"use client";
/**
 * Slots & capacity (/activity-slots/): for a day, each activity (add-on) with
 * its capacity ("Available per day"), how many people are booked and who.
 */
import { useState } from "react";
import Link from "next/link";
import { addDays, formatDate, formatMoney, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { listHref, newHref, viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Input } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";

export function ActivitySlots() {
  const user = useUser();
  const [day, setDay] = useState(todayISO());
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows: activities, loading } = useList("add-ons", { filter: { ...unitFilter, active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: bookings } = useList("activity-bookings", { filter: { ...unitFilter, date: day } });
  const live = bookings.filter((b) => b.status !== "Cancelled");

  return (
    <div>
      <PageHeader
        title="Slots & capacity"
        subtitle={
          <>
            Booked vs. available for {formatDate(day)}. Capacity is “Available per day” on each{" "}
            <Link href={listHref("add-ons")} className="underline">
              add-on service
            </Link>
            .
          </>
        }
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((a) => {
            const list = live.filter((b) => b.add_on_id === a.id);
            const people = list.reduce((s, b) => s + (Number(b.people) || 0), 0);
            const cap = a.quantity === null || a.quantity === undefined || a.quantity === "" ? null : Number(a.quantity);
            const full = cap !== null && people >= cap;
            return (
              <section key={a.id} className={cn("flex flex-col gap-2 rounded-xl border p-4", full ? "border-red-500/70" : "border-line")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="jd-serif text-xl font-semibold">{String(a.name)}</span>
                  <span className="text-xs text-slate-500">
                    {formatMoney(a.price)} / {String(a.per ?? "booking").toLowerCase()}
                  </span>
                </div>
                <span className={cn("text-sm", full ? "font-medium text-red-600" : "text-slate-600")}>
                  {people} booked{cap !== null ? ` of ${cap}` : " · no limit"}
                  {full ? " · full" : ""}
                </span>
                <ul className="flex flex-col text-sm">
                  {list.map((b) => (
                    <li key={b.id} className="flex justify-between gap-2 border-t border-line py-1.5">
                      <Link href={viewHref("activity-bookings", b.id)} className="hover:underline">
                        {String(b.time ?? "")} {String(b.guest_name ?? "")}
                      </Link>
                      <span className="text-slate-500">
                        {String(b.people ?? "")} · {String(b.status)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={newHref("activity-bookings", { add_on_id: a.id, date: day })} className="self-start text-sm underline">
                  + Book {String(a.name)}
                </Link>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
