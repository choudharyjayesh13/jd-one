"use client";
/**
 * Front Office → Check-in (/check-in/), Staying (/staying/) and Checked-out (/checked-out/).
 *
 * Check-in: "New check-in" opens the step-by-step check-in; below, every check-in in the
 *   chosen dates. A guest who is still in the hotel can be checked out from the row.
 * Staying: who is in the hotel right now, their rooms, bill, paid and balance; check out here.
 * Checked-out: guests who have left, with "Print bill" for each.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Printer, Search } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { addDays, formatDate, formatDateTime, formatMoney, todayISO } from "@/core/format";
import { viewHref } from "@/core/routes";
import { moduleLevel } from "@/core/auth/access";
import { useUser } from "@/core/auth/AuthProvider";
import { Button } from "@/core/ui/Button";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { EmptyState, Loading, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { roomLines, roomsLabel } from "@/modules/rooms/occupancy";
import { useUnitChoice } from "@/modules/rooms/unit";
import { CheckInDialog, CheckOutDialog } from "./Dialogs";
import { PAY_LATER_TAG, billFor } from "./desk";

function useAllowed() {
  const user = useUser();
  const lvl = moduleLevel("checkins");
  return !!user.post || lvl === null || lvl >= 1;
}

function UnitPicker() {
  const { unit, setUnit, units, canAll } = useUnitChoice();
  if (!canAll) return null;
  return (
    <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto">
      <option value="">All JD Stays properties</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {String(u.name)}
        </option>
      ))}
    </Select>
  );
}

function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
      <span>From</span>
      <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-auto" />
      <span>to</span>
      <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-auto" />
    </div>
  );
}

function PrintHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-4 hidden items-center gap-4 border-b border-slate-300 pb-3 print:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brands/udaisarovar.webp`} alt="" className="h-14 w-14 rounded-full" />
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{title}</p>
        <h1 className="jd-serif text-2xl font-semibold text-black">{sub}</h1>
        <p className="text-xs text-slate-600">Printed {formatDateTime(new Date().toISOString())}</p>
      </div>
    </header>
  );
}

function useRoomNames(unit: string) {
  const { rows: rooms } = useList("rooms", { filter: unit ? { business_unit_id: unit } : {} });
  const names = useMemo(() => new Map(rooms.map((r) => [r.id, String(r.name)])), [rooms]);
  return (b: Row | undefined, ci?: Row) => {
    if (ci?.room_numbers) return String(ci.room_numbers);
    if (!b) return "—";
    const ids = [String(b.room_id ?? ""), ...roomLines(b).flatMap((l) => (l.room_ids ?? []).map(String))].filter(Boolean);
    const n = Array.from(new Set(ids)).map((id) => names.get(id)).filter(Boolean);
    return n.length ? n.join(", ") : "Not assigned";
  };
}

const PILL: Record<string, string> = { green: "bg-emerald-50 text-emerald-800 ring-emerald-200", amber: "bg-amber-50 text-amber-800 ring-amber-200", slate: "bg-slate-50 text-slate-600 ring-slate-200" };
function Badge({ tone, children }: { tone: "green" | "amber" | "slate"; children: ReactNode }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1", PILL[tone])}>{children}</span>;
}

const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500";
const td = "px-3 py-2.5 align-top";

function NoAccess() {
  return <EmptyState title="No access" hint="Ask the Director to give you Check-in access in Team Access." />;
}

/* ---------------- Check-in ---------------- */
export function CheckInPage() {
  const allowed = useAllowed();
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const { unit, unitName } = useUnitChoice();
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState<Row | null>(null);
  const refresh = useCallback(() => undefined, []);
  const { rows: checkins, loading } = useList("checkins", { range: { actual_in: { gte: `${from}T00:00:00`, lte: `${to}T23:59:59` } }, sort: { field: "actual_in", dir: "desc" } });
  const { rows: bookings } = useList("bookings", { filter: unit ? { business_unit_id: unit } : {}, range: { check_out: { gte: addDays(from, -1) } } });
  const { rows: staff } = useList("staff", {});
  const bMap = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const sName = useMemo(() => new Map(staff.map((s) => [s.id, String(s.name)])), [staff]);
  const roomsOf = useRoomNames(unit);
  const list = checkins.filter((c) => bMap.has(String(c.booking_id)));
  const waiting = bookings.filter((b) => ["Confirmed", "On hold"].includes(String(b.status)) && String(b.check_in) <= today);

  if (!allowed) return <NoAccess />;
  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Check-in"
          subtitle={`${unitName} · ${list.length} ${list.length === 1 ? "check-in" : "check-ins"} · ${waiting.length} waiting to arrive today`}
          actions={
            <Button icon={LogIn} onClick={() => setOpen(true)}>
              New check-in
            </Button>
          }
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <div className="flex gap-2">
            <UnitPicker />
            <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!list.length}>
              Print / PDF
            </Button>
          </div>
        </div>
      </div>
      <PrintHeader title="Check-in register" sub={`${unitName} · ${formatDate(from)} to ${formatDate(to)}`} />
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title="No check-ins in these dates" hint="Use New check-in when a guest arrives." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line bg-slate-50">
              <tr>
                <th className={th}>Guest</th>
                <th className={th}>Rooms</th>
                <th className={th}>Checked in</th>
                <th className={th}>ID proof</th>
                <th className={th}>By</th>
                <th className={th}>Status</th>
                <th className={cn(th, "print:hidden")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((c) => {
                const b = bMap.get(String(c.booking_id))!;
                const inHouse = String(b.status) === "Checked-in";
                return (
                  <tr key={c.id}>
                    <td className={td}>
                      <Link href={viewHref("bookings", b.id)} className="font-medium text-navy hover:underline">
                        {String(b.guest_name)}
                      </Link>
                      <div className="text-xs text-slate-500">{String(b.phone ?? "")}</div>
                    </td>
                    <td className={td}>{roomsOf(b, c)}</td>
                    <td className={td}>{formatDateTime(c.actual_in)}</td>
                    <td className={td}>
                      {String(c.id_proof_type ?? "—")}
                      {c.id_number ? <span className="text-slate-500"> ····{String(c.id_number)}</span> : null}
                    </td>
                    <td className={td}>{sName.get(String(c.handled_by)) ?? "—"}</td>
                    <td className={td}>
                      {inHouse ? <Badge tone="green">Staying</Badge> : <Badge tone="slate">Checked out {c.actual_out ? formatDate(String(c.actual_out).slice(0, 10)) : ""}</Badge>}
                      {String(c.notes ?? "").startsWith(PAY_LATER_TAG) && <div className="mt-1 text-xs text-amber-700">Pays at check-out</div>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right print:hidden")}>
                      {inHouse ? (
                        <Button size="sm" onClick={() => setOut(b)}>
                          Check out
                        </Button>
                      ) : (
                        <Link href={`/guest-bill/?id=${b.id}`} className="text-sm font-medium text-[#9a7128] hover:underline">
                          Bill
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <CheckInDialog unit={unit} onClose={() => setOpen(false)} onDone={refresh} />}
      {out && <CheckOutDialog booking={out} onClose={() => setOut(null)} onDone={refresh} />}
    </div>
  );
}

/* ---------------- Staying ---------------- */
export function StayingPage() {
  const allowed = useAllowed();
  const today = todayISO();
  const { unit, unitName } = useUnitChoice();
  const [out, setOut] = useState<Row | null>(null);
  const { rows, loading } = useList("bookings", { filter: { ...(unit ? { business_unit_id: unit } : {}), status: "Checked-in" }, sort: { field: "check_out", dir: "asc" } });
  const { rows: checkins } = useList("checkins", { filter: {}, range: { actual_in: { gte: `${addDays(today, -60)}T00:00:00` } } });
  const ciFor = useMemo(() => {
    const m = new Map<string, Row>();
    for (const c of checkins) if (!c.actual_out) m.set(String(c.booking_id), c);
    return m;
  }, [checkins]);
  const roomsOf = useRoomNames(unit);
  const people = (b: Row) => {
    const l = roomLines(b);
    const a = l.length ? l.reduce((s, x) => s + x.adults, 0) : Number(b.adults ?? 0);
    const c = l.length ? l.reduce((s, x) => s + x.children, 0) : Number(b.children ?? 0);
    return `${a} adult${a === 1 ? "" : "s"}${c ? ` · ${c} child${c === 1 ? "" : "ren"}` : ""}`;
  };
  const due = rows.reduce((s, b) => s + Number(b.balance ?? 0), 0);

  if (!allowed) return <NoAccess />;
  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Staying"
          subtitle={`${unitName} · ${rows.length} ${rows.length === 1 ? "guest" : "guests"} in the hotel · balance due ${formatMoney(due)}`}
          actions={
            <div className="flex gap-2">
              <UnitPicker />
              <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!rows.length}>
                Print / PDF
              </Button>
            </div>
          }
        />
      </div>
      <PrintHeader title="Guests staying" sub={`${unitName} · ${formatDate(today)}`} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No guest is staying right now" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
          {rows.map((b) => {
            const ci = ciFor.get(b.id);
            const later = String(ci?.notes ?? "").startsWith(PAY_LATER_TAG);
            const leaving = String(b.check_out) <= today;
            return (
              <article key={b.id} className="rounded-xl border border-line bg-white p-4 print:break-inside-avoid">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={viewHref("bookings", b.id)} className="jd-serif text-lg font-medium text-navy hover:underline">
                      {String(b.guest_name)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {String(b.phone ?? "")} · {people(b)}
                    </p>
                  </div>
                  {leaving ? <Badge tone="amber">Leaves today</Badge> : <Badge tone="green">Staying</Badge>}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-slate-500">Rooms</dt>
                  <dd className="font-medium text-navy">{roomsOf(b, ci)}</dd>
                  <dt className="text-slate-500">Booked</dt>
                  <dd>{roomsLabel(b)}</dd>
                  <dt className="text-slate-500">Since</dt>
                  <dd>{ci?.actual_in ? formatDateTime(ci.actual_in) : formatDate(b.check_in)}</dd>
                  <dt className="text-slate-500">Till</dt>
                  <dd>{formatDate(b.check_out)}</dd>
                  <dt className="text-slate-500">Total · Paid</dt>
                  <dd>
                    {formatMoney(b.total)} · {formatMoney(Number(b.total ?? 0) - Number(b.balance ?? 0))}
                  </dd>
                  <dt className="text-slate-500">Balance</dt>
                  <dd className={cn("font-semibold", Number(b.balance ?? 0) > 0 ? "text-red-700" : "text-emerald-700")}>{formatMoney(b.balance)}</dd>
                </dl>
                {later && <p className="mt-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{String(ci?.notes).replace(PAY_LATER_TAG, "Pays at check-out:")}</p>}
                <div className="mt-4 flex gap-2 print:hidden">
                  <Button size="sm" onClick={() => setOut(b)}>
                    Check out
                  </Button>
                  <Link href={`/guest-bill/?id=${b.id}`} className="inline-flex items-center rounded-lg border border-line px-3 text-sm text-navy hover:bg-slate-50">
                    Bill so far
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {out && <CheckOutDialog booking={out} onClose={() => setOut(null)} onDone={() => undefined} />}
    </div>
  );
}

/* ---------------- Checked-out ---------------- */
export function CheckedOutPage() {
  const allowed = useAllowed();
  const router = useRouter();
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const search = q.trim();
  const { unit, unitName } = useUnitChoice();
  const base = { ...(unit ? { business_unit_id: unit } : {}), status: "Checked-out" };
  // Searching looks through every checked-out guest; otherwise the dates decide.
  const { rows: bookings, loading } = useList(
    "bookings",
    search ? { filter: base, search, sort: { field: "check_out", dir: "desc" }, limit: 100 } : { filter: base, range: { check_out: { gte: from, lte: to } }, sort: { field: "check_out", dir: "desc" } },
  );
  const { rows: checkins } = useList("checkins", search ? { sort: { field: "actual_out", dir: "desc" }, limit: 500 } : { range: { actual_out: { gte: `${addDays(from, -3)}T00:00:00` } } });
  const { rows: staff } = useList("staff", {});
  const sName = useMemo(() => new Map(staff.map((s) => [s.id, String(s.name)])), [staff]);
  const ciFor = useMemo(() => {
    const m = new Map<string, Row>();
    for (const c of checkins) if (c.actual_out) m.set(String(c.booking_id), c);
    return m;
  }, [checkins]);
  const roomsOf = useRoomNames(unit);

  // The real bill for each guest (rooms + food & drinks − payments), same as the printed bill.
  const [bills, setBills] = useState<Map<string, { total: number; paid: number; balance: number }>>(new Map());
  const ids = bookings.map((b) => b.id).join(",");
  useEffect(() => {
    let live = true;
    void Promise.all(bookings.map(async (b) => [b.id, await billFor(getStore(), b)] as const)).then((pairs) => live && setBills(new Map(pairs)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const billOf = (b: Row) => bills.get(b.id) ?? { total: Number(b.total ?? 0), paid: Number(b.total ?? 0) - Number(b.balance ?? 0), balance: Number(b.balance ?? 0) };
  const sum = (k: "total" | "paid" | "balance") => bookings.reduce((s, b) => s + billOf(b)[k], 0);
  const open = (b: Row) => router.push(`/guest-bill/?id=${b.id}`);

  if (!allowed) return <NoAccess />;
  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Checked-out" subtitle={`${unitName} · bills of guests who have left`} />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest name, phone or booking no." className="pl-9" />
          </div>
          {!search && <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
          <UnitPicker />
          <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!bookings.length}>
            Print / PDF report
          </Button>
        </div>
      </div>
      <PrintHeader title="Check-out bill report" sub={`${unitName} · ${search ? `search “${search}”` : `${formatDate(from)} to ${formatDate(to)}`}`} />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Guests", String(bookings.length), ""],
          ["Billed", formatMoney(sum("total")), ""],
          ["Received", formatMoney(sum("paid")), "text-emerald-700"],
          ["Still due", formatMoney(sum("balance")), sum("balance") > 0 ? "text-red-700" : ""],
        ].map(([k, v, c]) => (
          <div key={k} className="rounded-xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{k}</p>
            <p className={cn("jd-serif text-2xl font-semibold text-navy", c)}>{v}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : bookings.length === 0 ? (
        <EmptyState title={search ? "No checked-out guest matches" : "No check-outs in these dates"} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-line bg-slate-50">
              <tr>
                <th className={th}>Guest</th>
                <th className={th}>Rooms</th>
                <th className={th}>Stay</th>
                <th className={th}>Checked out</th>
                <th className={cn(th, "text-right")}>Bill</th>
                <th className={cn(th, "text-right")}>Paid</th>
                <th className={cn(th, "text-right")}>Due</th>
                <th className={th}>By</th>
                <th className={cn(th, "print:hidden")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bookings.map((b) => {
                const c = ciFor.get(b.id);
                const bill = billOf(b);
                return (
                  <tr key={b.id} onClick={() => open(b)} className="cursor-pointer hover:bg-[#faf5ea]">
                    <td className={td}>
                      <span className="font-medium text-navy">{String(b.guest_name)}</span>
                      <div className="text-xs text-slate-500">
                        {String(b.phone ?? "")}
                        {b.booking_ref || b.external_ref ? ` · #${String(b.booking_ref ?? b.external_ref)}` : ""}
                      </div>
                    </td>
                    <td className={td}>{roomsOf(b, c)}</td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {formatDate(b.check_in)} → {formatDate(b.check_out)}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>{c?.actual_out ? formatDateTime(c.actual_out) : formatDate(b.check_out)}</td>
                    <td className={cn(td, "text-right")}>{formatMoney(bill.total)}</td>
                    <td className={cn(td, "text-right text-emerald-700")}>{formatMoney(bill.paid)}</td>
                    <td className={cn(td, "text-right", bill.balance > 0 ? "font-medium text-red-700" : "text-slate-500")}>{formatMoney(bill.balance)}</td>
                    <td className={td}>{c ? (sName.get(String(c.handled_by)) ?? "—") : "—"}</td>
                    <td className={cn(td, "whitespace-nowrap text-right print:hidden")}>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-navy">
                        <Printer className="h-3.5 w-3.5" /> Open bill
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500 print:hidden">Open a bill to print it, save it as PDF or send it to the guest on WhatsApp.</p>
    </div>
  );
}
