"use client";
/** Client-side providers + PWA service worker registration + first-run demo seed. */
import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/core/auth/AuthProvider";
import { ToastProvider } from "./Toast";
import { ensureSeeded } from "@/core/data/demo";

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
