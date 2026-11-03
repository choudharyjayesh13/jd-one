"use client";
/**
 * "Install app" support. Chrome/Android fires `beforeinstallprompt` once, early,
 * often before the screen that shows the Download button is on screen, so it is
 * caught here (from Providers) and kept for later. iPhone has no such event:
 * people add the app from Safari's Share menu, so we show the steps instead.
 */
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> };
export type Platform = "ios" | "android" | "other";

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function getInstallPrompt(): InstallEvent | null {
  return deferred;
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Opened from the home-screen icon (already installed). */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installed || iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with a touch screen.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Link opened inside WhatsApp / Instagram / Facebook: those browsers cannot install apps. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\//i.test(navigator.userAgent);
}

export async function runInstallPrompt(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  await e.prompt();
  const choice = e.userChoice ? await e.userChoice : { outcome: "accepted" as const };
  deferred = null;
  notify();
  return choice.outcome === "accepted";
}
