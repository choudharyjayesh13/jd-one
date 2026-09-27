"use client";
/**
 * Auth context. Local mode: PIN gate, user is the owner (or "acting as" a
 * staff member chosen in Settings, to preview team views). Supabase mode:
 * email + password, role comes from the linked `staff` row.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role, Row } from "@/core/schema/types";
import { getStore, getSupabaseClient, storeKind } from "@/core/data";
import { hasPin, isUnlocked, markUnlocked, setPin as savePin, verifyPin } from "./pin";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  role: Role;
  /** Linked staff record (null in local mode unless "acting as" is set). */
  staff: Row | null;
  /** Business unit the user is scoped to; null = all units (owner/manager). */
  unitId: string | null;
}

interface AuthState {
  mode: "local" | "supabase";
  loading: boolean;
  user: AuthUser | null;
  /** Local mode: whether a PIN has been set yet. */
  pinSet: boolean;
  /** Supabase: signed in but no staff row links to this account. */
  unlinkedEmail: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  createPin: (pin: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Local mode only: preview the app as a staff member (null = owner). */
  actAs: (staffId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const ACT_AS_KEY = "jdone.actAs";

const localOwner: AuthUser = { id: "local-owner", email: null, name: "Owner (this device)", role: "owner", staff: null, unitId: null };

function userFromStaff(id: string, email: string | null, staff: Row | null): AuthUser {
  const role = ((staff?.role as Role) ?? "staff") as Role;
  const scoped = role !== "owner" && role !== "manager";
  return {
    id,
    email,
    name: (staff?.name as string) ?? email ?? "Staff",
    role,
    staff,
    unitId: scoped ? ((staff?.business_unit_id as string) ?? null) : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pinSet, setPinSet] = useState(false);
  const [unlinkedEmail, setUnlinkedEmail] = useState<string | null>(null);

  const loadLocalUser = useCallback(async () => {
    const actAs = localStorage.getItem(ACT_AS_KEY);
    if (!actAs) return localOwner;
    const staff = await getStore().get("staff", actAs);
    return staff ? userFromStaff(`local-${staff.id}`, null, staff) : localOwner;
  }, []);

  // Boot: restore session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (storeKind === "local") {
        setPinSet(hasPin());
        if (isUnlocked()) setUser(await loadLocalUser());
        if (!cancelled) setLoading(false);
        return;
      }
      const client = getSupabaseClient()!;
      const resolve = async (sessionUserId: string | undefined, email: string | null) => {
        if (!sessionUserId) {
          setUser(null);
          setUnlinkedEmail(null);
          return;
        }
        const rows = await getStore().list("staff", { filter: { auth_user_id: sessionUserId } });
        const staff = rows[0] ?? null;
        if (!staff) {
          setUser(null);
          setUnlinkedEmail(email);
          return;
        }
        setUnlinkedEmail(null);
        setUser(userFromStaff(sessionUserId, email, staff));
      };
      const { data } = await client.auth.getSession();
      await resolve(data.session?.user.id, data.session?.user.email ?? null);
      if (!cancelled) setLoading(false);
      const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
        void resolve(session?.user.id, session?.user.email ?? null);
      });
      return () => sub.subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLocalUser]);

  const value = useMemo<AuthState>(
    () => ({
      mode: storeKind,
      loading,
      user,
      pinSet,
      unlinkedEmail,
      async signInWithPassword(email, password) {
        const client = getSupabaseClient();
        if (!client) throw new Error("Supabase is not configured");
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      async unlockWithPin(pin) {
        const ok = await verifyPin(pin);
        if (ok) {
          markUnlocked(true);
          setUser(await loadLocalUser());
        }
        return ok;
      },
      async createPin(pin) {
        await savePin(pin);
        setPinSet(true);
        markUnlocked(true);
        setUser(await loadLocalUser());
      },
      async signOut() {
        if (storeKind === "local") {
          markUnlocked(false);
          setUser(null);
          return;
        }
        await getSupabaseClient()?.auth.signOut();
        setUser(null);
      },
      async actAs(staffId) {
        if (staffId) localStorage.setItem(ACT_AS_KEY, staffId);
        else localStorage.removeItem(ACT_AS_KEY);
        setUser(await loadLocalUser());
      },
    }),
    [loading, user, pinSet, unlinkedEmail, loadLocalUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Current user, guaranteed (pages behind the auth gate). */
export function useUser(): AuthUser {
  const { user } = useAuth();
  return user ?? localOwner;
}
