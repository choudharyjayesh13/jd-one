"use client";
/**
 * HR → Duty location (/live-location/). Chairman and Director only.
 * For each person with duty location on (e.g. the purchaser): where they were last seen and
 * the day's route on a map, from the JD One Android app. Points are kept 30 days.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { addDays, calendarTodayISO, formatDate } from "@/core/format";
import { NoAccess } from "@/core/ui/AuthGate";
import { Button } from "@/core/ui/Button";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { EmptyState, Loading, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";

const time = (iso: unknown) => new Date(String(iso)).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
function ago(iso: unknown) {
  const m = Math.round((Date.now() - Date.parse(String(iso))) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} days ago`;
}
const gmaps = (p: Row) => `https://www.google.com/maps?q=${Number(p.latitude)},${Number(p.longitude)}`;

type LeafletLike = {
  map: (el: HTMLElement, o?: Record<string, unknown>) => LMap;
  tileLayer: (u: string, o: Record<string, unknown>) => { addTo: (m: LMap) => void };
  polyline: (ll: [number, number][], o: Record<string, unknown>) => { addTo: (m: LMap) => unknown };
  circleMarker: (ll: [number, number], o: Record<string, unknown>) => { addTo: (m: LMap) => { bindTooltip: (t: string) => unknown } };
  latLngBounds: (ll: [number, number][]) => unknown;
};
type LMap = { fitBounds: (b: unknown, o?: Record<string, unknown>) => void; setView: (ll: [number, number], z: number) => void; remove: () => void };

let leafletLoading: Promise<LeafletLike> | null = null;
function loadLeaflet(): Promise<LeafletLike> {
  const w = window as unknown as { L?: LeafletLike };
  if (w.L) return Promise.resolve(w.L);
  if (!leafletLoading)
    leafletLoading = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => (w.L ? resolve(w.L) : reject(new Error("Map did not load")));
      s.onerror = () => reject(new Error("Map did not load"));
      document.head.appendChild(s);
    });
  return leafletLoading;
}

function RouteMap({ points }: { points: Row[] }) {
  const el = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!el.current || !points.length) return;
    let map: LMap | null = null;
    let live = true;
    loadLeaflet()
      .then((L) => {
        if (!live || !el.current) return;
        map = L.map(el.current, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
        const ll = points.map((p) => [Number(p.latitude), Number(p.longitude)] as [number, number]);
        if (ll.length > 1) L.polyline(ll, { color: "#a9802f", weight: 4, opacity: 0.85 }).addTo(map);
        points.forEach((p, i) => {
          const lastOne = i === points.length - 1;
          L.circleMarker(ll[i], { radius: lastOne ? 9 : 4, color: lastOne ? "#17140f" : "#a9802f", fillColor: lastOne ? "#e9c46a" : "#ffffff", fillOpacity: 1, weight: lastOne ? 3 : 2 })
            .addTo(map!)
            .bindTooltip(`${time(p.at)}${lastOne ? " · last seen" : ""}`);
        });
        if (ll.length > 1) map.fitBounds(L.latLngBounds(ll), { padding: [30, 30] });
        else map.setView(ll[0], 16);
      })
      .catch((e: Error) => setErr(e.message));
    return () => {
      live = false;
      map?.remove();
    };
  }, [points]);
  if (err) return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{err}. Use the Google Maps links below.</p>;
  return <div ref={el} className="h-[420px] w-full overflow-hidden rounded-xl border border-line" />;
}

export function LiveLocation() {
  const user = useUser();
  const [date, setDate] = useState(calendarTodayISO());
  const { rows: tracked, loading } = useList("staff", { filter: { track_location: true, active: true }, sort: { field: "name", dir: "asc" } });
  const [who, setWho] = useState("");
  const person = tracked.find((s) => s.id === who) ?? tracked[0];
  const { rows: pings } = useList(person ? "location-pings" : null, { filter: { staff_id: person?.id }, range: { at: { gte: `${date}T00:00:00+05:30`, lte: `${date}T23:59:59+05:30` } }, sort: { field: "at", dir: "asc" }, limit: 1000 });
  const { rows: latestRows } = useList(person ? "location-pings" : null, { filter: { staff_id: person?.id }, sort: { field: "at", dir: "desc" }, limit: 1 });
  const latest = latestRows[0];
  const points = useMemo(() => pings, [pings]);

  if (!user.post) return <NoAccess />;
  return (
    <div>
      <PageHeader title="Duty location" subtitle="Staff with duty location on · from check-in to check-out · kept 30 days" />
      {loading ? (
        <Loading />
      ) : tracked.length === 0 ? (
        <EmptyState title="Nobody has duty location on" hint="Turn it on for a person in HR → Employees → Location." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {tracked.length > 1 && (
              <Select value={person?.id ?? ""} onChange={(e) => setWho(e.target.value)} className="h-9 w-auto">
                {tracked.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.name)}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))}>
              ‹ Day before
            </Button>
            <Input type="date" value={date} max={calendarTodayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-auto" />
            {date !== calendarTodayISO() && (
              <Button variant="ghost" size="sm" onClick={() => setDate(calendarTodayISO())}>
                Today
              </Button>
            )}
          </div>

          {person && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-5 py-4">
              <div>
                <p className="jd-serif text-xl font-semibold text-navy">{String(person.name)}</p>
                <p className="text-sm text-slate-500">{String(person.designation ?? "")}</p>
              </div>
              {latest ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Last seen</p>
                    <p className={cn("text-sm font-medium", Date.now() - Date.parse(String(latest.at)) < 15 * 60000 ? "text-emerald-700" : "text-navy")}>
                      {ago(latest.at)} · {time(latest.at)}
                      {latest.accuracy_m ? <span className="font-normal text-slate-500"> · ±{Number(latest.accuracy_m)} m</span> : null}
                    </p>
                  </div>
                  <a href={gmaps(latest)} target="_blank" rel="noreferrer">
                    <Button size="sm" icon={ExternalLink}>
                      Google Maps
                    </Button>
                  </a>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No location yet. It starts when they check in from the JD One Android app.</p>
              )}
            </section>
          )}

          {points.length ? (
            <>
              <RouteMap points={points} />
              <section className="rounded-xl border border-line bg-white">
                <h2 className="border-b border-line px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {formatDate(date)} · {points.length} point{points.length === 1 ? "" : "s"}
                </h2>
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {[...points].reverse().map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                      <span className="flex items-center gap-2 text-navy">
                        <MapPin className="h-3.5 w-3.5 text-[#a9802f]" /> {time(p.at)}
                        {p.speed_kmh ? <span className="text-xs text-slate-500">· {Number(p.speed_kmh)} km/h</span> : null}
                      </span>
                      <a href={gmaps(p)} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#9a7128] hover:underline">
                        Open in Google Maps
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-slate-500">No location points on {formatDate(date)}.</p>
          )}
        </div>
      )}
    </div>
  );
}
