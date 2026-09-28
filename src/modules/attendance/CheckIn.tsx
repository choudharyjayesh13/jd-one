"use client";
/**
 * Mark attendance from a phone: selfie (front camera), exact time, and GPS
 * position. Saves onto today's attendance row (status P) and, when the
 * business unit has coordinates, records the distance from the property.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, LogIn, LogOut, MapPin, RefreshCw } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { todayISO, formatDateTime } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { PageHeader } from "@/core/ui/misc";
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
    if (!staffId) return setToday(null);
    void store.list("attendance", { filter: { date: todayISO(), staff_id: staffId } }).then((rows) => setToday(rows[0] ?? null));
  }, [store, staffId, saving]);

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
    locate();
     
  }, []);

  const save = async (kind: "in" | "out") => {
    if (!staffId) return toast("Choose your name first", "error");
    if (!photo) return toast("Take a selfie first", "error");
    if (!pos) return toast("Location not captured yet — press Retry location", "error");
    setSaving(true);
    try {
      const at = new Date().toISOString();
      const device = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : null;
      const common = { latitude: pos.lat, longitude: pos.lng, accuracy_m: pos.accuracy, distance_m: distance, location_ok: locationOk, device };
      if (kind === "in") {
        const values = { date: todayISO(), staff_id: staffId, status: "P", checked_in_at: at, selfie: photo, ...common };
        if (today) await store.update("attendance", today.id, values);
        else await store.create("attendance", values);
        toast(`Checked in at ${formatDateTime(at)}${distance != null ? ` · ${distance} m from ${unit?.name}` : ""}`, "success");
      } else {
        if (!today) return toast("No check-in today yet", "error");
        await store.update("attendance", today.id, { checked_out_at: at, selfie_out: photo, ...common });
        toast(`Checked out at ${formatDateTime(at)}`, "success");
      }
      setPhoto(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Mark attendance" subtitle="Selfie + time + location. Works best on your phone." />
      <Card>
        <CardBody className="space-y-4">
          <div className="text-center">
            <div className="text-3xl font-semibold tabular-nums text-navy">{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            <div className="text-sm text-slate-500">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Who are you?
            <select className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select your name…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {String(s.name)}
                  {s.designation ? ` · ${s.designation}` : ""}
                </option>
              ))}
            </select>
          </label>
          {today?.checked_in_at ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Checked in today at {formatDateTime(today.checked_in_at)}
              {today.checked_out_at ? ` · out at ${formatDateTime(today.checked_out_at)}` : ""}
            </p>
          ) : null}

          <div className="flex items-center gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Selfie" className="h-28 w-28 rounded-xl border border-line object-cover" />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-line text-slate-300">
                <Camera className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-2">
              <Button variant="secondary" icon={Camera} onClick={() => input.current?.click()}>
                {photo ? "Retake selfie" : "Take selfie"}
              </Button>
              <input
                ref={input}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto(await toSelfieDataUrl(f));
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-slate-500">Front camera opens on phones.</p>
            </div>
          </div>

          <div className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-medium text-slate-700">
                <MapPin className="h-4 w-4" /> Location
              </span>
              <Button variant="ghost" size="sm" icon={RefreshCw} loading={locating} onClick={locate}>
                Retry location
              </Button>
            </div>
            {pos ? (
              <div className="mt-1 space-y-1 text-slate-600">
                <div>
                  {pos.lat.toFixed(6)}, {pos.lng.toFixed(6)} <span className="text-slate-400">(±{pos.accuracy} m)</span>{" "}
                  <a className="text-navy underline" href={`https://maps.google.com/?q=${pos.lat},${pos.lng}`} target="_blank" rel="noreferrer">
                    map
                  </a>
                </div>
                {unitPos ? (
                  <div className={locationOk ? "text-emerald-700" : "text-red-700"}>
                    {distance} m from {String(unit?.name)} {locationOk ? "✓ on site" : `— outside the ${fence} m limit`}
                  </div>
                ) : (
                  <div className="text-slate-400">Set the property&apos;s latitude/longitude under Settings → Business units to check distance.</div>
                )}
              </div>
            ) : (
              <div className="mt-1 text-slate-500">{locating ? "Getting your position…" : (posError ?? "Location not captured.")}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button icon={LogIn} loading={saving} disabled={!!today?.checked_in_at} onClick={() => void save("in")}>
              Check in
            </Button>
            <Button variant="secondary" icon={LogOut} loading={saving} disabled={!today?.checked_in_at || !!today?.checked_out_at} onClick={() => void save("out")}>
              Check out
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
