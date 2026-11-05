"use client";
/**
 * Reservations → Rates → Today's rates (/todays-rates/).
 * One card per room type for the chosen day (today by default): rooms free, open or stop-sell,
 * and the rate per meal plan with extra adult / child. "Change rate" saves a rate for that one
 * day only (a newer rate row wins), so ranges set under Bulk rates stay as they are.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { getStore } from "@/core/data";
import { addDays, formatDate, formatMoney, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { canCreate } from "@/core/auth/access";
import { getEntity } from "@/core/schema/registry";
import type { Row } from "@/core/schema/types";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { EmptyState, Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { UNIT_TYPES } from "@/modules/bookings/entity";
import { roomsByType } from "@/modules/rooms/entity";
import { bookedUnits, weekday } from "@/modules/rooms/occupancy";
import { useUnitChoice } from "@/modules/rooms/unit";
import { MEAL_PLANS, MEAL_PLAN_LABELS, isClosed, resolveRate } from "./entity";

export function TodayRates() {
  const user = useUser();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const { unit, unitName } = useUnitChoice();
  const unitFilter = unit ? { business_unit_id: unit } : {};
  const { rows: rates, loading } = useList("rates", { filter: unitFilter });
  const { rows: rooms } = useList("rooms", { filter: { ...unitFilter, active: true } });
  const { rows: bookings } = useList("bookings", { filter: unitFilter, range: { check_in: { lte: date }, check_out: { gte: date } } });
  const inventory = useMemo(() => roomsByType(rooms.filter((r) => String(r.status) !== "Out of order")), [rooms]);
  const types = useMemo(() => {
    const used = new Set<string>([...inventory.keys(), ...rates.map((r) => String(r.unit_type))]);
    return UNIT_TYPES.filter((t) => used.has(t));
  }, [inventory, rates]);
  const mayEdit = canCreate(user.role, getEntity("rates"));
  const [edit, setEdit] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Today's rates"
        subtitle={`${unitName} · rate per room per night, excl. GST`}
        actions={
          <Link href="/rates-calendar/">
            <Button variant="secondary" icon={CalendarRange}>
              Bulk rates
            </Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border border-line bg-white">
          <button type="button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} className="flex h-9 w-9 items-center justify-center text-navy hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDate(today)} className="h-9 border-x border-line px-3 text-sm font-medium text-navy hover:bg-slate-50">
            Today
          </button>
          <button type="button" aria-label="Next day" onClick={() => setDate(addDays(date, 1))} className="flex h-9 w-9 items-center justify-center text-navy hover:bg-slate-50">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-auto" />
        <span className="text-sm text-slate-600">
          {weekday(date)}, {formatDate(date)}
          {date === today ? " · today" : ""}
        </span>
      </div>

      {loading ? (
        <Loading />
      ) : types.length === 0 ? (
        <EmptyState title="No room types yet" hint="Set up rooms or add rates under Bulk rates." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {types.map((t) => {
            const total = inventory.get(t) ?? 0;
            const sold = bookedUnits(bookings, t, date);
            const free = Math.max(0, total - sold);
            const closed = isClosed(rates, t, date);
            return (
              <article key={t} className="overflow-hidden rounded-xl border border-line bg-white">
                <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <h2 className="jd-serif text-xl font-semibold text-navy">{t}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{total ? `${free} of ${total} free tonight` : "No rooms set up"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium ring-1", closed ? "bg-red-50 text-red-700 ring-red-200" : free === 0 && total ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200")}>
                      {closed ? "Stop sell" : free === 0 && total ? "Sold out" : "Open"}
                    </span>
                    {mayEdit && (
                      <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEdit(t)}>
                        Change rate
                      </Button>
                    )}
                  </div>
                </header>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                      <th className="px-5 py-2 text-left font-medium">Meal plan</th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="px-3 py-2 text-right font-medium">Extra adult</th>
                      <th className="px-5 py-2 text-right font-medium">Extra child</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {MEAL_PLANS.map((p) => {
                      const r = resolveRate(rates, t, p, date);
                      return (
                        <tr key={p}>
                          <td className="px-5 py-2.5">
                            <span className="font-medium text-navy">{p}</span> <span className="text-slate-500">· {MEAL_PLAN_LABELS[p]}</span>
                            {r?.note ? <div className="text-xs text-[#9a7128]">{String(r.note)}</div> : null}
                          </td>
                          <td className="jd-serif px-3 py-2.5 text-right text-lg font-semibold text-navy tabular-nums">{r ? formatMoney(r.rate) : <span className="text-sm font-normal text-slate-400">Not set</span>}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r?.extra_adult ? formatMoney(r.extra_adult) : "—"}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{r?.extra_child ? formatMoney(r.extra_child) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Change rate sets the price for this one day only. For a range of dates, weekends or a festival, use Bulk rates.</p>
      {edit && <ChangeRate type={edit} date={date} unit={unit} rates={rates} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ChangeRate({ type, date, unit, rates, onClose }: { type: string; date: string; unit: string; rates: Row[]; onClose: () => void }) {
  const user = useUser();
  const { toast } = useToast();
  const { units } = useUnitChoice();
  const start = Object.fromEntries(
    MEAL_PLANS.map((p) => {
      const r = resolveRate(rates, type, p, date);
      return [p, { rate: r ? String(r.rate) : "", adult: r?.extra_adult ? String(r.extra_adult) : "", child: r?.extra_child ? String(r.extra_child) : "" }];
    }),
  ) as Record<string, { rate: string; adult: string; child: string }>;
  const [v, setV] = useState(start);
  const [closed, setClosed] = useState(isClosed(rates, type, date));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const unitId = unit || String(units.find((u) => /udaisarovar/i.test(String(u.name)))?.id ?? "");

  const save = async () => {
    const changed = MEAL_PLANS.filter((p) => v[p].rate !== start[p].rate || v[p].adult !== start[p].adult || v[p].child !== start[p].child || closed !== isClosed(rates, type, date));
    if (!changed.length && !note) return onClose();
    if (!closed && changed.some((p) => !(Number(v[p].rate) > 0))) return toast("Enter a rate for each meal plan you change", "error");
    setBusy(true);
    try {
      for (const p of changed) {
        await getStore().create("rates", {
          business_unit_id: unitId,
          unit_type: type,
          meal_plan: p,
          date_from: date,
          date_to: date,
          rate: Number(v[p].rate) || 0,
          extra_adult: Number(v[p].adult) || null,
          extra_child: Number(v[p].child) || null,
          channel: "All channels",
          closed,
          min_nights: 1,
          note: note.trim() || null,
          created_by: (user.staff?.id as string) ?? null,
        });
      }
      toast(`${type}: rate saved for ${formatDate(date)}`, "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`${type} · ${formatDate(date)}`}>
      <div className="flex flex-col gap-4">
        {MEAL_PLANS.map((p) => (
          <div key={p} className="grid grid-cols-3 gap-2">
            <Field label={`${p} · rate`}>
              <Input type="number" min={0} inputMode="numeric" value={v[p].rate} onChange={(e) => setV({ ...v, [p]: { ...v[p], rate: e.target.value } })} />
            </Field>
            <Field label="Extra adult">
              <Input type="number" min={0} inputMode="numeric" value={v[p].adult} onChange={(e) => setV({ ...v, [p]: { ...v[p], adult: e.target.value } })} />
            </Field>
            <Field label="Extra child">
              <Input type="number" min={0} inputMode="numeric" value={v[p].child} onChange={(e) => setV({ ...v, [p]: { ...v[p], child: e.target.value } })} />
            </Field>
          </div>
        ))}
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Last-minute offer" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#17140f]" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Stop sell for this day
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save for this day
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
