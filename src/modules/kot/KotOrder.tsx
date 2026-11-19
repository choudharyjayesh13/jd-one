"use client";
/** /kot-order: take a KOT by tapping dishes from the menu — quantities, rates and total filled in automatically. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Minus, Plus, Search, Send, Trash2, ChefHat, Printer } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Loading } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { formatMoney, todayISO } from "@/core/format";
import { listHref } from "@/core/routes";
import type { Row } from "@/core/schema/types";
import { KOT_TYPES } from "./entity";

interface Line { item_id: string; name: string; qty: number; rate: number }

export function KotOrder() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { rows: menu, loading } = useList("menu", { filter: { active: true } });
  const { rows: bookings } = useList("bookings", { filter: { status: "Checked-in" } });
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [head, setHead] = useState({ order_type: "Table", table_or_room: "", guest_name: "", pax: "", booking_id: "", special_notes: "" });
  const [saving, setSaving] = useState(false);

  if (loading) return <Loading />;
  const cats = [...new Set(menu.map((m) => String(m.category)))];
  const active = cat || cats[0] || "";
  const shown = menu.filter((m) => (q.trim() ? String(m.name).toLowerCase().includes(q.trim().toLowerCase()) : m.category === active));
  const qtyOf = (id: string) => lines.find((l) => l.item_id === id)?.qty ?? 0;
  const add = (m: Row, d: number) =>
    setLines((ls) => {
      const ex = ls.find((l) => l.item_id === m.id);
      if (!ex) return d > 0 ? [...ls, { item_id: m.id, name: String(m.name), qty: d, rate: Number(m.price) }] : ls;
      return ls.map((l) => (l.item_id === m.id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0);
    });
  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const inHouse = bookings.filter((b) => String(b.check_in) <= todayISO() && String(b.check_out) >= todayISO());

  const send = async () => {
    if (!lines.length) return toast("Add at least one dish", "error");
    if (!head.table_or_room.trim() && head.order_type !== "Takeaway") return toast("Enter the table or room", "error");
    setSaving(true);
    try {
      const unit = user.unitId ?? (menu[0]?.business_unit_id as string) ?? null;
      const b = inHouse.find((x) => x.id === head.booking_id);
      await getStore().create("kots", {
        order_type: head.order_type,
        table_or_room: head.table_or_room.trim() || null,
        guest_name: head.guest_name.trim() || (b ? String(b.guest_name) : null),
        pax: head.pax ? Number(head.pax) : null,
        booking_id: head.booking_id || null,
        items: lines.map((l) => `${l.qty} x ${l.name}`).join("\n"),
        lines: lines.map((l) => ({ ...l, amount: l.qty * l.rate })),
        special_notes: head.special_notes.trim() || null,
        amount: total,
        status: "New",
        taken_by: (user.staff?.id as string) ?? null,
        business_unit_id: unit,
      });
      toast(`KOT sent to kitchen · ${formatMoney(total)}`);
      router.push(listHref("kots"));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";
  return (
    <div className="mx-auto grid max-w-6xl gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-navy"><ChefHat className="h-6 w-6 text-gold" /> New KOT order</h1>
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dish…" className={cn(input, "pl-9")} /></div>
        {!q && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cats.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold", c === active ? "border-navy bg-navy text-white" : "border-line bg-white text-slate-600")}>{c}</button>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {shown.map((m) => {
            const n = qtyOf(m.id);
            return (
              <div key={m.id} className={cn("flex items-center justify-between gap-3 rounded-xl border bg-white p-3", n ? "border-amber-400 bg-amber-50" : "border-line")}>
                <div className="min-w-0">
                  <div className="truncate font-medium text-navy">{String(m.name)}</div>
                  <div className="text-sm text-slate-500">{formatMoney(m.price)}{m.description ? <span className="block truncate text-xs">{String(m.description)}</span> : null}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {n > 0 && <button type="button" onClick={() => add(m, -1)} className="rounded-lg border border-line bg-white p-1.5"><Minus className="h-4 w-4" /></button>}
                  {n > 0 && <b className="w-6 text-center">{n}</b>}
                  <button type="button" onClick={() => add(m, 1)} className="rounded-lg bg-navy p-1.5 text-white"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
          {!shown.length && <p className="text-sm text-slate-500">No dish found.</p>}
        </div>
      </section>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <select value={head.order_type} onChange={(e) => setHead({ ...head, order_type: e.target.value })} className={input}>{KOT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <input value={head.table_or_room} onChange={(e) => setHead({ ...head, table_or_room: e.target.value })} placeholder="Table / room no." className={input} />
            <input value={head.guest_name} onChange={(e) => setHead({ ...head, guest_name: e.target.value })} placeholder="Guest name" className={input} />
            <input value={head.pax} onChange={(e) => setHead({ ...head, pax: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Guests (pax)" className={input} />
          </div>
          {inHouse.length > 0 && (
            <select value={head.booking_id} onChange={(e) => setHead({ ...head, booking_id: e.target.value })} className={input}>
              <option value="">Not a room guest / walk-in</option>
              {inHouse.map((b) => <option key={b.id} value={b.id}>{String(b.guest_name)} · {String(b.unit_type ?? "")}</option>)}
            </select>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-navy">Order ({lines.reduce((s, l) => s + l.qty, 0)} items)</h2>
          {!lines.length && <p className="text-sm text-slate-500">Tap + on dishes to add them.</p>}
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.item_id} className="flex items-center gap-2 text-sm">
                <span className="w-7 font-semibold">{l.qty}×</span>
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <input type="number" min={0} value={l.rate} onChange={(e) => setLines((ls) => ls.map((x) => (x.item_id === l.item_id ? { ...x, rate: Number(e.target.value) || 0 } : x)))} className="w-20 rounded-lg border border-line px-2 py-1 text-right" title="Rate" />
                <span className="w-16 text-right font-medium">{formatMoney(l.qty * l.rate)}</span>
                <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.item_id !== l.item_id))} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <textarea value={head.special_notes} onChange={(e) => setHead({ ...head, special_notes: e.target.value })} rows={2} placeholder="Kitchen notes: less spicy, Jain, no onion…" className={cn(input, "mt-3")} />
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-lg font-bold text-navy"><span>Total</span><span>{formatMoney(total)}</span></div>
          <button type="button" disabled={saving} onClick={() => void send()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{saving ? "Sending…" : "Send to kitchen"}</button>
        </div>
      </aside>
    </div>
  );
}

/** Shown above the KOT list. */
export function KotListBanner() {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <Link href="/kot-order/" className="flex items-center justify-between gap-3 rounded-2xl bg-orange-500 px-5 py-4 font-semibold text-white shadow-sm hover:bg-orange-600">
        <span className="flex items-center gap-2"><ChefHat className="h-5 w-5" /> New order from menu</span><Plus className="h-5 w-5" />
      </Link>
      <Link href="/kot-print/" className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white px-5 py-4 font-semibold text-navy shadow-sm hover:bg-slate-50">
        <Printer className="h-5 w-5" /> Kitchen printer
      </Link>
    </div>
  );
}
