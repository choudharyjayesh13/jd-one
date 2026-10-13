"use client";
/** Customer pipeline: every deal a customer has with us (stay, event, wedding, salon, property…) by stage, with ₹ totals. */
import { useState } from "react";
import Link from "next/link";
import { Phone, MessageCircle, Plus, Search, IndianRupee, CalendarCheck, AlarmClock, Trophy } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Loading } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { formatDate, formatMoney, todayISO } from "@/core/format";
import { newHref, viewHref } from "@/core/routes";
import type { Row } from "@/core/schema/types";
import { DEAL_STAGES } from "@/modules/deals/entity";

export function DealsBoard() {
  const user = useUser();
  const { toast } = useToast();
  const { rows: deals, loading } = useList("deals");
  const { rows: customers } = useList("customers");
  const { rows: staff } = useList("staff", { filter: { active: true } });
  const me = (user.staff?.id as string | undefined) ?? "";
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  if (loading) return <Loading />;
  const cust = (id: unknown) => customers.find((c) => c.id === id);
  const name = (id: unknown) => String(staff.find((s) => s.id === id)?.name ?? "Unassigned");
  const t = q.trim().toLowerCase();
  const mine = deals.filter((d) => {
    const c = cust(d.customer_id);
    const hay = `${d.title} ${d.contact_name ?? ""} ${d.phone ?? ""} ${c?.name ?? ""} ${c?.phone ?? ""}`.toLowerCase();
    return (!who || d.assigned_to === who) && (!t || hay.includes(t));
  });
  const open = mine.filter((d) => d.stage !== "Completed" && d.stage !== "Lost");
  const sum = (rs: Row[], f = "value") => rs.reduce((a, r) => a + Number(r[f] ?? 0), 0);
  const today = todayISO();
  const due = open.filter((d) => d.next_follow_up && String(d.next_follow_up) <= today);
  const month = today.slice(0, 7);
  const wonMonth = mine.filter((d) => d.stage === "Completed" && String(d.closed_at ?? "").slice(0, 7) === month);

  const move = async (d: Row, stage: string) => {
    try {
      await getStore().update("deals", d.id, { stage, closed_at: stage === "Completed" || stage === "Lost" ? today : null });
      toast(`${d.title} → ${stage}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const phone = (d: Row) => String(d.phone ?? cust(d.customer_id)?.phone ?? "").replace(/\D/g, "").slice(-10);

  const Card = ({ d }: { d: Row }) => {
    const p = phone(d);
    const c = cust(d.customer_id);
    const late = d.next_follow_up && String(d.next_follow_up) < today && d.stage !== "Completed" && d.stage !== "Lost";
    return (
      <div className="space-y-2 rounded-xl border border-line bg-white p-3 text-sm shadow-sm">
        <Link href={viewHref("deals", d.id)} className="block font-semibold text-navy hover:underline">{String(d.title)}</Link>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
          <span>{String(c?.name ?? d.contact_name ?? "—")}</span>
          <span className="rounded bg-slate-100 px-1.5">{String(d.kind ?? "")}</span>
          {d.expected_date ? <span>📅 {formatDate(d.expected_date)}</span> : null}
          <span>👤 {name(d.assigned_to)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-navy">{formatMoney(d.value)}</span>
          {Number(d.advance ?? 0) > 0 && <span className="text-emerald-700">adv {formatMoney(d.advance)}</span>}
          {d.next_follow_up ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", late ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500")}>follow-up {formatDate(d.next_follow_up).slice(0, 6)}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.length === 10 && <a href={`tel:+91${p}`} className="flex items-center gap-1 rounded-lg bg-navy px-2 py-1 text-[11px] font-semibold text-white"><Phone className="h-3 w-3" />Call</a>}
          {p.length === 10 && <a href={`https://wa.me/91${p}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"><MessageCircle className="h-3 w-3" />WhatsApp</a>}
          <select value={String(d.stage)} onChange={(e) => void move(d, e.target.value)} className="ml-auto rounded-lg border border-line bg-white px-1.5 py-1 text-[11px] text-navy">
            {DEAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    );
  };

  const cols = DEAL_STAGES.filter((c) => showClosed || (c !== "Completed" && c !== "Lost"));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Every customer deal in progress — new guests and repeat customers — from enquiry to completed.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer / deal" className="rounded-xl border border-line py-2 pl-8 pr-3 text-sm" /></div>
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Everyone</option>
            {staff.map((s) => <option key={s.id as string} value={s.id as string}>{String(s.name)}{s.id === me ? " (me)" : ""}</option>)}
          </select>
          <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Completed / Lost</label>
          <Link href={newHref("deals", { next_follow_up: today })} className="flex items-center gap-1 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />New deal</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Open pipeline value", v: formatMoney(sum(open)), icon: IndianRupee, tone: "text-navy" },
          { label: "Advance collected (open)", v: formatMoney(sum(open, "advance")), icon: CalendarCheck, tone: "text-emerald-600" },
          { label: "Follow-ups due", v: String(due.length), icon: AlarmClock, tone: "text-rose-600" },
          { label: "Completed this month", v: `${wonMonth.length} · ${formatMoney(sum(wonMonth))}`, icon: Trophy, tone: "text-amber-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500"><k.icon className={cn("h-4 w-4", k.tone)} />{k.label}</div>
            <div className={cn("mt-1 text-xl font-bold", k.tone)}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {cols.map((c) => {
          const items = mine.filter((d) => d.stage === c);
          return (
            <div key={c} className="w-72 shrink-0 rounded-2xl bg-slate-100 p-2">
              <div className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-navy">
                <span>{c}</span>
                <span className="text-xs font-normal text-slate-500">{items.length} · {formatMoney(sum(items))}</span>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto">
                {items.map((d) => <Card key={d.id} d={d} />)}
                {items.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">No deals</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
