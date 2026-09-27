"use client";
/**
 * Generic list: search, business-unit filter, CSV export, "New" button and a
 * table (cards on phones). Also used embedded on detail pages for reverse
 * relations (fixedFilter + newPrefill).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Search } from "lucide-react";
import type { FieldValues } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { useUser } from "@/core/auth/AuthProvider";
import { canCreate } from "@/core/auth/access";
import { newHref, viewHref } from "@/core/routes";
import { toCSV, downloadText } from "@/core/csv";
import { todayISO } from "@/core/format";
import { Button } from "./Button";
import { Input, Select } from "./Input";
import { Table, Th, Td } from "./Table";
import { FieldValue } from "./FieldValue";
import { useList, useRelationMaps, relationLabel } from "./hooks";
import { EmptyState, Loading, ErrorBox } from "./misc";

interface Props {
  entity: string;
  fixedFilter?: Record<string, unknown>;
  newPrefill?: FieldValues;
  embedded?: boolean;
  limit?: number;
}

export function EntityList({ entity, fixedFilter, newPrefill, embedded, limit }: Props) {
  const def = getEntity(entity);
  const user = useUser();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<string>(user.unitId ?? "");
  const maps = useRelationMaps(def);

  const filter = useMemo(() => {
    const f: Record<string, unknown> = { ...(fixedFilter ?? {}) };
    if (def.unitField && unit) f[def.unitField] = unit;
    return f;
  }, [fixedFilter, def.unitField, unit]);

  const { rows, loading, error } = useList(entity, { search: search.trim() || undefined, filter, limit });
  const units = maps["business-units"] ? Array.from(maps["business-units"].values()) : [];
  const columns = def.listColumns.map((c) => def.fields.find((f) => f.name === c)!).filter(Boolean);

  const exportCsv = () => {
    const text = toCSV(def, rows, (row, name) => {
      const f = def.fields.find((x) => x.name === name);
      return f?.type === "relation" ? relationLabel(maps, f.entity!, row[name]) : row[name];
    });
    downloadText(`${def.name}-${todayISO()}.csv`, text);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${def.label.toLowerCase()}…`} className="pl-9" />
        </div>
        {def.unitField && !user.unitId && !fixedFilter?.[def.unitField] && (
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-auto max-w-[200px]">
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {String(u.name)}
              </option>
            ))}
          </Select>
        )}
        {!embedded && (
          <Button variant="secondary" icon={Download} onClick={exportCsv} title="Export CSV" aria-label="Export CSV">
            <span className="hidden sm:inline">CSV</span>
          </Button>
        )}
        {canCreate(user.role, def) && (
          <Button icon={Plus} onClick={() => router.push(newHref(entity, newPrefill))}>
            New
          </Button>
        )}
      </div>

      {error && <ErrorBox message={error} />}
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${def.label.toLowerCase()} yet`} hint={search ? "Try a different search." : `Tap New to add the first ${def.labelSingular.toLowerCase()}.`} />
      ) : (
        <>
          {/* Phone: card list */}
          <ul className="space-y-2 sm:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => router.push(viewHref(entity, row.id))} className="w-full rounded-xl border border-line bg-white p-3 text-left shadow-sm active:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-navy">{String(row[def.titleField] ?? "") || def.labelSingular}</span>
                    {columns[1] && (
                      <span className="text-sm">
                        <FieldValue field={columns[1]} value={row[columns[1].name]} maps={maps} />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {columns.slice(2, 5).map((c) => (
                      <span key={c.name}>
                        {c.label}: <FieldValue field={c} value={row[c.name]} maps={maps} />
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <Th key={c.name}>{c.label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(viewHref(entity, row.id))}>
                    {columns.map((c) => (
                      <Td key={c.name} className={c.name === def.titleField ? "font-medium text-navy" : undefined}>
                        <FieldValue field={c} value={row[c.name]} maps={maps} />
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="text-xs text-slate-400">{rows.length} record{rows.length === 1 ? "" : "s"}</p>
        </>
      )}
    </div>
  );
}
