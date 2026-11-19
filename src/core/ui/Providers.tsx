"use client";
/** Client-side providers + PWA service worker registration + first-run demo seed. */
import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/core/auth/AuthProvider";
import { ToastProvider } from "./Toast";
import { ensureSeeded } from "@/core/data/demo";
import { captureInstallPrompt } from "./install";

// Catch Chrome's "install app" offer as early as possible (it fires once per page load).
captureInstallPrompt();

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    void ensureSeeded();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => undefined);
    }
  }, []);
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
