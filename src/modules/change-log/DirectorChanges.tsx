"use client";
/**
 * Administration → Director changes (Chairman only). The database records every
 * create / edit / delete made from the Director's login (jdone.change_log, with
 * the row before and after). The Chairman reviews them here and can undo one.
 */
import { useMemo, useState } from "react";
import { getStore } from "@/core/data";
import type { EntityDef, Row } from "@/core/schema/types";
import { getEntityByTable } from "@/core/schema/registry";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate, formatDateTime, formatMoney } from "@/core/format";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { cn } from "@/core/ui/cn";

type Filter = "All" | "Edited" | "Deleted" | "Created" | "Access";
const SKIP = new Set(["updated_at", "created_at", "created_by", "id"]);

function actionOf(r: Row): Exclude<Filter, "All"> {
  if (r.table_name === "staff_access") return "Access";
  return r.action === "INSERT" ? "Created" : r.action === "DELETE" ? "Deleted" : "Edited";
}

function show(def: EntityDef | undefined, field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const f = def?.fields.find((x) => x.name === field);
  if (f?.type === "money") return formatMoney(value);
  if (f?.type === "date") return formatDate(value);
  if (f?.type === "datetime") return formatDateTime(value);
  if (f?.type === "relation") return "(linked record)";
  if (f?.type === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
  return String(value).slice(0, 120);
}

function labelOf(def: EntityDef | undefined, field: string): string {
  return def?.fields.find((x) => x.name === field)?.label ?? field.replace(/_/g, " ");
}

function titleOf(def: EntityDef | undefined, data: Record<string, unknown> | null): string {
  if (!data) return "";
  const t = def ? data[def.titleField] : undefined;
  return String(t ?? data.name ?? data.guest_name ?? data.voucher_no ?? data.module ?? data.id ?? "");
}

const BADGE: Record<Exclude<Filter, "All">, string> = {
  Edited: "border-white/40 text-white",
  Deleted: "border-[#ff9b85]/80 text-[#ffb4a3]",
  Created: "border-[#7fbf9a]/80 text-[#a9ddbf]",
  Access: "border-[#d7aa60]/80 text-[#f4d390]",
};

export function DirectorChanges() {
  const user = useUser();
  const { toast, confirm } = useToast();
  const { rows, loading, error, reload } = useList(user.post === "chairman" ? "change-log" : null, { sort: { field: "at", dir: "desc" }, limit: 300 });
  const [filter, setFilter] = useState<Filter>("All");
  const [busy, setBusy] = useState<string | null>(null);

  const items = useMemo(
    () =>
      rows.map((r) => {
        const def = getEntityByTable(String(r.table_name));
        const before = (r.before as Record<string, unknown> | null) ?? null;
        const after = (r.after as Record<string, unknown> | null) ?? null;
        const changed =
          r.action === "UPDATE" && before && after
            ? Object.keys(after).filter((k) => !SKIP.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
            : [];
        return { r, def, before, after, changed, kind: actionOf(r) };
      }),
    [rows],
  );

  if (user.post !== "chairman") return <NoAccess />;
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={`${error} — has the phase-1 database update been run?`} />;

  const unseen = rows.filter((r) => !r.seen);
  const count = (k: Exclude<Filter, "All">) => items.filter((i) => i.kind === k).length;
  const shown = items.filter((i) => filter === "All" || i.kind === filter);

  const markAllSeen = async () => {
    setBusy("all");
    try {
      for (const r of unseen) await getStore().update("change-log", r.id, { seen: true });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const undo = async (it: (typeof items)[number]) => {
    const { r, def, before, changed } = it;
    if (!def) return toast("This change cannot be undone from here.", "error");
    const ok = await confirm(`Undo this ${it.kind.toLowerCase()} change made by the Director?`, "Undo change");
    if (!ok) return;
    setBusy(r.id);
    try {
      const store = getStore();
      const id = String(r.record_id);
      if (r.action === "UPDATE" && before) await store.update(def.name, id, Object.fromEntries(changed.map((k) => [k, before[k] ?? null])));
      else if (r.action === "DELETE" && before) await store.create(def.name, before);
      else if (r.action === "INSERT") await store.remove(def.name, id);
      await store.update("change-log", r.id, { undone_at: new Date().toISOString(), undone_by: user.email ?? user.name, seen: true });
      await reload();
      toast("Change undone.", "success");
    } catch (e) {
      toast(`Could not undo: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const filters: Filter[] = ["All", "Edited", "Deleted", "Created", "Access"];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.34em] text-[#d7aa60]">Administration · Chairman only</span>
          <h1 className="jd-serif text-4xl font-medium leading-none text-white sm:text-5xl">
            Director <em className="text-[#d7aa60]">changes</em>
          </h1>
          <p className="max-w-2xl text-sm font-light text-white/70">Everything created, edited or removed from the Director’s login, with the old and the new value. You can undo a change.</p>
        </div>
        <button type="button" disabled={!unseen.length || busy === "all"} onClick={() => void markAllSeen()} className="min-h-11 rounded border border-white/30 px-4 text-xs uppercase tracking-[0.18em] text-white hover:bg-white/5 disabled:opacity-40">
          Mark all as seen
        </button>
      </header>

      <div className="grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-4">
        {[
          ["New, not seen", unseen.length],
          ["Edited", count("Edited")],
          ["Deleted", count("Deleted")],
          ["Access changes", count("Access")],
        ].map(([l, v]) => (
          <div key={String(l)} className="flex flex-col gap-1.5 bg-black p-4">
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/65">{l}</span>
            <span className="jd-serif text-4xl font-semibold leading-none text-white">{v}</span>
          </div>
        ))}
      </div>

      <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn("min-h-11 rounded-full border px-4 text-sm", filter === f ? "border-white bg-white font-medium text-black" : "border-white/20 text-white/80 hover:border-white/40")}
          >
            {f === "Access" ? "Access changes" : f}
          </button>
        ))}
      </div>

      {!shown.length && <p className="text-sm text-white/60">No changes {filter === "All" ? "yet" : `of this kind`}.</p>}

      <div className="flex flex-col gap-2.5">
        {shown.map((it) => {
          const { r, def, before, after, changed, kind } = it;
          const where = def?.label ?? String(r.table_name);
          const title = titleOf(def, after ?? before);
          return (
            <article key={r.id} className={cn("flex flex-col gap-3 rounded-md border bg-[#0e0d0b] p-4", r.seen ? "border-white/15" : "border-[#ee8122]/55")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  {!r.seen && <span className="h-2 w-2 rounded-full bg-[#ee8122]" aria-label="New" />}
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em]", BADGE[kind])}>{kind === "Access" ? "Access changed" : kind}</span>
                  <span className="text-xs uppercase tracking-[0.14em] text-white/60">{where}</span>
                </div>
                <span className="text-xs text-white/55">
                  {String(r.actor_email ?? "Director")} · {formatDateTime(r.at)}
                </span>
              </div>
              <span className="text-base font-medium text-white">{title || where}</span>

              {r.action === "UPDATE" && changed.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {changed.slice(0, 8).map((k) => (
                    <div key={k} className="grid gap-2 text-sm sm:grid-cols-[160px_1fr_1fr]">
                      <span className="text-white/55">{labelOf(def, k)}</span>
                      <span className="rounded border border-white/15 px-2.5 py-1 text-white/70 line-through decoration-white/35">{show(def, k, before?.[k])}</span>
                      <span className="rounded border border-[#d7aa60]/50 px-2.5 py-1 text-white">{show(def, k, after?.[k])}</span>
                    </div>
                  ))}
                </div>
              )}
              {r.action === "DELETE" && before && <p className="text-sm text-white/65">Removed record: {titleOf(def, before)}</p>}

              <div className="flex flex-wrap items-center gap-3">
                {r.undone_at ? (
                  <span className="text-sm text-[#f4d390]">Undone · {formatDateTime(r.undone_at)}</span>
                ) : (
                  <button type="button" disabled={busy === r.id} onClick={() => void undo(it)} className="min-h-10 rounded border border-white/30 px-4 text-xs uppercase tracking-[0.16em] text-white hover:bg-white/5 disabled:opacity-40">
                    Undo change
                  </button>
                )}
                {!r.seen && !r.undone_at && (
                  <button
                    type="button"
                    onClick={() => void getStore().update("change-log", r.id, { seen: true }).then(() => reload())}
                    className="min-h-10 px-2 text-sm text-[#d7aa60] hover:text-[#f4d390]"
                  >
                    Mark as seen
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
