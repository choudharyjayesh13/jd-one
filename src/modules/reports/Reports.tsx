"use client";
/**
 * Reports (AsiaTech "Reports"): revenue, occupancy, bookings by source and
 * payments by mode, month by month for the chosen property. Everything is
 * computed from the records already in the app.
 */
import { useMemo, useState } from "react";
import { formatMoney, formatMonth, monthRange, todayISO } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { Select } from "@/core/ui/Input";
import { Card, CardBody, CardHeader, Stat } from "@/core/ui/Card";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader } from "@/core/ui/misc";
import { Table, Th, Td } from "@/core/ui/Table";
import type { Row } from "@/core/schema/types";
import { HOLDING_STATUSES, dayList } from "@/modules/rooms/occupancy";
import { nightsBetween } from "@/modules/customers/stats";

function monthsBack(n: number): string[] {
  const out: string[] = [];
  const t = todayISO();
  let [y, m] = t.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function Reports() {
  const user = useUser();
  const [unit, setUnit] = useState(user.unitId ?? "");
  const [span, setSpan] = useState("6");
  const unitFilter = unit ? { business_unit_id: unit } : {};
  const { rows: units } = useList("business-units", { filter: { active: true } });
  const { rows: bookings, loading } = useList("bookings", { filter: unitFilter });
  const { rows: rooms } = useList("rooms", { filter: { ...unitFilter, active: true } });
  const { rows: payments } = useList("payments");
  const { rows: petty } = useList("petty-cash", { filter: unitFilter });
  const { rows: expenses } = useList("expenses", { filter: unitFilter });
  const months = useMemo(() => monthsBack(Number(span)), [span]);
  const bookingIds = useMemo(() => new Set(bookings.map((b) => b.id)), [bookings]);
  const live = (b: Row) => b.status !== "Cancelled" && b.status !== "No-show";

  const perMonth = months.map((month) => {
    const { start, end, days } = monthRange(month);
    const inMonth = bookings.filter((b) => live(b) && String(b.check_in) >= start && String(b.check_in) <= end);
    const revenue = inMonth.reduce((s, b) => s + Number(b.total ?? 0), 0);
    const nights = dayList(start, days);
    const roomNights = bookings.filter((b) => HOLDING_STATUSES.includes(String(b.status)) || b.status === "Checked-out").reduce((s, b) => s + nights.filter((d) => String(b.check_in) <= d && String(b.check_out) > d).length * Number(b.units ?? 1), 0);
    const capacity = rooms.length * days;
    const occ = capacity ? Math.round((roomNights / capacity) * 100) : null;
    const paid = payments.filter((p) => bookingIds.has(String(p.booking_id)) && String(p.date) >= start && String(p.date) <= end);
    const byMode = groupSum(paid, "mode", "amount");
    const bySource = groupSum(inMonth, "source", "total");
    const spend = expenses.filter((e) => String(e.date) >= start && String(e.date) <= end).reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const pettyOut = petty.filter((e) => e.kind === "Cash out" && String(e.date) >= start && String(e.date) <= end).reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const avgNights = inMonth.length ? inMonth.reduce((s, b) => s + nightsBetween(b.check_in, b.check_out), 0) / inMonth.length : 0;
    return { month, bookings: inMonth.length, revenue, roomNights, occ, paid: paid.reduce((s, p) => s + Number(p.amount ?? 0), 0), byMode, bySource, spend, pettyOut, adr: roomNights ? Math.round(revenue / roomNights) : 0, avgNights };
  });
  const cur = perMonth[0];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Revenue, occupancy, sources and payments by month"
        actions={
          <>
            <Select value={span} onChange={(e) => setSpan(e.target.value)} className="w-auto">
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
            </Select>
            {!user.unitId && (
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto">
                <option value="">All properties</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)}
                  </option>
                ))}
              </Select>
            )}
          </>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          {cur && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label={`Revenue ${formatMonth(cur.month)}`} value={formatMoney(cur.revenue)} hint={`${cur.bookings} bookings`} />
              <Stat label="Occupancy" value={cur.occ === null ? "—" : `${cur.occ}%`} hint={`${cur.roomNights} room-nights`} />
              <Stat label="Avg rate / night" value={formatMoney(cur.adr)} hint={`avg stay ${cur.avgNights.toFixed(1)} nights`} />
              <Stat label="Collected" value={formatMoney(cur.paid)} hint={Object.entries(cur.byMode).map(([k, v]) => `${k} ${formatMoney(v)}`).join(" · ") || "—"} />
              <Stat label="Expenses + petty cash" value={formatMoney(cur.spend + cur.pettyOut)} tone={cur.spend + cur.pettyOut > cur.revenue ? "bad" : "neutral"} />
            </div>
          )}
          <Card>
            <CardHeader title="Revenue & occupancy by month" subtitle="Bookings counted by check-in month; cancelled and no-show excluded" />
            <CardBody className="overflow-x-auto p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Month</Th>
                    <Th>Bookings</Th>
                    <Th>Revenue</Th>
                    <Th>Room-nights</Th>
                    <Th>Occupancy</Th>
                    <Th>Avg rate</Th>
                    <Th>Collected</Th>
                    <Th>Expenses</Th>
                  </tr>
                </thead>
                <tbody>
                  {perMonth.map((m) => (
                    <tr key={m.month} className="border-t border-line">
                      <Td>{formatMonth(m.month)}</Td>
                      <Td>{m.bookings}</Td>
                      <Td>{formatMoney(m.revenue)}</Td>
                      <Td>{m.roomNights}</Td>
                      <Td>{m.occ === null ? "—" : `${m.occ}%`}</Td>
                      <Td>{formatMoney(m.adr)}</Td>
                      <Td>{formatMoney(m.paid)}</Td>
                      <Td>{formatMoney(m.spend + m.pettyOut)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Bookings by source" subtitle="Revenue per channel, latest month first" />
              <CardBody className="overflow-x-auto p-0">
                <Table>
                  <thead>
                    <tr>
                      <Th>Month</Th>
                      <Th>Sources</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {perMonth.map((m) => (
                      <tr key={m.month} className="border-t border-line">
                        <Td>{formatMonth(m.month)}</Td>
                        <Td>{Object.entries(m.bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${formatMoney(v)}`).join(" · ") || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Payments by mode" subtitle="Cash, UPI, card, bank, OTA" />
              <CardBody className="overflow-x-auto p-0">
                <Table>
                  <thead>
                    <tr>
                      <Th>Month</Th>
                      <Th>Modes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {perMonth.map((m) => (
                      <tr key={m.month} className="border-t border-line">
                        <Td>{formatMonth(m.month)}</Td>
                        <Td>{Object.entries(m.byMode).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${formatMoney(v)}`).join(" · ") || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function groupSum(rows: Row[], key: string, amount: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? "Other");
    out[k] = (out[k] ?? 0) + Number(r[amount] ?? 0);
  }
  return out;
}
