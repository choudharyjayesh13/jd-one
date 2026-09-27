"use client";
/** Wraps every app page: redirects to /login until a user is present, then renders the shell. */
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/core/auth/AuthProvider";
import { AppShell } from "./AppShell";
import { Loading } from "./misc";

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login/?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <Loading label="Opening JD One…" />;
  return <AppShell>{children}</AppShell>;
}
