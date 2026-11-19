/** Departments a person works in (any module they can at least view). Light helper, safe for the menu. */
import type { AuthUser } from "@/core/auth/AuthProvider";
import { moduleLevel } from "@/core/auth/access";
import { DEPARTMENTS } from "@/core/departments";
import { REPORT_DEPARTMENTS } from "@/modules/night-audit/access";

export function myDepartments(user: AuthUser): string[] {
  const all = REPORT_DEPARTMENTS.map((d) => d.id);
  if (user.post) return all;
  return all.filter((id) => {
    const dept = DEPARTMENTS.find((d) => d.id === id);
    if (!dept) return false;
    return dept.modules.some((m) => {
      const lvl = moduleLevel(m.key);
      return lvl === null ? user.role === "owner" || user.role === "manager" : lvl >= 1;
    });
  });
}
