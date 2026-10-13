"use client";
/**
 * /pipeline → New leads: the Uday Sarovar sales SOP as a board. 11 stages (01 New … 11 Nurture) with the
 * stage rule on every column, one-tap Call / WhatsApp / follow-up / move, "Call these first", and the
 * approval gate (owner/manager approve or send back quotes waiting in stage 06).
 */
import { useState } from "react";
import Link from "next/link";
import { Phone, MessageCircle, AlarmClock, Flame, Search, CalendarClock, Minus, Plus, ShieldCheck, Info, Users, BedDouble, Trophy, IndianRupee } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Loading } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { formatDate, formatMoney, todayISO } from "@/core/format";
import { newHref, viewHref } from "@/core/routes";
import type { Row } from "@/core/schema/types";
import { LEAD_QUALIFICATIONS, LEAD_STAGES, STAGE_GUIDE } from "@/modules/leads/options";
import { followUpStatus } from "@/modules/leads/entity";

const TONE: Record<string, string> = { Overdue: "bg-rose-100 text-rose-700", Today: "bg-amber-100 text-amber-800", "Call now": "bg-orange-100 text-orange-700", Upcoming: "bg-emerald-50 text-emerald-700", "Not set": "bg-slate-100 text-slate-500", Closed: "bg-slate-100 text-slate-400" };
const QTONE: Record<string, string> = { Hot: "bg-rose-500 text-white", Warm: "bg-amber-400 text-white", Cold: "bg-sky-200 text-sky-800", Unqualified: "bg-slate-200 text-slate-600" };
const APPROVERS = ["owner", "manager"];

export function Pipeline() {
  const user = useUser();
  const { toast } = useToast();
  const { rows: leads, loading } = useList("leads");
  const { rows: staff } = useList("staff", { filter: { active: true } });
  const me = (user.staff?.id as string | undefined) ?? "";
  const canApprove = APPROVERS.includes(String(user.role));
  const [who, setWho] = useState<string>(user.role === "marketing" && me ? me : "");
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [guide, setGuide] = useState(false);
  const [openFu, setOpenFu] = useState<string | null>(null);
  const [fuForm, setFuForm] = useState<{ date: string; calls: number; action: string; note: string }>({ date: "", calls: 0, action: "", note: "" });
  const [review, setReview] = useState<Record<string, string>>({});

  if (loading) return <Loading />;
  const name = (id: unknown) => String(staff.find((s) => s.id === id)?.name ?? "Unassigned");
  const t = q.trim().toLowerCase();
  const mine = leads.filter((l) => (!who || (who === "none" ? !l.assigned_to : l.assigned_to === who)) && (!t || `${l.name} ${l.phone} ${l.requirement ?? ""} ${l.campaign ?? ""} ${l.city ?? ""}`.toLowerCase().includes(t)));
  const open = mine.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const fu = (s: string) => open.filter((l) => followUpStatus(l) === s);
  const overdue = fu("Overdue"), today = fu("Today"), callNow = fu("Call now");
  const month = todayISO().slice(0, 7);
  const wonThisMonth = mine.filter((l) => l.stage === "Won" && String(l.won_at ?? l.updated_at ?? "").slice(0, 7) === month);
  const wonValue = wonThisMonth.reduce((a, l) => a + Number(l.booking_value ?? l.package_proposed ?? l.budget ?? 0), 0);
  const pending = leads.filter((l) => l.approval_status === "Pending" && l.stage !== "Won" && l.stage !== "Lost");
  const noAction = open.filter((l) => l.stage !== "New" && (!l.next_follow_up || !l.next_action));
  const callers = staff.filter((s) => ["marketing", "manager", "owner"].includes(String(s.role)));

  const save = async (l: Row, values: Record<string, unknown>, msg: string) => {
    try {
      await getStore().update("leads", l.id, values);
      toast(msg);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const move = (l: Row, stage: string) =>
    save(l, { stage, last_contact: todayISO(), ...(stage === "Awaiting approval" ? { approval_status: "Pending" } : {}) }, stage === "Won" ? `${l.name} won — saved as a lifetime guest 🎉` : `${l.name} → ${STAGE_GUIDE[stage]?.no ?? ""} ${stage}`);
  const decide = (l: Row, status: "Approved" | "Revision required" | "Rejected") =>
    save(l, {
      approval_status: status,
      approved_by: me || null,
      approved_at: new Date().toISOString(),
      approval_notes: [review[l.id]?.trim() ? `${todayISO()} ${String(user.name ?? "").split(" ")[0]}: ${review[l.id].trim()}` : "", String(l.approval_notes ?? "")].filter(Boolean).join("\n") || null,
      stage: status === "Approved" ? "Quote shared" : status === "Revision required" ? "Quote preparation" : l.stage,
    }, `${l.name}: ${status}`);
  const startFu = (l: Row) => {
    setOpenFu(l.id);
    setFuForm({ date: String(l.next_follow_up ?? "").slice(0, 10), calls: Number(l.call_attempts ?? 0), action: String(l.next_action ?? ""), note: "" });
  };
  const saveFu = async (l: Row) => {
    const stamp = `${todayISO()} (${String(user.name ?? "").split(" ")[0]}): ${fuForm.note.trim()}`;
    await save(l, {
      next_follow_up: fuForm.date || null,
      call_attempts: fuForm.calls,
      next_action: fuForm.action.trim() || null,
      last_contact: todayISO(),
      stage: l.stage === "New" && fuForm.calls > 0 ? "Contact attempted" : l.stage,
      ...(fuForm.note.trim() ? { notes: [stamp, String(l.notes ?? "")].filter(Boolean).join("\n") } : {}),
    }, `Follow-up saved for ${l.name}`);
    setOpenFu(null);
  };
  const phone = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);

  const Card = ({ l }: { l: Row }) => {
    const st = followUpStatus(l);
    const p = phone(l.phone);
    const color = STAGE_GUIDE[String(l.stage)]?.color ?? "#64748b";
    return (
      <div className="group space-y-2 rounded-xl border border-line border-l-4 bg-white p-3 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderLeftColor: color }}>
        <div className="flex items-start justify-between gap-2">
          <Link href={viewHref("leads", l.id)} className="font-semibold leading-tight text-navy hover:underline">{String(l.name)}</Link>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", TONE[st])}>{st}{l.next_follow_up && st !== "Closed" ? ` · ${formatDate(l.next_follow_up).slice(0, 6)}` : ""}</span>
        </div>
        {l.next_action ? <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">➜ {String(l.next_action)}</p> : l.requirement ? <p className="line-clamp-2 text-xs text-slate-500">{String(l.requirement)}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          {l.qualification ? <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", QTONE[String(l.qualification)] ?? "bg-slate-100")}>{String(l.qualification)}</span> : null}
          {l.lead_type ? <span className="rounded bg-slate-100 px-1.5 py-0.5">{String(l.lead_type)}</span> : null}
          {l.visit_from ? <span>📅 {formatDate(l.visit_from).slice(0, 6)}{l.visit_to ? `–${formatDate(l.visit_to).slice(0, 6)}` : ""}</span> : null}
          {Number(l.guests ?? 0) > 0 ? <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{String(l.guests)}</span> : null}
          {Number(l.rooms_count ?? 0) > 0 ? <span className="flex items-center gap-0.5"><BedDouble className="h-3 w-3" />{String(l.rooms_count)}</span> : null}
          {Number(l.package_proposed ?? l.budget ?? 0) > 0 ? <span className="font-semibold text-navy">{formatMoney(l.package_proposed ?? l.budget)}</span> : null}
          {Number(l.call_attempts ?? 0) > 0 ? <span>📞 {String(l.call_attempts)}</span> : null}
          {l.approval_status && l.approval_status !== "Not needed" ? (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", l.approval_status === "Approved" ? "bg-emerald-100 text-emerald-700" : l.approval_status === "Pending" ? "bg-fuchsia-100 text-fuchsia-700" : "bg-rose-100 text-rose-700")}>🛡 {String(l.approval_status)}</span>
          ) : null}
          <span className="ml-auto">👤 {name(l.assigned_to).split(" ")[0]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.length === 10 && <a href={`tel:+91${p}`} className="flex items-center gap-1 rounded-lg bg-navy px-2 py-1 text-[11px] font-semibold text-white"><Phone className="h-3 w-3" />Call</a>}
          {p.length === 10 && <a href={`https://wa.me/91${p}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"><MessageCircle className="h-3 w-3" />WhatsApp</a>}
          <button type="button" onClick={() => (openFu === l.id ? setOpenFu(null) : startFu(l))} className="flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white"><CalendarClock className="h-3 w-3" />Follow-up</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] text-slate-500">Stage
            <select value={String(l.stage)} onChange={(e) => void move(l, e.target.value)} className="mt-0.5 w-full rounded-lg border border-line bg-white px-1.5 py-1 text-[11px] text-navy">
              {LEAD_STAGES.map((s) => <option key={s} value={s}>{STAGE_GUIDE[s]?.no} {s}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-slate-500">Hot / Warm / Cold
            <select value={String(l.qualification ?? "")} onChange={(e) => void save(l, { qualification: e.target.value || null }, `${l.name}: ${e.target.value || "not set"}`)} className="mt-0.5 w-full rounded-lg border border-line bg-white px-1.5 py-1 text-[11px] text-navy">
              <option value="">— not set —</option>
              {LEAD_QUALIFICATIONS.map((qv) => <option key={qv} value={qv}>{qv}</option>)}
            </select>
          </label>
        </div>
        {openFu === l.id && (
          <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px]">
            <label className="block text-slate-600">Next action
              <input value={fuForm.action} onChange={(e) => setFuForm({ ...fuForm, action: e.target.value })} placeholder="Send pool-view package on WhatsApp" className="mt-0.5 w-full rounded border border-line bg-white px-1.5 py-1" />
            </label>
            <label className="block text-slate-600">Next follow-up
              <input type="date" value={fuForm.date} onChange={(e) => setFuForm({ ...fuForm, date: e.target.value })} className="mt-0.5 w-full rounded border border-line bg-white px-1.5 py-1" />
            </label>
            <div className="flex items-center justify-between text-slate-600">
              <span>Calls made</span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => setFuForm({ ...fuForm, calls: Math.max(0, fuForm.calls - 1) })} className="rounded border border-line bg-white p-0.5"><Minus className="h-3 w-3" /></button>
                <b className="w-6 text-center text-sm text-navy">{fuForm.calls}</b>
                <button type="button" onClick={() => setFuForm({ ...fuForm, calls: fuForm.calls + 1 })} className="rounded border border-line bg-white p-0.5"><Plus className="h-3 w-3" /></button>
              </span>
            </div>
            <label className="block text-slate-600">What did the guest say?
              <textarea value={fuForm.note} onChange={(e) => setFuForm({ ...fuForm, note: e.target.value })} rows={2} className="mt-0.5 w-full rounded border border-line bg-white px-1.5 py-1" />
            </label>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void saveFu(l)} className="flex-1 rounded-lg bg-navy px-2 py-1.5 font-semibold text-white">Save</button>
              <button type="button" onClick={() => setOpenFu(null)} className="rounded-lg border border-line bg-white px-2 py-1.5">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const cols = LEAD_STAGES.filter((c) => showClosed || (c !== "Won" && c !== "Lost"));
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Sales pipeline</h1>
          <p className="text-sm text-slate-500">Every enquiry in one place. Update the stage, next action and follow-up after every call — no lead without a next step.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone / city" className="rounded-xl border border-line py-2 pl-8 pr-3 text-sm" /></div>
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Everyone</option>
            <option value="none">Unassigned</option>
            {callers.map((s) => <option key={s.id as string} value={s.id as string}>{String(s.name)}{s.id === me ? " (me)" : ""}</option>)}
          </select>
          <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Won / Lost</label>
          <button type="button" onClick={() => setGuide(!guide)} className="flex items-center gap-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-slate-600"><Info className="h-4 w-4" />Stage rules</button>
          <Link href={newHref("leads", { stage: "New", assigned_to: me || undefined })} className="flex items-center gap-1 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />New lead</Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Overdue follow-ups", n: String(overdue.length), icon: AlarmClock, tone: "from-rose-500 to-rose-600" },
          { label: "Follow up today", n: String(today.length), icon: CalendarClock, tone: "from-amber-400 to-amber-500" },
          { label: "New — call now", n: String(callNow.length), icon: Flame, tone: "from-orange-500 to-orange-600" },
          { label: "Waiting approval", n: String(pending.length), icon: ShieldCheck, tone: "from-fuchsia-500 to-fuchsia-600" },
          { label: "Won this month", n: `${wonThisMonth.length} · ${formatMoney(wonValue)}`, icon: Trophy, tone: "from-emerald-500 to-emerald-600" },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-2xl bg-gradient-to-br p-4 text-white shadow-sm", k.tone)}>
            <div className="flex items-center gap-2 text-xs opacity-90"><k.icon className="h-4 w-4" />{k.label}</div>
            <div className="mt-1 text-2xl font-bold">{k.n}</div>
          </div>
        ))}
      </div>

      {guide && (
        <section className="grid gap-2 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          {LEAD_STAGES.map((s) => (
            <div key={s} className="rounded-xl border-l-4 bg-slate-50 p-2.5 text-xs" style={{ borderLeftColor: STAGE_GUIDE[s].color }}>
              <div className="font-semibold text-navy">{STAGE_GUIDE[s].no} · {s}</div>
              <p className="mt-0.5 text-slate-600">{STAGE_GUIDE[s].means}</p>
              <p className="mt-0.5 text-slate-500">➜ {STAGE_GUIDE[s].exit}</p>
            </div>
          ))}
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">Approval gate: any rate, discount or inclusion outside the approved rate card goes to stage 06 — only approved quotes are shared with guests. Mark Won only after the advance/confirmation is complete.</p>
        </section>
      )}

      {canApprove && pending.length > 0 && (
        <section className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-fuchsia-900"><ShieldCheck className="h-5 w-5" />Quotes waiting for your approval ({pending.length})</h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {pending.map((l) => (
              <div key={l.id} className="space-y-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={viewHref("leads", l.id)} className="font-semibold text-navy hover:underline">{String(l.name)}</Link>
                  <span className="flex items-center gap-1 text-base font-bold text-navy"><IndianRupee className="h-4 w-4" />{Number(l.package_proposed ?? 0).toLocaleString("en-IN")}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {[l.lead_type, l.visit_from ? formatDate(l.visit_from) : "", l.guests ? `${l.guests} guests` : "", l.rooms_count ? `${l.rooms_count} rooms` : "", l.budget ? `budget ${formatMoney(l.budget)}` : "", `by ${name(l.assigned_to)}`].filter(Boolean).join(" · ")}
                </p>
                {l.approval_notes ? <p className="whitespace-pre-line rounded bg-slate-50 p-1.5 text-xs text-slate-600">{String(l.approval_notes)}</p> : null}
                <input value={review[l.id] ?? ""} onChange={(e) => setReview({ ...review, [l.id]: e.target.value })} placeholder="Your note (optional)" className="w-full rounded-lg border border-line px-2 py-1 text-xs" />
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => void decide(l, "Approved")} className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white">✓ Approve</button>
                  <button type="button" onClick={() => void decide(l, "Revision required")} className="flex-1 rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-semibold text-white">↺ Revise</button>
                  <button type="button" onClick={() => void decide(l, "Rejected")} className="rounded-lg border border-rose-300 bg-white px-2 py-1.5 text-xs font-semibold text-rose-600">✕</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(overdue.length > 0 || today.length > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 font-semibold text-amber-900">📞 Call these first ({overdue.length + today.length})</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...overdue, ...today].slice(0, 30).map((l) => <Card key={l.id} l={l} />)}</div>
        </section>
      )}

      {noAction.length > 0 && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">⚠ {noAction.length} open lead{noAction.length === 1 ? "" : "s"} without a next action or follow-up date — tap Follow-up on each card.</p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {cols.map((c) => {
          const items = mine.filter((l) => l.stage === c);
          const g = STAGE_GUIDE[c];
          const value = items.reduce((a, l) => a + Number(l.package_proposed ?? l.budget ?? 0), 0);
          return (
            <div key={c} className="w-72 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
              <div className="px-3 py-2 text-white" style={{ background: g.color }}>
                <div className="flex items-center justify-between text-sm font-semibold"><span>{g.no} · {c}</span><span className="rounded-full bg-white/25 px-2 text-xs">{items.length}</span></div>
                <div className="mt-0.5 text-[10px] opacity-90" title={`${g.means} → ${g.exit}`}>➜ {g.exit}{value > 0 ? ` · ${formatMoney(value)}` : ""}</div>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
                {items.slice(0, 150).map((l) => <Card key={l.id} l={l} />)}
                {items.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">No leads here</p>}
                {items.length > 150 && <p className="px-2 py-1 text-xs text-slate-500">+{items.length - 150} more — use search or the Leads list</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
