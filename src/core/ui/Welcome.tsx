"use client";
/**
 * Greeting after sign-in ("Good morning, Harish Bairwa"), like a phone's hello screen.
 * Shown once per app session for each signed-in person, then fades into the app.
 * Tap anywhere to skip.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/core/auth/AuthProvider";
import { BRAND_STORAGE_KEY, STAYS_PROPERTIES, findBrand } from "@/core/auth/brands";
import { TIMEZONE } from "@/core/format";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SHOW_MS = 2600;
const FADE_MS = 600;

function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TIMEZONE }).format(now)) % 24;
  if (h >= 4 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 22) return "Good evening";
  return "Hello";
}

export function Welcome() {
  const user = useUser();
  const [phase, setPhase] = useState<"hidden" | "show" | "fade">("hidden");
  const [property, setProperty] = useState(STAYS_PROPERTIES[0]!);

  useEffect(() => {
    const key = `jdone.greeted.${user.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
      setProperty(findBrand(window.localStorage.getItem(BRAND_STORAGE_KEY)) ?? STAYS_PROPERTIES[0]!);
    } catch {
      /* storage blocked: still greet once for this page */
    }
    setPhase("show");
    const t1 = window.setTimeout(() => setPhase("fade"), SHOW_MS);
    const t2 = window.setTimeout(() => setPhase("hidden"), SHOW_MS + FADE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [user.id]);

  if (phase === "hidden") return null;
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TIMEZONE }).format(now);
  const post = user.post === "chairman" ? "Chairman" : user.post === "director" ? "Director" : String(user.staff?.designation ?? "");

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setPhase("hidden")}
      className="jd-sans fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-7 bg-white px-6 text-center text-[#17140f] transition-opacity"
      style={{ opacity: phase === "fade" ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="jd-pop relative h-[120px] w-[120px]">
        <span className="jd-orbit gold" aria-hidden="true" />
        {property.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${BASE}/brands/${property.logo}`} alt="" className="block h-[120px] w-[120px] rounded-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${BASE}/icons/icon-512.png`} alt="" className="block h-[120px] w-[120px] rounded-full" />
        )}
      </div>
      <div className="jd-rise flex flex-col items-center gap-3" style={{ animationDelay: "0.15s" }}>
        <span className="jd-serif text-[clamp(26px,4vw,36px)] font-medium italic text-[#9a7128]">{greeting(now)},</span>
        <span className="jd-serif text-[clamp(34px,6vw,58px)] font-semibold leading-tight">{user.name}</span>
        <span className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#d7aa60]" />
          <span className="h-[7px] w-[7px] rotate-45 bg-[#d7aa60]" />
          <span className="h-px w-16 bg-gradient-to-r from-[#d7aa60] to-transparent" />
        </span>
        {post && <span className="text-[11px] uppercase tracking-[0.3em] text-[#17140f]">{post}</span>}
      </div>
      <span className="jd-rise text-xs uppercase tracking-[0.24em] text-[#6b6255]" style={{ animationDelay: "0.35s" }}>
        {property.name} · {day}
      </span>
    </div>
  );
}
