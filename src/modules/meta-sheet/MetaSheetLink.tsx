"use client";
/**
 * Sales → Meta sheet link (/meta-sheet/). Chairman and Director only.
 * 1. Sales team: three seats (posts sales_1 … sales_3). Only these people – plus the Chairman and the
 *    Director – can see leads, and new leads from the sheet go to them in turn.
 * 2. The link: the key the agency's Google Sheet uses to send leads to JD One, and when it last talked to us.
 * 3. How to connect the sheet (one time) and how stages are written back.
 * The database checks everything again (jdone.sheet_links is readable only by the two posts).
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, Download, Eye, EyeOff, KeyRound, RefreshCw, UserCog } from "lucide-react";
import { getStore, getSupabaseClient } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDateTime } from "@/core/format";
import { NoAccess } from "@/core/ui/AuthGate";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { SALES_SEATS } from "@/modules/night-audit/access";

const SCRIPT_URL = "/setup/jd-one-meta-sheet.gs";

const STAGE_WORDS: [string, string][] = [
  ["New", "New"],
  ["Contact attempted", "Not Answered"],
  ["Contacted", "Discussed"],
  ["Nurture", "Callback Scheduled"],
  ["Qualified · Quote preparation", "Hot – Interested"],
  ["Awaiting approval · Quote shared · Confirmation pending", "Quotation sent"],
  ["Won", "Booked"],
  ["Lost", "Lost"],
];

type Link = { secret: string; last_in_at: string | null; last_in_count: number | null; total_in: number; last_out_at: string | null };

export function MetaSheetLink() {
  const user = useUser();
  const { toast } = useToast();
  const { rows: posts, reload } = useList("org-posts");
  const { rows: staffRows } = useList("staff", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: leads } = useList(user.post ? "leads" : null);
  const [link, setLink] = useState<Link | null>(null);
  const [linkErr, setLinkErr] = useState("");
  const [show, setShow] = useState(false);
  const [picking, setPicking] = useState<Row | null>(null);
  const [rotating, setRotating] = useState(false);
  const [confirmKey, setConfirmKey] = useState(false);

  const loadLink = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return setLinkErr("The sheet link works only in the live app.");
    const { data, error } = await client.from("sheet_links").select("secret, last_in_at, last_in_count, total_in, last_out_at").eq("id", "meta-leads").maybeSingle();
    if (error) return setLinkErr(/relation|schema cache|does not exist/i.test(error.message) ? "The database step for the sheet link has not been run yet." : error.message);
    setLink((data as Link) ?? null);
  }, []);
  useEffect(() => {
    void loadLink();
  }, [loadLink]);

  if (!user.post) return <NoAccess />;

  const seats = SALES_SEATS.map((p) => posts.find((r) => r.post === p)).filter(Boolean) as Row[];
  const staff = staffRows.filter((s) => s.role !== "owner");
  const fromSheet = leads.filter((l) => l.sheet_tab);
  const tabs = [...new Set(fromSheet.map((l) => String(l.sheet_tab)))].sort();
  const openFor = (r: Row) => {
    const s = staff.find((x) => String(x.email ?? "").toLowerCase() === String(r.email ?? "").toLowerCase());
    return s ? fromSheet.filter((l) => l.assigned_to === s.id && l.stage !== "Won" && l.stage !== "Lost").length : 0;
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`, "success");
    } catch {
      toast("Could not copy – select it and copy by hand", "error");
    }
  };
  const copyScript = async () => {
    try {
      const text = await (await fetch(SCRIPT_URL)).text();
      await copy(text, "Script");
    } catch {
      toast("Could not load the script", "error");
    }
  };
  const rotate = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setRotating(true);
    const { error } = await client.rpc("rotate_sheet_key");
    setRotating(false);
    setConfirmKey(false);
    if (error) return toast(error.message, "error");
    toast("New key made. Paste it in the sheet: JD One → Connect to JD One", "success");
    setShow(true);
    void loadLink();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Meta sheet link" subtitle="The agency's Google Sheet → JD One · every tab named Campaign…" />

      {/* Sales team */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="jd-serif text-xl font-semibold text-navy">Sales team</h2>
        <p className="mt-1 text-sm text-slate-600">Only these three people – and the Chairman and the Director – can see leads. New leads from the sheet go to them one by one, in turn.</p>
        <div className="mt-4 divide-y divide-line rounded-lg border border-line">
          {seats.map((r, i) => (
            <div key={String(r.id)} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Seat {i + 1}</div>
                <div className="font-medium text-navy">{String(r.holder_name ?? "") || <span className="text-slate-400">Empty</span>}</div>
              </div>
              <div className="flex items-center gap-3">
                {r.holder_name ? <span className="text-sm text-slate-500">{openFor(r)} open leads</span> : null}
                <Button size="sm" variant="secondary" icon={UserCog} onClick={() => setPicking(r)}>
                  {r.holder_name ? "Change" : "Choose"}
                </Button>
              </div>
            </div>
          ))}
          {seats.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">The database step for sales seats has not been run yet.</p>}
        </div>
      </section>

      {/* Link */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="jd-serif text-xl font-semibold text-navy">Sheet connection</h2>
        {linkErr ? (
          <p className="mt-2 text-sm text-slate-600">{linkErr}</p>
        ) : !link ? (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Status" value={link.last_in_at || link.last_out_at ? "Connected" : "Not connected yet"} tone={link.last_in_at || link.last_out_at ? "ok" : "wait"} />
              <Stat label="Last talked to the sheet" value={link.last_out_at ? formatDateTime(link.last_out_at) : "—"} />
              <Stat label="Leads received from the sheet" value={`${fromSheet.length || link.total_in}`} sub={tabs.length ? tabs.join(" · ") : undefined} />
            </div>
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">Key for the sheet</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-line bg-slate-50 px-3 py-2 font-mono text-sm text-navy">{show ? link.secret : "•".repeat(24)}</code>
                <Button size="sm" variant="secondary" icon={show ? EyeOff : Eye} onClick={() => setShow(!show)}>
                  {show ? "Hide" : "Show"}
                </Button>
                <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copy(link.secret, "Key")}>
                  Copy
                </Button>
                <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setConfirmKey(true)}>
                  Change key
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Keep this key private. Anyone with it can send leads into JD One. If it gets out, change it and paste the new one in the sheet.</p>
            </div>
          </>
        )}
      </section>

      {/* Steps */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="jd-serif text-xl font-semibold text-navy">Connect the sheet (one time, on a computer)</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Open the sheet <b>Udaisarovar Meta Leads 2026</b> with the Udaisarovar Google account.</li>
          <li>
            Click <b>Copy script</b> below. In the sheet open <b>Extensions → Apps Script</b>, delete what is there, paste, and press <b>Save</b>.
          </li>
          <li>Go back to the sheet and reload it. A new menu <b>JD One</b> appears at the top.</li>
          <li>
            Click <b>JD One → Connect to JD One</b>. Google asks for permission once – choose the Udaisarovar account and allow. Paste the key from above.
          </li>
          <li>Done. Old leads come in at once. After that new leads come every minute, and progress goes back to the sheet every 10 minutes.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={Copy} onClick={() => void copyScript()}>
            Copy script
          </Button>
          <a href={SCRIPT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Open script
          </a>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-navy">Rules for the agency</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Every new campaign goes in a new tab whose name starts with <b>Campaign</b> (Campaign 3, Campaign Diwali…).</li>
              <li>Row 1 has the column names, as now. The phone number column must be there.</li>
              <li>Do not rename or delete the hidden tab <b>_jdone_sent</b> – it remembers what was already sent.</li>
            </ul>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-navy">What comes back to the sheet</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Tabs in the agency layout (Campaign 1): Lead Stage, Assigned To, Call Attempts, Last Contacted, Next Follow-up, Staff Remarks.</li>
              <li>Tabs straight from Meta (Campaign 2): new columns at the end, named “JD One …”. The agency&apos;s own columns are not touched.</li>
              <li>A tab <b>JD One summary</b> with every campaign counted together.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Stage words */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="jd-serif text-xl font-semibold text-navy">Stage names</h2>
        <p className="mt-1 text-sm text-slate-600">The team works in JD One stages. The sheet shows the words the agency already uses.</p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-medium">JD One stage</th>
              <th className="py-2 font-medium">Shown in the sheet</th>
            </tr>
          </thead>
          <tbody>
            {STAGE_WORDS.map(([a, b]) => (
              <tr key={a} className="border-b border-line/60">
                <td className="py-2 pr-4 text-navy">{a}</td>
                <td className="py-2 text-slate-700">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {picking && (
        <PickSeat
          row={picking}
          seatNo={SALES_SEATS.indexOf(picking.post as (typeof SALES_SEATS)[number]) + 1}
          staff={staff}
          taken={seats.filter((s) => s.id !== picking.id).map((s) => String(s.email ?? "").toLowerCase())}
          onClose={() => {
            setPicking(null);
            void reload();
          }}
        />
      )}
      {confirmKey && (
        <Dialog open onClose={() => setConfirmKey(false)} title="Change the key?">
          <div className="flex flex-col gap-4 text-sm text-slate-700">
            <p>The sheet stops sending leads until the new key is pasted there (JD One → Connect to JD One). Leads are not lost – they wait in the sheet and come in after you paste it.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmKey(false)}>
                Cancel
              </Button>
              <Button icon={KeyRound} loading={rotating} onClick={() => void rotate()}>
                Make new key
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "wait" }) {
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={tone === "ok" ? "mt-1 font-semibold text-emerald-700" : tone === "wait" ? "mt-1 font-semibold text-amber-700" : "mt-1 font-semibold text-navy"}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function PickSeat({ row, seatNo, staff, taken, onClose }: { row: Row; seatNo: number; staff: Row[]; taken: string[]; onClose: () => void }) {
  const { toast } = useToast();
  const [id, setId] = useState(String(staff.find((s) => String(s.email ?? "").toLowerCase() === String(row.email ?? "").toLowerCase())?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const s = staff.find((x) => x.id === id);
    if (s && !s.email) return toast(`${String(s.name)} has no login email yet`, "error");
    if (s && taken.includes(String(s.email).toLowerCase())) return toast(`${String(s.name)} already has a seat`, "error");
    setBusy(true);
    try {
      await getStore().update("org-posts", row.id, { holder_name: s ? String(s.name) : null, email: s ? String(s.email).toLowerCase() : null });
      toast(s ? `${String(s.name)} is in the sales team (seat ${seatNo})` : `Seat ${seatNo} is empty now`, "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Sales seat ${seatNo}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">This person will see all leads and get new leads in turn. Leads already given to the old person stay with them – move them from the pipeline if needed.</p>
        <Field label="Person">
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Nobody (empty seat)</option>
            {staff.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {String(s.name)}
                {s.designation ? ` · ${String(s.designation)}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
