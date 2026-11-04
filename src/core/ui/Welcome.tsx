"use client";
/**
 * Greeting after every sign-in, in the style of the iPhone "hello" screen:
 *   "Good morning" is written out in a handwriting script, stroke by stroke,
 *   then the person's name appears at once in the same script,
 *   then their post, plain and straight away.
 * Shown after each sign-in and once each time the app is opened; fades into the app.
 * Tap anywhere to skip.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/core/auth/AuthProvider";
import { TIMEZONE } from "@/core/format";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const WRITE_MS = 1700; // greeting being written
const NAME_AT = WRITE_MS + 150;
const SHOW_MS = NAME_AT + 1900;
const FADE_MS = 700;

/**
 * By the clock in India:
 *   4:00 am – 11:59 am  Good morning
 *   12:00 pm – 4:59 pm  Good afternoon
 *   5:00 pm – 9:59 pm   Good evening
 *   10:00 pm – 3:59 am  Hello   (late night / night shift)
 */
export function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TIMEZONE }).format(now)) % 24;
  if (h >= 4 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 22) return "Good evening";
  return "Hello";
}

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';
const SCRIPT_FONT = '"JD Hello", "Snell Roundhand", "Segoe Script", cursive';

const fontFace = `@font-face{font-family:"JD Hello";src:url("${BASE}/fonts/sacramento.woff") format("woff");font-display:block;}`;

export function Welcome() {
  const user = useUser();
  const [phase, setPhase] = useState<"hidden" | "write" | "name" | "fade">("hidden");

  useEffect(() => {
    const key = `jdone.greeted.${user.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still greet */
    }
    let cancelled = false;
    const timers: number[] = [];
    const start = () => {
      if (cancelled) return;
      setPhase("write");
      timers.push(window.setTimeout(() => setPhase("name"), NAME_AT));
      timers.push(window.setTimeout(() => setPhase("fade"), SHOW_MS));
      timers.push(window.setTimeout(() => setPhase("hidden"), SHOW_MS + FADE_MS));
    };
    // Wait (briefly) for the script font so the greeting is never written in a fallback face.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      const guard = window.setTimeout(start, 900);
      fonts
        .load(`64px "JD Hello"`)
        .catch(() => undefined)
        .then(() => {
          window.clearTimeout(guard);
          start();
        });
    } else start();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [user.id]);

  if (phase === "hidden") return null;
  const post = user.post === "chairman" ? "Chairman" : user.post === "director" ? "Director" : String(user.staff?.designation ?? "");
  const showName = phase === "name" || phase === "fade";

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setPhase("hidden")}
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-white px-2 text-center text-[#1d1d1f] transition-opacity ease-out"
      style={{ opacity: phase === "fade" ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <style>{fontFace}</style>
      <span
        className="jd-write block whitespace-nowrap leading-[1.3]"
        style={{ fontFamily: SCRIPT_FONT, fontSize: "clamp(64px, 17vw, 156px)", padding: "0.28em 0.4em", WebkitTextStroke: "1.6px #1d1d1f", animationDuration: `${WRITE_MS}ms` }}
      >
        {greeting(new Date())}
      </span>
      <span
        className="-mt-3 block max-w-full leading-[1.3] transition-opacity duration-300"
        style={{ fontFamily: SCRIPT_FONT, fontSize: "clamp(42px, 10.5vw, 96px)", padding: "0.15em 0.3em", WebkitTextStroke: "1.1px #1d1d1f", opacity: showName ? 1 : 0 }}
      >
        {user.name}
      </span>
      {post && (
        <span
          className="mt-3 block text-[clamp(16px,2vw,20px)] tracking-[-0.01em] text-[#86868b]"
          style={{ fontFamily: SYSTEM_FONT, opacity: showName ? 1 : 0 }}
        >
          {post}
        </span>
      )}
    </div>
  );
}
