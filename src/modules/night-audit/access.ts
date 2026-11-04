/** Who may write which department report, and who may run the night audit. Kept free of heavy imports (used by the menu). */
import type { AuthUser } from "@/core/auth/AuthProvider";
import { moduleLevel } from "@/core/auth/access";
import { DEPARTMENTS } from "@/core/departments";

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

/** Night audit (and every department's report): Chairman, Director, Front Office staff, and anyone ticked for "Night audit". */
export function canNightAudit(user: AuthUser): boolean {
  if (user.post) return true;
  const lvl = moduleLevel("night-audit");
  if (lvl === null) return user.role === "owner" || user.role === "manager";
  // Front Office staff (check-in / check-out duty) run the night audit.
  return lvl >= 2 || (moduleLevel("checkins") ?? 0) >= 2;
}

/** Departments this person can write the daily report for: the ones they work in (Edit or Manage on any module). */
export function reportDepartments(user: AuthUser): string[] {
  if (canNightAudit(user)) return REPORT_DEPARTMENTS.map((d) => d.id);
  return REPORT_DEPARTMENTS.filter((rd) => {
    const dept = DEPARTMENTS.find((d) => d.id === rd.id);
    return !!dept?.modules.some((m) => (moduleLevel(m.key) ?? 0) >= 2);
  }).map((d) => d.id);
}
