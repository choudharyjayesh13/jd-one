"use client";
/** Generic record page: fields, module actions, edit/delete, related-record tabs. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import type { EntityAction } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { getStore } from "@/core/data";
import { deleteRecord, recordTitle } from "@/core/data/service";
import { useUser } from "@/core/auth/AuthProvider";
import { canDelete, canUpdate } from "@/core/auth/access";
import { listHref } from "@/core/routes";
import { formatDateTime } from "@/core/format";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { EntityForm } from "./EntityForm";
import { EntityList } from "./EntityList";
import { FieldValue } from "./FieldValue";
import { useRecord, useRelationMaps } from "./hooks";
import { Loading, ErrorBox, PageHeader } from "./misc";
import { useToast } from "./Toast";
import { cn } from "./cn";

export function EntityDetail({ entity, id, startEditing }: { entity: string; id: string; startEditing?: boolean }) {
  const def = getEntity(entity);
  const user = useUser();
  const router = useRouter();
  const { toast, confirm } = useToast();
  const { row, loading, error, reload } = useRecord(entity, id);
  const maps = useRelationMaps(def);
  const [editing, setEditing] = useState(Boolean(startEditing));
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!row) return <ErrorBox message={`${def.labelSingular} not found.`} />;

  const staffId = (user.staff?.id as string | undefined) ?? null;
  const statusField = def.fields.find((f) => f.type === "select" && (f.name === "status" || f.name === "stage"));

  const runAction = async (a: EntityAction) => {
    setBusy(a.id);
    try {
      await a.run({
        record: row,
        store: getStore(),
        staffId,
        navigate: (href) => router.push(href),
        toast,
        confirm,
        refresh: reload,
      });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!(await confirm(`Delete this ${def.labelSingular.toLowerCase()}? This cannot be undone.`))) return;
    try {
      await deleteRecord(entity, id, { store: getStore(), staffId });
      toast(`${def.labelSingular} deleted`);
      router.push(listHref(entity));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const visibleActions = (def.actions ?? []).filter((a) => !a.visible || a.visible(row));
  const tabs = def.reverse ?? [];

  return (
    <div>
      <PageHeader
        title={recordTitle(def, row)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {statusField && <FieldValue field={statusField} value={row[statusField.name]} maps={maps} />}
            <span>Updated {formatDateTime(row.updated_at)}</span>
          </span>
        }
        back={listHref(entity)}
        actions={
          <>
            {visibleActions.map((a) => (
              <Button key={a.id} variant={a.variant ?? "secondary"} icon={a.icon} loading={busy === a.id} onClick={() => void runAction(a)}>
                {a.label}
              </Button>
            ))}
            {canUpdate(user.role, def) && (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canDelete(user.role, def) && <Button variant="ghost" icon={Trash2} onClick={() => void remove()} aria-label="Delete" />}
          </>
        }
      />

      <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {def.fields
            .filter((f) => !f.hidden)
            .map((f) => (
              <div key={f.name} className={cn(f.type === "textarea" && "sm:col-span-2 lg:col-span-3")}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{f.label}</dt>
                <dd className="mt-0.5 text-sm text-slate-900">
                  <FieldValue field={f} value={f.computed ? f.computed(row) : row[f.name]} maps={maps} />
                </dd>
              </div>
            ))}
        </dl>
      </div>

      {tabs.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((t, i) => (
              <button
                key={t.entity + t.field}
                type="button"
                onClick={() => setTab(i)}
                className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", i === tab ? "border-gold text-navy" : "border-transparent text-slate-500 hover:text-navy")}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tabs[tab] && <EntityList key={tabs[tab].entity + tabs[tab].field} entity={tabs[tab].entity} fixedFilter={{ [tabs[tab].field]: id }} newPrefill={{ [tabs[tab].field]: id }} embedded />}
        </div>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} title={`Edit ${def.labelSingular.toLowerCase()}`} wide>
        {editing && (
          <EntityForm
            entity={entity}
            id={id}
            onSaved={() => {
              setEditing(false);
              void reload();
            }}
            onCancel={() => setEditing(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
