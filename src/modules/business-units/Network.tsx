"use client";
/**
 * The JD One network: every member business grouped by owner, with what they
 * offer and the discount they give the network. Any signed-in member (owner,
 * staff) can see it — that is the point: members give business to each other.
 */
import { useMemo } from "react";
import Link from "next/link";
import { MessageCircle, Phone, Globe } from "lucide-react";
import { useUser } from "@/core/auth/AuthProvider";
import { viewHref } from "@/core/routes";
import { Card, CardBody, CardHeader, Stat } from "@/core/ui/Card";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader } from "@/core/ui/misc";
import { normalizePhone } from "@/core/phone";
import type { Row } from "@/core/schema/types";

const CUSTOMER_DEFAULT = 10;
const OWNER_DEFAULT = 15;

export function Network() {
  const user = useUser();
  const { rows: units, loading } = useList("business-units", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: owners } = useList("owners");
  const groups = useMemo(() => {
    const byOwner = new Map<string, { owner: Row | null; units: Row[] }>();
    for (const u of units) {
      const key = String(u.owner_id ?? "—");
      if (!byOwner.has(key)) byOwner.set(key, { owner: owners.find((o) => o.id === u.owner_id) ?? null, units: [] });
      byOwner.get(key)!.units.push(u);
    }
    return Array.from(byOwner.values()).sort((a, b) => String(a.owner?.name ?? "zz").localeCompare(String(b.owner?.name ?? "zz")));
  }, [units, owners]);
  const isMine = (u: Row) => (user.unitId ? u.id === user.unitId : false);

  return (
    <div>
      <PageHeader title="JD One network" subtitle="Members give business to each other. Customers of any member get a direct-dealing discount; owners dealing with owners get more." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Member businesses" value={units.length} />
        <Stat label="Owners" value={groups.filter((g) => g.owner).length} />
        <Stat label="Customer discount" value={`${CUSTOMER_DEFAULT}%`} hint="default, when dealing directly" />
        <Stat label="Owner-to-owner" value={`${OWNER_DEFAULT}%`} hint="default; each business can set its own" />
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          {groups.map((g, i) => (
            <Card key={g.owner?.id ?? `none-${i}`}>
              <CardHeader title={g.owner ? String(g.owner.name) : "Owner not set"} subtitle={g.owner ? [g.owner.city, g.owner.network_admin ? "network admin" : null].filter(Boolean).join(" · ") : "Set the owner on each business"} />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {g.units.map((u) => {
                    const phone = u.phone ? normalizePhone(u.phone).replace(/^\+/, "") : "";
                    return (
                      <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-navy">
                            <Link href={viewHref("business-units", u.id)} className="hover:underline">
                              {String(u.name)}
                            </Link>
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {String(u.type ?? "")}
                              {u.city ? ` · ${u.city}` : ""}
                            </span>
                            {isMine(u) && <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy">yours</span>}
                          </div>
                          {u.network_offer ? <p className="mt-0.5 text-slate-600">{String(u.network_offer)}</p> : u.description ? <p className="mt-0.5 line-clamp-2 text-slate-600">{String(u.description)}</p> : null}
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">customers {String(u.network_customer_discount_pct ?? CUSTOMER_DEFAULT)}% off</span>
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">owners {String(u.network_owner_discount_pct ?? OWNER_DEFAULT)}% off</span>
                            {/* contact links follow */}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {phone && (
                            <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener" className="rounded-lg border border-line p-2 text-navy hover:bg-slate-50" title="WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          )}
                          {u.phone ? (
                            <a href={`tel:${String(u.phone)}`} className="rounded-lg border border-line p-2 text-navy hover:bg-slate-50" title="Call">
                              <Phone className="h-4 w-4" />
                            </a>
                          ) : null}
                          {u.website ? (
                            <a href={String(u.website)} target="_blank" rel="noopener" className="rounded-lg border border-line p-2 text-navy hover:bg-slate-50" title="Website">
                              <Globe className="h-4 w-4" />
                            </a>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">How the discount works: when a customer or owner books or buys directly (not through an OTA or marketplace), apply the member&apos;s network percentage at billing and note &ldquo;JD One network&rdquo; on the bill. Each business sets its own percentages under Hotel details → Edit.</p>
    </div>
  );
}
