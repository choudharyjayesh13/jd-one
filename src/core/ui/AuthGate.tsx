"use client";
/**
 * Wraps every app page: redirects to /login until a user is present, then renders
 * the shell. A page whose module is set to "No access" in Team access shows a
 * notice instead of its content (the menu already hides it; this covers links).
 */
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/core/auth/AuthProvider";
import { moduleLevel } from "@/core/auth/access";
import { moduleForPath } from "@/core/departments";
import { AppShell } from "./AppShell";
import { Loading } from "./misc";
import { PasswordPrompt } from "@/core/auth/ChangePassword";

export function NoAccess() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
      <span className="text-[11px] uppercase tracking-[0.3em] text-[#9a7128]">No access</span>
      <h1 className="jd-serif text-3xl font-medium text-[#17140f]">This page is not part of your work</h1>
      <p className="text-sm font-light text-[#3a332a]">Ask the Chairman or the Director to give you access in Team access.</p>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login/?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user)
    return (
      <div className="jd-light jd-sans min-h-screen">
        <Loading label="Opening JD One…" />
      </div>
    );
  const key = moduleForPath(pathname);
  const blocked = key !== null && moduleLevel(key) === 0;
  return (
    <AppShell>
      <PasswordPrompt />
      {blocked ? <NoAccess /> : children}
    </AppShell>
  );
}
