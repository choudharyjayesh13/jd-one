"use client";
/** Cash-in-hand tiles above the petty cash list: balance per property + this month's movement. */
import { currentMonth, formatMoney, monthRange } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { Stat } from "@/core/ui/Card";
import { useList } from "@/core/ui/hooks";

export function PettyCashSummary() {
  const user = useUser();
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows } = useList("petty-cash", { filter: unitFilter });
  const { rows: units } = useList("business-units");
  const { start, end } = monthRange(currentMonth());
  const signed = (r: Record<string, unknown>) => (r.kind === "Cash in" ? 1 : -1) * Number(r.amount ?? 0);
  const balance = rows.reduce((s, r) => s + signed(r), 0);
  const month = rows.filter((r) => String(r.date) >= start && String(r.date) <= end);
  const spent = month.filter((r) => r.kind === "Cash out").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const received = month.filter((r) => r.kind === "Cash in").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const perUnit = units
    .map((u) => ({ name: String(u.name), bal: rows.filter((r) => r.business_unit_id === u.id).reduce((s, r) => s + signed(r), 0) }))
    .filter((u) => u.bal !== 0);
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Cash in hand" value={formatMoney(balance)} tone={balance < 0 ? "bad" : "good"} hint={perUnit.length > 1 ? perUnit.map((u) => `${u.name}: ${formatMoney(u.bal)}`).join(" · ") : undefined} />
      <Stat label="Spent this month" value={formatMoney(spent)} />
      <Stat label="Received this month" value={formatMoney(received)} />
      <Stat label="Entries this month" value={month.length} />
    </div>
  );
}
