"use client";
/**
 * /pipeline → Revenue targets: Jayesh's "JD Stays & Hospitality — Monthly Revenue Projection" (14 Oct 2026)
 * for the sales team and Akshayraj. Monthly revenue = rooms × rate × 30 × occupancy; food = occupied rooms × F&B spend.
 * Excludes GST, OTA commission & events.
 */
import { useState } from "react";
import { Target } from "lucide-react";
import { useList } from "@/core/ui/hooks";
import { cn } from "@/core/ui/cn";
import { todayISO } from "@/core/format";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SAROVAR_ROOMS = 5;
const PENTHOUSE_ROOMS = 3;
const OCC = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const SAROVAR_RATES = [4000, 5000, 6000, 7000, 8000, 9000, 10000];
const PENTHOUSE_RATES = [4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000];
const FOOD = [1000, 1500, 2000, 2500];

export const SCENARIOS = [
  { name: "Conservative", occ: 30, sarovar: 5000, penthouse: 5000, food: 1000, color: "#fcd679", text: "#5b4300" },
  { name: "Base", occ: 50, sarovar: 6000, penthouse: 6000, food: 1500, color: "#c4e0a1", text: "#25440d" },
  { name: "Strong", occ: 70, sarovar: 8000, penthouse: 8000, food: 2000, color: "#7fdcea", text: "#0b4a55" },
] as const;

const month = (rooms: number, rate: number, occ: number) => Math.round(rooms * rate * 30 * (occ / 100));
const food = (spend: number, occ: number) => Math.round((SAROVAR_ROOMS + PENTHOUSE_ROOMS) * spend * 30 * (occ / 100));
export const scenarioMonth = (s: (typeof SCENARIOS)[number]) => month(SAROVAR_ROOMS, s.sarovar, s.occ) + month(PENTHOUSE_ROOMS, s.penthouse, s.occ) + food(s.food, s.occ);
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(n % 1e5 ? 1 : 0)} L`);

const hl = (rate: number, o: number, kind: "sarovar" | "penthouse" | "food") => SCENARIOS.find((s) => s.occ === o && s[kind] === rate);

function PriceRows({ title, rows, val, kind }: { title: string; rows: number[]; val: (r: number, o: number) => number; kind: "sarovar" | "penthouse" | "food" }) {
  return (
  <>
    <tr><td colSpan={11} className="bg-orange-600 px-3 py-1.5 text-left text-xs font-bold text-white">{title}</td></tr>
    {rows.map((r) => (
      <tr key={r}>
        <td className="bg-orange-50 px-2 py-1 text-center font-medium">{inr(r)}</td>
        {OCC.map((o) => {
          const s = hl(r, o, kind);
          return <td key={o} className="px-2 py-1 text-right tabular-nums" style={s ? { background: s.color, color: s.text, fontWeight: 700 } : undefined}>{val(r, o).toLocaleString("en-IN")}</td>;
        })}
      </tr>
    ))}
  </>
);
}

/** One-line target strip shown on top of the leads board. */
export function TargetStrip({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
      <Target className="h-4 w-4 text-orange-600" />
      <b>Monthly revenue targets (rooms + food):</b>
      {SCENARIOS.map((s) => (
        <span key={s.name} className="rounded-full px-2 py-0.5 font-semibold" style={{ background: s.color, color: s.text }}>
          {s.name} {lakh(scenarioMonth(s))}
        </span>
      ))}
      <button type="button" onClick={onOpen} className="ml-auto font-semibold underline">See full projection →</button>
    </div>
  );
}

export function RevenueTargets() {
  const [occ, setOcc] = useState(50);
  const [sr, setSr] = useState(6000);
  const [pr, setPr] = useState(6000);
  const [fs, setFs] = useState(1500);
  const [img, setImg] = useState(false);
  const { rows: leads } = useList("leads", { filter: { stage: "Won" } });
  const m = todayISO().slice(0, 7);
  const wonValue = leads.filter((l) => String(l.won_at ?? l.updated_at ?? "").slice(0, 7) === m).reduce((a, l) => a + Number(l.booking_value ?? l.package_proposed ?? l.budget ?? 0), 0);

  const calc = { sarovar: month(SAROVAR_ROOMS, sr, occ), penthouse: month(PENTHOUSE_ROOMS, pr, occ), food: food(fs, occ) };
  const total = calc.sarovar + calc.penthouse + calc.food;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">JD Stays & Hospitality — revenue targets</h1>
        <p className="text-sm text-slate-500">Udai Sarovar (5 rooms) + 3BHK Penthouse (3 rooms) + food, per 30-day month. Excludes GST, OTA commission & events.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {SCENARIOS.map((s) => {
          const mo = scenarioMonth(s);
          const pct = Math.min(Math.round((wonValue / mo) * 100), 100);
          return (
            <div key={s.name} className="rounded-2xl p-4 shadow-sm" style={{ background: s.color, color: s.text }}>
              <div className="text-xs font-semibold uppercase tracking-wide">{s.name}</div>
              <div className="text-[11px] opacity-80">{s.occ}% occupancy · ₹{s.sarovar / 1000}k / ₹{s.penthouse / 1000}k / food ₹{s.food.toLocaleString("en-IN")}</div>
              <div className="mt-2 text-2xl font-bold">{inr(mo)}<span className="text-sm font-medium"> / month</span></div>
              <div className="text-sm font-semibold">{inr(mo * 12)} / year</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60"><div className="h-full rounded-full bg-current" style={{ width: `${pct}%` }} /></div>
              <div className="mt-1 text-[11px]">Won this month {inr(wonValue)} · {pct}% of target</div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-navy">Try your own numbers</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-600">Occupancy <b className="text-navy">{occ}%</b>
            <input type="range" min={10} max={100} step={10} value={occ} onChange={(e) => setOcc(Number(e.target.value))} className="mt-2 w-full accent-orange-600" />
          </label>
          {[
            { label: "Udai Sarovar ₹/room/night", v: sr, set: setSr, opts: SAROVAR_RATES },
            { label: "Penthouse ₹/room/night", v: pr, set: setPr, opts: PENTHOUSE_RATES },
            { label: "Food ₹/occupied room/night", v: fs, set: setFs, opts: FOOD },
          ].map((f) => (
            <label key={f.label} className="text-xs text-slate-600">{f.label}
              <select value={f.v} onChange={(e) => f.set(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-line bg-white px-2 py-2 text-sm text-navy">
                {f.opts.map((o) => <option key={o} value={o}>{inr(o)}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
          {[["Udai Sarovar", calc.sarovar], ["Penthouse", calc.penthouse], ["Food", calc.food], ["Month", total], ["Year", total * 12]].map(([k, v]) => (
            <div key={k as string} className={cn("rounded-xl p-3", k === "Month" || k === "Year" ? "bg-navy text-white" : "bg-slate-50 text-navy")}>
              <div className="text-[11px] opacity-70">{k}</div>
              <div className="text-lg font-bold tabular-nums">{inr(v as number)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-xs">
          <thead>
            <tr className="bg-orange-600 text-white">
              <th className="px-2 py-2 text-left">Occupancy →</th>
              {OCC.map((o) => <th key={o} className="px-2 py-2 text-right">{o}%</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <PriceRows title="UDAI SAROVAR — 5 rooms (₹/room/night)" rows={SAROVAR_RATES} val={(r, o) => month(SAROVAR_ROOMS, r, o)} kind="sarovar" />
            <PriceRows title="3BHK PENTHOUSE — 3 rooms (₹/room/night)" rows={PENTHOUSE_RATES} val={(r, o) => month(PENTHOUSE_ROOMS, r, o)} kind="penthouse" />
            <PriceRows title="FOOD — ₹ spend / occupied room / night" rows={FOOD} val={(r, o) => food(r, o)} kind="food" />
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-slate-500">Monthly revenue = rooms × rate × 30 × occupancy. Food = occupied rooms × F&B spend. Highlighted cells = the three scenarios above.</p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <button type="button" onClick={() => setImg(!img)} className="text-sm font-semibold text-navy underline">{img ? "Hide" : "Show"} the original projection sheet</button>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${base}/sales/revenue-projection.png`} alt="JD Stays & Hospitality — Monthly Revenue Projection" className="mt-3 w-full rounded-xl border border-line" />
        )}
      </section>
    </div>
  );
}
