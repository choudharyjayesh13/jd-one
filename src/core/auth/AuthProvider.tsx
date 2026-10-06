"use client";
/**
 * Auth context. Local mode: PIN gate, user is the owner (or "acting as" a
 * staff member chosen in Settings, to preview team views). Supabase mode:
 * email + password, role comes from the linked `staff` row. A signed-in
 * account without a staff row is a self sign-up waiting for HR approval:
 * its `signup_requests` row is created here from the sign-up metadata.
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

/** Supabase: signed in, but not (yet) a staff member — waiting for approval. */
export interface PendingSignup {
  email: string | null;
  name: string;
  status: "Pending" | "Approved" | "Rejected";
  note: string | null;
}

export interface SignUpInput {
  name: string;
  phone: string;
  email: string;
  password: string;
  designation: string;
  business_unit_id: string;
}

interface AuthState {
  mode: "local" | "supabase";
  loading: boolean;
  user: AuthUser | null;
  /** Local mode: whether a PIN has been set yet. */
  pinSet: boolean;
  /** Supabase: signed in but no staff row links to this account (sign-up awaiting approval). */
  pendingSignup: PendingSignup | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Supabase: create an account; returns true when the email must be confirmed first. */
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>;
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

/**
 * First sign-in without a staff row: record the sign-up request (from the
 * metadata given at sign-up) so HR can approve it. Idempotent: one row per auth user.
 */
async function ensureSignupRequest(authUserId: string, email: string | null, meta: Record<string, unknown>): Promise<PendingSignup> {
  const name = String(meta.name ?? meta.full_name ?? email ?? "New user");
  try {
    const store = getStore();
    const existing = (await store.list("signup-requests", { filter: { auth_user_id: authUserId } }))[0];
    if (existing) return { email, name: String(existing.name ?? name), status: (existing.status as PendingSignup["status"]) ?? "Pending", note: (existing.note as string | null) ?? null };
    const row = await store.create("signup-requests", {
      auth_user_id: authUserId,
      name,
      phone: (meta.phone as string | undefined) ?? null,
      email,
      designation: (meta.designation as string | undefined) ?? null,
      business_unit_id: (meta.business_unit_id as string | undefined) || null,
      status: "Pending",
      requested_at: new Date().toISOString(),
    });
    return { email, name: String(row.name ?? name), status: "Pending", note: null };
  } catch {
    // RLS or table missing (schema not updated yet): still show the pending screen.
    return { email, name, status: "Pending", note: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pinSet, setPinSet] = useState(false);
  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);

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
      type SessionUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | undefined;
      const resolve = async (su: SessionUser) => {
        if (!su) {
          setUser(null);
          setPendingSignup(null);
          return;
        }
        const email = su.email ?? null;
        const rows = await getStore().list("staff", { filter: { auth_user_id: su.id } });
        const staff = rows[0] ?? null;
        if (!staff) {
          setUser(null);
          setPendingSignup(await ensureSignupRequest(su.id, email, su.user_metadata ?? {}));
          return;
        }
        setPendingSignup(null);
        setUser(userFromStaff(su.id, email, staff));
      };
      const { data } = await client.auth.getSession();
      await resolve(data.session?.user);
      if (!cancelled) setLoading(false);
      const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
        void resolve(session?.user);
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
      pendingSignup,
      async signInWithPassword(email, password) {
        const client = getSupabaseClient();
        if (!client) throw new Error("Supabase is not configured");
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      async signUp(input) {
        const client = getSupabaseClient();
        if (!client) throw new Error("Supabase is not configured");
        const { data, error } = await client.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            // Bring staff back to the staff app (not the customer portal / Site URL) after confirming their email.
            emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/login/` : undefined,
            data: { name: input.name, phone: input.phone, designation: input.designation, business_unit_id: input.business_unit_id },
          },
        });
        if (error) throw new Error(error.message);
        // With "Confirm email" on, Supabase returns a user but no session until the link is clicked.
        return { needsEmailConfirmation: !data.session };
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
    [loading, user, pinSet, pendingSignup, loadLocalUser],
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
