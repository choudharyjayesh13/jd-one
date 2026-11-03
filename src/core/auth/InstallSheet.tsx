"use client";
/**
 * "Download app" for staff: the ⋮ menu on the sign-in screens and the button
 * under JD Stays & Hospitality open this sheet. Android gets a one-tap install
 * when Chrome offers it (steps otherwise); iPhone gets the Safari steps.
 */
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/core/ui/cn";
import { detectPlatform, getInstallPrompt, isInAppBrowser, isInstalled, onInstallChange, runInstallPrompt, type Platform } from "@/core/ui/install";

const APP_URL = "https://app.myjdgroup.com";

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 10-.66-.38l-1.86 3.22A11.4 11.4 0 0012 8.1c-1.77 0-3.43.37-4.92 1.04L5.22 5.92a.38.38 0 10-.66.38L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.37-3.65zM14.1 5.84c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.76-.95 2.79 1.01.08 2.04-.51 2.67-1.27z" />
    </svg>
  );
}

function Step({ n, title, hi }: { n: number; title: ReactNode; hi: string }) {
  return (
    <li className="flex gap-4 border-t border-[#e7e1d5] py-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d7aa60] text-sm text-[#9a7128]">{n}</span>
      <span className="flex flex-col gap-1">
        <span className="text-[15px] text-[#17140f]">{title}</span>
        <span className="text-[13px] text-[#6b6255]">{hi}</span>
      </span>
    </li>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(APP_URL).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="min-h-11 rounded-[4px] border border-[#d9d1c2] px-4 text-xs uppercase tracking-[0.2em] text-[#17140f] hover:border-[#d7aa60]"
    >
      {copied ? "Link copied ✓" : "Copy link"}
    </button>
  );
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform>("android");
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p === "ios" ? "ios" : "android");
    setInApp(isInAppBrowser());
    const sync = () => {
      setCanPrompt(!!getInstallPrompt());
      setInstalled(isInstalled());
    };
    sync();
    return onInstallChange(sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tab = (p: Platform, label: string, icon: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={platform === p}
      onClick={() => setPlatform(p)}
      className={cn(
        "flex min-h-[52px] flex-1 items-center justify-center gap-2.5 rounded-[4px] border text-sm tracking-[0.08em]",
        platform === p ? "border-[#17140f] bg-[#17140f] font-medium text-white" : "border-[#d9d1c2] text-[#3a332a] hover:border-[#cfc6b4]",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17140f]/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Download JD One"
        className="jd-rise max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[22px] border border-[#d7aa60]/40 bg-white px-6 pb-8 pt-6 text-[#17140f] sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icons/icon-192.png`} alt="" className="h-14 w-14 rounded-2xl" />
            <div className="flex flex-col gap-1">
              <span className="jd-serif text-2xl font-semibold uppercase tracking-[0.16em]">JD One</span>
              <span className="text-[11px] uppercase tracking-[0.28em] text-[#9a7128]">Download the app</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d9d1c2] text-xl text-[#3a332a] hover:text-[#17140f]">
            ×
          </button>
        </div>

        {installed ? (
          <p className="rounded-[4px] border border-[#d7aa60] px-4 py-4 text-sm">
            JD One is already installed on this phone. Open it from your home screen.
            <span className="mt-1 block text-[#6b6255]">JD One इस फ़ोन में पहले से है — होम स्क्रीन से खोलें।</span>
          </p>
        ) : (
          <>
            <div role="tablist" aria-label="Phone type" className="mb-5 flex gap-2.5">
              {tab("android", "Android", <AndroidIcon />)}
              {tab("ios", "iPhone", <AppleIcon />)}
            </div>

            {inApp && (
              <div className="mb-4 flex flex-col gap-3 rounded-[4px] border border-[#d7aa60]/60 px-4 py-3 text-sm">
                <span>
                  You opened this link inside WhatsApp. Open it in {platform === "ios" ? "Safari" : "Chrome"} to install.
                  <span className="mt-1 block text-[#6b6255]">
                    WhatsApp के अंदर से ऐप इंस्टॉल नहीं होता — ऊपर ⋮ या शेयर से “{platform === "ios" ? "Open in Safari" : "Open in Chrome"}” चुनें।
                  </span>
                </span>
                <CopyLink />
              </div>
            )}

            {platform === "android" ? (
              <div className="flex flex-col gap-2">
                {canPrompt && (
                  <button
                    type="button"
                    onClick={() => void runInstallPrompt()}
                    className="jd-gold-btn mb-3 min-h-[54px] rounded-[4px] text-[13px] font-medium uppercase tracking-[0.26em]"
                  >
                    Install JD One
                  </button>
                )}
                <ol className="flex flex-col">
                  <Step n={1} title="Open app.myjdgroup.com in Chrome" hi="यह लिंक Chrome में खोलें" />
                  <Step
                    n={2}
                    title={
                      <>
                        Tap <b className="font-medium">⋮</b> (top right) → <b className="font-medium">Install app</b> or <b className="font-medium">Add to Home screen</b>
                      </>
                    }
                    hi="ऊपर दाईं ओर ⋮ दबाएँ → “Install app” या “Add to Home screen”"
                  />
                  <Step n={3} title="Tap Install — JD One appears on your home screen" hi="Install दबाएँ — JD One का आइकन होम स्क्रीन पर आ जाएगा" />
                </ol>
              </div>
            ) : (
              <ol className="flex flex-col">
                <Step n={1} title="Open app.myjdgroup.com in Safari" hi="यह लिंक Safari में खोलें (WhatsApp के अंदर नहीं)" />
                <Step
                  n={2}
                  title={
                    <>
                      Tap the <b className="font-medium">Share</b> button <span aria-hidden="true">(□↑)</span> at the bottom
                    </>
                  }
                  hi="नीचे Share बटन (□↑) दबाएँ"
                />
                <Step
                  n={3}
                  title={
                    <>
                      Scroll down, tap <b className="font-medium">Add to Home Screen</b>, then <b className="font-medium">Add</b>
                    </>
                  }
                  hi="नीचे स्क्रॉल करें → “Add to Home Screen” → “Add”"
                />
              </ol>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#e7e1d5] pt-5">
              <span className="text-sm text-[#6b6255]">Share with staff: app.myjdgroup.com</span>
              <CopyLink />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
