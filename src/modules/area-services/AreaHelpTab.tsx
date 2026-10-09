"use client";
/**
 * "Area help" tab of the JD One network: emergency numbers first, then the
 * thana, hospitals, fire station and complaint lines for the chosen area.
 * "Use my location" asks the phone for its position once and sorts by distance;
 * the position stays on the device and is never saved.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { LocateFixed, MapPin, Phone, ShieldAlert, BadgeCheck } from "lucide-react";
import { formatDate } from "@/core/format";
import { viewHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { EmptyState } from "@/core/ui/misc";
import type { Row } from "@/core/schema/types";

/** National / Rajasthan numbers that work from any phone. */
export const EMERGENCY_NUMBERS: { label: string; number: string; note?: string }[] = [
  { label: "All emergencies", number: "112", note: "Police, fire, ambulance" },
  { label: "Police", number: "100" },
  { label: "Ambulance", number: "108" },
  { label: "Fire", number: "101" },
  { label: "Women helpline (Rajasthan Police)", number: "1090" },
  { label: "Child helpline", number: "1098" },
  { label: "Cyber fraud", number: "1930" },
  { label: "Highway help (NHAI)", number: "1033" },
  { label: "Rajasthan Sampark (govt complaints)", number: "181" },
];

const ORDER = ["Police station", "Police control room", "Women police station", "Cyber police station", "Traffic police", "Hospital (govt)", "Hospital (private, 24x7 emergency)", "Ambulance", "Fire station", "Blood bank", "Electricity complaint", "Water complaint", "Municipal office", "Collectorate / tehsil", "Other"];

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const hasPos = (r: Row) => r.lat !== null && r.lat !== undefined && r.lat !== "" && r.lng !== null && r.lng !== undefined && r.lng !== "";

function Tel({ n }: { n: unknown }) {
  if (!n) return null;
  return (
    <a href={`tel:${String(n).replace(/\s/g, "")}`} className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
      <Phone className="h-3.5 w-3.5" /> {String(n)}
    </a>
  );
}

function Service({ r, dist }: { r: Row; dist: number | null }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={viewHref("area-services", r.id)} className="font-medium text-navy hover:underline">
          {String(r.name)}
        </Link>
        {r.verified ? <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="Verified" /> : null}
        {dist !== null && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}</span>}
        {r.hours ? <span className="text-xs text-slate-500">{String(r.hours)}</span> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Tel n={r.phone} />
        <Tel n={r.phone2} />
        {hasPos(r) && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sky-700 hover:underline">
            <MapPin className="h-3.5 w-3.5" /> Directions
          </a>
        )}
      </div>
      {Boolean(r.officer_name || r.beat_officer) && (
        <div className="mt-1 text-xs text-slate-600">
          {r.officer_name ? (
            <span>
              {String(r.officer_rank ?? "In-charge")}: <b>{String(r.officer_name)}</b> {r.officer_phone ? <Tel n={r.officer_phone} /> : null}
            </span>
          ) : null}
          {r.beat_officer ? (
            <span className="ml-3">
              {String(r.beat_rank ?? "Beat officer")}
              {r.beat_area ? ` (${String(r.beat_area)})` : ""}: <b>{String(r.beat_officer)}</b> {r.beat_phone ? <Tel n={r.beat_phone} /> : null}
            </span>
          ) : null}
          {r.officers_checked_on ? <span className="ml-2 text-slate-400">checked {formatDate(r.officers_checked_on)}</span> : null}
        </div>
      )}
      {r.area_covered ? <div className="mt-0.5 text-xs text-slate-500">Covers: {String(r.area_covered)}</div> : null}
      {r.address ? <div className="text-xs text-slate-400">{String(r.address)}</div> : null}
    </li>
  );
}

export function AreaHelpTab({ rows, query }: { rows: Row[]; query: string }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string>("");

  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return setLocMsg("This phone or browser can't share location.");
    setLocMsg("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocMsg("Sorted by distance from you. Your location is not saved.");
      },
      () => setLocMsg("Location permission was not given. Pick your area with the filters above instead."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const withDist = useMemo(
    () => rows.map((r) => ({ r, dist: pos && hasPos(r) ? km(pos, { lat: Number(r.lat), lng: Number(r.lng) }) : null })),
    [rows, pos],
  );
  /** "Which thana is this?": the police station whose covered areas mention the searched locality, else the nearest one. */
  const myThana = useMemo(() => {
    const thanas = withDist.filter((x) => x.r.type === "Police station");
    if (query) {
      const hit = thanas.find((x) => String(x.r.area_covered ?? "").toLowerCase().includes(query.toLowerCase()));
      if (hit) return hit;
    }
    return pos ? [...thanas].filter((x) => x.dist !== null).sort((a, b) => a.dist! - b.dist!)[0] ?? null : null;
  }, [withDist, query, pos]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof withDist>();
    for (const x of withDist) m.set(String(x.r.type), [...(m.get(String(x.r.type)) ?? []), x]);
    for (const list of m.values()) list.sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9) || String(a.r.name).localeCompare(String(b.r.name)));
    return Array.from(m.entries()).sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  }, [withDist]);

  return (
    <div className="space-y-4">
      <Card className="border-red-200">
        <CardHeader title="Emergency numbers" subtitle="Free from any phone, anywhere in India" />
        <CardBody>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EMERGENCY_NUMBERS.map((e) => (
              <a key={e.number} href={`tel:${e.number}`} className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2 hover:bg-red-100">
                <span className="text-sm text-red-900">
                  {e.label}
                  {e.note ? <span className="block text-xs text-red-700/70">{e.note}</span> : null}
                </span>
                <span className="text-lg font-bold tabular-nums text-red-700">{e.number}</span>
              </a>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" icon={LocateFixed} onClick={locate}>
          Use my location
        </Button>
        {locMsg && <span className="text-xs text-slate-500">{locMsg}</span>}
      </div>

      {myThana && (
        <Card className="border-navy/30">
          <CardHeader title={`Your thana: ${String(myThana.r.name)}`} subtitle={query ? `Covers “${query}”` : "Nearest police station to you"} />
          <CardBody>
            <ul>
              <Service r={myThana.r} dist={myThana.dist} />
            </ul>
          </CardBody>
        </Card>
      )}

      {!rows.length ? (
        <EmptyState title="No area services here yet" hint="Pick another district, or add the thana, hospital and fire station for this area." />
      ) : (
        groups.map(([type, list]) => (
          <Card key={type}>
            <CardHeader title={type} subtitle={`${list.length} in this area`} />
            <CardBody>
              <ul className="divide-y divide-line">
                {list.slice(0, 12).map((x) => (
                  <Service key={x.r.id} r={x.r} dist={x.dist} />
                ))}
              </ul>
            </CardBody>
          </Card>
        ))
      )}
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        In an emergency call 112 first. Officer names change with transfers; check the date shown and update it when you learn of a change.
      </p>
    </div>
  );
}
