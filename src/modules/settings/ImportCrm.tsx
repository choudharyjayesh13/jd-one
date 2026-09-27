"use client";
/**
 * Settings → Import CRM: paste or upload a CSV/TSV, pick a preset (JD CRM
 * Leads sheet / Meta Leads sheet / generic), adjust the column mapping,
 * preview, import. Uses the same parser + engine as the scheduled script.
 */
import { useMemo, useState } from "react";
import { FileUp, Play } from "lucide-react";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { parseDelimited } from "@/core/import/csv";
import { PRESETS, detectPreset, mappingForPreset, mapRow } from "@/core/import/crm-leads";
import { metaRowToLead } from "@/core/import/meta-leads";
import { importLeads } from "@/core/import/run";
import { dataStoreSink } from "@/core/import/sinks";
import { TARGET_FIELDS, type ColumnMapping, type ImportSummary, type ImportedLead, type TargetField } from "@/core/import/types";
import { Button } from "@/core/ui/Button";
import { Select, Textarea } from "@/core/ui/Input";
import { Table, Th, Td } from "@/core/ui/Table";
import { useToast } from "@/core/ui/Toast";

export function ImportCrm() {
  const user = useUser();
  const { toast, confirm } = useToast();
  const [text, setText] = useState("");
  const [presetId, setPresetId] = useState<string>("");
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const table = useMemo(() => (text.trim() ? parseDelimited(text) : null), [text]);
  const preset = useMemo(() => {
    if (!table) return null;
    return PRESETS.find((p) => p.id === presetId) ?? detectPreset(table.headers);
  }, [table, presetId]);
  const effectiveMapping = useMemo(() => (table && preset ? mapping ?? mappingForPreset(preset, table.headers) : {}), [table, preset, mapping]);

  const leads: ImportedLead[] = useMemo(() => {
    if (!table || !preset) return [];
    if (preset.id === "meta") return table.rows.map((r) => metaRowToLead(r, table.headers)).filter((x): x is ImportedLead => Boolean(x));
    return table.rows.map((r) => mapRow(r, effectiveMapping, preset.source)).filter((x): x is ImportedLead => Boolean(x));
  }, [table, preset, effectiveMapping]);

  const onFile = async (f: File) => {
    setText(await f.text());
    setMapping(null);
    setSummary(null);
  };

  const run = async () => {
    if (!preset || !leads.length) return;
    if (!(await confirm(`Import ${leads.length} leads? Existing customers are matched by phone; leads already imported (same id) are only filled in, never overwritten.`))) return;
    setBusy(true);
    try {
      const s = await importLeads(leads, dataStoreSink(getStore()), { source: preset.source, staffId: (user.staff?.id as string) ?? null, label: `Manual import: ${preset.label}` });
      setSummary(s);
      toast(`Imported: ${s.created} new leads, ${s.updated} updated, ${s.customersCreated} new customers`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-navy">Import CRM (CSV / TSV)</h4>
      <p className="text-xs text-slate-500">Export the sheet as CSV (or copy the cells and paste — tab-separated works). The layout is detected automatically; you can adjust the mapping before importing.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-navy hover:bg-slate-50">
          <FileUp className="h-4 w-4" /> Choose file
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <Select
          value={preset?.id ?? ""}
          onChange={(e) => {
            setPresetId(e.target.value);
            setMapping(null);
          }}
          className="w-auto"
          disabled={!table}
        >
          <option value="">Auto-detect layout</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMapping(null);
          setSummary(null);
        }}
        placeholder="…or paste CSV / TSV here (first row = headers)"
        rows={4}
        className="font-mono text-xs"
      />

      {table && preset && (
        <>
          <p className="text-sm text-slate-700">
            {table.rows.length} rows · {table.headers.length} columns · layout: <span className="font-medium">{preset.label}</span>
          </p>
          {preset.id !== "meta" && (
            <details className="rounded-lg border border-line bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-navy">Column mapping</summary>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TARGET_FIELDS.map((f) => (
                  <label key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">{f.label}</span>
                    <Select value={effectiveMapping[f.id] ?? ""} onChange={(e) => setMapping({ ...effectiveMapping, [f.id as TargetField]: e.target.value || undefined })} className="h-8 w-44 text-xs">
                      <option value="">—</option>
                      {table.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            </details>
          )}
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Source</Th>
                <Th>Campaign</Th>
                <Th>Stage</Th>
                <Th>Qualification</Th>
                <Th>Assigned</Th>
                <Th>Requirement</Th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 5).map((l, i) => (
                <tr key={i}>
                  <Td>{l.lead.name}</Td>
                  <Td>{l.lead.phone || <span className="text-red-600">missing</span>}</Td>
                  <Td>{l.lead.source}</Td>
                  <Td>{l.lead.campaign}</Td>
                  <Td>{l.lead.stage}</Td>
                  <Td>{l.lead.qualification}</Td>
                  <Td>{l.assigned_to_name}</Td>
                  <Td className="max-w-[240px] truncate">{l.lead.requirement}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              Preview of first 5 · {leads.length} importable · {table.rows.length - leads.length} skipped (no name/phone)
            </span>
            <Button icon={Play} loading={busy} disabled={!leads.length} onClick={() => void run()}>
              Import {leads.length} leads
            </Button>
          </div>
        </>
      )}
      {summary && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Done: {summary.created} leads created, {summary.updated} updated, {summary.skipped} skipped, {summary.customersCreated} customers created, {summary.errors} errors.
          {summary.messages.map((m, i) => (
            <div key={i} className="text-xs text-red-700">
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
