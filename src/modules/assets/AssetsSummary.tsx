"use client";
/** Tiles + alerts above the Group assets list: service due, insurance/PUC expiry, km and fuel this month. */
import { addDays, currentMonth, formatMoney, formatNumber, monthRange, todayISO } from "@/core/format";
import { Stat } from "@/core/ui/Card";
import { useList } from "@/core/ui/hooks";
import { serviceState } from "./service-due";

const VEHICLES = new Set(["Car", "Scooty", "Motorbike", "Tempo / Loader"]);

export function AssetsSummary() {
  const { rows: assets } = useList("assets");
  const { rows: trips } = useList("vehicle-logs");
  const { rows: fuel } = useList("fuel-logs");
  const today = todayISO();
  const soon = addDays(today, 30);
  const { start, end } = monthRange(currentMonth());
  const inMonth = (r: Record<string, unknown>) => String(r.date) >= start && String(r.date) <= end;

  const active = assets.filter((a) => a.status !== "Sold / disposed");
  const vehicles = active.filter((a) => VEHICLES.has(String(a.asset_type)));
  const due = active
    .map((a) => ({ a, ...serviceState(a, today) }))
    .filter((x) => x.state === "overdue" || x.state === "soon")
    .sort((x, y) => (x.state === y.state ? 0 : x.state === "overdue" ? -1 : 1));
  const papers = active.flatMap((a) => {
    const out: { name: string; what: string; date: string; past: boolean }[] = [];
    for (const [k, what] of [["insurance_expiry", "Insurance"], ["puc_expiry", "PUC"]] as const) {
      const d = a[k] ? String(a[k]) : "";
      if (d && d <= soon) out.push({ name: String(a.name), what, date: d, past: d < today });
    }
    return out;
  });
  const missingReg = vehicles.filter((a) => !a.registration_no).length;
  const km = trips.filter(inMonth).reduce((s, r) => s + Number(r.km ?? 0), 0);
  const fuelMonth = fuel.filter(inMonth);
  const fuelSpend = fuelMonth.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vehicles" value={vehicles.length} hint={`${active.length - vehicles.length} other assets${missingReg ? ` · ${missingReg} without number` : ""}`} tone={missingReg ? "bad" : "neutral"} />
        <Stat label="Service due" value={due.length} tone={due.some((d) => d.state === "overdue") ? "bad" : due.length ? "neutral" : "good"} hint={due.length ? `${due.filter((d) => d.state === "overdue").length} overdue` : "All up to date"} />
        <Stat label="Km this month" value={formatNumber(km)} hint={`${trips.filter(inMonth).length} trips logged`} />
        <Stat label="Fuel this month" value={formatMoney(fuelSpend)} hint={`${fuelMonth.length} refills`} />
      </div>
      {(due.length > 0 || papers.length > 0) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="mb-1 font-semibold">Needs attention</div>
          <ul className="space-y-0.5">
            {due.map((d) => (
              <li key={String(d.a.id)}>
                <span className={d.state === "overdue" ? "font-semibold text-red-700" : ""}>{d.state === "overdue" ? "Service overdue" : "Service due soon"}</span>
                {": "}{String(d.a.name)}{d.a.registration_no ? ` (${String(d.a.registration_no)})` : ""}, {d.reason}
              </li>
            ))}
            {papers.map((p, i) => (
              <li key={`p${i}`}>
                <span className={p.past ? "font-semibold text-red-700" : ""}>{p.what} {p.past ? "expired" : "expiring"}</span>: {p.name}, {p.date}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
