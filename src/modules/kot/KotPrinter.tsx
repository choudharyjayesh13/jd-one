"use client";
/**
 * /kot-print: keep this page open on the property's POS machine (or a phone next to the printer).
 * Every new KOT — taken by a waiter in JD One or ordered by a guest in the Guest App — is printed
 * automatically and stamped printed_at, so it never prints twice. Reprint / test print by hand.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Printer, RefreshCw, Volume2 } from "lucide-react";
import { getStore } from "@/core/data";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { formatMoney } from "@/core/format";
import type { Row } from "@/core/schema/types";
import {
  DEFAULT_SETTINGS, type PrinterSettings, type PrintMethod, kotBytes, toBase64,
  bluetoothSupported, bluetoothPair, bluetoothPrint, bluetoothName, browserPrint,
} from "./escpos";

const KEY = "jd-kot-printer";
const loadSettings = (): PrinterSettings => {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULT_SETTINGS; }
};
const METHODS: { id: PrintMethod; label: string; help: string }[] = [
  { id: "rawbt", label: "RawBT app (Bluetooth / Wi-Fi / built-in)", help: "Install the free “RawBT” app on this Android POS / phone, choose your printer in it once (Bluetooth, Wi-Fi IP or built-in), then every KOT goes straight to the printer." },
  { id: "bluetooth", label: "Bluetooth printer (direct)", help: "Chrome talks to a Bluetooth (BLE) thermal printer directly. Tap “Pair printer” once each time this page is opened." },
  { id: "browser", label: "Normal print dialog", help: "Uses the device’s own print service — e.g. POS machines with a built-in printer (Sunmi and similar)." },
];

function beep() {
  try {
    const a = new AudioContext(); const o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.25);
  } catch { /* no audio */ }
}

export function KotPrinter() {
  const { toast } = useToast();
  const [s, setS] = useState<PrinterSettings>(DEFAULT_SETTINGS);
  const [recent, setRecent] = useState<Row[]>([]);
  const [bt, setBt] = useState<string | null>(null);
  const [last, setLast] = useState<string>("");
  const busy = useRef(false);
  const sRef = useRef(s);

  useEffect(() => { const v = loadSettings(); sRef.current = v; queueMicrotask(() => setS(v)); }, []);
  const save = (patch: Partial<PrinterSettings>) => {
    const v = { ...s, ...patch }; setS(v); sRef.current = v;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
  };

  const printOne = useCallback(async (k: Row, cfg: PrinterSettings) => {
    if (cfg.method === "bluetooth") await bluetoothPrint(kotBytes(k, cfg));
    else if (cfg.method === "rawbt") window.location.href = "rawbt:base64," + toBase64(kotBytes(k, cfg));
    else browserPrint(k, cfg);
  }, []);

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const store = getStore();
      const rows = await store.list("kots", { sort: { field: "created_at", dir: "desc" }, limit: 15 });
      setRecent(rows);
      const cfg = sRef.current;
      const todo = rows.filter((r) => !r.printed_at && r.status !== "Cancelled").reverse();
      if (todo.length) beep();
      if (!cfg.auto) return;
      for (const k of todo) {
        if (cfg.method === "bluetooth" && !bluetoothName()) break; // wait until the printer is paired
        await printOne(k, cfg);
        await store.update("kots", k.id, { printed_at: new Date().toISOString() });
        setLast(`${k.kot_no} printed`);
        if (cfg.method !== "bluetooth") break; // app / dialog printing: one per round
      }
    } catch (e) {
      setLast("Printer: " + (e as Error).message);
    } finally {
      busy.current = false;
    }
  }, [printOne]);

  useEffect(() => {
    const first = setTimeout(() => void poll(), 0);
    const t = setInterval(() => void poll(), 6000);
    let lock: { release(): Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => { clearTimeout(first); clearInterval(t); void lock?.release(); };
  }, [poll]);

  const manual = async (k: Row) => {
    try {
      await printOne(k, s);
      if (!k.printed_at) await getStore().update("kots", k.id, { printed_at: new Date().toISOString() });
      toast(`${k.kot_no} sent to printer`);
      void poll();
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const test = () => manual({ id: "", updated_at: "", printed_at: "test", kot_no: "TEST", order_type: "Table", table_or_room: "T1", guest_name: "Printer test", created_at: new Date().toISOString(), items: "1 x Masala chai\n2 x Veg sandwich", amount: 0, special_notes: "If you can read this, the printer works." } as Row);
  const pair = async () => {
    try { setBt(await bluetoothPair()); toast("Printer paired"); } catch (e) { toast((e as Error).message, "error"); }
  };

  const box = "rounded-2xl border border-line bg-white p-4 shadow-sm";
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-navy"><Printer className="h-6 w-6 text-gold" /> Kitchen printer</h1>
      <p className="text-sm text-slate-600">Keep this page open on the POS machine. New orders from waiters and from the Guest App print here automatically. The screen stays on while this page is open.</p>

      <section className={cn(box, "space-y-3")}>
        <h2 className="font-semibold text-navy">1 · How is the printer connected?</h2>
        {METHODS.map((m) => (
          <label key={m.id} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3", s.method === m.id ? "border-orange-400 bg-orange-50" : "border-line")}>
            <input type="radio" name="method" checked={s.method === m.id} onChange={() => save({ method: m.id })} className="mt-1" />
            <span><b className="block text-navy">{m.label}</b><span className="text-sm text-slate-600">{m.help}</span></span>
          </label>
        ))}
        {s.method === "bluetooth" && (
          bluetoothSupported()
            ? <button type="button" onClick={() => void pair()} className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2 font-semibold text-white"><Bluetooth className="h-4 w-4" />{bt ? `Paired: ${bt} · pair again` : "Pair printer"}</button>
            : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This browser has no Bluetooth. Open this page in Chrome on Android, or use the RawBT option.</p>
        )}
        {s.method === "rawbt" && <a href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter" target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-orange-600 underline">Get RawBT on Google Play</a>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Paper
            <select value={s.width} onChange={(e) => save({ width: Number(e.target.value) as 58 | 80 })} className="rounded-lg border border-line px-2 py-1"><option value={58}>58 mm (small)</option><option value={80}>80 mm (wide)</option></select></label>
          <label className="flex items-center gap-2">Copies
            <select value={s.copies} onChange={(e) => save({ copies: Number(e.target.value) as 1 | 2 })} className="rounded-lg border border-line px-2 py-1"><option value={1}>1</option><option value={2}>2 (kitchen + service)</option></select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.auto} onChange={(e) => save({ auto: e.target.checked })} /> Print new orders automatically</label>
        </div>
        <button type="button" onClick={() => void test()} className="rounded-xl border border-line px-4 py-2 font-semibold text-navy">Test print</button>
      </section>

      <section className={box}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-navy">2 · Latest orders</h2>
          <button type="button" onClick={() => void poll()} className="flex items-center gap-1 text-sm text-slate-500"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
        {last && <p className="mb-2 flex items-center gap-1 text-xs text-slate-500"><Volume2 className="h-3 w-3" />{last}</p>}
        <ul className="divide-y divide-line">
          {recent.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <b className="text-navy">{String(k.kot_no)}</b> · {String(k.table_or_room ?? k.order_type ?? "")}
                {k.source === "Guest app" && <span className="ml-1 rounded-full bg-sky-100 px-2 text-xs text-sky-700">Guest App</span>}
                <span className="block truncate text-slate-500">{String(k.items ?? "").replace(/\n/g, " · ")}</span>
              </div>
              <span className="text-right text-xs text-slate-500">{k.amount ? formatMoney(k.amount) : ""}<br />{k.printed_at ? "✓ printed" : <b className="text-orange-600">not printed</b>}</span>
              <button type="button" onClick={() => void manual(k)} className="rounded-lg bg-orange-500 px-3 py-1.5 font-semibold text-white">{k.printed_at ? "Reprint" : "Print"}</button>
            </li>
          ))}
          {!recent.length && <li className="py-3 text-sm text-slate-500">No orders yet.</li>}
        </ul>
      </section>
    </div>
  );
}
