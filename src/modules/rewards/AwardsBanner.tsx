"use client";
import { useEffect, useState } from "react";
import { getStore } from "@/core/data";
import { cn } from "@/core/ui/cn";
import { photoOfDay } from "@/core/ui/property";
import { INCENTIVES, loadAwards, type Awards } from "./rewards";

const initials = (n: unknown) => String(n ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function AwardsBanner({ me, compact }: { me?: string | null; compact?: boolean }) {
  const [a, setA] = useState<Awards | null>(null);
  useEffect(() => {
    let cancel = false;
    const load = () => loadAwards(getStore()).then((x) => !cancel && setA(x)).catch(() => undefined);
    void load();
    const unsubs = ["attendance", "tasks", "tickets", "leads"].map((e) => getStore().subscribe?.(e, () => void load()));
    return () => { cancel = true; unsubs.forEach((u) => u?.()); };
  }, []);
  const card = (label: string, emoji: string, bonus: number, r: Awards["week"], photo: string) => (
    <div className="relative overflow-hidden rounded-2xl text-white shadow-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-br from-navy/95 via-navy/85 to-amber-900/70" />
      <div className={cn("relative flex items-center gap-4", compact ? "p-4" : "p-5")}>
        <span className="text-4xl">{emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-gold">{label} · so far</div>
          {r ? (
            <>
              <div className="truncate text-xl font-bold">{String(r.staff.name)}{me && r.staff.id === me ? " — that's you! 🎉" : ""}</div>
              <div className="text-xs text-white/70">{r.score} points · {String(r.staff.designation ?? "")}</div>
            </>
          ) : (
            <div className="text-base font-semibold">Open — be the first to score!</div>
          )}
        </div>
        {r && <span className="hidden h-12 w-12 items-center justify-center rounded-full bg-gold text-sm font-bold text-navy sm:flex">{initials(r.staff.name)}</span>}
        <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-navy">₹{bonus.toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {card("Employee of the Week", "🏅", INCENTIVES[0].amount, a?.week ?? null, photoOfDay(5).url)}
      {card("Employee of the Month", "🏆", INCENTIVES[1].amount, a?.month ?? null, photoOfDay(6).url)}
    </div>
  );
}
