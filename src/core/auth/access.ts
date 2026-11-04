/**
 * Who may do what.
 *
 * Phase 1 (3 Nov 2026): access is set per staff member in Team access, per
 * module, as a level (0 No access · 1 View · 2 Edit · 3 Manage). The Chairman
 * and the Director have every module at Manage. A staff member with no Team
 * access rows yet keeps the old role/team rules, so nobody loses access on the
 * day this goes live.
 */
import { teamsForRole, type EntityDef, type Role, type Team } from "@/core/schema/types";
import { entities } from "@/core/schema/registry";
import { modulesForEntity } from "@/core/departments";

export type Post = "chairman" | "director";

interface CurrentAccess {
  /** Chairman or Director. */
  admin: boolean;
  /** module key → level, or null when this person has no Team access set (old rules apply). */
  levels: Record<string, number> | null;
}

let current: CurrentAccess = { admin: false, levels: null };
/** Report duty (Reports → Report duty): "night-audit" and "report-<department>". Kept apart from the menu levels. */
let duties: Record<string, number> = {};
export const isDutyKey = (k: string) => k === "night-audit" || k.startsWith("report-");

/** Set by AuthProvider whenever the signed-in user (or their access) changes. */
export function setCurrentAccess(next: CurrentAccess) {
  duties = {};
  let levels: Record<string, number> | null = null;
  for (const [k, v] of Object.entries(next.levels ?? {})) {
    if (isDutyKey(k)) duties[k] = v;
    else (levels ??= {})[k] = v;
  }
  // Someone with only a report duty (no Team access set yet) keeps the old menu rules.
  current = { admin: next.admin, levels };
}

export function getCurrentAccess(): CurrentAccess {
  return current;
}

/** Level of a menu module for the signed-in user; null = no Team access set (use the old rules). */
export function moduleLevel(key: string): number | null {
  if (current.admin) return 3;
  if (isDutyKey(key)) return duties[key] ?? (current.levels ? 0 : null);
  if (!current.levels) return null;
  return current.levels[key] ?? 0;
}

/** Level of an entity: the highest level of the menu modules that open it; null = old rules. */
function entityLevel(def: EntityDef): number | null {
  if (current.admin) return 3;
  if (!current.levels) return null;
  const keys = modulesForEntity(def.name);
  if (!keys.length) return null; // helper tables that are not a menu item keep the old rules
  return Math.max(...keys.map((k) => current.levels?.[k] ?? 0));
}

export function isAdmin(role: Role): boolean {
  return current.admin || role === "owner" || role === "manager";
}

function legacyRead(role: Role, def: EntityDef): boolean {
  if (!def.permissions.read.includes(role)) return false;
  if (role === "owner" || role === "manager") return true;
  const mine = teamsForRole(role);
  return def.teams.some((t) => mine.includes(t));
}

export function canRead(role: Role, def: EntityDef): boolean {
  const lvl = entityLevel(def);
  return lvl === null ? legacyRead(role, def) : lvl >= 1;
}

export function canCreate(role: Role, def: EntityDef): boolean {
  const lvl = entityLevel(def);
  return lvl === null ? legacyRead(role, def) && def.permissions.create.includes(role) : lvl >= 2;
}

export function canUpdate(role: Role, def: EntityDef): boolean {
  const lvl = entityLevel(def);
  return lvl === null ? legacyRead(role, def) && def.permissions.update.includes(role) : lvl >= 2;
}

/** Deleting also needs the database's delete right (owner), whatever the level. */
export function canDelete(role: Role, def: EntityDef): boolean {
  // Chairman and Director have the same powers, deleting included (the Director's deletes are logged for the Chairman).
  if (current.admin) return true;
  const lvl = entityLevel(def);
  const legacy = legacyRead(role, def) && def.permissions.delete.includes(role);
  return lvl === null ? legacy : lvl >= 3 && def.permissions.delete.includes(role);
}

/** Modules a role may open, in registry order. */
export function visibleEntities(role: Role): EntityDef[] {
  return entities.filter((e) => !e.hidden && canRead(role, e));
}

/** Old sidebar groups (team → modules); still used by the dashboard's team view. */
export function navGroups(role: Role): { team: Team; entities: EntityDef[] }[] {
  const mine = teamsForRole(role);
  const order: Team[] = ["property", "operations", "marketing", "accounts", "finance", "hr"];
  return order
    .filter((t) => mine.includes(t))
    .map((team) => ({ team, entities: visibleEntities(role).filter((e) => e.teams.includes(team)) }))
    .filter((g) => g.entities.length > 0);
}
