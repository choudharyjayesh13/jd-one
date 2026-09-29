/** Export any list of records to a CSV download (Excel-friendly, UTF-8 BOM). */
import type { EntityDef, Row } from "@/core/schema/types";

function escape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(def: EntityDef, rows: Row[], labels?: (row: Row, field: string) => unknown): string {
  const fields = def.fields.filter((f) => f.type !== "file" && f.type !== "files");
  const header = fields.map((f) => escape(f.label)).join(",");
  const lines = rows.map((r) => fields.map((f) => escape(labels ? labels(r, f.name) : r[f.name])).join(","));
  return "﻿" + [header, ...lines].join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
