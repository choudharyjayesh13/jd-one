"use client";
/** /pipeline: Sales & Marketing pipeline — leads by stage, follow-ups due, one tap to call / WhatsApp / move stage. */
import { useState } from "react";
import Link from "next/link";
import { Phone, MessageCircle, AlarmClock, Flame, Search } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Loading } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { formatDate, formatMoney, todayISO } from "@/core/format";
import { viewHref } from "@/core/routes";
import type { Row } from "@/core/schema/types";
import { LEAD_STAGES } from "@/modules/leads/options";
import { followUpStatus } from "@/modules/leads/entity";

const COLS = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "On Hold", "Won", "Lost"] as const;
const TONE: Record<string, string> = { Overdue: "bg-rose-100 text-rose-700", Today: "bg-amber-100 text-amber-800", "Call now": "bg-orange-100 text-orange-700", Upcoming: "bg-emerald-50 text-emerald-700", "Not set": "bg-slate-100 text-slate-500", Closed: "bg-slate-100 text-slate-400" };

export function Pipeline() {
  const user = useUser();
  const { toast } = useToast();
  const { rows: leads, loading } = useList("leads");
  const { rows: staff } = useList("staff", { filter: { active: true } });
  const me = (user.staff?.id as string | undefined) ?? "";
  const [who, setWho] = useState<string>(user.role === "marketing" && me ? me : "");
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  if (loading) return <Loading />;
  const name = (id: unknown) => String(staff.find((s) => s.id === id)?.name ?? "Unassigned");
  const t = q.trim().toLowerCase();
  const mine = leads.filter((l) => (!who || (who === "none" ? !l.assigned_to : l.assigned_to === who)) && (!t || `${l.name} ${l.phone} ${l.requirement ?? ""} ${l.campaign ?? ""}`.toLowerCase().includes(t)));
  const open = mine.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const fu = (s: string) => open.filter((l) => followUpStatus(l) === s);
  const overdue = fu("Overdue"), today = fu("Today"), callNow = fu("Call now");
  const wonThisMonth = mine.filter((l) => l.stage === "Won" && String(l.won_at ?? l.updated_at ?? "").slice(0, 7) === todayISO().slice(0, 7));
  const callers = staff.filter((s) => ["marketing", "manager", "owner"].includes(String(s.role)));

  const move = async (l: Row, stage: string) => {
    try {
      await getStore().update("leads", l.id, { stage, last_contact: todayISO() });
      toast(stage === "Won" ? `${l.name} converted — saved as a lifetime guest` : `${l.name} → ${stage}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const phone = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);
  const Card = ({ l }: { l: Row }) => {
    const st = followUpStatus(l);
    const p = phone(l.phone);
    return (
      <div className="space-y-2 rounded-xl border border-line bg-white p-3 text-sm shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <Link href={viewHref("leads", l.id)} className="font-semibold text-navy hover:underline">{String(l.name)}</Link>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", TONE[st])}>{st}{l.next_follow_up && st !== "Closed" ? ` · ${formatDate(l.next_follow_up).slice(0, 6)}` : ""}</span>
        </div>
        {l.requirement ? <p className="line-clamp-2 text-xs text-slate-500">{String(l.requirement)}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          {l.qualification ? <span className={cn("rounded px-1.5 py-0.5", l.qualification === "Hot" ? "bg-rose-50 text-rose-600" : "bg-slate-100")}>{String(l.qualification)}</span> : null}
          {l.budget ? <span>{formatMoney(l.budget)}</span> : null}
          {Number(l.call_attempts ?? 0) > 0 ? <span>📞 {String(l.call_attempts)}</span> : null}
          <span>👤 {name(l.assigned_to)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {p.length === 10 && <a href={`tel:+91${p}`} className="flex items-center gap-1 rounded-lg bg-navy px-2 py-1 text-[11px] font-semibold text-white"><Phone className="h-3 w-3" />Call</a>}
          {p.length === 10 && <a href={`https://wa.me/91${p}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"><MessageCircle className="h-3 w-3" />WhatsApp</a>}
          <select value={String(l.stage)} onChange={(e) => void move(l, e.target.value)} className="ml-auto rounded-lg border border-line bg-white px-1.5 py-1 text-[11px]">
            {LEAD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    );
  };

  const cols = COLS.filter((c) => showClosed || (c !== "Won" && c !== "Lost"));
  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Sales pipeline</h1>
          <p className="text-sm text-slate-500">Call, follow up and move every lead until it books. A converted lead becomes a lifetime guest (JDG number) automatically.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone" className="rounded-xl border border-line py-2 pl-8 pr-3 text-sm" /></div>
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Everyone</option>
            <option value="none">Unassigned</option>
            {callers.map((s) => <option key={s.id as string} value={s.id as string}>{String(s.name)}{s.id === me ? " (me)" : ""}</option>)}
          </select>
          <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Won / Lost</label>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Overdue follow-ups", n: overdue.length, icon: AlarmClock, tone: "text-rose-600" },
          { label: "Follow up today", n: today.length, icon: AlarmClock, tone: "text-amber-600" },
          { label: "New — call now", n: callNow.length, icon: Flame, tone: "text-orange-600" },
          { label: "Converted this month", n: wonThisMonth.length, icon: Flame, tone: "text-emerald-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500"><k.icon className={cn("h-4 w-4", k.tone)} />{k.label}</div>
            <div className={cn("mt-1 text-2xl font-bold", k.tone)}>{k.n}</div>
          </div>
        ))}
      </div>

      {(overdue.length > 0 || today.length > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 font-semibold text-amber-900">Call these first ({overdue.length + today.length})</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...overdue, ...today].slice(0, 30).map((l) => <Card key={l.id} l={l} />)}</div>
        </section>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {cols.map((c) => {
          const items = mine.filter((l) => l.stage === c);
          return (
            <div key={c} className="w-72 shrink-0 rounded-2xl bg-slate-100 p-2">
              <div className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-navy"><span>{c}</span><span className="rounded-full bg-white px-2 text-xs">{items.length}</span></div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto">{items.slice(0, 150).map((l) => <Card key={l.id} l={l} />)}{items.length > 150 && <p className="px-2 py-1 text-xs text-slate-500">+{items.length - 150} more — use search or the Leads list</p>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
