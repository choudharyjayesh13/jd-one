/** Who may send which department report, run the night audit, and assign that duty. Kept free of heavy imports (used by the menu). */
import { useEffect, useState } from "react";
import type { AuthUser } from "@/core/auth/AuthProvider";
import { moduleLevel } from "@/core/auth/access";
import { getStore } from "@/core/data";

/** Department ids in report order (same ids as the menu). */
export const REPORT_DEPARTMENTS: { id: string; title: string }[] = [
  { id: "front-office", title: "Front Office" },
  { id: "reservations", title: "Reservations" },
  { id: "sales", title: "Sales & Marketing" },
  { id: "housekeeping", title: "Housekeeping" },
  { id: "fb-service", title: "F&B Service" },
  { id: "fb-production", title: "F&B Production (Kitchen)" },
  { id: "stores", title: "Stores & Inventory" },
  { id: "maintenance", title: "Maintenance" },
  { id: "activities", title: "Activities" },
  { id: "accounts", title: "Accounts" },
  { id: "hr", title: "HR" },
  { id: "security", title: "Security" },
];
export const deptTitle = (id: string) => REPORT_DEPARTMENTS.find((d) => d.id === id)?.title ?? id;

/** Team-access keys used for report duty (stored in jdone.staff_access like any module). */
export const NIGHT_AUDIT_KEY = "night-audit";
export const reportKey = (dept: string) => `report-${dept}`;

/** Night audit (and every department's report): Chairman, Director, and whoever is assigned the night audit. */
export function canNightAudit(user: AuthUser): boolean {
  if (user.post) return true;
  const lvl = moduleLevel(NIGHT_AUDIT_KEY);
  if (lvl === null) return user.role === "owner" || user.role === "manager";
  return lvl >= 2;
}

/** Departments this person has been assigned to send the daily report for. */
export function reportDepartments(user: AuthUser): string[] {
  if (canNightAudit(user)) return REPORT_DEPARTMENTS.map((d) => d.id);
  return REPORT_DEPARTMENTS.filter((d) => (moduleLevel(reportKey(d.id)) ?? 0) >= 2).map((d) => d.id);
}

/** Property Supervisor: the person in the "property_supervisor" post (by login email). */
export function useIsPropertySupervisor(user: AuthUser): boolean {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    const email = (user.email ?? "").toLowerCase();
    if (!email) return;
    let live = true;
    getStore()
      .list("org-posts", { filter: { post: "property_supervisor" } })
      .then((rows) => live && setYes(rows.some((r) => String(r.email ?? "").toLowerCase() === email)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user.email]);
  return yes;
}

/** Chairman, Director and the Property Supervisor assign report duty. */
export function useCanAssignReports(user: AuthUser): boolean {
  const sup = useIsPropertySupervisor(user);
  return !!user.post || sup;
}
