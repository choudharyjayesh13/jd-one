"use client";
/**
 * /report-issue — staff report a repair in three steps: pick the trade (big tiles),
 * describe it with photos/videos, then pick who will fix it from the saved repair contacts.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Plus, Send, Star, CheckCircle2 } from "lucide-react";
import type { FileItem } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { newHref, viewHref } from "@/core/routes";
import { FilesInput } from "@/core/ui/FilesInput";
import { Input, Select, Textarea } from "@/core/ui/Input";
import { Button } from "@/core/ui/Button";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { photoOfDay } from "@/core/ui/property";
import { TICKET_CATEGORIES } from "@/modules/tickets/entity";

const ICON: Record<string, string> = {
  Carpenter: "🪚", "AC / cooling": "❄️", Electrical: "⚡", Plumbing: "🚿", Painter: "🎨", "Pest control": "🐜", Housekeeping: "🧹",
  "Kitchen equipment": "🍳", "IT / WiFi": "📶", Pool: "🏊", Garden: "🌿", Safety: "🧯", Other: "🔧",
};
const PLACES = ["Air cottage", "Water cottage", "Earth cottage", "Fire cottage", "Family room", "Camping tents", "Kitchen", "Restaurant", "Pool", "Lawn / garden", "Reception", "Washrooms", "Parking"];
const URGENCY = [
  { v: "Urgent", label: "Urgent", hint: "guest affected now", cls: "border-red-300 bg-red-50 text-red-700" },
  { v: "High", label: "Today", hint: "fix today", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  { v: "Medium", label: "This week", hint: "can wait a bit", cls: "border-slate-300 bg-slate-50 text-slate-700" },
  { v: "Low", label: "Whenever", hint: "small thing", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
];
const digits = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);

export function ReportIssue() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const me = (user.staff?.id as string | undefined) ?? null;
  const { rows: units } = useList("business-units");
  const { rows: vendors } = useList("service-vendors", { filter: { active: true } });
  const defaultUnit = user.unitId ?? (user.staff?.business_unit_id as string | undefined) ?? "";
  const [trade, setTrade] = useState<string>("");
  const [place, setPlace] = useState("");
  const [details, setDetails] = useState("");
  const [urgency, setUrgency] = useState("High");
  const [media, setMedia] = useState<FileItem[]>([]);
  const [vendorId, setVendorId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>(defaultUnit);
  const [busy, setBusy] = useState(false);
  const unit = unitId || String(units.find((u) => String(u.name).includes("Udaisarovar"))?.id ?? units[0]?.id ?? "");
  const options = useMemo(() => vendors.filter((v) => v.trade === trade).sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0)), [vendors, trade]);

  const submit = async () => {
    if (!trade) return toast("Choose what kind of repair it is", "error");
    if (!place && !details.trim()) return toast("Say where it is or what is wrong", "error");
    setBusy(true);
    try {
      const t = await getStore().create("tickets", {
        title: `${trade}${place ? ` – ${place}` : ""}${details.trim() ? `: ${details.trim().split("\n")[0].slice(0, 60)}` : ""}`,
        category: trade,
        business_unit_id: unit,
        location: place || null,
        priority: urgency,
        description: details.trim() || null,
        media,
        reported_by: me,
        vendor_id: vendorId || null,
        status: "Open",
      });
      toast("Issue reported — thank you! 🙏");
      router.push(viewHref("tickets", t.id));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const step = (n: number, title: string, done: boolean) => (
    <h2 className="mb-4 flex items-center gap-3 text-base font-semibold text-navy">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", done ? "bg-emerald-500 text-white" : "bg-navy text-white")}>{done ? <CheckCircle2 className="h-5 w-5" /> : n}</span>
      {title}
    </h2>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl text-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoOfDay(2).url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/80 to-navy/30" />
        <div className="relative p-6 sm:p-8">
          <p className="text-sm text-white/70">Keep The Udaisarovar perfect</p>
          <h1 className="mt-1 text-3xl font-bold">Report an issue</h1>
          <p className="mt-1 text-sm text-white/70">Choose the trade, add a photo or video, and pick who should fix it.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        {step(1, "What needs fixing?", !!trade)}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {TICKET_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => { setTrade(c); setVendorId(""); }}
              className={cn("flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-4 text-center text-xs font-semibold transition", trade === c ? "border-gold bg-gold/15 text-navy shadow" : "border-line text-slate-600 hover:border-navy/20 hover:bg-slate-50")}>
              <span className="text-3xl">{ICON[c] ?? "🔧"}</span>{c}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        {step(2, "Where, how urgent, and a photo or video", !!place || !!details)}
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {PLACES.map((p) => (
              <button key={p} type="button" onClick={() => setPlace(place === p ? "" : p)} className={cn("rounded-full border px-3 py-1.5 text-sm", place === p ? "border-navy bg-navy text-white" : "border-line text-slate-600 hover:bg-slate-50")}>{p}</button>
            ))}
          </div>
          <Input placeholder="Or type the exact place (e.g. Fire cottage bathroom)" value={place} onChange={(e) => setPlace(e.target.value)} />
          <Textarea rows={3} placeholder="What is wrong? (e.g. AC not cooling, door hinge broken, tap leaking)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {URGENCY.map((u) => (
              <button key={u.v} type="button" onClick={() => setUrgency(u.v)} className={cn("rounded-xl border-2 px-3 py-2.5 text-left", urgency === u.v ? u.cls : "border-line text-slate-500")}>
                <div className="text-sm font-semibold">{u.label}</div><div className="text-[11px] opacity-80">{u.hint}</div>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border-2 border-dashed border-gold/50 bg-gold/5 p-4">
            <p className="mb-3 text-sm font-medium text-navy">📸 Add photos or a video of the problem</p>
            <FilesInput value={media} onChange={setMedia} />
          </div>
          {!defaultUnit && units.length > 1 && (
            <Select value={unit} onChange={(e) => setUnitId(e.target.value)} className="max-w-xs">
              {units.map((u) => <option key={u.id} value={u.id}>{String(u.name)}</option>)}
            </Select>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        {step(3, trade ? `Who can fix it? · ${trade} options` : "Who can fix it?", !!vendorId)}
        {!trade ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Choose the trade above to see repair contacts.</p>
        ) : (
          <div className="space-y-3">
            {options.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">No {trade.toLowerCase()} saved yet. Add one so everyone can call them next time.</p>}
            {options.map((v) => (
              <label key={v.id} className={cn("flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border-2 px-4 py-3 transition", vendorId === v.id ? "border-gold bg-gold/10" : "border-line hover:bg-slate-50")}>
                <input type="radio" name="vendor" className="h-5 w-5 accent-navy" checked={vendorId === v.id} onChange={() => setVendorId(String(v.id))} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-navy">{String(v.name)}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                    {v.area ? <span>📍 {String(v.area)}</span> : null}
                    {v.visit_charge ? <span>💰 {String(v.visit_charge)}</span> : null}
                    {v.rating ? <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-gold text-gold" /> {String(v.rating)}</span> : null}
                  </div>
                </div>
                {digits(v.phone) && (
                  <span className="flex gap-2">
                    <a href={`tel:+91${digits(v.phone)}`} className="inline-flex items-center gap-1 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white"><Phone className="h-3.5 w-3.5" /> Call</a>
                    <a href={`https://wa.me/91${digits(v.phone)}?text=${encodeURIComponent(`Namaste, The Udaisarovar here. ${trade} work needed${place ? ` at ${place}` : ""}. ${details}`)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
                  </span>
                )}
              </label>
            ))}
            <Link href={newHref("service-vendors", { trade })} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"><Plus className="h-4 w-4" /> Add a {trade.toLowerCase()} contact</Link>
          </div>
        )}
      </section>

      <Button icon={Send} loading={busy} onClick={() => void submit()} className="w-full py-4 text-base">Report issue</Button>
    </div>
  );
}
