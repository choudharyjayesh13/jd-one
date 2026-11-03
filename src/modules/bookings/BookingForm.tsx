"use client";
/**
 * New / edit booking in four steps: Guest & dates → Rooms → Payment → Review.
 * A booking can hold several room categories (bookings.room_lines), each with
 * its own rooms, guests, meal plan and rate. The first line is also copied to
 * the old single-room fields so reports and older screens keep working.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import type { CustomFormProps, FieldValues, LiveHint, Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { saveRecord } from "@/core/data/service";
import { addDays, formatDate, formatMoney, todayISO } from "@/core/format";
import { normalizePhone } from "@/core/phone";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Field, Input, Select, Textarea } from "@/core/ui/Input";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { customerLiveHint } from "@/modules/customers/match";
import { nightsBetween } from "@/modules/customers/stats";
import { bookedUnits, dayList, roomLines, type RoomLine } from "@/modules/rooms/occupancy";
import { BOOKING_SOURCES, BOOKING_STATUSES, UNIT_TYPES } from "./entity";

const MEALS = ["CP", "MAP", "AP"] as const;
const MEAL_LABEL: Record<string, string> = { CP: "Breakfast", MAP: "Breakfast + 1 meal", AP: "All meals", EP: "Room only" };
const STEPS = ["Guest & dates", "Rooms", "Payment", "Review"] as const;

const newLine = (unit_type = "", room_id?: string | null, meal_plan = "CP"): RoomLine => ({
  unit_type,
  rooms: 1,
  adults: 2,
  children: 0,
  meal_plan,
  rate: 0,
  room_ids: room_id ? [room_id] : [],
});

/** Latest matching rate row for a room type + meal plan on the check-in night. */
function suggestRate(rates: Row[], unitId: string, type: string, plan: string, date: string): number | null {
  const hit = rates
    .filter((r) => r.business_unit_id === unitId && r.unit_type === type && r.meal_plan === plan && !r.closed && String(r.date_from) <= date && String(r.date_to) >= date)
    .filter((r) => r.channel === "All channels" || r.channel === "Direct / website")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  return hit ? Number(hit.rate) || 0 : null;
}

export function BookingForm({ id, prefill, onSaved, onCancel }: CustomFormProps) {
  const user = useUser();
  const { toast } = useToast();
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const [existing, setExisting] = useState<Row | null>(null);
  const [v, setV] = useState<FieldValues | null>(null);
  const [lines, setLines] = useState<RoomLine[]>([]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<LiveHint | null>(null);

  const { rows: units } = useList("business-units", { filter: { active: true } });
  const { rows: agents } = useList("agents");
  const unitId = String(v?.business_unit_id ?? "");
  const { rows: rooms } = useList(unitId ? "rooms" : null, { filter: { business_unit_id: unitId, active: true } });
  const { rows: rates } = useList(unitId ? "rates" : null, { filter: { business_unit_id: unitId } });
  const checkIn = String(v?.check_in ?? "");
  const checkOut = String(v?.check_out ?? "");
  const { rows: overlapping } = useList(unitId && checkOut ? "bookings" : null, { filter: { business_unit_id: unitId }, range: { check_in: { lte: checkOut } } });

  // Load the booking (edit) or start from the prefill (new).
  const prefillKey = JSON.stringify(prefill ?? {});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = JSON.parse(prefillKey) as FieldValues;
        const row = id ? await getStore().get("bookings", id) : null;
        if (id && !row) throw new Error("Booking not found");
        if (cancelled) return;
        if (row) {
          setExisting(row);
          setV({ ...row });
          const ls = roomLines(row);
          setLines(
            ls.length
              ? ls
              : [{ unit_type: String(row.unit_type ?? ""), rooms: Number(row.units ?? 1) || 1, adults: Number(row.adults ?? 2), children: Number(row.children ?? 0), meal_plan: String(row.meal_plan ?? "CP"), rate: Number(row.rate ?? 0), room_ids: row.room_id ? [String(row.room_id)] : [] }],
          );
        } else {
          const ci = String(p.check_in ?? todayISO());
          setV({
            status: "Confirmed",
            source: "Direct",
            business_unit_id: p.business_unit_id ?? user.unitId ?? "",
            ...p,
            check_in: ci,
            check_out: String(p.check_out ?? addDays(ci, 1)),
          });
          const first = newLine(String(p.unit_type ?? ""), (p.room_id as string | undefined) ?? null, String(p.meal_plan ?? "CP"));
          if (p.adults) first.adults = Number(p.adults) || 2;
          if (p.children) first.children = Number(p.children) || 0;
          setLines([first]);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, prefillKey, user.unitId]);

  // Default property: the only / first active one.
  useEffect(() => {
    if (v && !v.business_unit_id && units.length) setV((x) => ({ ...x, business_unit_id: (units.find((u) => /udaisarovar/i.test(String(u.name))) ?? units[0]).id }));
  }, [v, units]);

  // "Existing guest: 4 stays…" while typing the phone.
  const phone = String(v?.phone ?? "");
  useEffect(() => {
    let cancelled = false;
    if (normalizePhone(phone).length < 10) {
      setHint(null);
      return;
    }
    customerLiveHint({ phone, customer_id: v?.customer_id }, getStore()).then((h) => {
      if (!cancelled) setHint(h);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const types = useMemo(() => {
    const fromRooms = Array.from(new Set(rooms.map((r) => String(r.unit_type)).filter(Boolean)));
    return fromRooms.length ? fromRooms : UNIT_TYPES.filter((t) => t !== "Other").map(String);
  }, [rooms]);

  const nights = checkIn && checkOut ? Math.max(0, nightsBetween(checkIn, checkOut)) : 0;
  const lineTotal = (l: RoomLine) => l.rate * l.rooms * nights;
  const roomsTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const tax = existing?.booking_ref ? Number(existing.tax_amount ?? 0) : 0;
  const grand = roomsTotal + tax;
  const paid = Number(existing?.paid ?? 0);
  const advance = Number(v?.advance ?? 0);

  /** Rooms of a type free on every night of the stay (this booking's own rooms not counted). */
  const freeOf = (type: string): number | null => {
    if (!nights || !type) return null;
    const total = rooms.filter((r) => r.unit_type === type && r.status !== "Out of order").length;
    if (!total) return null;
    const others = overlapping.filter((b) => b.id !== id);
    const used = Math.max(0, ...dayList(checkIn, nights).map((d) => bookedUnits(others, type, d)));
    return Math.max(0, total - used);
  };

  if (loadError) return <ErrorBox message={loadError} />;
  if (!v) return <Loading />;

  const set = (k: string, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const setLine = (i: number, patch: Partial<RoomLine>) =>
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, ...patch };
        // New room type or meal plan: offer the rate from the rate card (still editable).
        if ((patch.unit_type !== undefined || patch.meal_plan !== undefined) && checkIn) {
          const r = suggestRate(rates, unitId, next.unit_type, next.meal_plan, checkIn);
          if (r !== null) next.rate = r;
        }
        if (patch.unit_type !== undefined && patch.unit_type !== l.unit_type) next.room_ids = [];
        if (patch.rooms !== undefined) next.room_ids = (next.room_ids ?? []).slice(0, next.rooms);
        return next;
      }),
    );

  const check = (s: number): string | null => {
    if (s === 0) {
      if (!String(v.guest_name ?? "").trim()) return "Enter the guest's name.";
      if (normalizePhone(v.phone).length < 10) return "Enter a 10-digit phone number.";
      if (!v.business_unit_id) return "Choose the property.";
      if (!checkIn || !checkOut || nights < 1) return "Check-out must be after check-in.";
    }
    if (s === 1) {
      if (!lines.length) return "Add at least one room category.";
      if (lines.some((l) => !l.unit_type)) return "Choose a room category on every line.";
      if (lines.some((l) => l.rate < 0)) return "Rate cannot be negative.";
    }
    return null;
  };

  const go = (to: number) => {
    for (let s = 0; s < to; s++) {
      const msg = check(s);
      if (msg) {
        setStep(s);
        setError(msg);
        return;
      }
    }
    setError(null);
    setStep(to);
  };

  const save = async () => {
    for (let s = 0; s < 2; s++) {
      const msg = check(s);
      if (msg) {
        setStep(s);
        setError(msg);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const first = lines[0];
      const values: FieldValues = {
        ...v,
        room_lines: lines,
        unit_type: first.unit_type,
        units: lines.reduce((s, l) => s + l.rooms, 0),
        rooms_count: lines.reduce((s, l) => s + l.rooms, 0),
        adults: lines.reduce((s, l) => s + l.adults, 0),
        children: lines.reduce((s, l) => s + l.children, 0),
        meal_plan: first.meal_plan,
        rate: first.rate,
        room_id: first.room_ids?.[0] ?? null,
        total: null,
        booked_by: v.booked_by ?? user.name,
      };
      const ctx = { store: getStore(), staffId };
      let row: Row;
      try {
        row = await saveRecord("bookings", values, ctx, id);
      } catch (e) {
        // Database not updated yet (phase-2 SQL): a one-category booking still saves in the old fields.
        if (!/room_lines/i.test((e as Error).message)) throw e;
        if (lines.length > 1) throw new Error("Several room categories need a one-time database update (phase-2 SQL). Ask the Chairman, or book one category for now.");
        row = await saveRecord("bookings", { ...values, room_lines: [], total: first.rate * first.rooms * nights + tax }, ctx, id);
      }
      toast(id ? "Booking updated" : "Booking saved");
      onSaved(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) =>
    cn("h-10 rounded-full border px-4 text-sm transition-colors", on ? "border-white bg-white font-medium text-black" : "border-line text-slate-600 hover:border-slate-400");

  return (
    <div className="flex flex-col gap-5">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => go(i)}
              className={cn(
                "flex h-12 w-full items-center gap-2 border-b-2 px-1 text-left text-sm",
                i === step ? "border-gold text-slate-900" : i < step ? "border-gold/50 text-slate-600" : "border-line text-slate-500",
              )}
            >
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs", i === step ? "bg-gold font-semibold text-black" : "border border-slate-400")}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden truncate sm:inline">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" required>
                <Input type="tel" inputMode="tel" value={String(v.phone ?? "")} onChange={(e) => set("phone", e.target.value)} placeholder="98290 12345" autoFocus={!id} />
              </Field>
              <Field label="Guest name" required>
                <Input value={String(v.guest_name ?? "")} onChange={(e) => set("guest_name", e.target.value)} />
              </Field>
              {hint && (
                <p className={cn("rounded-lg border px-3 py-2 text-sm sm:col-span-2", hint.tone === "success" ? "border-gold/60" : "border-line")}>{hint.message}</p>
              )}
              <Field label="Check-in" required>
                <Input type="date" value={checkIn} onChange={(e) => set("check_in", e.target.value)} />
              </Field>
              <Field label="Check-out" required help={nights ? `${nights} night${nights === 1 ? "" : "s"}` : undefined}>
                <Input type="date" value={checkOut} min={checkIn ? addDays(checkIn, 1) : undefined} onChange={(e) => set("check_out", e.target.value)} />
              </Field>
              {!user.unitId && (
                <Field label="Property" required>
                  <Select value={unitId} onChange={(e) => set("business_unit_id", e.target.value)}>
                    <option value="">Select…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {String(u.name)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Source" required>
                <Select value={String(v.source ?? "Direct")} onChange={(e) => set("source", e.target.value)}>
                  {BOOKING_SOURCES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              {(v.source === "Travel agent" || v.source === "Corporate" || Boolean(v.agent_id)) && (
                <Field label="Agent">
                  <Select value={String(v.agent_id ?? "")} onChange={(e) => set("agent_id", e.target.value || null)}>
                    <option value="">—</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {String(a.name ?? a.company ?? "Agent")}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Status" required>
                <Select value={String(v.status ?? "Confirmed")} onChange={(e) => set("status", e.target.value)}>
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-500">Add as many room categories as the guest needs — each has its own rooms, guests, meal plan and rate.</p>
              {lines.map((l, i) => {
                const free = freeOf(l.unit_type);
                return (
                  <div key={i} className="flex flex-col gap-4 rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <Field label={`Room category ${i + 1}`} required>
                        <Select value={l.unit_type} onChange={(e) => setLine(i, { unit_type: e.target.value })} className="min-w-[220px]">
                          <option value="">Select…</option>
                          {types.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </Select>
                      </Field>
                      {(
                        [
                          ["rooms", "Rooms", 1],
                          ["adults", "Adults", 1],
                          ["children", "Children", 0],
                        ] as const
                      ).map(([k, label, min]) => (
                        <Field key={k} label={label} plain>
                          <div className="flex h-10 items-center rounded-lg border border-line">
                            <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} className="flex h-10 w-10 items-center justify-center" onClick={() => setLine(i, { [k]: Math.max(min, l[k] - 1) } as Partial<RoomLine>)}>
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-7 text-center font-medium">{l[k]}</span>
                            <button type="button" aria-label={`More ${label.toLowerCase()}`} className="flex h-10 w-10 items-center justify-center" onClick={() => setLine(i, { [k]: l[k] + 1 } as Partial<RoomLine>)}>
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </Field>
                      ))}
                      {lines.length > 1 && (
                        <Button variant="secondary" icon={Trash2} aria-label="Remove this category" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />
                      )}
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <Field label="Meal plan" plain>
                        <div className="flex flex-wrap gap-2">
                          {MEALS.map((m) => (
                            <button key={m} type="button" className={chip(l.meal_plan === m)} onClick={() => setLine(i, { meal_plan: m })} title={MEAL_LABEL[m]}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Rate / room / night (₹)">
                        <Input type="number" inputMode="numeric" min={0} value={l.rate || ""} onChange={(e) => setLine(i, { rate: Number(e.target.value) || 0 })} className="w-36" />
                      </Field>
                      <div className="flex flex-col items-end">
                        <span className="text-xs text-slate-500">
                          {formatMoney(l.rate)} × {l.rooms} × {nights} night{nights === 1 ? "" : "s"}
                        </span>
                        <span className="jd-serif text-2xl font-semibold">{formatMoney(lineTotal(l))}</span>
                      </div>
                    </div>
                    {free !== null && (
                      <p className={cn("text-xs", free < l.rooms ? "text-red-600" : "text-slate-500")}>
                        {free < l.rooms ? `Only ${free} ${l.unit_type} free for these dates — check the availability calendar.` : `${free} ${l.unit_type} free for these dates.`}
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setLines((ls) => [...ls, newLine("", null, ls[ls.length - 1]?.meal_plan ?? "CP")])}
                className="h-12 rounded-xl border border-dashed border-gold text-sm uppercase tracking-[0.18em] text-gold hover:bg-gold/10"
              >
                + Add another room category
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Advance agreed (₹)" help="Record the money actually received under Payments (a receipt voucher is made automatically)">
                <Input type="number" inputMode="numeric" min={0} value={String(v.advance ?? "")} onChange={(e) => set("advance", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
              {v.status === "On hold" && (
                <Field label="Hold until">
                  <Input type="datetime-local" value={String(v.hold_until ?? "").slice(0, 16)} onChange={(e) => set("hold_until", e.target.value || null)} />
                </Field>
              )}
              <Field label="Special requests" wide>
                <Textarea value={String(v.special_requests ?? "")} onChange={(e) => set("special_requests", e.target.value)} placeholder="Same cottage as last time, cake on 20 Dec…" />
              </Field>
              <Field label="GST invoice – company">
                <Input value={String(v.gst_company ?? "")} onChange={(e) => set("gst_company", e.target.value)} />
              </Field>
              <Field label="GSTIN">
                <Input value={String(v.gstin ?? "")} onChange={(e) => set("gstin", e.target.value)} placeholder="08ABCDE1234F1Z5" />
              </Field>
            </div>
          )}

          {step === 3 && (
            <dl className="flex flex-col">
              {(
                [
                  ["Guest", `${String(v.guest_name ?? "")} · ${String(v.phone ?? "")}`],
                  ["Stay", `${formatDate(checkIn)} → ${formatDate(checkOut)} · ${nights} night${nights === 1 ? "" : "s"}`],
                  ["Source · status", `${String(v.source ?? "")} · ${String(v.status ?? "")}`],
                  ["Advance agreed", formatMoney(advance)],
                  ["Special requests", String(v.special_requests || "—")],
                ] as [string, string][]
              ).map(([k, val]) => (
                <div key={k} className="flex justify-between gap-6 border-t border-line py-3 text-sm">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium">{val}</dd>
                </div>
              ))}
            </dl>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between gap-3">
            <Button variant="secondary" onClick={() => (step === 0 ? onCancel?.() : go(step - 1))}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 3 ? (
              <Button onClick={() => go(step + 1)}>Continue</Button>
            ) : (
              <Button icon={Check} loading={saving} onClick={() => void save()}>
                {id ? "Save booking" : "Confirm booking"}
              </Button>
            )}
          </div>
        </div>

        <aside aria-label="Booking summary" className="flex w-full flex-col gap-3 rounded-xl border border-line p-4 lg:w-80">
          <span className="text-[11px] uppercase tracking-[0.28em] text-gold">
            Summary · {nights} night{nights === 1 ? "" : "s"}
          </span>
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm">
              <span className="text-slate-600">
                {l.rooms} × {l.unit_type || "—"} · {l.meal_plan}
              </span>
              <span className="whitespace-nowrap font-medium">{formatMoney(lineTotal(l))}</span>
            </div>
          ))}
          {tax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">GST</span>
              <span>{formatMoney(tax)}</span>
            </div>
          )}
          <div className="h-px bg-line" />
          <div className="flex justify-between text-sm text-slate-600">
            <span>
              {lines.reduce((s, l) => s + l.rooms, 0)} rooms
            </span>
            <span>
              {lines.reduce((s, l) => s + l.adults, 0)} adults · {lines.reduce((s, l) => s + l.children, 0)} children
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</span>
            <span className="jd-serif text-3xl font-semibold">{formatMoney(grand)}</span>
          </div>
          {paid > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Paid so far</span>
              <span>{formatMoney(paid)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Balance</span>
            <span className="font-semibold text-gold">{formatMoney(grand - paid)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
