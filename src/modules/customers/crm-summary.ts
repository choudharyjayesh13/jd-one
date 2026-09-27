/** Group-wide CRM numbers for the Marketing / Finance dashboard sections. */
import type { DataStore } from "@/core/data/types";
import type { Row } from "@/core/schema/types";
import { addDays, todayISO } from "@/core/format";

export interface CrmSummary {
  customers: number;
  guestsWithStay: number;
  repeatGuestPct: number | null;
  topBySpend: { customer: Row; spend: number; stays: number }[];
  winBack: { customer: Row; lastContact: string | null }[];
  celebrations: { customer: Row; kind: "Birthday" | "Anniversary"; date: string }[];
}

const STAY_STATUSES = new Set(["Confirmed", "Checked-in", "Checked-out"]);

export async function crmSummary(store: DataStore): Promise<CrmSummary> {
  const [customers, bookings, payments, activities, leads] = await Promise.all([
    store.list("customers"),
    store.list("bookings"),
    store.list("payments"),
    store.list("activities"),
    store.list("leads"),
  ]);
  const today = todayISO();
  const staysBy = new Map<string, number>();
  const spendBy = new Map<string, number>();
  const lastBy = new Map<string, string>();
  const touch = (id: unknown, date: unknown) => {
    if (!id || !date) return;
    const d = String(date).slice(0, 10);
    if (d > today) return;
    const k = String(id);
    if (!lastBy.has(k) || lastBy.get(k)! < d) lastBy.set(k, d);
  };
  for (const b of bookings) {
    const k = String(b.customer_id ?? "");
    if (!k) continue;
    if (STAY_STATUSES.has(String(b.status)) && String(b.check_in ?? "") <= today) staysBy.set(k, (staysBy.get(k) ?? 0) + 1);
    touch(k, b.check_in);
    touch(k, String(b.created_at));
  }
  for (const p of payments) {
    const k = String(p.customer_id ?? "");
    if (k) spendBy.set(k, (spendBy.get(k) ?? 0) + Number(p.amount ?? 0));
  }
  for (const a of activities) touch(a.customer_id, a.at ?? a.created_at);
  for (const l of leads) {
    touch(l.customer_id, l.last_contact);
    touch(l.customer_id, String(l.created_at));
  }

  const withStay = customers.filter((c) => (staysBy.get(c.id) ?? 0) >= 1);
  const repeat = withStay.filter((c) => (staysBy.get(c.id) ?? 0) >= 2);
  const cutoff = addDays(today, -90);
  const month = today.slice(5, 7);
  const celebrations: CrmSummary["celebrations"] = [];
  for (const c of customers) {
    for (const [field, kind] of [
      ["birthday", "Birthday"],
      ["anniversary", "Anniversary"],
    ] as const) {
      const d = c[field] as string | null;
      if (d && d.slice(5, 7) === month) celebrations.push({ customer: c, kind, date: `${today.slice(0, 4)}-${d.slice(5, 10)}` });
    }
  }
  celebrations.sort((a, b) => a.date.localeCompare(b.date));

  return {
    customers: customers.length,
    guestsWithStay: withStay.length,
    repeatGuestPct: withStay.length ? Math.round((repeat.length / withStay.length) * 100) : null,
    topBySpend: customers
      .map((c) => ({ customer: c, spend: spendBy.get(c.id) ?? 0, stays: staysBy.get(c.id) ?? 0 }))
      .filter((x) => x.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10),
    winBack: withStay
      .map((c) => ({ customer: c, lastContact: lastBy.get(c.id) ?? null }))
      .filter((x) => !x.lastContact || x.lastContact < cutoff)
      .sort((a, b) => (a.lastContact ?? "").localeCompare(b.lastContact ?? ""))
      .slice(0, 15),
    celebrations,
  };
}
