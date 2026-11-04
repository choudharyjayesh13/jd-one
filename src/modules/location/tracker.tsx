"use client";
/**
 * Duty location (only for staff the Chairman / Director switched on, e.g. the purchaser).
 * Works inside the JD One Android app, which has a background-location plugin: from check-in
 * to check-out the phone's position is saved every few minutes, even with the screen locked
 * (Android shows a "JD One · duty location on" notification the whole time).
 * In a normal browser nothing is tracked; the person sees a note to use the Android app.
 */
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { calendarTodayISO } from "@/core/format";
import { useList } from "@/core/ui/hooks";

type Loc = { latitude: number; longitude: number; accuracy?: number; speed?: number | null; time?: number | null };
type Watcher = {
  addWatcher(o: Record<string, unknown>, cb: (l?: Loc, e?: { code?: string; message?: string }) => void): Promise<string>;
  removeWatcher(o: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
};

const SAVE_EVERY_MS = 3 * 60 * 1000; // at most one point every 3 minutes…
const SAVE_IF_MOVED_M = 150; // …unless they moved this far

function plugin(): Watcher | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; registerPlugin?: (n: string) => unknown; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return ((cap.Plugins?.BackgroundGeolocation as Watcher | undefined) ?? (cap.registerPlugin?.("BackgroundGeolocation") as Watcher | undefined)) || null;
}
export const inAndroidApp = () => plugin() !== null;

function metres(a: Loc, b: Loc) {
  const R = 6371000;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLa = r(b.latitude - a.latitude);
  const dLo = r(b.longitude - a.longitude);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// One watcher for the whole app (pages remount; the watcher must not).
let watcherId: string | null = null;
let starting = false;
let staffId: string | null = null;
let last: { loc: Loc; at: number } | null = null;
let status: "off" | "on" | "denied" = "off";
const listeners = new Set<() => void>();
const setStatus = (s: typeof status) => {
  status = s;
  listeners.forEach((f) => f());
};

async function save(loc: Loc) {
  if (!staffId) return;
  const now = Date.now();
  if (last && now - last.at < SAVE_EVERY_MS && metres(last.loc, loc) < SAVE_IF_MOVED_M) return;
  last = { loc, at: now };
  try {
    await getStore().create("location-pings", {
      staff_id: staffId,
      at: new Date(loc.time ?? now).toISOString(),
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy_m: loc.accuracy != null ? Math.round(loc.accuracy) : null,
      speed_kmh: loc.speed != null ? Math.round(loc.speed * 3.6 * 10) / 10 : null,
    });
  } catch {
    last = null; // try again with the next point (no network in the market, etc.)
  }
}

async function start(id: string) {
  const p = plugin();
  staffId = id;
  if (!p || watcherId || starting) return;
  starting = true;
  try {
    watcherId = await p.addWatcher(
      { backgroundTitle: "JD One · duty location on", backgroundMessage: "Shared with JD Group until you check out.", requestPermissions: true, stale: false, distanceFilter: 30 },
      (loc, err) => {
        if (err) {
          if (err.code === "NOT_AUTHORIZED") setStatus("denied");
          return;
        }
        if (loc) {
          setStatus("on");
          void save(loc);
        }
      },
    );
    setStatus("on");
  } catch {
    setStatus("denied");
  } finally {
    starting = false;
  }
}

async function stop() {
  const p = plugin();
  if (p && watcherId) await p.removeWatcher({ id: watcherId }).catch(() => undefined);
  watcherId = null;
  last = null;
  setStatus("off");
}

function onDuty(att: Row | undefined) {
  if (!att) return false;
  return (!!att.checked_in_at && !att.checked_out_at) || (!!att.shift2_in_at && !att.shift2_out_at);
}

/** Mounted once in the app shell. Shows a thin strip only for staff with duty location on. */
export function LocationTracker() {
  const user = useUser();
  const me = user.staff?.id ?? null;
  const { rows: meRows } = useList(me ? "staff" : null, { filter: { id: me } });
  const tracked = meRows[0]?.track_location === true;
  const { rows: att } = useList(me && tracked ? "attendance" : null, { filter: { staff_id: me, date: calendarTodayISO() } });
  const duty = onDuty(att[0]);
  const native = inAndroidApp();
  const [, force] = useState(0);

  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);

  useEffect(() => {
    if (!me || !native) return;
    if (tracked && duty) void start(me);
    else if (watcherId) void stop();
  }, [me, native, tracked, duty]);

  if (!tracked || !duty) return null;
  if (!native)
    return (
      <div className="print:hidden border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
        Your duty location is shared through the <b className="font-semibold">JD One Android app</b>. Please open JD One from the app on your phone, not the browser.
      </div>
    );
  if (status === "denied")
    return (
      <button type="button" onClick={() => void plugin()?.openSettings()} className="print:hidden block w-full border-b border-red-200 bg-red-50 px-4 py-1.5 text-center text-xs text-red-800">
        Location is not allowed. Tap here, then Permissions → Location → <b>Allow</b>.
      </button>
    );
  return (
    <div className="print:hidden flex items-center justify-center gap-1.5 border-b border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] text-emerald-800">
      <MapPin className="h-3.5 w-3.5" /> Duty location on · shared with JD Group until you check out
    </div>
  );
}
