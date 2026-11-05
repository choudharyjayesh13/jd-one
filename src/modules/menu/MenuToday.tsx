"use client";
/** Quick "available today" switches + rates for the chef. Changes show live in the guest app's Menu tab and in KOT orders. */
import { useState } from "react";
import { getStore } from "@/core/data";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import type { Row } from "@/core/schema/types";

export function MenuToday() {
  const { rows, reload } = useList("menu");
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const cats = [...new Set(rows.map((r) => String(r.category)))];
  const set = async (r: Row, patch: Record<string, unknown>, msg: string) => {
    setBusy(r.id);
    try {
      await getStore().update("menu", r.id, patch);
      toast(msg);
      await reload();
    } catch (e) {
      toast((e as Error).message.includes("row-level") ? "Only the chef or office can change the menu" : (e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  if (!rows.length) return null;
  const on = rows.filter((r) => r.active).length;
  return (
    <section className="mb-5 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-navy">👨‍🍳 Today&apos;s menu — tap to switch a dish on / off</h2>
        <span className="text-sm text-slate-500">{on} of {rows.length} dishes available · shows live in the guest app & KOT</span>
      </div>
      <div className="space-y-4">
        {cats.map((c) => (
          <div key={c}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gold">{c}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rows.filter((r) => r.category === c).map((r) => (
                <div key={r.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", r.active ? "border-emerald-200 bg-emerald-50" : "border-line bg-slate-50 text-slate-400")}>
                  <button type="button" disabled={busy === r.id} onClick={() => void set(r, { active: !r.active }, `${r.name}: ${r.active ? "not available today" : "available"}`)}
                    className={cn("h-6 w-11 shrink-0 rounded-full p-0.5 transition", r.active ? "bg-emerald-500" : "bg-slate-300")}>
                    <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition", r.active ? "translate-x-5" : "")} />
                  </button>
                  <span className="min-w-0 flex-1 truncate">{String(r.name)}</span>
                  <span className="text-slate-400">₹</span>
                  <input type="number" min={0} defaultValue={Number(r.price)} onBlur={(e) => { const v = Number(e.target.value); if (v !== Number(r.price)) void set(r, { price: v }, `${r.name}: rate ₹${v}`); }}
                    className="w-16 rounded-lg border border-line bg-white px-1.5 py-0.5 text-right" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
