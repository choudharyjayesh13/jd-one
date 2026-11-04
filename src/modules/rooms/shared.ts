"use client";
/**
 * Pages shared by several departments (e.g. the Room chart is used by Front Office,
 * Housekeeping and F&B). Which departments see them is ticked in Administration → Home cards
 * and stored in jdone.home_cards as "page:<page id>".
 */
import { useEffect, useState } from "react";
import { useUser } from "@/core/auth/AuthProvider";
import { moduleLevel } from "@/core/auth/access";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { myDepartments } from "@/modules/home/depts";

export const SHARED_PAGES: { id: string; title: string; href: string; depts: string[] }[] = [
  { id: "room-chart", title: "Room chart", href: "/room-chart/", depts: ["front-office", "reservations", "housekeeping", "fb-service", "fb-production", "maintenance"] },
];

let cache: Row[] | null = null;
let pending: Promise<Row[]> | null = null;
function loadSaved(): Promise<Row[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= getStore()
    .list("home-cards")
    .catch(() => [] as Row[])
    .then((r) => (cache = r));
  return pending;
}
/** Forget the cached ticks (after saving them). */
export function resetSharedPages() {
  cache = null;
  pending = null;
}

export function sharedDepartments(saved: Row[], id: string): string[] {
  const row = saved.find((r) => String(r.card) === `page:${id}`);
  return Array.isArray(row?.departments) ? (row!.departments as unknown[]).map(String) : SHARED_PAGES.find((p) => p.id === id)?.depts ?? [];
}

/** Departments (of this person) whose menu shows the shared page, and whether they may open it at all. */
export function useSharedPageDepts(id: string): { depts: string[]; allowed: boolean } {
  const user = useUser();
  const [saved, setSaved] = useState<Row[] | null>(cache);
  useEffect(() => {
    let live = true;
    void loadSaved().then((r) => live && setSaved(r));
    return () => {
      live = false;
    };
  }, []);
  const ticked = sharedDepartments(saved ?? [], id);
  const mine = myDepartments(user);
  const depts = user.post ? ticked : ticked.filter((d) => mine.includes(d));
  const explicit = (moduleLevel(id) ?? 0) >= 1;
  return { depts, allowed: !!user.post || depts.length > 0 || explicit };
}

export function useSharedPage(id: string): boolean {
  return useSharedPageDepts(id).allowed;
}
