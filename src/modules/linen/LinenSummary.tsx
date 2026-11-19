"use client";
/** Pieces still at the laundry, per item (sent − received), shown above the linen list. */
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { formatNumber } from "@/core/format";

export function LinenSummary() {
  const user = useUser();
  const { rows } = useList("linen-logs", { filter: user.unitId ? { business_unit_id: user.unitId } : {} });
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.item);
    const q = Number(r.quantity) || 0;
    if (r.movement === "Sent to laundry") out.set(k, (out.get(k) ?? 0) + q);
    if (r.movement === "Received from laundry") out.set(k, (out.get(k) ?? 0) - q);
  }
  const pending = Array.from(out.entries()).filter(([, n]) => n > 0);
  if (!rows.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-line p-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-gold">At the laundry now</div>
      {pending.length === 0 ? (
        <p className="text-sm text-slate-500">Everything sent has come back.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {pending.map(([item, n]) => (
            <span key={item} className="rounded-full border border-line px-3 py-1 text-sm">
              {item}: <b className="font-semibold">{formatNumber(n)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
