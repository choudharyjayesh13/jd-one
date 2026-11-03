"use client";
/**
 * Team access (Administration → Team access). Only the Chairman and the Director.
 * For each staff member: departments → modules → No access / View / Edit / Manage.
 *
 * Stored in jdone.staff_access, one row per module with a level above 0, plus a
 * "_configured" marker row, so "everything set to No access" is different from
 * "not set up yet" (people not set up keep the old role rules).
 */
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { ASSIGNABLE_DEPARTMENTS, LEVELS, ROLE_TEMPLATES, levelsFromTemplate, type Level } from "@/core/departments";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Loading, ErrorBox } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { cn } from "@/core/ui/cn";

const MARKER = "_configured";

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function Diamond() {
  return (
    <span className="flex items-center gap-2.5" aria-hidden="true">
      <span className="h-px w-14 bg-[#d7aa60]" />
      <span className="h-1.5 w-1.5 rotate-45 bg-[#d7aa60]" />
      <span className="h-px w-14 bg-gradient-to-r from-[#d7aa60] to-transparent" />
    </span>
  );
}

function LevelPicker({ value, onChange, label }: { value: Level; onChange: (l: Level) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={`${label} access`} className="grid min-w-[300px] grid-cols-4 overflow-hidden rounded border border-white/20">
      {LEVELS.map((l, i) => {
        const on = value === l.level;
        return (
          <button
            key={l.level}
            type="button"
            role="radio"
            aria-checked={on}
            title={l.hint}
            onClick={() => onChange(l.level)}
            className={cn(
              "min-h-9 px-2 text-xs",
              i > 0 && "border-l border-white/15",
              on ? (l.level === 3 ? "jd-gold-btn font-semibold" : l.level === 0 ? "bg-white/15 font-medium text-white" : "bg-[#ffffff] font-medium text-black") : "text-white/65 hover:bg-white/5",
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

export function TeamAccess() {
  const user = useUser();
  const { toast } = useToast();
  const { rows: staff, loading: staffLoading, error: staffError } = useList("staff");
  const { rows: posts } = useList("org-posts");
  const { rows: allAccess, reload: reloadAccess } = useList("staff-access");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Level>>({});
  const [template, setTemplate] = useState("Custom");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const postEmails = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of posts) if (p.email) m.set(String(p.email).toLowerCase(), String(p.post));
    return m;
  }, [posts]);
  const chairmanEmailSet = posts.some((p) => p.post === "chairman" && p.email);

  /** Post held by a staff member: by login email; before the Chairman email is set, the owner is Chairman. */
  const postOf = (s: Row): string | null => {
    const em = String(s.email ?? "").toLowerCase();
    if (em && postEmails.has(em)) return postEmails.get(em) ?? null;
    if (!chairmanEmailSet && s.role === "owner") return "chairman";
    return null;
  };

  const people = useMemo(
    () =>
      [...staff]
        .filter((s) => s.active !== false)
        .sort((a, b) => {
          const pa = postOf(a) ? 0 : 1;
          const pb = postOf(b) ? 0 : 1;
          return pa - pb || String(a.name ?? "").localeCompare(String(b.name ?? ""));
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staff, postEmails, chairmanEmailSet],
  );

  const accessByStaff = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of allAccess) {
      const k = String(r.staff_id);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [allAccess]);

  const selected = people.find((p) => p.id === sel) ?? people.find((p) => !postOf(p)) ?? people[0] ?? null;
  const selectedPost = selected ? postOf(selected) : null;
  const selectedRows = selected ? accessByStaff.get(selected.id) ?? [] : [];
  const configured = selectedRows.length > 0;

  // Load the selected person's levels into the editor.
  useEffect(() => {
    if (!selected) return;
    const levels: Record<string, Level> = {};
    for (const d of ASSIGNABLE_DEPARTMENTS) for (const m of d.modules) levels[m.key] = 0;
    for (const r of selectedRows) if (r.module !== MARKER) levels[String(r.module)] = (Number(r.level) || 0) as Level;
    setDraft(levels);
    setTemplate("Custom");
    setDirty(false);
    setPreview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, allAccess]);

  if (!user.post) return <NoAccess />;
  if (staffLoading) return <Loading />;
  if (staffError) return <ErrorBox message={staffError} />;

  const set = (patch: Record<string, Level>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setTemplate("Custom");
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const store = getStore();
      const want = new Map<string, Level>(Object.entries(draft).filter(([, l]) => l > 0) as [string, Level][]);
      want.set(MARKER, 0);
      const have = new Map(selectedRows.map((r) => [String(r.module), r]));
      for (const [mod, row] of have) {
        if (!want.has(mod)) await store.remove("staff-access", row.id);
        else if (Number(row.level) !== want.get(mod)) await store.update("staff-access", row.id, { level: want.get(mod) });
      }
      for (const [mod, level] of want) if (!have.has(mod)) await store.create("staff-access", { staff_id: selected.id, module: mod, level, created_by: user.staff?.id ?? null });
      await reloadAccess();
      setDirty(false);
      toast(`Saved. ${String(selected.name)} sees the new menu next time a page opens.`, "success");
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const resetToOldRules = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      for (const r of selectedRows) await getStore().remove("staff-access", r.id);
      await reloadAccess();
      toast(`${String(selected.name)} is back on the old role rules.`, "info");
    } catch (e) {
      toast(`Could not change: ${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const ql = q.trim().toLowerCase();
  const list = people.filter((p) => !ql || `${p.name ?? ""} ${p.designation ?? ""} ${p.email ?? ""}`.toLowerCase().includes(ql));

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.34em] text-[#d7aa60]">Administration · The Udaisarovar</span>
        <h1 className="jd-serif text-4xl font-medium leading-none text-white sm:text-5xl">
          Team <em className="text-[#d7aa60]">access</em>
        </h1>
        <Diamond />
        <p className="max-w-2xl text-sm font-light text-white/70">
          Choose the departments and modules each team member can use. Only the Chairman and the Director can change access, and every change the Director makes is recorded for the Chairman.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Team members" className="w-full overflow-hidden rounded-md border border-white/15 bg-[#0e0d0b] lg:w-80">
          <label className="flex items-center gap-2 border-b border-white/10 px-3">
            <Search className="h-4 w-4 text-white/50" />
            <span className="sr-only">Search team</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or post" className="min-h-12 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40" />
          </label>
          <div className="max-h-[70vh] overflow-y-auto">
            {list.map((p) => {
              const post = postOf(p);
              const rows = accessByStaff.get(p.id) ?? [];
              const depts = ASSIGNABLE_DEPARTMENTS.filter((d) => d.modules.some((m) => rows.some((r) => r.module === m.key && Number(r.level) > 0))).length;
              const on = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSel(p.id)}
                  className={cn("flex w-full items-center gap-3 border-t border-white/5 px-3.5 py-3 text-left", on ? "bg-[#d7aa60]/12 shadow-[inset_2px_0_0_#d7aa60]" : "hover:bg-white/5")}
                >
                  <span className={cn("jd-serif flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold", post ? "jd-gold-btn" : "border border-[#d7aa60]/60 text-[#f4d390]")}>{initialsOf(String(p.name ?? "?"))}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium text-white">{String(p.name ?? "")}</span>
                    <span className="truncate text-xs text-white/55">{post ? (post === "chairman" ? "Chairman" : "Director") : String(p.designation ?? p.role ?? "")}</span>
                  </span>
                  <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-[#d7aa60]">{post ? "All · admin" : rows.length ? `${depts} dept${depts === 1 ? "" : "s"}` : "Old rules"}</span>
                </button>
              );
            })}
            {!list.length && <p className="px-4 py-6 text-sm text-white/60">No one matches “{q}”.</p>}
          </div>
        </section>

        {selected && (
          <section aria-label="Access" className="flex min-w-0 flex-1 basis-[520px] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-white/15 bg-[#0e0d0b] p-5">
              <div className="flex items-center gap-4">
                <span className="jd-serif flex h-14 w-14 items-center justify-center rounded-full border border-[#d7aa60] text-xl font-semibold text-[#f4d390]">{initialsOf(String(selected.name ?? "?"))}</span>
                <span className="flex flex-col gap-1">
                  <span className="jd-serif text-3xl font-semibold leading-none text-white">{String(selected.name ?? "")}</span>
                  <span className="text-sm text-white/65">
                    {selectedPost ? (selectedPost === "chairman" ? "Chairman" : "Director") : String(selected.designation ?? selected.role ?? "")}
                    {!selectedPost && !configured && " · not set up yet (old role rules)"}
                  </span>
                </span>
              </div>
              {!selectedPost && (
                <div className="flex flex-wrap items-end gap-2.5">
                  <label className="flex flex-col gap-1.5 text-[10px] uppercase tracking-[0.24em] text-white/65">
                    Role template
                    <select
                      value={template}
                      onChange={(e) => {
                        setTemplate(e.target.value);
                        setDraft(levelsFromTemplate(e.target.value) as Record<string, Level>);
                        setDirty(true);
                      }}
                      className="min-h-11 rounded border border-white/20 bg-black px-3 text-sm normal-case tracking-normal text-white"
                    >
                      {Object.keys(ROLE_TEMPLATES).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => setPreview((p) => !p)} className="min-h-11 rounded border border-white/30 px-4 text-xs uppercase tracking-[0.16em] text-white hover:bg-white/5">
                    {preview ? "Close preview" : "Preview menu"}
                  </button>
                  <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="jd-gold-btn min-h-11 rounded px-5 text-xs font-medium uppercase tracking-[0.2em] disabled:opacity-50">
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              )}
            </div>

            {selectedPost ? (
              <div className="flex flex-col gap-2 rounded-md border border-[#d7aa60]/60 p-6">
                <span className="jd-serif text-2xl font-semibold text-[#f4d390]">Full access to every department</span>
                <span className="font-light text-white/75">
                  This access belongs to the post of {selectedPost === "chairman" ? "Chairman" : "Director"}, not to the person. If the post is given to someone else, the access moves with it. It cannot be changed from this page.
                </span>
              </div>
            ) : (
              <>
                {dirty && <div className="rounded border border-white/30 px-4 py-3 text-sm text-white/85">Unsaved changes — press Save changes to apply.</div>}
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 px-0.5 text-xs text-white/65">
                  {LEVELS.map((l) => (
                    <span key={l.level}>
                      <b className="font-medium text-white">{l.label}</b> — {l.hint.toLowerCase()}
                    </span>
                  ))}
                </div>

                {preview && (
                  <div className="rounded-md border border-[#d7aa60]/50 bg-[#0e0d0b] p-5">
                    <span className="text-[11px] uppercase tracking-[0.3em] text-[#d7aa60]">Menu as {String(selected.name)} will see it</span>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      {ASSIGNABLE_DEPARTMENTS.map((d) => {
                        const mods = d.modules.filter((m) => !m.soon && (draft[m.key] ?? 0) > 0);
                        if (!mods.length) return null;
                        return (
                          <div key={d.id}>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-white">{d.label}</div>
                            <ul className="mt-1.5 border-l border-[#d7aa60]/30 pl-3 text-[13px] text-white/75">
                              {mods.map((m) => (
                                <li key={m.key} className="flex justify-between py-0.5">
                                  {m.label}
                                  {draft[m.key] === 1 && <span className="text-[9px] uppercase tracking-[0.14em] text-white/40">View</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {ASSIGNABLE_DEPARTMENTS.map((d) => {
                    const given = d.modules.filter((m) => (draft[m.key] ?? 0) > 0).length;
                    const on = given > 0;
                    const live = d.modules.filter((m) => !m.soon);
                    return (
                      <div key={d.id} className={cn("overflow-hidden rounded-md border bg-[#0e0d0b]", on ? "border-[#d7aa60]/50" : "border-white/15")}>
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <label className="flex min-h-11 cursor-pointer items-center gap-3.5">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => set(Object.fromEntries(d.modules.map((m) => [m.key, (on ? 0 : m.soon ? 0 : 1) as Level])))}
                              className="h-5 w-5 accent-[#d7aa60]"
                            />
                            <span className="flex flex-col">
                              <span className="jd-serif text-xl font-semibold uppercase tracking-[0.08em] text-white">{d.label}</span>
                              <span className="text-xs text-white/55">{on ? `${given} of ${d.modules.length} modules` : "Not given · hidden from the menu"}</span>
                            </span>
                          </label>
                          {on && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="mr-1 text-[10px] uppercase tracking-[0.22em] text-white/50">Apply to all</span>
                              {LEVELS.filter((l) => l.level > 0).map((l) => (
                                <button key={l.level} type="button" onClick={() => set(Object.fromEntries(live.map((m) => [m.key, l.level])))} className="min-h-8 rounded border border-white/25 px-3 text-xs text-white/85 hover:bg-white/5">
                                  {l.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {on && (
                          <div className="border-t border-white/10">
                            {d.modules.map((m) => {
                              const lvl = (draft[m.key] ?? 0) as Level;
                              return (
                                <div key={m.key} className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/5 py-2 pl-12 pr-4 first:border-t-0">
                                  <span className={cn("text-[15px]", lvl === 0 ? "text-white/45" : "text-white")}>
                                    {m.label}
                                    {m.soon && <span className="ml-2 text-[9px] uppercase tracking-[0.16em] text-[#d7aa60]">Coming soon</span>}
                                  </span>
                                  <LevelPicker value={lvl} label={m.label} onChange={(l) => set({ [m.key]: l })} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {configured && (
                  <button type="button" disabled={saving} onClick={() => void resetToOldRules()} className="self-start text-sm text-white/55 underline-offset-4 hover:text-white hover:underline">
                    Remove Team access for {String(selected.name)} (go back to the old role rules)
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
