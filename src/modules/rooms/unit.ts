"use client";
/**
 * Which property a room / front-office page shows. Staff always see their own property
 * (The Udaisarovar for JD Stays); only the Chairman and the Director can switch to another
 * property or to all JD Stays & Hospitality properties together.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";

export function useUnitChoice() {
  const user = useUser();
  const canAll = !!user.post;
  const { rows: units } = useList("business-units", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const home = user.unitId ?? (units.find((u) => /udaisarovar/i.test(String(u.name)))?.id as string | undefined) ?? "";
  const [unit, setUnit] = useState<string>(home);
  useEffect(() => {
    if (!unit && home) setUnit(home);
  }, [home, unit]);
  const current = canAll ? unit : home;
  return { unit: current, setUnit, units, canAll, unitName: String(units.find((u) => u.id === current)?.name ?? (canAll && !current ? "All properties" : "The Udaisarovar")) };
}
