"use client";
/**
 * Rates calendar (AsiaTech "Rate Management → Rates"): rows = room types,
 * columns = days, cell = rate in force for the chosen meal plan. "Bulk update"
 * adds a rate row for one room type + plan(s) + date range — never all rooms
 * at once, so the AsiaTech Increase/Decrease accident cannot repeat here.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCopy, Plus } from "lucide-react";
import { getStore } from "@/core/data";
import { currentMonth, formatMoney, formatMonth, monthRange, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { canCreate } from "@/core/auth/access";
import { getEntity } from "@/core/schema/registry";
import { listHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { UNIT_TYPES } from "@/modules/bookings/entity";
import { roomsByType } from "@/modules/rooms/entity";
import { dayList, isWeekend, weekday } from "@/modules/rooms/occupancy";
import { MEAL_PLANS, MEAL_PLAN_LABELS, RATE_CHANNELS, resolveRate, isClosed } from "./entity";

export function RatesCalendar() {
  const user = useUser();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [plan, setPlan] = useState<string>("EP");
  const [unit, setUnit] = useState(user.unitId ?? "");
  const [open, setOpen] = useState(false);
  const { start, days } = monthRange(month);
  const unitFilter = unit ? { business_unit_id: unit } : {};
  const { rows: units } = useList("business-units", { filter: { active: true } });
  const { rows: rates, loading, reload } = useList("rates", { filter: unitFilter });
  const { rows: rooms } = useList("rooms", { filter: unitFilter });
  const dates = useMemo(() => dayList(start, days), [start, days]);
  const inventory = useMemo(() => roomsByType(rooms), [rooms]);
  const types = useMemo(() => {
    const used = new Set<string>([...rates.map((r) => String(r.unit_type)), ...inventory.keys()]);
    const known = UNIT_TYPES.filter((t) => used.has(t));
    return known.length ? known : UNIT_TYPES.slice(0, 3);
  }, [rates, inventory]);
  const today = todayISO();
  const mayEdit = canCreate(user.role, getEntity("rates"));

  const copySheet = async () => {
    const lines = [`${units.find((u) => u.id === unit)?.name ?? "All properties"} · rates ${formatMonth(month)} (${plan} ${MEAL_PLAN_LABELS[plan]}, excl. GST)`];
    for (const t of types) {
      const segs: string[] = [];
      let cur: { from: string; to: string; rate: string } | null = null;
      for (const d of dates) {
        const r = resolveRate(rates, t, plan, d);
        const v = isClosed(rates, t, d) ? "CLOSED" : r ? String(r.rate) : "—";
        if (cur && cur.rate === v) cur.to = d;
        else {
          if (cur) segs.push(`${cur.from.slice(8)}–${cur.to.slice(8)}: ${cur.rate}`);
          cur = { from: d, to: d, rate: v };
        }
      }
      if (cur) segs.push(`${cur.from.slice(8)}–${cur.to.slice(8)}: ${cur.rate}`);
      lines.push(`${t}: ${segs.join(" · ")}`);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    toast("Rate sheet copied — paste into AsiaTech notes or WhatsApp");
  };

  return (
    <div>
      <PageHeader
        title="Rates calendar"
        subtitle={
          <>
            {formatMonth(month)} · {MEAL_PLAN_LABELS[plan]} rate per night, excl. GST.{" "}
            <Link href={listHref("rates")} className="underline">
              All rate rows
            </Link>
          </>
        }
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-auto">
              {MEAL_PLANS.map((p) => (
                <option key={p} value={p}>
                  {p} · {MEAL_PLAN_LABELS[p]}
                </option>
              ))}
            </Select>
            {!user.unitId && (
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto">
                <option value="">All properties</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="secondary" size="sm" icon={ClipboardCopy} onClick={() => void copySheet()}>
              Copy sheet
            </Button>
            {mayEdit && (
              <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
                Bulk update
              </Button>
            )}
          </>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Room type</th>
                {dates.map((d) => (
                  <th key={d} className={cn("min-w-[52px] px-0.5 py-1.5 text-center font-medium text-slate-500", d === today && "bg-gold/20 text-navy", isWeekend(d) && d !== today && "bg-slate-50")}>
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[9px] font-normal">{weekday(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t} className="border-t border-line">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-navy">{t}</td>
                  {dates.map((d) => {
                    const r = resolveRate(rates, t, plan, d);
                    const closed = isClosed(rates, t, d);
                    return (
                      <td key={d} className={cn("px-0.5 py-0.5 text-center tabular-nums", closed ? "bg-slate-200 text-slate-600" : r ? (r.note ? "bg-gold/15 text-navy font-semibold" : "text-slate-800") : "text-slate-300", isWeekend(d) && !closed && !r?.note && "bg-slate-50/60")}
                          title={closed ? "Closed (stop sell)" : r ? `${formatMoney(r.rate)} · ${r.channel}${r.note ? ` · ${r.note}` : ""}` : "No rate set"}>
                        {closed ? "×" : r ? Number(r.rate).toLocaleString("en-IN") : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Gold cells carry a note (peak / festival). A newer rate row overrides an older one for the same dates. AsiaTech still has to be updated separately until the channel manager is connected.</p>
      {open && (
        <BulkUpdate
          unitId={unit || (units[0]?.id as string | undefined) || ""}
          units={units}
          defaultType={types[0]}
          defaultPlan={plan}
          month={month}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function BulkUpdate({ unitId, units, defaultType, defaultPlan, month, onClose, onSaved }: { unitId: string; units: { id: string; name?: unknown }[]; defaultType: string; defaultPlan: string; month: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const user = useUser();
  const { start, end } = monthRange(month);
  const [unit, setUnit] = useState(unitId);
  const [type, setType] = useState(defaultType);
  const [plans, setPlans] = useState<string[]>([defaultPlan]);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [rate, setRate] = useState("");
  const [channel, setChannel] = useState<string>("All channels");
  const [closed, setClosed] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const togglePlan = (p: string) => setPlans((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const save = async () => {
    if (!unit) return toast("Choose a property", "error");
    if (!closed && !(Number(rate) > 0)) return toast("Enter a rate", "error");
    if (plans.length === 0) return toast("Pick at least one meal plan", "error");
    if (to < from) return toast("'To' must be on or after 'From'", "error");
    setSaving(true);
    try {
      const store = getStore();
      for (const p of plans) {
        await store.create("rates", { business_unit_id: unit, unit_type: type, meal_plan: p, date_from: from, date_to: to, rate: closed ? Number(rate) || 0 : Number(rate), channel, closed, note: note || null, min_nights: 1, created_by: (user.staff?.id as string) ?? null });
      }
      toast(`${closed ? "Closed" : "Rate set"} for ${type} · ${plans.join("/")} · ${from} → ${to}`);
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Bulk update rates">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Property" required>
          <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {String(u.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Room type" required help="One room type at a time">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Meal plans" required plain wide>
          <div className="flex flex-wrap gap-2">
            {MEAL_PLANS.map((p) => (
              <button key={p} type="button" onClick={() => togglePlan(p)} className={cn("rounded-full border px-3 py-1 text-sm", plans.includes(p) ? "border-navy bg-navy text-white" : "border-line bg-white text-slate-700")}>
                {p} · {MEAL_PLAN_LABELS[p]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="From" required>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" required>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Rate / night (excl. GST)" required={!closed}>
          <Input type="number" inputMode="numeric" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="4500" />
        </Field>
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {RATE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" wide>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Diwali peak, long weekend…" />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Stop sell (close this room type online for these dates)
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void save()} loading={saving}>
          Save
        </Button>
      </div>
    </Dialog>
  );
}
