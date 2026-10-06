"use client";
/**
 * Password change for every signed-in user (Supabase mode).
 * - <ChangePasswordForm/>: used on /account/ any time.
 * - <PasswordPrompt/>: shown after sign-in while user_metadata.must_change_password is true
 *   (accounts created with the starting password). It can be postponed twice; on the
 *   third sign-in the change is required.
 */
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { getSupabaseClient, storeKind } from "@/core/data";
import { Button } from "@/core/ui/Button";
import { Field, Input } from "@/core/ui/Input";
import { useToast } from "@/core/ui/Toast";

const MAX_POSTPONES = 2;

export function ChangePasswordForm({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    if (pw === "jdgroup2026") return setErr("Choose a new password, not the starting one.");
    if (pw !== pw2) return setErr("The two passwords do not match.");
    setBusy(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error("Sign-in is not configured");
      const { error } = await client.auth.updateUser({ password: pw, data: { must_change_password: false, password_changed_at: new Date().toISOString() } });
      if (error) throw new Error(error.message);
      setPw(""); setPw2("");
      toast("Password changed — use it next time you sign in", "success");
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={compact ? "space-y-3" : "max-w-sm space-y-3"}>
      <Field label="New password" required>
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Type it again" required>
        <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button icon={KeyRound} loading={busy} onClick={() => void save()}>Change password</Button>
    </div>
  );
}

export function PasswordPrompt() {
  const [state, setState] = useState<{ show: boolean; postponed: number }>({ show: false, postponed: 0 });
  useEffect(() => {
    if (storeKind !== "supabase") return;
    const client = getSupabaseClient();
    void client?.auth.getUser().then(({ data }) => {
      const md = (data.user?.user_metadata ?? {}) as { must_change_password?: boolean; password_prompt_postponed?: number };
      if (!md.must_change_password) return;
      // Count each new browser session as one sign-in.
      const key = `jd-pw-prompt-${data.user!.id}`;
      const postponed = md.password_prompt_postponed ?? 0;
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
        }
      } catch { /* private mode */ }
      setState({ show: true, postponed });
    });
  }, []);
  if (!state.show) return null;
  const left = MAX_POSTPONES - state.postponed;
  const later = async () => {
    const client = getSupabaseClient();
    await client?.auth.updateUser({ data: { password_prompt_postponed: state.postponed + 1 } });
    setState({ show: false, postponed: state.postponed + 1 });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Set your own password</h2>
        <p className="mt-1 text-sm text-slate-600">
          You signed in with the starting password. Please choose your own so nobody else can use your login.
        </p>
        <div className="mt-4">
          <ChangePasswordForm compact onDone={() => setState({ ...state, show: false })} />
        </div>
        {left > 0 ? (
          <button type="button" onClick={() => void later()} className="mt-4 text-sm text-slate-500 underline">
            Later ({left} {left === 1 ? "time" : "times"} left)
          </button>
        ) : (
          <p className="mt-4 text-sm font-medium text-amber-700">Changing your password is now required to continue.</p>
        )}
      </div>
    </div>
  );
}
