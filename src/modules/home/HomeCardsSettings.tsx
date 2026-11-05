"use client";
/**
 * Administration → Home cards (/home-cards/). Tick which departments see each card on Home.
 * Chairman, Director and Property Supervisor only. Unchanged cards keep their defaults.
 */
import { useMemo, useState } from "react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Loading, PageHeader } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { REPORT_DEPARTMENTS, useCanAssignReports } from "@/modules/night-audit/access";
import { HOME_CARDS, cardDepartments } from "./cards";
import { SHARED_PAGES, resetSharedPages, sharedDepartments } from "@/modules/rooms/shared";

export function HomeCardsSettings() {
  const user = useUser();
  const { toast } = useToast();
  const canEdit = useCanAssignReports(user);
  const { rows: saved, loading, error, reload } = useList("home-cards");
  const base = useMemo(() => cardDepartments(saved), [saved]);
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const pagesBase = useMemo(() => Object.fromEntries(SHARED_PAGES.map((p) => [p.id, sharedDepartments(saved, p.id)])), [saved]);
  const [pageDraft, setPageDraft] = useState<Record<string, string[]> | null>(null);
  const pagesCur = pageDraft ?? pagesBase;
  const [busy, setBusy] = useState(false);
  const cur = draft ?? base;

  if (!canEdit) return <NoAccess />;

  const toggle = (card: string, dept: string) =>
    setDraft((d) => {
      const m = { ...(d ?? base) };
      const set = new Set(m[card] ?? []);
      if (set.has(dept)) set.delete(dept);
      else set.add(dept);
      m[card] = REPORT_DEPARTMENTS.map((x) => x.id).filter((x) => set.has(x));
      return m;
    });

  const togglePage = (id: string, dept: string) =>
    setPageDraft((d) => {
      const m = { ...(d ?? pagesBase) };
      const set = new Set(m[id] ?? []);
      if (set.has(dept)) set.delete(dept);
      else set.add(dept);
      m[id] = REPORT_DEPARTMENTS.map((x) => x.id).filter((x) => set.has(x));
      return m;
    });

  const save = async () => {
    if (!draft && !pageDraft) return;
    setBusy(true);
    try {
      const store = getStore();
      for (const p of SHARED_PAGES) {
        if (!pageDraft) break;
        const want = pageDraft[p.id] ?? [];
        if (JSON.stringify(want) === JSON.stringify(pagesBase[p.id] ?? [])) continue;
        const row = saved.find((r) => String(r.card) === `page:${p.id}`);
        if (row) await store.update("home-cards", row.id, { departments: want });
        else await store.create("home-cards", { card: `page:${p.id}`, departments: want });
      }
      resetSharedPages();
      for (const c of HOME_CARDS) {
        if (!draft) break;
        const want = draft[c.id] ?? [];
        if (JSON.stringify(want) === JSON.stringify(base[c.id] ?? [])) continue;
        const row = saved.find((r) => String(r.card) === c.id);
        if (row) await store.update("home-cards", row.id, { departments: want });
        else await store.create("home-cards", { card: c.id, departments: want });
      }
      await reload();
      setDraft(null);
      setPageDraft(null);
      toast("Home cards saved. Everyone sees the change the next time Home opens.", "success");
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setDraft(Object.fromEntries(HOME_CARDS.map((c) => [c.id, c.depts])));

  return (
    <div>
      <PageHeader
        title="Home cards"
        subtitle="Which departments see each figure and list on Home"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Defaults
            </Button>
            {(draft || pageDraft) && (
              <Button variant="secondary" onClick={() => (setDraft(null), setPageDraft(null))}>
                Undo
              </Button>
            )}
            <Button loading={busy} disabled={!draft && !pageDraft} onClick={() => void save()}>
              Save
            </Button>
          </div>
        }
      />
      {error ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">The Home cards table is not in the database yet – the defaults are in use. Run the latest database update to save changes.</p>
      ) : null}
      {loading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium">Card</th>
                {REPORT_DEPARTMENTS.map((d) => (
                  <th key={d.id} className="px-2 py-2 text-center font-medium">
                    {d.title.replace(" (Kitchen)", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOME_CARDS.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2">
                    <span className="block font-medium text-navy">{c.title}</span>
                    <span className="block text-[11px] uppercase tracking-[0.12em] text-slate-400">{c.kind === "stat" ? "Figure" : "List"}</span>
                  </td>
                  {REPORT_DEPARTMENTS.map((d) => (
                    <td key={d.id} className="px-2 py-2 text-center">
                      <input type="checkbox" aria-label={`${c.title} – ${d.title}`} className="h-4 w-4 accent-[#17140f]" checked={(cur[c.id] ?? []).includes(d.id)} onChange={() => toggle(c.id, d.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="jd-serif mb-2 mt-8 text-2xl font-semibold text-navy">Pages shared by departments</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <tbody>
            {SHARED_PAGES.map((p) => (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2">
                  <span className="block font-medium text-navy">{p.title}</span>
                  <span className="block text-[11px] uppercase tracking-[0.12em] text-slate-400">Shown in the menu of</span>
                </td>
                {REPORT_DEPARTMENTS.map((d) => (
                  <td key={d.id} className="px-2 py-2 text-center">
                    <label className="flex flex-col items-center gap-1 text-[10px] text-slate-500">
                      <input type="checkbox" className="h-4 w-4 accent-[#17140f]" checked={(pagesCur[p.id] ?? []).includes(d.id)} onChange={() => togglePage(p.id, d.id)} />
                      {d.title.replace(" (Kitchen)", "")}
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">The Chairman and the Director always see every card. Others see the cards ticked for the departments they work in (from Team access).</p>
    </div>
  );
}
