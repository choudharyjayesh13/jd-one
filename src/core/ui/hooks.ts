"use client";
/** Data hooks: subscribe-aware list/record loading on top of the DataStore. */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EntityDef, Row } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { getStore, type ListQuery } from "@/core/data";

interface ListState {
  key: string;
  rows: Row[];
  error: string | null;
}

export function useList(entity: string | null, query?: ListQuery) {
  const key = `${entity ?? ""}|${JSON.stringify(query ?? {})}`;
  const [state, setState] = useState<ListState>({ key: "", rows: [], error: null });

  const reload = useCallback(() => {
    if (!entity) return Promise.resolve();
    const q = JSON.parse(key.slice(key.indexOf("|") + 1)) as ListQuery;
    return getStore()
      .list(entity, q)
      .then(
        (rows) => setState({ key, rows, error: null }),
        (e: Error) => setState({ key, rows: [], error: e.message }),
      );
  }, [entity, key]);

  useEffect(() => {
    void reload();
    if (!entity) return;
    return getStore().subscribe?.(entity, () => void reload());
  }, [entity, reload]);

  // "loading" is derived: we have not yet stored a result for the current query.
  const loading = Boolean(entity) && state.key !== key;
  return { rows: state.key === key ? state.rows : [], loading, error: state.key === key ? state.error : null, reload };
}

interface RecordState {
  key: string;
  row: Row | null;
  error: string | null;
}

export function useRecord(entity: string, id: string | null) {
  const key = `${entity}|${id ?? ""}`;
  const [state, setState] = useState<RecordState>({ key: "", row: null, error: null });

  const reload = useCallback(() => {
    if (!id) return Promise.resolve();
    return getStore()
      .get(entity, id)
      .then(
        (row) => setState({ key, row, error: null }),
        (e: Error) => setState({ key, row: null, error: e.message }),
      );
  }, [entity, id, key]);

  useEffect(() => {
    void reload();
    return getStore().subscribe?.(entity, () => void reload());
  }, [entity, reload]);

  const ready = !id || state.key === key;
  return { row: ready ? state.row : null, loading: !ready, error: ready ? state.error : null, reload };
}

export type RelationMaps = Record<string, Map<string, Row>>;

/** Loads the related records referenced by relation fields so lists/details can show names. */
export function useRelationMaps(def: EntityDef): RelationMaps {
  const relEntities = useMemo(() => Array.from(new Set(def.fields.filter((f) => f.type === "relation" && f.entity).map((f) => f.entity!))), [def]);
  const [maps, setMaps] = useState<RelationMaps>({});

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all(relEntities.map((name) => getStore().list(name).then((rows) => [name, new Map(rows.map((r) => [r.id, r]))] as const))).then((entries) => {
        if (!cancelled) setMaps(Object.fromEntries(entries));
      });
    void load();
    const unsubs = relEntities.map((name) => getStore().subscribe?.(name, () => void load()));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
  }, [relEntities]);

  return maps;
}

/** Label for a relation id using loaded maps. */
export function relationLabel(maps: RelationMaps, entity: string, id: unknown): string {
  if (!id) return "";
  const row = maps[entity]?.get(String(id));
  if (!row) return "…";
  return String(row[getEntity(entity).titleField] ?? row.id);
}
