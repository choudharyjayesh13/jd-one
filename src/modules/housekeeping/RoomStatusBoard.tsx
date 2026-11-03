"use client";
/**
 * Room status board (/room-status/): every room as a tile — who is in it today
 * (in house / arriving / leaving / vacant) and its housekeeping status. Tap a
 * status to change it; each change is saved as a housekeeping entry.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { getStore } from "@/core/data";
import { todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { newHref, viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader, EmptyState } from "@/core/ui/misc";
import { Select } from "@/core/ui/Input";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import type { Row } from "@/core/schema/types";
import { HK_STATUSES } from "@/modules/rooms/entity";
import { HOLDING_STATUSES, expandStays } from "@/modules/rooms/occupancy";

const TONE: Record<string, string> = {
  Clean: "border-emerald-500/70",
  Inspected: "border-sky-500/70",
  Dirty: "border-red-500/80",
  Maintenance: "border-amber-500/80",
};
const DOT: Record<string, string> = { Clean: "bg-emerald-500", Inspected: "bg-sky-500", Dirty: "bg-red-500", Maintenance: "bg-amber-500" };

export function RoomStatusBoard() {
  const user = useUser();
  const { toast } = useToast();
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const today = todayISO();
  const [filter, setFilter] = useState("All");
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows: rooms, loading, reload } = useList("rooms", { filter: { ...unitFilter, active: true }, sort: { field: "sort_order", dir: "asc" }, thenBy: { field: "name", dir: "asc" } });
  const { rows: bookings } = useList("bookings", { filter: unitFilter, range: { check_in: { lte: today }, check_out: { gte: today } } });

  // Who is in each room today.
  const occ = useMemo(() => {
    const m = new Map<string, { label: string; guest: string; bookingId: string }>();
    for (const s of expandStays(bookings.filter((b) => HOLDING_STATUSES.includes(String(b.status)) || b.status === "Checked-out"))) {
      if (!s.room_id) continue;
      const rid = String(s.room_id);
      const ci = String(s.check_in);
      const co = String(s.check_out);
      let label = "";
      if (co === today) label = s.status === "Checked-out" ? "Left today" : "Leaving today";
      else if (ci === today) label = s.status === "Checked-in" ? "In house" : "Arriving today";
      else if (ci < today && co > today) label = "In house";
      if (!label || s.status === "Cancelled") continue;
      if (!m.has(rid) || label === "Arriving today") m.set(rid, { label, guest: String(s.guest_name ?? ""), bookingId: s._bookingId });
    }
    return m;
  }, [bookings, today]);

  const setStatus = async (room: Row, status: string) => {
    try {
      await getStore().create("housekeeping-reports", {
        date: today,
        room_id: room.id,
        status,
        task: status === "Inspected" ? "Inspection" : status === "Maintenance" ? "Maintenance" : "Daily clean",
        cleaned_by: staffId,
        business_unit_id: room.business_unit_id,
        created_by: staffId,
      });
      await getStore().update("rooms", room.id, { hk_status: status });
      toast(`${String(room.name)}: ${status}`);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const shown = rooms.filter((r) => filter === "All" || r.hk_status === filter);
  const count = (s: string) => rooms.filter((r) => r.hk_status === s).length;

  return (
    <div>
      <PageHeader
        title="Room status board"
        subtitle="Today’s guests and housekeeping status of every room. Tap a status to change it."
        actions={
          <Link href={newHref("housekeeping-reports")} className="text-sm underline">
            Full room checklist →
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["All", ...HK_STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn("h-10 rounded-full border px-4 text-sm", filter === s ? "border-[#ffffff] bg-[#ffffff] font-medium text-[#000000]" : "border-line text-slate-600")}
          >
            {s} {s === "All" ? rooms.length : count(s)}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : rooms.length === 0 ? (
        <EmptyState title="No rooms yet" hint="Add each cottage, suite and tent under Front Office → Rooms." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((r) => {
            const o = occ.get(r.id);
            const hk = String(r.hk_status ?? "Clean");
            return (
              <div key={r.id} className={cn("flex flex-col gap-2 rounded-xl border-2 p-3", TONE[hk] ?? "border-line")}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={viewHref("rooms", r.id)} className="font-semibold hover:underline">
                    {String(r.name)}
                  </Link>
                  <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", DOT[hk] ?? "bg-slate-400")} aria-hidden="true" />
                </div>
                <span className="text-xs text-slate-500">{String(r.unit_type ?? "")}</span>
                {o ? (
                  <Link href={viewHref("bookings", o.bookingId)} className="text-sm">
                    <span className="font-medium">{o.label}</span>
                    <span className="block truncate text-slate-500">{o.guest}</span>
                  </Link>
                ) : (
                  <span className="text-sm text-slate-500">Vacant</span>
                )}
                <Select value={hk} onChange={(e) => void setStatus(r, e.target.value)} aria-label={`Housekeeping status of ${String(r.name)}`}>
                  {HK_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
