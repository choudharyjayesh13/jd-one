"use client";
/** "Local leaders" tab of the JD One network: rural (Zila → Samiti → Gram Panchayat) and urban (city → ward) representatives. */
import Link from "next/link";
import { Phone, ExternalLink, BadgeCheck } from "lucide-react";
import { formatDate } from "@/core/format";
import { viewHref } from "@/core/routes";
import { Card, CardBody, CardHeader, Stat } from "@/core/ui/Card";
import { EmptyState } from "@/core/ui/misc";
import type { Row } from "@/core/schema/types";

const RURAL = new Set(["Zila Parishad", "Panchayat Samiti", "Gram Panchayat"]);
const URBAN = new Set(["Municipal Corporation", "Nagar Parishad", "Nagar Palika"]);
const ROLE_ORDER = ["Zila Pramukh", "Up-Zila Pramukh", "Mayor", "Deputy Mayor", "Nagar Palika / Parishad Chairperson", "Vice-Chairperson", "Pradhan", "Up-Pradhan", "Sarpanch", "Up-Sarpanch", "Ward Parshad (Councillor)", "Ward Panch", "MLA", "MP", "Other"];
const rank = (r: Row) => {
  const i = ROLE_ORDER.indexOf(String(r.role));
  return i < 0 ? 99 : i;
};
const wardNum = (r: Row) => Number(String(r.ward_no ?? "").replace(/\D/g, "")) || 9999;

const PARTY_COLOUR: Record<string, string> = {
  BJP: "bg-orange-100 text-orange-800",
  "INC (Congress)": "bg-sky-100 text-sky-800",
  Independent: "bg-slate-100 text-slate-700",
  AAP: "bg-blue-100 text-blue-800",
  BSP: "bg-indigo-100 text-indigo-800",
};

function PartyChip({ r }: { r: Row }) {
  if (!r.party || r.party === "Not known") return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PARTY_COLOUR[String(r.party)] ?? "bg-slate-100 text-slate-700"}`}>
      {String(r.party)}
      {r.party_symbol ? ` · ${String(r.party_symbol)}` : ""}
    </span>
  );
}

function Person({ r }: { r: Row }) {
  const photo = typeof r.photo === "string" ? r.photo : null;
  return (
    <li className="flex gap-3 py-2">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={String(r.name)} className="h-11 w-11 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
          {String(r.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={viewHref("leaders", r.id)} className="font-medium text-navy hover:underline">
            {String(r.name)}
          </Link>
          {r.verified ? <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="Verified" /> : null}
          <PartyChip r={r} />
          {r.status && r.status !== "In office" ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{String(r.status)}</span> : null}
        </div>
        <div className="text-sm text-slate-600">
          {String(r.role)}
          {r.ward_no ? ` · Ward ${String(r.ward_no)}` : ""}
          {r.in_office_since ? ` · in post since ${formatDate(r.in_office_since)}` : ""}
          {r.in_politics_since ? ` · in politics since ${String(r.in_politics_since)}` : ""}
        </div>
        {r.area ? <div className="text-xs text-slate-500">Covers: {String(r.area)}</div> : null}
        <div className="mt-0.5 flex flex-wrap gap-3 text-xs">
          {r.phone ? (
            <a href={`tel:${String(r.phone)}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
              <Phone className="h-3 w-3" /> {String(r.phone)}
            </a>
          ) : null}
          {r.source_url ? (
            <a href={String(r.source_url)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-slate-500 hover:underline">
              <ExternalLink className="h-3 w-3" /> Source
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function groupBy(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${String(r.body_name)}|${String(r.body_type)}|${String(r.city)}`;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return Array.from(m.entries())
    .map(([k, rs]) => ({ key: k, body: rs[0], rows: [...rs].sort((a, b) => rank(a) - rank(b) || wardNum(a) - wardNum(b)) }))
    .sort((a, b) => String(a.body.body_type).localeCompare(String(b.body.body_type)) || String(a.body.body_name).localeCompare(String(b.body.body_name)));
}

export function LeadersTab({ rows }: { rows: Row[] }) {
  const rural = rows.filter((r) => RURAL.has(String(r.body_type)));
  const urban = rows.filter((r) => URBAN.has(String(r.body_type)));
  const other = rows.filter((r) => !RURAL.has(String(r.body_type)) && !URBAN.has(String(r.body_type)));
  const parties = new Map<string, number>();
  for (const r of rows) if (r.party && r.party !== "Not known") parties.set(String(r.party), (parties.get(String(r.party)) ?? 0) + 1);
  const partyLine = Array.from(parties.entries()).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(" · ");

  if (!rows.length) return <EmptyState title="No local leaders here yet" hint="Pick another district, or add a Pradhan, Sarpanch, Nagar Palika chairperson or ward member." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pradhans & Sarpanches" value={rural.filter((r) => ["Pradhan", "Sarpanch", "Zila Pramukh"].includes(String(r.role))).length} hint={`${rural.length} panchayat entries`} />
        <Stat label="City & town leaders" value={urban.length} hint="Mayor, chairpersons, ward members" />
        <Stat label="Verified" value={`${rows.filter((r) => r.verified).length} / ${rows.length}`} />
        <Stat label="By party" value={parties.size} hint={partyLine || "not recorded"} />
      </div>
      {[
        ["Villages & panchayats", rural, "Zila Parishad → Panchayat Samiti (Pradhan) → Gram Panchayat (Sarpanch, ward panches)"],
        ["Cities & towns", urban, "Municipal Corporation / Nagar Parishad / Nagar Palika → wards"],
        ["MLAs, MPs & others", other, ""],
      ].map(([title, list, sub]) =>
        (list as Row[]).length ? (
          <div key={String(title)} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{String(title)}</h3>
            {sub ? <p className="-mt-2 text-xs text-slate-500">{String(sub)}</p> : null}
            {groupBy(list as Row[]).map((g) => (
              <Card key={g.key}>
                <CardHeader title={String(g.body.body_name)} subtitle={`${String(g.body.body_type)} · ${String(g.body.city)}, ${String(g.body.district)}`} />
                <CardBody>
                  <ul className="divide-y divide-line">
                    {g.rows.map((r) => (
                      <Person key={r.id} r={r} />
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : null,
      )}
      <p className="text-xs text-slate-500">Details come from official election results and public notices; each entry links to its source. Phone numbers are shown only when published officially or given by the person.</p>
    </div>
  );
}
