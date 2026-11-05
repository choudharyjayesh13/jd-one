"use client";
/**
 * HR → Employees → "Password" (Chairman and Director only).
 * Sets a new password for a team member's login, then shows it once so it can be copied or
 * sent on WhatsApp. Passwords are stored encrypted by Supabase, so the old one can never be
 * read back – only replaced. The database function jdone.admin_set_password() checks the post
 * again, and only the Chairman can change the Chairman's password.
 */
import { useState } from "react";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { getSupabaseClient } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Input } from "@/core/ui/Input";
import { useToast } from "@/core/ui/Toast";

function makePassword(): string {
  const words = ["Lake", "Sarovar", "Aravali", "Lotus", "Mewar", "Peacock", "Haveli", "Monsoon", "Jharokha", "Banyan"];
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `${words[a[0] % words.length]}@${1000 + (a[1] % 9000)}`;
}

export function PasswordDialog({ person, onClose }: { person: Row; onClose: () => void }) {
  const { toast } = useToast();
  const [pw, setPw] = useState(makePassword);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const name = String(person.name ?? "");
  const email = String(person.email ?? "");

  const save = async () => {
    setErr("");
    if (pw.trim().length < 8) return setErr("Use at least 8 characters.");
    const client = getSupabaseClient();
    if (!client) return setErr("Passwords can only be set in the live app.");
    setBusy(true);
    const { error } = await client.rpc("admin_set_password", { p_staff: person.id, p_password: pw.trim() });
    setBusy(false);
    if (error) return setErr(/function|schema cache/i.test(error.message) ? "The database step for passwords has not been run yet." : error.message);
    setSaved(pw.trim());
    toast(`New password saved for ${name}`, "success");
  };

  const message = `JD One login\nEmail: ${email}\nPassword: ${saved}\nOpen: https://app.myjdgroup.com`;
  return (
    <Dialog open onClose={onClose} title={`Password · ${name}`}>
      {!saved ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Login email: <span className="font-medium text-navy">{email || "—"}</span>
          </p>
          <Field label="New password" required help="The old password stays secret even from the app – it can only be replaced.">
            <div className="flex gap-2">
              <Input value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
              <Button variant="secondary" icon={RefreshCw} onClick={() => setPw(makePassword())} aria-label="Make another" />
            </div>
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button icon={KeyRound} loading={busy} onClick={() => void save()}>
              Save password
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-[#e7dcc4] bg-[#faf5ea] p-4 text-center">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">New password for {name}</p>
            <p className="mt-1 select-all font-mono text-2xl font-semibold text-navy">{saved}</p>
          </div>
          <p className="text-xs text-slate-500">Share it now – once you close this window it cannot be shown again. They can change it later from Account.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon={Copy} onClick={() => void navigator.clipboard?.writeText(message).then(() => toast("Copied", "success"))}>
              Copy
            </Button>
            {person.phone ? (
              <a
                className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-navy hover:bg-slate-50"
                href={`https://wa.me/${String(person.phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
              >
                Send on WhatsApp
              </a>
            ) : null}
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
