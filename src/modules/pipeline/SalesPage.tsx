"use client";
/** /pipeline: one place for the sales team — funnel on top, then New leads board or Customer deals board. */
import { useState } from "react";
import { useUser } from "@/core/auth/AuthProvider";
import { cn } from "@/core/ui/cn";
import { Pipeline } from "./Pipeline";
import { DealsBoard } from "./DealsBoard";
import { Funnel } from "./Funnel";

export function SalesPage() {
  const user = useUser();
  const me = (user.staff?.id as string | undefined) ?? "";
  const initial = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "deals" ? "deals" : "leads";
  const [tab, setTab] = useState<"leads" | "deals">(initial);
  const [mineOnly, setMineOnly] = useState(user.role === "marketing");

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        {([["leads", "🧲 New leads"], ["deals", "🤝 Customer deals"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-xl px-4 py-2 text-sm font-semibold", tab === k ? "bg-navy text-white" : "border border-line bg-white text-slate-600")}>{label}</button>
        ))}
        {me && (
          <label className="ml-auto flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Funnel: only my leads</label>
        )}
      </div>
      <Funnel who={mineOnly ? me : ""} />
      {tab === "leads" ? <Pipeline /> : <DealsBoard />}
    </div>
  );
}
