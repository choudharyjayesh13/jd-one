"use client";
/**
 * Sales pipeline → "Campaign pipelines": one card per Meta campaign (Campaign 1, Campaign 2, Campaign 3 …,
 * in the order of the agency's sheet tabs) plus "Other enquiries". Each card is that campaign's pipeline
 * in small – how many leads sit in each of the 11 stages, and what needs doing now. "Open pipeline"
 * opens the full board for that campaign. A new tab in the sheet gets its card with its first lead.
 */
import { ArrowRight } from "lucide-react";
import { useList } from "@/core/ui/hooks";
import { Loading } from "@/core/ui/misc";
import { formatMoney } from "@/core/format";
import type { Row } from "@/core/schema/types";
import { LEAD_STAGES, STAGE_GUIDE } from "@/modules/leads/options";
import { followUpStatus } from "@/modules/leads/entity";
import { OTHER, campaignKey, campaignList } from "./CampaignBar";

const HOT = ["Qualified", "Quote preparation", "Awaiting approval", "Quote shared", "Confirmation pending"];

export function CampaignBoards({ onOpen }: { onOpen: (campaign: string) => void }) {
  const { rows: leads, loading } = useList("leads");
  if (loading) return <Loading />;
  const names = campaignList(leads);
  const cards = [...names.map((n) => ({ id: n, title: n, list: leads.filter((l) => campaignKey(l) === n) })), { id: OTHER, title: "Other enquiries", list: leads.filter((l) => !campaignKey(l)) }].filter((c) => c.list.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="jd-serif text-2xl font-semibold text-navy">Campaign pipelines</h1>
        <p className="text-sm text-slate-500">Each Meta campaign has its own pipeline. A new campaign tab in the agency&apos;s sheet shows here by itself.</p>
      </div>
      {cards.length === 0 && <p className="rounded-xl border border-line bg-white p-5 text-sm text-slate-500">No leads yet.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.id} title={c.title} sub={c.id === OTHER ? "WhatsApp, calls, website, walk-in and others" : campaignName(c.list) === c.title ? "" : campaignName(c.list)} list={c.list} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </div>
  );
}

/** The Meta campaign name most leads in this tab carry (e.g. "Leads Campaign 2 - AKS"). */
function campaignName(list: Row[]): string {
  const m = new Map<string, number>();
  for (const l of list) if (l.campaign) m.set(String(l.campaign), (m.get(String(l.campaign)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function Card({ title, sub, list, onOpen }: { title: string; sub: string; list: Row[]; onOpen: () => void }) {
  const open = list.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const notCalled = list.filter((l) => l.stage === "New" && !Number(l.call_attempts ?? 0)).length;
  const overdue = list.filter((l) => followUpStatus(l) === "Overdue").length;
  const today = list.filter((l) => followUpStatus(l) === "Today").length;
  const hot = list.filter((l) => HOT.includes(String(l.stage))).length;
  const won = list.filter((l) => l.stage === "Won");
  const wonValue = won.reduce((a, l) => a + Number(l.booking_value ?? l.package_proposed ?? 0), 0);
  const per = LEAD_STAGES.map((s) => ({ s, n: list.filter((l) => l.stage === s).length }));
  const total = list.length || 1;

  return (
    <section className="flex flex-col rounded-xl border border-line bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="jd-serif text-xl font-semibold text-navy">{title}</h2>
          <p className="truncate text-xs text-slate-500">{sub || " "}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-navy tabular-nums">{list.length}</div>
          <div className="text-xs text-slate-500">{open.length} open</div>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-line border-b border-line text-center">
        <Num label="Not called" n={notCalled} warn />
        <Num label="Overdue" n={overdue} warn sub={today ? `${today} today` : undefined} />
        <Num label="Hot + quoted" n={hot} />
        <Num label="Booked" n={won.length} sub={wonValue ? formatMoney(wonValue) : undefined} gold />
      </div>

      <div className="px-5 py-4">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          {per.filter((x) => x.n).map((x) => (
            <div key={x.s} title={`${x.s}: ${x.n}`} style={{ width: `${(x.n / total) * 100}%`, background: STAGE_GUIDE[x.s].color }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
          {per.map((x) => (
            <div key={x.s} className={x.n ? "flex items-center gap-1.5 text-slate-700" : "flex items-center gap-1.5 text-slate-300"}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.n ? STAGE_GUIDE[x.s].color : "#e2e8f0" }} />
              <span className="truncate">{STAGE_GUIDE[x.s].no} {x.s}</span>
              <span className="ml-auto font-semibold tabular-nums">{x.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-line px-5 py-3">
        <button type="button" onClick={onOpen} className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Open {title} pipeline
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function Num({ label, n, sub, warn, gold }: { label: string; n: number; sub?: string; warn?: boolean; gold?: boolean }) {
  return (
    <div className="px-2 py-3">
      <div className={warn && n ? "text-lg font-semibold text-rose-700 tabular-nums" : gold && n ? "text-lg font-semibold text-[#9a7b2f] tabular-nums" : "text-lg font-semibold text-navy tabular-nums"}>{n}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      {sub ? <div className="text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}
