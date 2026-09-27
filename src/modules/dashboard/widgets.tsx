"use client";
/** Small presentational pieces used by the dashboard sections. */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { Badge } from "@/core/ui/Badge";
import { viewHref } from "@/core/routes";

export function Section({ title, children, href, subtitle }: { title: string; subtitle?: string; href?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          href ? (
            <Link href={href} className="inline-flex items-center gap-1 text-xs text-navy hover:underline">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          ) : undefined
        }
      />
      <CardBody className="p-0">{children}</CardBody>
    </Card>
  );
}

export function RecordList({ entity, rows, primary, secondary, badge, empty = "Nothing here" }: { entity: string; rows: Row[]; primary: (r: Row) => ReactNode; secondary?: (r: Row) => ReactNode; badge?: (r: Row) => unknown; empty?: string }) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.slice(0, 8).map((r) => (
        <li key={r.id}>
          <Link href={viewHref(entity, r.id)} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50">
            <span className="min-w-0">
              <span className="block truncate font-medium text-navy">{primary(r)}</span>
              {secondary && <span className="block truncate text-xs text-slate-500">{secondary(r)}</span>}
            </span>
            {badge && <Badge value={badge(r)} />}
          </Link>
        </li>
      ))}
      {rows.length > 8 && <li className="px-4 py-2 text-xs text-slate-400">+{rows.length - 8} more</li>}
    </ul>
  );
}

export function KeyValue({ rows }: { rows: { label: ReactNode; value: ReactNode; hint?: ReactNode }[] }) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-slate-500">No data yet</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <span className="min-w-0 truncate text-slate-700">
            {r.label}
            {r.hint && <span className="ml-1 text-xs text-slate-400">{r.hint}</span>}
          </span>
          <span className="shrink-0 font-medium tabular-nums text-navy">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Progress({ pct }: { pct: number | null }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={p >= 100 ? "h-full bg-emerald-500" : p >= 60 ? "h-full bg-gold" : "h-full bg-navy"} style={{ width: `${p}%` }} />
    </div>
  );
}
