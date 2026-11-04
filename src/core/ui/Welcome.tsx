"use client";
/**
 * Greeting after every sign-in, in the style of the iPhone "hello" screen:
 * clean white, system font, the words drift in from a soft blur.
 *   Good morning
 *   Harish Bairwa
 *   General Manager
 * Shown after each sign-in and once each time the app is opened; fades into the app.
 * Tap anywhere to skip.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/core/auth/AuthProvider";
import { TIMEZONE } from "@/core/format";

const SHOW_MS = 2600;
const FADE_MS = 700;

function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TIMEZONE }).format(now)) % 24;
  if (h >= 4 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 22) return "Good evening";
  return "Hello";
}

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';

export function Welcome() {
  const user = useUser();
  const [phase, setPhase] = useState<"hidden" | "show" | "fade">("hidden");

  useEffect(() => {
    const key = `jdone.greeted.${user.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still greet */
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
  const post = user.post === "chairman" ? "Chairman" : user.post === "director" ? "Director" : String(user.staff?.designation ?? "");

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setPhase("hidden")}
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-white px-8 text-center text-[#1d1d1f] transition-opacity ease-out"
      style={{ opacity: phase === "fade" ? 0 : 1, transitionDuration: `${FADE_MS}ms`, fontFamily: SYSTEM_FONT }}
    >
      <span className="jd-hello text-[clamp(40px,7vw,68px)] font-semibold leading-[1.05] tracking-[-0.03em]">{greeting(new Date())}</span>
      <span className="jd-hello mt-3 text-[clamp(24px,3.6vw,34px)] font-medium leading-tight tracking-[-0.02em]" style={{ animationDelay: "0.25s" }}>
        {user.name}
      </span>
      {post && (
        <span className="jd-hello mt-2 text-[clamp(15px,1.8vw,18px)] font-normal tracking-[-0.01em] text-[#86868b]" style={{ animationDelay: "0.45s" }}>
          {post}
        </span>
      )}
    </div>
  );
}
