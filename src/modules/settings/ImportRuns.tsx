"use client";
/** "Last import" summary + recent runs (manual CSV and the scheduled Meta import). */
import { storeKind } from "@/core/data";
import { formatDateTime } from "@/core/format";
import { useList } from "@/core/ui/hooks";
import { Table, Th, Td } from "@/core/ui/Table";

export function ImportRuns() {
  const { rows } = useList("import-runs", { limit: 8 });
  const last = rows[0];
  return (
    <div>
      <h4 className="text-sm font-semibold text-navy">Automatic Meta leads import</h4>
      {storeKind === "local" ? (
        <p className="mt-1 text-xs text-slate-500">The scheduled import (GitHub Action, daily 08:00 IST) needs shared mode (Supabase). In local mode use the manual CSV import below.</p>
      ) : last ? (
        <p className="mt-1 text-sm text-slate-700">
          Last import: {formatDateTime(last.started_at)} · {String(last.source)} · {String(last.created)} new lead{Number(last.created) === 1 ? "" : "s"}, {String(last.updated)} updated
          {Number(last.errors) ? <span className="text-red-600"> · {String(last.errors)} errors</span> : null}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">No imports recorded yet. Runs daily at 08:00 IST once the GitHub secrets are set (see README).</p>
      )}
      {rows.length > 0 && (
        <div className="mt-3">
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Source</Th>
                <Th>Rows</Th>
                <Th>Customers</Th>
                <Th>Leads new</Th>
                <Th>Updated</Th>
                <Th>Skipped</Th>
                <Th>Errors</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{formatDateTime(r.started_at)}</Td>
                  <Td>{String(r.source)}</Td>
                  <Td>{String(r.rows)}</Td>
                  <Td>{String(r.customers_created ?? 0)}</Td>
                  <Td>{String(r.created)}</Td>
                  <Td>{String(r.updated)}</Td>
                  <Td>{String(r.skipped)}</Td>
                  <Td className={Number(r.errors) ? "text-red-600" : undefined}>{String(r.errors)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
