"use client";
/**
 * Vendor dues (/vendor-dues/): per vendor, what was bought on credit (udhaar),
 * what was paid to them (expenses), and the balance still owed; plus payment
 * vouchers waiting to be paid. "Pay" opens a new expense for the balance.
 */
import { useMemo } from "react";
import Link from "next/link";
import { formatDate, formatMoney } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { newHref, viewHref } from "@/core/routes";
import { useList } from "@/core/ui/hooks";
import { Button } from "@/core/ui/Button";
import { Loading, PageHeader } from "@/core/ui/misc";

const key = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function VendorDues() {
  const user = useUser();
  const unitFilter = user.unitId ? { business_unit_id: user.unitId } : {};
  const { rows: purchases, loading } = useList("purchases", { filter: { ...unitFilter, payment_mode: "Credit (udhaar)" } });
  const { rows: expenses } = useList("expenses", { filter: unitFilter });
  const { rows: vouchers } = useList("vouchers", { filter: { ...unitFilter, vtype: "PV", status: "To pay" } });

  const dues = useMemo(() => {
    const m = new Map<string, { name: string; bought: number; paid: number; since: string }>();
    for (const p of purchases) {
      const k = key(p.vendor);
      if (!k) continue;
      const cur = m.get(k) ?? { name: String(p.vendor), bought: 0, paid: 0, since: String(p.date) };
      cur.bought += Number(p.amount) || 0;
      if (String(p.date) < cur.since) cur.since = String(p.date);
      m.set(k, cur);
    }
    for (const e of expenses) {
      const cur = m.get(key(e.vendor));
      if (cur && String(e.date) >= cur.since) cur.paid += Number(e.amount) || 0;
    }
    return Array.from(m.values())
      .map((d) => ({ ...d, balance: d.bought - d.paid }))
      .filter((d) => d.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [purchases, expenses]);

  const total = dues.reduce((s, d) => s + d.balance, 0) + vouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);

  return (
    <div>
      <PageHeader title="Vendor dues" subtitle={`Money owed to vendors · ${formatMoney(total)} in all`} />
      {loading ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="jd-serif mb-1 text-2xl font-semibold">Credit purchases not yet paid</h2>
            {dues.length === 0 ? (
              <p className="text-sm text-slate-500">No credit purchases outstanding.</p>
            ) : (
              <ul>
                {dues.map((d) => (
                  <li key={d.name} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{d.name}</span>
                      <span className="text-slate-500">
                        {" "}
                        · bought {formatMoney(d.bought)} since {formatDate(d.since)} · paid {formatMoney(d.paid)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">{formatMoney(d.balance)}</span>
                      <Link href={newHref("expenses", { vendor: d.name, amount: d.balance, category: "Kitchen & food", detail: "Vendor dues payment" })}>
                        <Button size="sm">Pay</Button>
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="jd-serif mb-1 text-2xl font-semibold">Payment vouchers to pay</h2>
            {vouchers.length === 0 ? (
              <p className="text-sm text-slate-500">None.</p>
            ) : (
              <ul>
                {vouchers.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2.5 text-sm">
                    <Link href={viewHref("vouchers", v.id)}>
                      <span className="font-mono">{String(v.voucher_no ?? "")}</span> · {String(v.party ?? "")} · {String(v.against ?? "")}
                    </Link>
                    <span className="font-semibold">{formatMoney(v.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
