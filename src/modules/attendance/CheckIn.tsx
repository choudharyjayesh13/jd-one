"use client";
/**
 * Mark attendance from a phone: selfie (front camera), exact time, and GPS
 * position. Saves onto today's attendance row (status P) and, when the
 * business unit has coordinates, records the distance from the property.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, MapPin, RefreshCw, X, Coffee, Send, CheckCircle2, Sun, Moon } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { todayISO, formatDateTime } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { photoOfDay } from "@/core/ui/property";
import { isAdmin } from "@/core/auth/access";
import { activeRest, nextPunch, phaseAt, pretty, shiftsOf } from "./shifts";
import { useToast } from "@/core/ui/Toast";
import type { Row } from "@/core/schema/types";

type Pos = { lat: number; lng: number; accuracy: number; at: string };

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

async function toSelfieDataUrl(file: File, max = 640): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function CheckIn() {
  const user = useUser();
  const { toast } = useToast();
  const store = getStore();
  const [staff, setStaff] = useState<Row[]>([]);
  const [units, setUnits] = useState<Row[]>([]);
  const [staffId, setStaffId] = useState<string>((user.staff?.id as string) ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [now, setNow] = useState(new Date());
  const [today, setToday] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [rests, setRests] = useState<Row[]>([]);
  const [restForm, setRestForm] = useState({ staff_id: "", start_time: "", end_time: "", note: "" });
  const leader = isAdmin(user.role) || user.role === "hr";

  const stopCamera = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  /** Live front-camera preview (needs HTTPS + permission). Falls back to the file picker. */
  const openCamera = async () => {
    setCamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      input.current?.click();
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 960 } }, audio: false });
      setStream(s);
    } catch (e) {
      const err = e as DOMException;
      setCamError(
        err.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow the camera for this site (lock icon in the address bar) or use the photo picker."
          : err.name === "NotFoundError"
            ? "No camera found on this device — use the photo picker."
            : `Camera error: ${err.message}`,
      );
      input.current?.click();
    }
  };

  useEffect(() => {
    if (stream && video.current) {
      video.current.srcObject = stream;
      void video.current.play().catch(() => undefined);
    }
  }, [stream]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const max = 640;
    const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    // Mirror so the saved selfie matches what the person saw in the preview.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", 0.8));
    stopCamera();
  };

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    void Promise.all([store.list("staff", { filter: { active: true } }), store.list("business-units")]).then(([s, u]) => {
      setStaff(s);
      setUnits(u);
      if (!staffId && s.length === 1) setStaffId(s[0].id);
    });
  }, [store, staffId]);
  useEffect(() => {
    const q = staffId ? store.list("attendance", { filter: { date: todayISO(), staff_id: staffId } }) : Promise.resolve([] as Row[]);
    void q.then((rows) => setToday(rows[0] ?? null));
  }, [store, staffId, saving]);
  const loadRests = useCallback(() => store.list("rest-periods", { filter: { date: todayISO() } }).then(setRests).catch(() => undefined), [store]);
  useEffect(() => {
    void loadRests();
  }, [loadRests]);

  const me = staff.find((s) => s.id === staffId) ?? null;
  const unit = useMemo(() => units.find((u) => u.id === me?.business_unit_id) ?? null, [units, me]);
  const unitPos = unit && unit.latitude != null && unit.longitude != null ? { lat: Number(unit.latitude), lng: Number(unit.longitude) } : null;
  const distance = pos && unitPos ? haversineM(pos, unitPos) : null;
  const fence = Number(unit?.geofence_m ?? 300);
  const locationOk = distance == null ? null : distance <= fence + (pos?.accuracy ?? 0);

  const locate = () => {
    if (!("geolocation" in navigator)) return setPosError("This phone does not share location.");
    setLocating(true);
    setPosError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: new Date().toISOString() });
        setLocating(false);
      },
      (e) => {
        setPosError(e.code === 1 ? "Location permission denied — allow location for this site and try again." : `Could not get location (${e.message}).`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  useEffect(() => {
    const t = setTimeout(locate, 0);
    return () => clearTimeout(t);
     
  }, []);

  const punch = nextPunch(today);
  const save = async () => {
    if (!staffId) return toast("Choose your name first", "error");
    if (!punch) return toast("All four punches done for today 👏", "info");
    if (!photo) return toast("Take a selfie first", "error");
    if (!pos) return toast("Location not captured yet — press Retry location", "error");
    setSaving(true);
    try {
      const at = new Date().toISOString();
      const device = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : null;
      const common = { latitude: pos.lat, longitude: pos.lng, accuracy_m: pos.accuracy, distance_m: distance, location_ok: locationOk, device };
      const values = { [punch.field]: at, [punch.selfie]: photo, ...common };
      if (today) await store.update("attendance", today.id, values);
      else await store.create("attendance", { date: todayISO(), staff_id: staffId, status: "P", ...values });
      toast(`${punch.label} · ${formatDateTime(at).slice(-8)}${distance != null ? ` · ${distance} m from ${unit?.name}` : ""}`, "success");
      setPhoto(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };
  const giveRest = async () => {
    const f = restForm;
    if (!f.staff_id || !f.start_time || !f.end_time) return toast("Choose the person and the rest time", "error");
    try {
      await store.create("rest-periods", { staff_id: f.staff_id, date: todayISO(), start_time: f.start_time, end_time: f.end_time, note: f.note || null, assigned_by: user.staff?.id ?? null });
      toast(`Rest time given to ${String(staff.find((x) => x.id === f.staff_id)?.name ?? "")} — they see it in the app`);
      setRestForm({ staff_id: "", start_time: "", end_time: "", note: "" });
      await loadRests();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const sh = shiftsOf(me);
  const phase = phaseAt(me, now);
  const myRest = activeRest(rests.filter((r) => r.staff_id === staffId), now);
  const steps = [
    { label: `Shift 1 in`, at: today?.checked_in_at, plan: sh.s1[0], icon: Sun },
    { label: `Shift 1 out`, at: today?.checked_out_at, plan: sh.s1[1], icon: Coffee },
    { label: `Shift 2 in`, at: today?.shift2_in_at, plan: sh.s2[0], icon: Sun },
    { label: `Shift 2 out`, at: today?.shift2_out_at, plan: sh.s2[1], icon: Moon },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl text-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoOfDay(4).url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-navy/70 via-navy/80 to-navy/95" />
        <div className="relative p-6 text-center sm:p-8">
          <p className="text-sm text-white/70">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <div className="mt-1 text-5xl font-bold tabular-nums sm:text-6xl">{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <p className="mt-2 inline-block rounded-full bg-white/10 px-4 py-1 text-sm">
            {phase === "before" ? `Shift 1 starts at ${pretty(sh.s1[0])}` : phase === "shift1" ? `Shift 1 · until ${pretty(sh.s1[1])}` : phase === "break" ? `Lunch & rest break · Shift 2 at ${pretty(sh.s2[0])}` : phase === "shift2" ? `Shift 2 · until ${pretty(sh.s2[1])}` : "Day finished · see you tomorrow"}
          </p>
        </div>
      </section>

      {myRest && (
        <section className="flex items-center gap-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4">
          <span className="text-4xl">🌿</span>
          <div>
            <div className="text-lg font-semibold text-emerald-800">You are on rest time until {pretty(String(myRest.end_time))}</div>
            <div className="text-sm text-emerald-700">{myRest.note ? String(myRest.note) : "Relax — your leader will call you if needed."}</div>
          </div>
        </section>
      )}

      <section className="space-y-5 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <label className="block text-sm font-medium text-slate-700">
          Who are you?
          <select className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 text-base" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Select your name…</option>
            {staff.map((x) => (
              <option key={x.id} value={x.id}>{String(x.name)}{x.designation ? ` · ${x.designation}` : ""}</option>
            ))}
          </select>
        </label>

        {/* Shift timeline */}
        <ol className="grid grid-cols-4 gap-2">
          {steps.map((st, i) => {
            const done = !!st.at;
            const isNext = !done && steps.slice(0, i).every((x) => x.at);
            return (
              <li key={st.label} className={cn("rounded-2xl border-2 px-2 py-3 text-center", done ? "border-emerald-300 bg-emerald-50" : isNext ? "border-gold bg-gold/10" : "border-line")}>
                <st.icon className={cn("mx-auto h-5 w-5", done ? "text-emerald-600" : isNext ? "text-amber-700" : "text-slate-300")} />
                <div className="mt-1 text-[11px] font-semibold text-navy">{st.label}</div>
                <div className={cn("text-xs tabular-nums", done ? "font-semibold text-emerald-700" : "text-slate-400")}>{done ? formatDateTime(st.at).slice(-8) : `plan ${pretty(st.plan)}`}</div>
              </li>
            );
          })}
        </ol>

        {/* Selfie */}
        <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Selfie" className="h-28 w-28 rounded-2xl object-cover shadow" />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 text-slate-300"><Camera className="h-9 w-9" /></div>
          )}
          <div className="space-y-2">
            <Button variant="secondary" icon={Camera} onClick={() => void openCamera()}>{photo ? "Retake selfie" : "Take selfie"}</Button>
            <button type="button" className="block text-xs text-slate-500 underline" onClick={() => input.current?.click()}>or choose a photo</button>
            {camError && <p className="text-xs text-red-700">{camError}</p>}
            <input ref={input} type="file" accept="image/*" capture="user" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await toSelfieDataUrl(f)); e.target.value = ""; }} />
          </div>
        </div>
        {stream && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
            <video ref={video} playsInline muted autoPlay className="max-h-[70vh] w-full max-w-md rounded-2xl" style={{ transform: "scaleX(-1)" }} />
            <div className="mt-4 flex gap-3">
              <Button icon={Camera} onClick={capture}>Capture</Button>
              <Button variant="secondary" icon={X} onClick={stopCamera}>Cancel</Button>
            </div>
            <p className="mt-2 text-xs text-slate-300">Look at the camera, then tap Capture.</p>
          </div>
        )}

        {/* Location */}
        <div className="rounded-2xl border border-line p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-slate-700"><MapPin className="h-4 w-4" /> Location</span>
            <Button variant="ghost" size="sm" icon={RefreshCw} loading={locating} onClick={locate}>Retry</Button>
          </div>
          {pos ? (
            <div className="mt-1 space-y-1 text-slate-600">
              {unitPos ? (
                <div className={locationOk ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{locationOk ? "✓ You are at" : "⚠ Outside"} {String(unit?.name)} · {distance} m</div>
              ) : (
                <div>📍 {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} <span className="text-slate-400">(±{pos.accuracy} m)</span></div>
              )}
            </div>
          ) : (
            <div className="mt-1 text-slate-500">{locating ? "Getting your position…" : (posError ?? "Location not captured.")}</div>
          )}
        </div>

        {punch ? (
          <Button icon={CheckCircle2} loading={saving} onClick={() => void save()} className="w-full py-4 text-base">{punch.label}</Button>
        ) : (
          <p className="rounded-2xl bg-emerald-50 px-4 py-4 text-center font-semibold text-emerald-700">✅ All four punches done today — thank you!</p>
        )}
      </section>

      {leader && (
        <section className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy"><Coffee className="h-5 w-5 text-emerald-600" /> Give rest time</h2>
          <p className="-mt-2 text-xs text-slate-500">When someone is free, give them rest. They see “You are on rest time” in their app.</p>
          <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr]">
            <select className="rounded-xl border border-line bg-white px-3 py-2.5" value={restForm.staff_id} onChange={(e) => setRestForm((f) => ({ ...f, staff_id: e.target.value }))}>
              <option value="">Choose person…</option>
              {staff.map((x) => <option key={x.id} value={x.id}>{String(x.name)}</option>)}
            </select>
            <input type="time" className="rounded-xl border border-line px-3 py-2.5" value={restForm.start_time} onChange={(e) => setRestForm((f) => ({ ...f, start_time: e.target.value }))} />
            <input type="time" className="rounded-xl border border-line px-3 py-2.5" value={restForm.end_time} onChange={(e) => setRestForm((f) => ({ ...f, end_time: e.target.value }))} />
          </div>
          <input className="w-full rounded-xl border border-line px-3 py-2.5" placeholder="Message (optional) — e.g. Rooms done, take rest" value={restForm.note} onChange={(e) => setRestForm((f) => ({ ...f, note: e.target.value }))} />
          <Button icon={Send} onClick={() => void giveRest()}>Give rest time</Button>
          {rests.length > 0 && (
            <ul className="space-y-1.5 border-t border-line pt-3 text-sm">
              {rests.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2"><span>🌿 {String(staff.find((x) => x.id === r.staff_id)?.name ?? "")}</span><span className="text-emerald-700">{pretty(String(r.start_time))} – {pretty(String(r.end_time))}</span></li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
