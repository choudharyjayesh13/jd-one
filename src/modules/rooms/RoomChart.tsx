"use client";
/**
 * Room chart (/room-chart/): every room of the property as a block, grouped by category
 * (cottages, family suite, camps…), with its state right now:
 *   Occupied · Vacant · Dirty · Out of order · DND (do not disturb)
 * plus who is in it and whether someone arrives or leaves today. Tap a room to see the
 * guest, mark it clean / dirty, DND, or out of order.
 * Which departments see this page is ticked in Administration → Home cards.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { formatDate, formatMoney, todayISO } from "@/core/format";
import { viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Select } from "@/core/ui/Input";
import { Loading, PageHeader } from "@/core/ui/misc";
import { NoAccess } from "@/core/ui/AuthGate";
import { cn } from "@/core/ui/cn";
import { bookingForRoom, roomLines } from "./occupancy";
import { useUnitChoice } from "./unit";
import { useSharedPage } from "./shared";

export type RoomState = "Occupied" | "Vacant" | "Dirty" | "Out of order" | "DND";
export const STATE_STYLE: Record<RoomState, { tile: string; dot: string; label: string }> = {
  Occupied: { tile: "border-[#1f5f8b]/30 bg-[#eef4f9]", dot: "bg-[#1f5f8b]", label: "text-[#1f5f8b]" },
  Vacant: { tile: "border-emerald-200 bg-emerald-50/70", dot: "bg-emerald-600", label: "text-emerald-700" },
  Dirty: { tile: "border-amber-300 bg-amber-50", dot: "bg-amber-500", label: "text-amber-800" },
  "Out of order": { tile: "border-slate-300 bg-slate-100", dot: "bg-slate-500", label: "text-slate-600" },
  DND: { tile: "border-[#7c3a5c]/30 bg-[#f8eef3]", dot: "bg-[#7c3a5c]", label: "text-[#7c3a5c]" },
};
const ORDER: RoomState[] = ["Occupied", "Vacant", "Dirty", "Out of order", "DND"];

export function roomState(room: Row, guest: Row | undefined): RoomState {
  if (String(room.status) === "Out of order") return "Out of order";
  const inRoom = guest && String(guest.status) === "Checked-in";
  if (inRoom && room.dnd) return "DND";
  if (inRoom) return "Occupied";
  if (String(room.hk_status) === "Dirty") return "Dirty";
  return "Vacant";
}

export function RoomChart() {
  const user = useUser();
  const { toast } = useToast();
  const today = todayISO();
  const { unit, setUnit, units, canAll, unitName } = useUnitChoice();
  const allowed = useSharedPage("room-chart");
  const unitFilter = unit ? { business_unit_id: unit } : {};
  const { rows: rooms, loading, reload: reloadRooms } = useList("rooms", { filter: { ...unitFilter, active: true }, sort: { field: "sort_order", dir: "asc" }, thenBy: { field: "name", dir: "asc" } });
  const { rows: bookings } = useList("bookings", { filter: unitFilter, range: { check_out: { gte: today } } });
  const [open, setOpen] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const info = useMemo(
    () =>
      rooms.map((r) => {
        const guest = bookingForRoom(bookings, r.id, today) ?? bookings.find((b) => String(b.status) === "Checked-in" && String(b.check_out) === today && (b.room_id === r.id || roomLines(b).some((l) => l.room_ids?.includes(r.id))));
        const arriving = bookings.find((b) => String(b.check_in) === today && ["Confirmed", "On hold"].includes(String(b.status)) && (b.room_id === r.id || roomLines(b).some((l) => l.room_ids?.includes(r.id))));
        const leaving = guest && String(guest.check_out) === today;
        return { room: r, guest: guest && ["Checked-in", "Confirmed"].includes(String(guest.status)) ? guest : undefined, arriving, leaving, state: roomState(r, guest) };
      }),
    [rooms, bookings, today],
  );
  const groups = useMemo(() => {
    const m = new Map<string, typeof info>();
    for (const i of info) {
      const k = String(i.room.unit_type ?? "Rooms");
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return Array.from(m.entries());
  }, [info]);
  const counts = Object.fromEntries(ORDER.map((s) => [s, info.filter((i) => i.state === s).length])) as Record<RoomState, number>;

  if (!allowed) return <NoAccess />;

  const update = async (room: Row, patch: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await getStore().update("rooms", room.id, patch);
      await reloadRooms();
      setOpen((o) => (o ? { ...o, ...patch } : o));
      toast(msg, "success");
    } catch (e) {
      toast(`Could not update: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const sel = open ? info.find((i) => i.room.id === open.id) : undefined;

  return (
    <div>
      <PageHeader
        title="Room chart"
        subtitle={`${unitName} · ${formatDate(today)} · ${rooms.length} rooms`}
        actions={
          canAll ? (
            <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto">
              <option value="">All JD Stays properties</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {String(u.name)}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ORDER.map((s) => (
          <div key={s} className={cn("rounded-lg border px-3 py-2.5", STATE_STYLE[s].tile)}>
            <div className={cn("flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]", STATE_STYLE[s].label)}>
              <span className={cn("h-2 w-2 rounded-full", STATE_STYLE[s].dot)} /> {s}
            </div>
            <div className="jd-serif mt-1 text-2xl font-semibold text-navy">{counts[s]}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-slate-500">No rooms set up for this property yet.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([type, list]) => (
            <section key={type}>
              <h2 className="mb-2 flex items-baseline gap-2">
                <span className="jd-serif text-2xl font-semibold text-navy">{type}</span>
                <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  {list.length} {list.length === 1 ? "room" : "rooms"}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {list.map((i) => (
                  <button key={i.room.id} type="button" onClick={() => setOpen(i.room)} className={cn("flex min-h-[124px] flex-col justify-between rounded-xl border p-3.5 text-left transition hover:shadow-md", STATE_STYLE[i.state].tile)}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="jd-serif text-xl font-semibold leading-tight text-navy">{String(i.room.name)}</span>
                      <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", STATE_STYLE[i.state].dot)} />
                    </div>
                    <div>
                      <div className={cn("text-[11px] font-medium uppercase tracking-[0.14em]", STATE_STYLE[i.state].label)}>{i.state}</div>
                      {i.guest && <div className="mt-0.5 truncate text-sm text-navy">{String(i.guest.guest_name)}</div>}
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                        {i.leaving && <span className="rounded bg-white/80 px-1.5 py-0.5 text-slate-700">Departs today</span>}
                        {i.arriving && <span className="rounded bg-white/80 px-1.5 py-0.5 text-slate-700">Arrives today</span>}
                        {i.state !== "Dirty" && String(i.room.hk_status) === "Dirty" && <span className="rounded bg-white/80 px-1.5 py-0.5 text-amber-800">Needs cleaning</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {open && sel && (
        <Dialog open onClose={() => setOpen(null)} title={`${String(sel.room.name)} · ${sel.state}`}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              {String(sel.room.unit_type)}
              {sel.room.block ? ` · ${String(sel.room.block)}` : ""} · housekeeping: {String(sel.room.hk_status ?? "—")}
            </p>
            {sel.guest ? (
              <Link href={viewHref("bookings", sel.guest.id)} className="rounded-lg border border-line px-3 py-2 hover:bg-slate-50">
                <span className="block font-medium text-navy">{String(sel.guest.guest_name)}</span>
                <span className="block text-xs text-slate-500">
                  {formatDate(sel.guest.check_in)} → {formatDate(sel.guest.check_out)} · {String(sel.guest.status)} · balance {formatMoney(sel.guest.balance)}
                </span>
              </Link>
            ) : sel.arriving ? (
              <Link href={viewHref("bookings", sel.arriving.id)} className="rounded-lg border border-line px-3 py-2 hover:bg-slate-50">
                <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Arriving today</span>
                <span className="block font-medium text-navy">{String(sel.arriving.guest_name)}</span>
              </Link>
            ) : (
              <p className="text-sm text-slate-500">No guest in this room tonight.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" loading={busy} onClick={() => void update(sel.room, { hk_status: "Clean" }, "Marked clean")}>
                Mark clean
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => void update(sel.room, { hk_status: "Dirty" }, "Marked dirty")}>
                Mark dirty
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => void update(sel.room, { dnd: !sel.room.dnd }, sel.room.dnd ? "DND removed" : "Do not disturb on")}>
                {sel.room.dnd ? "Remove DND" : "Do not disturb"}
              </Button>
              <Button
                variant={String(sel.room.status) === "Out of order" ? "secondary" : "danger"}
                loading={busy}
                onClick={() => void update(sel.room, { status: String(sel.room.status) === "Out of order" ? "Available" : "Out of order" }, String(sel.room.status) === "Out of order" ? "Back in service" : "Marked out of order")}
              >
                {String(sel.room.status) === "Out of order" ? "Back in service" : "Out of order"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
      <p className="mt-4 text-xs text-slate-500">
        {user.post ? "Which departments see this page: Administration → Home cards." : ""}
      </p>
    </div>
  );
}
