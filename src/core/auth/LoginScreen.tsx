"use client";
/**
 * /login: PIN (local mode) or email + password (Supabase mode). Supabase mode
 * also offers "Create account" (self sign-up, approved by HR) and shows the
 * "Pending approval" screen for accounts that have no staff record yet.
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, LockKeyhole, LogIn, LogOut, RefreshCw, UserRoundPlus } from "lucide-react";
import { getSupabaseClient } from "@/core/data";
import { useAuth } from "./AuthProvider";
import { Button } from "@/core/ui/Button";
import { Input, Field, Select } from "@/core/ui/Input";
import { Loading } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";

type Unit = { id: string; name: string; short_code: string | null; active: boolean };

/** Business units for the sign-up form, read with the anon key (policy "anon read active units"). */
async function loadUnitsAnon(): Promise<Unit[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from("business_units").select("id,name,short_code,active").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Unit[];
}

export function LoginScreen() {
  const { mode, loading, user, pinSet, pendingSignup, signInWithPassword, signUp, unlockWithPin, createPin, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", designation: "", business_unit_id: "" });
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next.startsWith("/") ? next : "/");
  }, [loading, user, router, next]);

  useEffect(() => {
    if (mode !== "supabase" || tab !== "signup" || units.length) return;
    loadUnitsAnon().then(setUnits, (e: Error) => setUnitsError(e.message));
  }, [mode, tab, units.length]);

  if (loading) return <Loading />;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "local") {
        if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits");
        if (!pinSet) {
          if (pin !== pin2) throw new Error("PINs do not match");
          await createPin(pin);
        } else if (!(await unlockWithPin(pin))) throw new Error("Wrong PIN");
      } else if (tab === "signup") {
        if (!form.name.trim() || !form.email.trim() || !form.password) throw new Error("Name, email and password are required");
        if (form.password.length < 6) throw new Error("Password must be at least 6 characters");
        if (!form.business_unit_id) throw new Error("Choose your business unit");
        const { needsEmailConfirmation } = await signUp({ ...form, name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(), designation: form.designation.trim() });
        setDone(needsEmailConfirmation ? "Check your email to confirm, then sign in. Your account is activated once JD Group approves it." : "Account created. Your account is activated once JD Group approves it.");
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const header = (
    <div className="mb-6 flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold text-lg font-bold text-navy">JD</span>
      <div>
        <h1 className="text-lg font-semibold text-navy">JD One</h1>
        <p className="text-xs text-slate-500">JD Group staff app</p>
      </div>
    </div>
  );

  // Signed in, but not a staff member yet: waiting for HR.
  if (mode === "supabase" && pendingSignup) {
    const rejected = pendingSignup.status === "Rejected";
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          {header}
          <div className={cn("rounded-xl px-4 py-4 text-sm", rejected ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900")}>
            <div className="mb-1 flex items-center gap-2 text-base font-semibold">
              <Clock className="h-4 w-4" /> {rejected ? "Sign-up not approved" : "Pending approval"}
            </div>
            <p>
              Hi {pendingSignup.name.split(" ")[0]}. {rejected ? "JD Group did not approve this account." : "Your account is waiting for JD Group (HR) to approve it. We'll notify you — then just sign in again."}
            </p>
            {pendingSignup.note && <p className="mt-2 italic">“{pendingSignup.note}”</p>}
            {pendingSignup.email && <p className="mt-2 text-xs opacity-80">Signed in as {pendingSignup.email}</p>}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" icon={RefreshCw} className="flex-1" onClick={() => window.location.reload()}>
              Check again
            </Button>
            <Button variant="ghost" icon={LogOut} onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {header}

        {mode === "local" ? (
          <>
            <p className="mb-4 rounded-lg bg-gold/10 px-3 py-2 text-xs text-navy">
              <LockKeyhole className="mr-1 inline h-3.5 w-3.5" />
              Local mode – single device. {pinSet ? "Enter your 4-digit PIN." : "Set a 4-digit PIN to protect this device."}
            </p>
            <Field label={pinSet ? "PIN" : "New PIN"} required>
              <Input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus className="text-center tracking-[0.5em]" />
            </Field>
            {!pinSet && (
              <div className="mt-3">
                <Field label="Repeat PIN" required>
                  <Input type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} className="text-center tracking-[0.5em]" />
                </Field>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm">
              {(["signin", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setError(null);
                    setDone(null);
                  }}
                  className={cn("flex-1 rounded-md py-1.5 font-medium", tab === t ? "bg-white text-navy shadow-sm" : "text-slate-500")}
                >
                  {t === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
            {done ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">{done}</div>
            ) : tab === "signin" ? (
              <div className="space-y-3">
                <Field label="Email" required>
                  <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </Field>
                <Field label="Password" required>
                  <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="Full name" required>
                  <Input autoComplete="name" value={form.name} onChange={setF("name")} autoFocus />
                </Field>
                <Field label="Phone" required>
                  <Input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={setF("phone")} placeholder="98290 12345" />
                </Field>
                <Field label="Email" required>
                  <Input type="email" autoComplete="email" value={form.email} onChange={setF("email")} />
                </Field>
                <Field label="Password" required help="At least 6 characters">
                  <Input type="password" autoComplete="new-password" value={form.password} onChange={setF("password")} />
                </Field>
                <Field label="Designation" required>
                  <Input value={form.designation} onChange={setF("designation")} placeholder="Front office, Chef, Housekeeping…" />
                </Field>
                <Field label="Business unit" required error={unitsError ?? undefined}>
                  <Select value={form.business_unit_id} onChange={setF("business_unit_id")}>
                    <option value="">{units.length ? "Select…" : "Loading…"}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.short_code ? ` (${u.short_code})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="text-xs text-slate-500">Your account is activated once JD Group (HR) approves it.</p>
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!done && (
          <Button type="submit" icon={mode !== "local" && tab === "signup" ? UserRoundPlus : LogIn} loading={busy} className="mt-5 w-full">
            {mode === "local" ? (pinSet ? "Unlock" : "Set PIN & open") : tab === "signup" ? "Create account" : "Sign in"}
          </Button>
        )}
      </form>
    </div>
  );
}
