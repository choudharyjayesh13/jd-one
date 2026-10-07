"use client";
/**
 * /my-documents: Aadhaar (number + front/back photo) and parents / guardian details.
 * Private: staff see only their own; owner / manager / HR see everyone (database rules).
 * Photos go to the PRIVATE `staff-docs` bucket and are shown with short-lived signed links.
 */
import { useCallback, useEffect, useState } from "react";
import { IdCard, Upload, ShieldCheck, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { getSupabaseClient } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import type { Row } from "@/core/schema/types";

const BUCKET = "staff-docs";
const HR_ROLES = ["owner", "manager", "hr"];
type Doc = Record<string, string | boolean | null>;
const EMPTY: Doc = { aadhaar_number: "", aadhaar_front: null, aadhaar_back: null, father_name: "", mother_name: "", guardian_name: "", guardian_relation: "", guardian_phone: "", verified: false };

export function docComplete(d: Row | Doc | null | undefined): boolean {
  return !!d && !!d.aadhaar_number && !!d.aadhaar_front && !!d.father_name && !!d.mother_name && !!d.guardian_phone;
}

async function toJpeg(file: File, max = 1600): Promise<Blob> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
}

function DocForm({ staff, canVerify, onSaved }: { staff: Row; canVerify: boolean; onSaved?: () => void }) {
  const sb = getSupabaseClient();
  const user = useUser();
  const { toast } = useToast();
  const [doc, setDoc] = useState<Doc>(EMPTY);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("staff_documents").select("*").eq("staff_id", staff.id as string).maybeSingle();
    const d = (data as Doc | null) ?? EMPTY;
    setDoc({ ...EMPTY, ...d });
    const l: Record<string, string> = {};
    for (const k of ["aadhaar_front", "aadhaar_back"]) {
      const p = d[k];
      if (typeof p === "string" && p) {
        const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(p, 600);
        if (s?.signedUrl) l[k] = s.signedUrl;
      }
    }
    setLinks(l);
  }, [sb, staff.id]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const set = (k: string, v: string) => setDoc((d) => ({ ...d, [k]: v }));
  const upload = async (k: "aadhaar_front" | "aadhaar_back", f: File | undefined) => {
    if (!sb || !f) return;
    setBusy(k);
    try {
      const blob = f.type.startsWith("image/") ? await toJpeg(f) : f;
      const ext = f.type === "application/pdf" ? "pdf" : "jpg";
      const path = `${staff.id}/${k}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || f.type });
      if (error) throw error;
      const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
      setDoc((d) => ({ ...d, [k]: path }));
      if (s?.signedUrl) setLinks((l) => ({ ...l, [k]: s.signedUrl }));
      toast("Photo uploaded — press Save to keep it");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  const save = async (extra: Doc = {}) => {
    if (!sb) return;
    const aadhaar = String(doc.aadhaar_number ?? "").replace(/\D/g, "");
    if (aadhaar && aadhaar.length !== 12) return toast("Aadhaar number must be 12 digits", "error");
    const phone = String(doc.guardian_phone ?? "").replace(/\D/g, "").slice(-10);
    if (doc.guardian_phone && phone.length !== 10) return toast("Parent / guardian mobile must be 10 digits", "error");
    setBusy("save");
    const row = {
      staff_id: staff.id, aadhaar_number: aadhaar || null, aadhaar_front: doc.aadhaar_front || null, aadhaar_back: doc.aadhaar_back || null,
      father_name: String(doc.father_name ?? "").trim() || null, mother_name: String(doc.mother_name ?? "").trim() || null,
      guardian_name: String(doc.guardian_name ?? "").trim() || null, guardian_relation: String(doc.guardian_relation ?? "").trim() || null,
      guardian_phone: phone || null, ...extra,
    };
    const { error } = await sb.from("staff_documents").upsert(row, { onConflict: "staff_id" });
    setBusy(null);
    if (error) return toast(error.message, "error");
    toast("Saved");
    await load();
    onSaved?.();
  };

  const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm";
  const photo = (k: "aadhaar_front" | "aadhaar_back", label: string) => (
    <label className={cn("flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 text-center text-sm", links[k] ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100")}>
      {links[k] && !String(doc[k]).endsWith(".pdf") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={links[k]} alt={label} className="max-h-40 rounded-lg object-contain" />
      ) : links[k] ? (
        <a href={links[k]} target="_blank" rel="noreferrer" className="text-navy underline">Open PDF</a>
      ) : (
        <Upload className="h-6 w-6 text-slate-400" />
      )}
      <span className="font-medium text-navy">{busy === k ? "Uploading…" : links[k] ? `${label} ✓ (tap to change)` : `Upload ${label}`}</span>
      <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => void upload(k, e.target.files?.[0])} />
    </label>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-navy"><IdCard className="h-5 w-5 text-gold" /> Aadhaar card</h2>
        <input className={input} inputMode="numeric" placeholder="12-digit Aadhaar number" maxLength={14} value={String(doc.aadhaar_number ?? "")} onChange={(e) => set("aadhaar_number", e.target.value.replace(/[^\d ]/g, ""))} />
        <div className="grid gap-3 sm:grid-cols-2">{photo("aadhaar_front", "front side")}{photo("aadhaar_back", "back side")}</div>
      </section>
      <section className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-navy"><Users className="h-5 w-5 text-gold" /> Parents / guardian</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Father's name" value={String(doc.father_name ?? "")} onChange={(e) => set("father_name", e.target.value)} />
          <input className={input} placeholder="Mother's name" value={String(doc.mother_name ?? "")} onChange={(e) => set("mother_name", e.target.value)} />
          <input className={input} placeholder="Guardian's name (if not parents)" value={String(doc.guardian_name ?? "")} onChange={(e) => set("guardian_name", e.target.value)} />
          <input className={input} placeholder="Relation (Father, Mother, Brother…)" value={String(doc.guardian_relation ?? "")} onChange={(e) => set("guardian_relation", e.target.value)} />
          <input className={cn(input, "sm:col-span-2")} inputMode="tel" placeholder="Parent / guardian mobile number" value={String(doc.guardian_phone ?? "")} onChange={(e) => set("guardian_phone", e.target.value)} />
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={CheckCircle2} loading={busy === "save"} onClick={() => void save()}>Save</Button>
        {doc.verified ? <span className="flex items-center gap-1 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> Verified by office</span>
          : canVerify && docComplete(doc) ? <Button variant="secondary" icon={ShieldCheck} onClick={() => void save({ verified: true, verified_by: (user.staff?.id as string) ?? null })}>Mark verified</Button> : null}
        <span className="text-xs text-slate-500">🔒 Only you and the office (owner / manager / HR) can see this.</span>
      </div>
    </div>
  );
}

export function MyDocuments() {
  const user = useUser();
  const sb = getSupabaseClient();
  const hr = HR_ROLES.includes(user.role);
  const { rows: staff } = useList(hr ? "staff" : null, { filter: { active: true } });
  const [docs, setDocs] = useState<Row[]>([]);
  const [pick, setPick] = useState<string>("");
  const loadDocs = useCallback(async () => {
    if (!sb || !hr) return;
    const { data } = await sb.from("staff_documents").select("staff_id,aadhaar_number,aadhaar_front,father_name,mother_name,guardian_phone,verified");
    setDocs(((data ?? []) as unknown) as Row[]);
  }, [sb, hr]);
  useEffect(() => {
    const t = setTimeout(() => void loadDocs(), 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  if (!sb) return <p className="p-6 text-slate-600">Documents work only in shared (online) mode.</p>;
  const me = user.staff;
  const target = hr && pick ? staff.find((s) => s.id === pick) ?? null : me;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-bold text-navy">{target && target !== me ? `${String(target.name)} — documents` : "My documents"}</h1>
        <p className="text-sm text-slate-500">Aadhaar card and parents / guardian details. Kept private.</p>
      </header>
      {hr && (
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-navy">Team documents</h2>
          <ul className="divide-y divide-line text-sm">
            {staff.map((s) => {
              const d = docs.find((x) => x.staff_id === s.id);
              const ok = docComplete(d);
              return (
                <li key={s.id as string}>
                  <button type="button" onClick={() => setPick(s.id === me?.id ? "" : (s.id as string))} className={cn("flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-slate-50", (pick || me?.id) === s.id && "bg-amber-50")}>
                    <span className="font-medium text-navy">{String(s.name)} <span className="font-normal text-slate-500">· {String(s.designation ?? s.role ?? "")}</span></span>
                    <span className={cn("flex items-center gap-1 text-xs font-semibold", d?.verified ? "text-emerald-700" : ok ? "text-amber-600" : "text-rose-600")}>
                      {d?.verified ? <><ShieldCheck className="h-4 w-4" /> Verified</> : ok ? "Complete — verify" : <><AlertCircle className="h-4 w-4" /> Missing</>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {target ? <DocForm key={target.id as string} staff={target} canVerify={hr} onSaved={() => void loadDocs()} /> : <p className="text-slate-600">Your login is not linked to a staff record yet.</p>}
    </div>
  );
}

/** My Day banner until the person has saved Aadhaar + parents' details. */
export function DocsNudge() {
  const user = useUser();
  const sb = getSupabaseClient();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const id = user.staff?.id as string | undefined;
    if (!sb || !id) return;
    let live = true;
    void sb.from("staff_documents").select("aadhaar_number,aadhaar_front,father_name,mother_name,guardian_phone").eq("staff_id", id).maybeSingle()
      .then(({ data }) => { if (live) setMissing(!docComplete(data as Row | null)); });
    return () => { live = false; };
  }, [sb, user.staff?.id]);
  if (!missing) return null;
  return (
    <a href="/my-documents/" className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
      <IdCard className="h-6 w-6 shrink-0 text-amber-600" />
      <span><b>Add your Aadhaar card and parents&apos; details.</b> Upload the Aadhaar photo and your father, mother and guardian mobile number — tap here.</span>
    </a>
  );
}
