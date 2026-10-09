"use client";
/**
 * The JD One network, divided State → District → City. Two tabs:
 *  - Members: member businesses (max 300 per city) with Google reviews, a direct
 *    "Call manager" button, discounts and an Order button.
 *  - Vendors: day-to-day suppliers for that city with their numbers.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Phone, Globe, ShoppingBag, Star, Plus } from "lucide-react";
import { useUser } from "@/core/auth/AuthProvider";
import { newHref, viewHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader, Stat } from "@/core/ui/Card";
import { Input, Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader, EmptyState } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { normalizePhone } from "@/core/phone";
import type { Row } from "@/core/schema/types";
import { CITY_MEMBER_CAP } from "./entity";
import { networkRatings } from "@/modules/feedback/entity";
import { RelationSelect } from "@/core/ui/RelationSelect";
import { LeadersTab } from "@/modules/leaders/LeadersTab";
import { AreaHelpTab } from "@/modules/area-services/AreaHelpTab";

const CUSTOMER_DEFAULT = 10;
const OWNER_DEFAULT = 15;
const FILTER_KEY = "jdone.networkFilter";

const wa = (p: unknown) => (p ? normalizePhone(p).replace(/^\+/, "") : "");
const uniq = (xs: unknown[]) => Array.from(new Set(xs.map((x) => String(x ?? "")).filter(Boolean))).sort();

function loadFilter(): { state: string; district: string; city: string } {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) ?? "null");
    if (v && typeof v === "object") return { state: v.state ?? "", district: v.district ?? "", city: v.city ?? "" };
  } catch {
    /* ignore */
  }
  return { state: "Rajasthan", district: "", city: "" };
}

function Stars({ rating, count, url }: { rating: unknown; count: unknown; url: unknown }) {
  if (!rating && !url) return null;
  const body = (
    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      {rating ? Number(rating).toFixed(1) : "—"}
      {count ? <span className="text-amber-700">({Number(count).toLocaleString("en-IN")} Google reviews)</span> : <span className="text-amber-700">Google reviews</span>}
    </span>
  );
  return url ? (
    <a href={String(url)} target="_blank" rel="noopener" className="hover:underline" title="Read reviews on Google">
      {body}
    </a>
  ) : (
    body
  );
}

export function Network() {
  const user = useUser();
  const [tab, setTab] = useState<"members" | "vendors" | "leaders" | "help">("members");
  const [f, setF] = useState(loadFilter);
  const [q, setQ] = useState("");
  const setFilter = (next: typeof f) => {
    setF(next);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const { rows: units, loading } = useList("business-units", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const { rows: owners } = useList("owners");
  const { rows: vendors, loading: vLoading } = useList("vendors", { filter: { active: true } });
  const { rows: fb } = useList("feedback");
  const { rows: leaders } = useList("leaders");
  const { rows: services } = useList("area-services");
  const [forCustomer, setForCustomer] = useState<string | null>(null);
  const { rows: custRows } = useList(forCustomer ? "customers" : null, { filter: { id: forCustomer } });
  const customer = custRows[0] ?? null;
  const scores = useMemo(() => networkRatings(fb), [fb]);
  /** Best-option score for a member: interest match first, then network feedback, then Google rating. */
  const fit = (u: Row) => {
    const interests = Array.isArray(customer?.interests) ? (customer!.interests as string[]) : [];
    const cat = String(u.service_category ?? u.type ?? "");
    const interestHit = interests.some((i) => cat.toLowerCase().includes(i.toLowerCase()) || i.toLowerCase().includes(cat.toLowerCase()));
    const net = scores.get(u.id);
    return (interestHit ? 10 : 0) + (net ? net.avg : 0) + Number(u.google_rating ?? 0) / 2;
  };

  const all = tab === "members" ? units : tab === "vendors" ? vendors : tab === "leaders" ? leaders : services;
  const states = uniq(all.map((r) => r.state));
  const districts = uniq(all.filter((r) => !f.state || r.state === f.state).map((r) => r.district));
  const cities = uniq(all.filter((r) => (!f.state || r.state === f.state) && (!f.district || r.district === f.district)).map((r) => r.city));
  const match = (r: Row) => (!f.state || r.state === f.state) && (!f.district || r.district === f.district) && (!f.city || r.city === f.city);
  const text = (r: Row) => !q || JSON.stringify([r.name, r.category, r.service_category, r.network_offer, r.contact_person, r.area]).toLowerCase().includes(q.toLowerCase());

  const memberRows = useMemo(() => units.filter(match).filter(text), [units, f, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const recommended = useMemo(() => (customer ? [...memberRows].sort((a, b) => fit(b) - fit(a)).slice(0, 5) : []), [customer, memberRows, scores]); // eslint-disable-line react-hooks/exhaustive-deps
  const vendorRows = useMemo(() => vendors.filter(match).filter(text), [vendors, f, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaderText = (r: Row) => !q || JSON.stringify([r.name, r.role, r.body_name, r.ward_no, r.area, r.party]).toLowerCase().includes(q.toLowerCase());
  const leaderRows = useMemo(() => leaders.filter(match).filter(leaderText), [leaders, f, q]); // eslint-disable-line react-hooks/exhaustive-deps
  // Area help: a typed locality is answered by the thana covering it, so the list itself is only filtered by area
  const helpRows = useMemo(() => services.filter(match), [services, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const seatsInCity = f.city ? units.filter((u) => u.city === f.city && (!f.state || u.state === f.state)).length : null;

  const groups = useMemo(() => {
    const byOwner = new Map<string, { owner: Row | null; units: Row[] }>();
    for (const u of memberRows) {
      const key = String(u.owner_id ?? "—");
      if (!byOwner.has(key)) byOwner.set(key, { owner: owners.find((o) => o.id === u.owner_id) ?? null, units: [] });
      byOwner.get(key)!.units.push(u);
    }
    return Array.from(byOwner.values()).sort((a, b) => String(a.owner?.name ?? "zz").localeCompare(String(b.owner?.name ?? "zz")));
  }, [memberRows, owners]);

  const vendorGroups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const v of vendorRows) {
      const k = String(v.category ?? "Other");
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [vendorRows]);

  return (
    <div>
      <PageHeader
        title="JD One network"
        subtitle="State → District → City. Members give business to each other, vendors keep them supplied, and every area gets its local leaders and help numbers."
        actions={
          tab === "vendors" ? (
            <Link href={newHref("vendors", { state: f.state, district: f.district, city: f.city })}>
              <Button size="sm" icon={Plus}>
                Add vendor
              </Button>
            </Link>
          ) : tab === "leaders" ? (
            <Link href={newHref("leaders", { state: f.state, district: f.district, city: f.city })}>
              <Button size="sm" icon={Plus}>
                Add leader
              </Button>
            </Link>
          ) : tab === "help" ? (
            <Link href={newHref("area-services", { state: f.state, district: f.district, city: f.city })}>
              <Button size="sm" icon={Plus}>
                Add service
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-3 flex gap-1 rounded-xl bg-white p-1 shadow-sm">
        {(
          [
            ["members", `Members (${memberRows.length})`],
            ["vendors", `Vendors (${vendorRows.length})`],
            ["leaders", `Local leaders (${leaderRows.length})`],
            ["help", `Area help`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex-1 rounded-lg px-3 py-1.5 text-sm font-medium", tab === k ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50")}>
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Select value={f.state} onChange={(e) => setFilter({ state: e.target.value, district: "", city: "" })}>
          <option value="">All states</option>
          {uniq([...states, f.state]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={f.district} onChange={(e) => setFilter({ ...f, district: e.target.value, city: "" })}>
          <option value="">All districts</option>
          {districts.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={f.city} onChange={(e) => setFilter({ ...f, city: e.target.value })}>
          <option value="">All cities</option>
          {cities.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "members" ? "Search service, product…" : tab === "vendors" ? "Search milk, plumber, gas…" : tab === "help" ? "Type your colony / village: which thana?" : "Search name, ward, village, party…"} />
      </div>

      {tab === "help" ? (
        <AreaHelpTab rows={helpRows} query={q} />
      ) : tab === "leaders" ? (
        <LeadersTab rows={leaderRows} />
      ) : tab === "members" ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Member businesses" value={memberRows.length} />
            <Stat label={f.city ? `Seats in ${f.city}` : "Seats per city"} value={seatsInCity === null ? CITY_MEMBER_CAP : `${seatsInCity} / ${CITY_MEMBER_CAP}`} hint={seatsInCity === null ? "pick a city to see seats used" : `${CITY_MEMBER_CAP - seatsInCity} left`} tone={seatsInCity !== null && seatsInCity >= CITY_MEMBER_CAP ? "bad" : "neutral"} />
            <Stat label="Customer discount" value={`${CUSTOMER_DEFAULT}%`} hint="when dealing directly" />
            <Stat label="Owner-to-owner" value={`${OWNER_DEFAULT}%`} hint="default; each member sets its own" />
          </div>
          <Card className="mb-4">
            <CardHeader title="Best options for a customer" subtitle="Pick a customer: members are ranked by their interests, then network feedback, then Google rating" />
            <CardBody>
              <RelationSelect entity="customers" value={forCustomer} onChange={(id) => setForCustomer(id)} />
              {customer && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-slate-500">
                    Interested in: {Array.isArray(customer.interests) && customer.interests.length ? (customer.interests as string[]).join(", ") : "not recorded yet"}
                    {customer.budget ? ` · ${customer.budget}` : ""}
                    {Array.isArray(customer.taste) && customer.taste.length ? ` · ${(customer.taste as string[]).join(", ")}` : ""}
                  </p>
                  <ol className="space-y-1 text-sm">
                    {recommended.map((u, i) => {
                      const net = scores.get(u.id);
                      return (
                        <li key={u.id} className="flex flex-wrap items-center gap-2">
                          <span className="w-5 text-slate-400">{i + 1}.</span>
                          <Link href={viewHref("business-units", u.id)} className="font-medium text-navy hover:underline">
                            {String(u.name)}
                          </Link>
                          <span className="text-xs text-slate-500">{String(u.service_category ?? u.type ?? "")}</span>
                          {net ? <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-800">network {net.avg}★ ({net.count})</span> : null}
                          {u.google_rating ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">Google {Number(u.google_rating).toFixed(1)}★</span> : null}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </CardBody>
          </Card>
          {loading ? (
            <Loading />
          ) : groups.length === 0 ? (
            <EmptyState title="No members here yet" hint="Change the state, district or city filter." />
          ) : (
            <div className="space-y-4">
              {groups.map((g, i) => (
                <Card key={g.owner?.id ?? `none-${i}`}>
                  <CardHeader title={g.owner ? String(g.owner.name) : "Owner not set"} subtitle={g.owner ? [g.owner.city, g.owner.network_admin ? "network admin" : null].filter(Boolean).join(" · ") : "Set the owner on each business"} />
                  <CardBody className="p-0">
                    <ul className="divide-y divide-line">
                      {g.units.map((u) => {
                        const callNo = u.manager_phone || u.phone;
                        return (
                          <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-navy">
                                <Link href={viewHref("business-units", u.id)} className="hover:underline">
                                  {String(u.name)}
                                </Link>
                                <span className="ml-2 text-xs font-normal text-slate-500">
                                  {[u.service_category || u.type, u.city, u.district && u.district !== u.city ? u.district : null, u.state].filter(Boolean).map(String).join(" · ")}
                                </span>
                                {user.unitId === u.id && <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy">yours</span>}
                              </div>
                              {u.network_offer ? <p className="mt-0.5 text-slate-600">{String(u.network_offer)}</p> : null}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <Stars rating={u.google_rating} count={u.google_reviews_count} url={u.google_maps_url} />
                                {scores.get(u.id) ? <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-800">network {scores.get(u.id)!.avg}★ from {scores.get(u.id)!.count} customers</span> : null}
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">customers {String(u.network_customer_discount_pct ?? CUSTOMER_DEFAULT)}% off</span>
                                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">owners {String(u.network_owner_discount_pct ?? OWNER_DEFAULT)}% off</span>
                                {u.order_webhook_url || u.order_page_url ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">orders go to {String(u.erp_name && u.erp_name !== "None" ? u.erp_name : "their system")}</span> : null}
                              </div>
                              {callNo ? (
                                <div className="mt-1 text-xs text-slate-600">
                                  Manager{u.manager_name ? `: ${u.manager_name}` : ""} · <a href={`tel:${String(callNo)}`} className="font-medium text-navy hover:underline">{String(callNo)}</a>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {callNo ? (
                                <a href={`tel:${String(callNo)}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-medium text-white hover:bg-emerald-700" title="Call the manager">
                                  <Phone className="h-4 w-4" /> Call
                                </a>
                              ) : null}
                              <Link href={newHref("orders", { business_unit_id: u.id, ...(user.unitId && user.unitId !== u.id ? { buyer_unit_id: user.unitId } : {}) })} className="inline-flex items-center gap-1 rounded-lg bg-navy px-2.5 py-2 text-xs font-medium text-white hover:bg-navy-700" title="Place an order with this member">
                                <ShoppingBag className="h-4 w-4" /> Order
                              </Link>
                              {wa(callNo) ? (
                                <a href={`https://wa.me/${wa(callNo)}`} target="_blank" rel="noopener" className="rounded-lg border border-line p-2 text-navy hover:bg-slate-50" title="WhatsApp">
                                  <MessageCircle className="h-4 w-4" />
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
          <p className="mt-3 text-xs text-slate-500">
            Each city has at most {CITY_MEMBER_CAP} member businesses, together covering every service and product. Press <strong>Call</strong> to reach the manager directly, or <strong>Order</strong> to place an order with the network discount applied automatically.
          </p>
        </>
      ) : vLoading ? (
        <Loading />
      ) : vendorGroups.length === 0 ? (
        <EmptyState title="No vendors listed here yet" hint="Add the milk, gas, laundry, plumber and other suppliers you use, so every member in this city can call them." action={<Link href={newHref("vendors", { state: f.state, district: f.district, city: f.city })}><Button size="sm" icon={Plus}>Add vendor</Button></Link>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {vendorGroups.map(([cat, list]) => (
            <Card key={cat}>
              <CardHeader title={cat} subtitle={`${list.length} vendor${list.length === 1 ? "" : "s"}`} />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {list.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={viewHref("vendors", v.id)} className="font-medium text-navy hover:underline">
                          {String(v.name)}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {[v.contact_person, v.area, v.city, v.rating ? `★ ${v.rating}` : null, v.delivers ? "delivers" : null].filter(Boolean).map(String).join(" · ")}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <a href={`tel:${String(v.phone)}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white" title={String(v.phone)}>
                          <Phone className="h-3.5 w-3.5" /> Call
                        </a>
                        {wa(v.whatsapp || v.phone) ? (
                          <a href={`https://wa.me/${wa(v.whatsapp || v.phone)}`} target="_blank" rel="noopener" className="rounded-lg border border-line p-1.5 text-navy" title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
