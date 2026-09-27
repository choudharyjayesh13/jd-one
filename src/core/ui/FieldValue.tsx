"use client";
/** Renders one stored value according to its FieldDef (money, date, badge, link…). */
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import type { FieldDef } from "@/core/schema/types";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/core/format";
import { viewHref } from "@/core/routes";
import { relationLabel, type RelationMaps } from "./hooks";
import { Badge } from "./Badge";

export function FieldValue({ field, value, maps }: { field: FieldDef; value: unknown; maps: RelationMaps }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return <span className="text-slate-400">—</span>;
  switch (field.type) {
    case "money":
      return <span className="tabular-nums">{formatMoney(value)}</span>;
    case "number":
      return <span className="tabular-nums">{formatNumber(value)}</span>;
    case "date":
      return <>{formatDate(value)}</>;
    case "datetime":
      return <>{formatDateTime(value)}</>;
    case "select":
      return <Badge value={value} />;
    case "multiselect":
      return (
        <span className="flex flex-wrap gap-1">
          {(Array.isArray(value) ? value : []).map((v) => (
            <Badge key={String(v)} value={v} />
          ))}
        </span>
      );
    case "boolean":
      return value ? <CheckCircle2 className="inline h-4 w-4 text-emerald-600" /> : <Circle className="inline h-4 w-4 text-slate-300" />;
    case "relation":
      return (
        <Link href={viewHref(field.entity!, String(value))} className="text-navy underline decoration-gold/60 underline-offset-2 hover:decoration-gold" onClick={(e) => e.stopPropagation()}>
          {relationLabel(maps, field.entity!, value)}
        </Link>
      );
    case "phone":
      return (
        <a href={`tel:${String(value)}`} className="text-navy" onClick={(e) => e.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${String(value)}`} className="text-navy" onClick={(e) => e.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "file":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={String(value)} alt={field.label} className="h-16 w-16 rounded-lg border border-line object-cover" />
        </a>
      );
    case "textarea":
      return <span className="whitespace-pre-wrap">{String(value)}</span>;
    default:
      return <>{String(value)}</>;
  }
}
