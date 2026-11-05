/**
 * ESC/POS receipt bytes for the small thermal POS printer (58 mm = 32 chars, 80 mm = 48 chars),
 * plus the three ways to reach it from a browser:
 *  - Bluetooth: Web Bluetooth (Chrome on Android / laptop) straight to a BLE thermal printer.
 *  - RawBT: the free Android "RawBT" print app — it forwards to Bluetooth, Wi-Fi/LAN (IP:9100), USB or a POS machine's built-in printer.
 *  - Browser: the normal print dialog (POS machines with a built-in printer service, e.g. Sunmi).
 */
import type { Row } from "@/core/schema/types";

export type PrintMethod = "bluetooth" | "rawbt" | "browser";
export interface PrinterSettings { method: PrintMethod; width: 58 | 80; auto: boolean; copies: 1 | 2 }
export const DEFAULT_SETTINGS: PrinterSettings = { method: "rawbt", width: 58, auto: true, copies: 1 };

const ESC = 0x1b, GS = 0x1d;
const ascii = (s: string) => s.replace(/₹/g, "Rs.").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\n]/g, "");
const pad = (l: string, r: string, w: number) => { const left = l.slice(0, Math.max(1, w - r.length - 1)); return left + " ".repeat(Math.max(1, w - left.length - r.length)) + r; };
const rs = (n: unknown) => "Rs." + Math.round(Number(n || 0)).toLocaleString("en-IN");

interface KotLine { name: string; qty: number; rate?: number; amount?: number }

/** Plain-text body of the KOT (also used for the browser print). */
export function kotText(k: Row, width: 58 | 80, title = "THE UDAISAROVAR"): { head: string[]; body: string[]; foot: string[] } {
  const w = width === 80 ? 48 : 32;
  const when = new Date(String(k.created_at ?? Date.now())).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const lines: KotLine[] = Array.isArray(k.lines) && k.lines.length ? (k.lines as KotLine[]) : String(k.items ?? "").split("\n").filter(Boolean).map((t) => {
    const m = t.match(/^\s*(\d+)\s*x\s*(.+)$/i); return { name: m ? m[2] : t, qty: m ? Number(m[1]) : 1 };
  });
  const rule = "-".repeat(w);
  const body = [rule, `${k.order_type ?? "Order"}: ${k.table_or_room ?? "-"}${k.pax ? `  Pax: ${k.pax}` : ""}`];
  if (k.guest_name) body.push(`Guest: ${k.guest_name}`);
  body.push(`Time: ${when}${k.source === "Guest app" ? "  (Guest App)" : ""}`, rule);
  for (const l of lines) {
    body.push(pad(`${l.qty} x ${l.name}`, l.amount != null ? rs(l.amount) : "", w));
  }
  body.push(rule);
  if (k.amount) body.push(pad("TOTAL (excl. 5% GST)", rs(k.amount), w));
  const foot: string[] = [];
  if (k.special_notes) foot.push(`NOTE: ${k.special_notes}`);
  return { head: [title, `KOT ${k.kot_no ?? ""}`], body: body.map(ascii), foot: foot.map(ascii) };
}

export function kotBytes(k: Row, s: PrinterSettings): Uint8Array {
  const t = kotText(k, s.width);
  const out: number[] = [];
  const txt = (str: string) => { for (const ch of ascii(str)) out.push(ch.charCodeAt(0)); out.push(0x0a); };
  for (let c = 0; c < s.copies; c++) {
    out.push(ESC, 0x40, ESC, 0x61, 1);            // init, centre
    txt(t.head[0]);
    out.push(GS, 0x21, 0x11); txt(t.head[1]); out.push(GS, 0x21, 0x00); // double size KOT no.
    out.push(ESC, 0x61, 0);                        // left
    t.body.forEach(txt);
    if (t.foot.length) { out.push(ESC, 0x45, 1); t.foot.forEach(txt); out.push(ESC, 0x45, 0); }
    out.push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0); // feed + cut (ignored by printers without a cutter)
  }
  return new Uint8Array(out);
}

export const toBase64 = (b: Uint8Array) => { let s = ""; b.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };

/* ---------- Bluetooth (Web Bluetooth, BLE printers) ---------- */
// Service UUIDs used by most cheap BLE thermal / POS printers.
const BT_SERVICES = ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455", "0000ff00-0000-1000-8000-00805f9b34fb", "0000ae30-0000-1000-8000-00805f9b34fb"];
type Char = { writeValue(b: BufferSource): Promise<void>; writeValueWithoutResponse?(b: BufferSource): Promise<void>; properties: { write: boolean; writeWithoutResponse: boolean } };
type BtDevice = { name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryServices(): Promise<{ getCharacteristics(): Promise<Char[]> }[]> }> } };
let btDevice: BtDevice | null = null;
let btChar: Char | null = null;

export const bluetoothSupported = () => typeof navigator !== "undefined" && "bluetooth" in navigator;
export const bluetoothName = () => btDevice?.name ?? null;

export async function bluetoothPair(): Promise<string> {
  const bt = (navigator as unknown as { bluetooth: { requestDevice(o: object): Promise<BtDevice> } }).bluetooth;
  btDevice = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  btChar = null;
  await bluetoothConnect();
  return btDevice.name ?? "Printer";
}

async function bluetoothConnect() {
  if (!btDevice?.gatt) throw new Error("Pair the Bluetooth printer first");
  if (btChar && btDevice.gatt.connected) return btChar;
  const server = await btDevice.gatt.connect();
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) { btChar = ch; return ch; }
    }
  }
  throw new Error("This Bluetooth device has no printer channel");
}

export async function bluetoothPrint(bytes: Uint8Array) {
  const ch = await bluetoothConnect();
  for (let i = 0; i < bytes.length; i += 180) {
    const part = bytes.slice(i, i + 180);
    if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(part);
    else await ch.writeValue(part);
    await new Promise((r) => setTimeout(r, 30));
  }
}

/* ---------- Browser print dialog ---------- */
export function browserPrint(k: Row, s: PrinterSettings) {
  const t = kotText(k, s.width);
  const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${s.width}mm auto;margin:2mm}body{font:12px/1.35 monospace;margin:0;width:${s.width - 4}mm}pre{margin:0;white-space:pre-wrap}h1{font-size:13px;text-align:center;margin:0}h2{font-size:20px;text-align:center;margin:2px 0}</style></head>
<body><h1>${esc(t.head[0])}</h1><h2>${esc(t.head[1])}</h2><pre>${esc(t.body.join("\n"))}</pre>${t.foot.length ? `<pre><b>${esc(t.foot.join("\n"))}</b></pre>` : ""}</body></html>`;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(f);
  f.contentDocument!.open(); f.contentDocument!.write(html); f.contentDocument!.close();
  setTimeout(() => { f.contentWindow!.print(); setTimeout(() => f.remove(), 2000); }, 200);
}
