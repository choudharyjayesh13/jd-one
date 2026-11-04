"use client";
/**
 * "Database update pending": the app's newer departments need tables that are
 * created by one SQL file. Until it has been run, the Chairman and the Director
 * see a gold strip at the top, and /setup-database/ walks them through it:
 * copy → open Supabase → paste → Run → check again.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getStore, storeKind } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { Button } from "./Button";
import { PageHeader } from "./misc";
import { useToast } from "./Toast";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SQL_URL = `${BASE}/setup/jd-one-database-update.sql`;
const SUPABASE_SQL_EDITOR = "https://supabase.com/dashboard/project/cyimbgjzxxxszjadxpgv/sql/new";
/** One table from each update; if any is missing, the update has not been (fully) run. */
const PROBES = ["org-posts", "staff-access", "vouchers", "indents", "linen-logs", "recipes", "service-schedules", "dept-reports", "night-audits", "home-cards", "shift-roster", "leave-requests"];

export function useDbUpdateNeeded(): { needed: boolean | null; recheck: () => Promise<void> } {
  const [needed, setNeeded] = useState<boolean | null>(null);
  const recheck = useCallback(async () => {
    if (storeKind !== "supabase") return setNeeded(false);
    const store = getStore();
    const results = await Promise.all(PROBES.map((e) => store.list(e, { limit: 1 }).then(() => true, () => false)));
    setNeeded(results.some((ok) => !ok));
  }, []);
  useEffect(() => {
    void recheck();
  }, [recheck]);
  return { needed, recheck };
}

/** Gold strip for the Chairman / Director while the update is pending. */
export function DbUpdateStrip() {
  const user = useUser();
  const { needed } = useDbUpdateNeeded();
  if (!user.post || !needed) return null;
  return (
    <Link href="/setup-database/" className="block print:hidden border-b border-[#eadfc6] bg-[#faf5ea] px-4 py-2 text-center text-sm font-medium text-[#7a5a1f]">
      Database update pending — some departments will not save until it is done. Tap here (2 minutes).
    </Link>
  );
}

export function DbSetupPage() {
  const { toast } = useToast();
  const { needed, recheck } = useDbUpdateNeeded();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  const copy = async () => {
    try {
      const sql = await fetch(SQL_URL).then((r) => {
        if (!r.ok) throw new Error("Could not load the update file");
        return r.text();
      });
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      toast("Copied — now open Supabase and paste");
    } catch (e) {
      toast(`${(e as Error).message}. Use "Download the file" instead.`, "error");
    }
  };

  const steps: [string, string][] = [
    ["Copy the update", "Tap the gold button below. The whole update is copied."],
    ["Open Supabase", "Tap “Open Supabase SQL Editor” and sign in with the account that owns the JD One database."],
    ["Paste and Run", "Tap in the big empty box, paste (long-press → Paste, or Ctrl+V), then press Run (bottom right). It says “Success. No rows returned”."],
    ["Come back", "Return here and tap “Check again”. The gold strip disappears when everything is in place."],
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Database update" subtitle="One-time step for the new departments (Team access, vouchers, kitchen, stores, housekeeping, security…). Safe to run again; it changes no existing data." />
      <div className={needed ? "rounded-xl border border-[#d7aa60] px-4 py-3 text-sm" : "rounded-xl border border-emerald-500/70 px-4 py-3 text-sm"}>
        {needed === null ? "Checking…" : needed ? "Status: the update has not been run yet (or not fully)." : "Status: done — the database is up to date."}
      </div>
      <ol className="flex flex-col">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-4 border-t border-line py-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d7aa60] text-sm text-[#9a7128]">{i + 1}</span>
            <span className="flex flex-col gap-1">
              <span className="font-medium">{t}</span>
              <span className="text-sm text-slate-500">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()}>{copied ? "Copied ✓ — copy again" : "1 · Copy the update"}</Button>
        <a href={SUPABASE_SQL_EDITOR} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">2 · Open Supabase SQL Editor</Button>
        </a>
        <Button
          variant="secondary"
          loading={checking}
          onClick={() => {
            setChecking(true);
            void recheck().finally(() => setChecking(false));
          }}
        >
          4 · Check again
        </Button>
        <a href={SQL_URL} download="jd-one-database-update.sql" className="self-center text-sm underline">
          Download the file
        </a>
      </div>
    </div>
  );
}
