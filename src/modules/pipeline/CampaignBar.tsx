"use client";
/**
 * Campaign pipelines: one button per Meta sheet tab (Campaign 2, Campaign 3 …) above the funnel and the
 * board, plus "All leads" and "Other enquiries" (WhatsApp, calls, website …). A new tab in the agency's
 * sheet gets its own button as soon as its first lead arrives. The choice is kept in the address
 * (/pipeline/?c=Campaign%202) so a campaign's pipeline can be opened straight from a link.
 */
import { useList } from "@/core/ui/hooks";
import type { Row } from "@/core/schema/types";
import { cn } from "@/core/ui/cn";

export const OTHER = "__other";

export function inCampaign(l: Row, campaign: string): boolean {
  if (!campaign) return true;
  if (campaign === OTHER) return !l.sheet_tab;
  return l.sheet_tab === campaign;
}

export const campaignLabel = (c: string) => (c === OTHER ? "Other enquiries" : c);

export function readCampaign(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("c") ?? "";
}

export function writeCampaign(c: string) {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  if (c) u.searchParams.set("c", c);
  else u.searchParams.delete("c");
  window.history.replaceState(null, "", u.toString());
}

/** Natural order: Campaign 2 before Campaign 10. */
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function CampaignBar({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { rows: leads } = useList("leads");
  const open = (l: Row) => l.stage !== "Won" && l.stage !== "Lost";
  const tabs = [...new Set(leads.map((l) => String(l.sheet_tab ?? "")).filter(Boolean))].sort(byName);
  const items: { id: string; label: string; total: number; open: number }[] = [
    { id: "", label: "All leads", total: leads.length, open: leads.filter(open).length },
    ...tabs.map((t) => {
      const list = leads.filter((l) => l.sheet_tab === t);
      return { id: t, label: t, total: list.length, open: list.filter(open).length };
    }),
  ];
  const others = leads.filter((l) => !l.sheet_tab);
  if (tabs.length) items.push({ id: OTHER, label: "Other enquiries", total: others.length, open: others.filter(open).length });
  if (!tabs.length) return null;

  return (
    <section className="rounded-xl border border-line bg-white p-3">
      <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">Pipeline for</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((it) => {
          const on = value === it.id;
          return (
            <button
              key={it.id || "all"}
              type="button"
              onClick={() => onChange(it.id)}
              className={cn(
                "shrink-0 rounded-lg border px-4 py-2 text-left transition",
                on ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-[#c9a54c]",
              )}
            >
              <div className="text-sm font-semibold">{it.label}</div>
              <div className={cn("text-xs", on ? "text-white/75" : "text-slate-500")}>
                {it.open} open · {it.total} total
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
