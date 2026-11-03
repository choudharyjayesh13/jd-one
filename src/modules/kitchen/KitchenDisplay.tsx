"use client";
/**
 * Kitchen display (/kitchen/): every open KOT as a card in three columns —
 * New → Preparing → Ready. The kitchen taps Accept, then Ready; service marks
 * Served from the order. Cards turn red after 15 minutes. Updates live, and
 * re-checks every 20 seconds in case the live link drops.
 */
import { useEffect, useState } from "react";
import { getStore } from "@/core/data";
import { formatDate } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Loading, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import type { Row } from "@/core/schema/types";

const LATE_MIN = 15;
const COLUMNS = [
  { status: "New", title: "New orders", next: "Preparing", action: "Accept" },
  { status: "Preparing", title: "Preparing", next: "Ready", action: "Ready" },
  { status: "Ready", title: "Ready to serve", next: "Served", action: "Served" },
] as const;

function minutesSince(iso: unknown, now: number): number {
  const t = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : 0;
}

export function KitchenDisplay() {
  const user = useUser();
  const { toast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const [sinceKey] = useState(since);
  const { rows, loading, reload } = useList("kots", { filter: user.unitId ? { business_unit_id: user.unitId } : {}, range: { created_at: { gte: sinceKey } }, sort: { field: "created_at", dir: "asc" } });

  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now());
      void reload();
    }, 20000);
    return () => window.clearInterval(t);
  }, [reload]);

  const move = async (k: Row, status: string) => {
    try {
      await getStore().update("kots", k.id, { status });
      toast(status === "Preparing" ? `KOT ${String(k.kot_no ?? "")} accepted` : `KOT ${String(k.kot_no ?? "")} → ${status}`);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div>
      <PageHeader title="Kitchen display" subtitle={`Open orders · ${formatDate(new Date().toISOString().slice(0, 10))} · late after ${LATE_MIN} min`} />
      {loading ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((c) => {
            const list = rows.filter((k) => k.status === c.status);
            return (
              <section key={c.status} className="flex flex-col gap-3">
                <h2 className="flex items-baseline justify-between border-b border-line pb-2">
                  <span className="jd-serif text-2xl font-semibold">{c.title}</span>
                  <span className="text-sm text-slate-500">{list.length}</span>
                </h2>
                {list.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
                {list.map((k) => {
                  const mins = minutesSince(k.created_at, now);
                  const late = c.status !== "Ready" && mins >= LATE_MIN;
                  return (
                    <article key={k.id} className={cn("flex flex-col gap-2 rounded-xl border p-4", late ? "border-red-500" : "border-line")}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-lg font-semibold">KOT {String(k.kot_no ?? "")}</span>
                        <span className={cn("text-sm font-medium", late ? "text-red-600" : "text-slate-500")}>{mins} min</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {String(k.order_type ?? "")}
                        {k.table_or_room ? ` · ${String(k.table_or_room)}` : ""}
                        {k.guest_name ? ` · ${String(k.guest_name)}` : ""}
                        {k.pax ? ` · ${String(k.pax)} pax` : ""}
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">{String(k.items ?? "")}</pre>
                      {k.special_notes ? <p className="rounded-md border border-gold/60 px-2 py-1 text-sm">Note: {String(k.special_notes)}</p> : null}
                      <div className="flex gap-2">
                        <Button className="flex-1" onClick={() => void move(k, c.next)}>
                          {c.action}
                        </Button>
                        {c.status === "New" && (
                          <Button variant="secondary" onClick={() => void move(k, "Cancelled")}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
