"use client";
/** /pipeline: one place for the sales team — funnel on top, then New leads board, Customer deals or Daily EOD. */
import { useState } from "react";
import { useUser } from "@/core/auth/AuthProvider";
import { cn } from "@/core/ui/cn";
import { Pipeline } from "./Pipeline";
import { DealsBoard } from "./DealsBoard";
import { EodBoard } from "./EodBoard";
import { Funnel } from "./Funnel";
import { RevenueTargets, TargetStrip } from "./RevenueTargets";

type Tab = "leads" | "deals" | "eod" | "targets";
const TABS: [Tab, string][] = [["leads", "🧲 New leads"], ["deals", "🤝 Customer deals"], ["eod", "📊 Daily EOD"], ["targets", "💰 Revenue targets"]];

export function SalesPage() {
  const user = useUser();
  const me = (user.staff?.id as string | undefined) ?? "";
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
  const [tab, setTab] = useState<Tab>(q === "deals" || q === "eod" || q === "targets" ? q : "leads");
  const [mineOnly, setMineOnly] = useState(user.role === "marketing");

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-2xl bg-slate-100 p-1">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition", tab === k ? "bg-white text-navy shadow" : "text-slate-500 hover:text-navy")}>{label}</button>
          ))}
        </div>
        {me && tab === "leads" && (
          <label className="ml-auto flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Funnel: only my leads</label>
        )}
      </div>
      {tab !== "targets" && <TargetStrip onOpen={() => setTab("targets")} />}
      {tab === "leads" && <Funnel who={mineOnly ? me : ""} />}
      {tab === "leads" ? <Pipeline /> : tab === "deals" ? <DealsBoard /> : tab === "eod" ? <EodBoard /> : <RevenueTargets />}
    </div>
  );
}
