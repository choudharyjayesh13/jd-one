"use client";
/** Searchable picker for relation fields, with an optional "+ New" hook. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { getStore } from "@/core/data";
import { recordTitle } from "@/core/data/service";
import { cn } from "./cn";

interface Props {
  entity: string;
  value: string | null;
  onChange: (id: string | null) => void;
  onCreateNew?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  /** Extra filter for the options (e.g. only active staff). */
  filter?: Record<string, unknown>;
}

export function RelationSelect({ entity, value, onChange, onCreateNew, disabled, invalid, placeholder, filter }: Props) {
  const def = getEntity(entity);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const filterKey = JSON.stringify(filter ?? {});

  useEffect(() => {
    const load = async () => setRows(await getStore().list(entity, { filter: JSON.parse(filterKey) }));
    void load();
    return getStore().subscribe?.(entity, () => void load());
  }, [entity, filterKey]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = rows.find((r) => r.id === value);
  const options = useMemo(() => {
    const needle = q.toLowerCase();
    return rows.filter((r) => !needle || recordTitle(def, r).toLowerCase().includes(needle) || def.searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(needle))).slice(0, 50);
  }, [rows, q, def]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-base sm:text-sm",
          invalid ? "border-red-500" : "border-line",
          disabled ? "bg-slate-50 text-slate-500" : "text-slate-900",
        )}
      >
        <span className={cn("truncate", !selected && "text-slate-400")}>{selected ? recordTitle(def, selected) : value ? "…" : placeholder ?? `Select ${def.labelSingular.toLowerCase()}`}</span>
        <span className="flex items-center gap-1">
          {value && !disabled && (
            <X
              className="h-4 w-4 text-slate-400 hover:text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-white shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${def.label.toLowerCase()}…`}
            className="w-full border-b border-line px-3 py-2 text-sm focus:outline-none"
          />
          <ul className="max-h-56 overflow-y-auto py-1 text-sm">
            {options.length === 0 && <li className="px-3 py-2 text-slate-400">No matches</li>}
            {options.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={cn("w-full px-3 py-2 text-left hover:bg-slate-50", r.id === value && "bg-gold/10 font-medium")}
                  onClick={() => {
                    onChange(r.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {recordTitle(def, r)}
                </button>
              </li>
            ))}
          </ul>
          {onCreateNew && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm font-medium text-navy hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
            >
              <Plus className="h-4 w-4" /> New {def.labelSingular.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
