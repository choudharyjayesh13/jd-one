"use client";
/** /login: PIN (local mode) or email + password (Supabase mode). */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, LogIn } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Button } from "@/core/ui/Button";
import { Input, Field } from "@/core/ui/Input";
import { Loading } from "@/core/ui/misc";

export function LoginScreen() {
  const { mode, loading, user, pinSet, unlinkedEmail, signInWithPassword, unlockWithPin, createPin, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next.startsWith("/") ? next : "/");
  }, [loading, user, router, next]);

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
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold text-lg font-bold text-navy">JD</span>
          <div>
            <h1 className="text-lg font-semibold text-navy">JD One</h1>
            <p className="text-xs text-slate-500">JD Group staff app</p>
          </div>
        </div>

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
            {unlinkedEmail && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {unlinkedEmail} is signed in but not linked to any staff record. Ask the owner to add you under Staff with this email / user id.
                <button type="button" className="ml-2 underline" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            )}
            <div className="space-y-3">
              <Field label="Email" required>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </Field>
              <Field label="Password" required>
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <Button type="submit" icon={LogIn} loading={busy} className="mt-5 w-full">
          {mode === "local" ? (pinSet ? "Unlock" : "Set PIN & open") : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
