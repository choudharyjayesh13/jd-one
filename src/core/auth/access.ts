/** Role-based access: which modules a role sees and what it may do with them. */
import { teamsForRole, type EntityDef, type Role, type Team } from "@/core/schema/types";
import { entities } from "@/core/schema/registry";

export function isAdmin(role: Role): boolean {
  return role === "owner" || role === "manager";
}

export function canRead(role: Role, def: EntityDef): boolean {
  if (!def.permissions.read.includes(role)) return false;
  if (isAdmin(role)) return true;
  const mine = teamsForRole(role);
  return def.teams.some((t) => mine.includes(t));
}

export const canCreate = (role: Role, def: EntityDef) => canRead(role, def) && def.permissions.create.includes(role);
export const canUpdate = (role: Role, def: EntityDef) => canRead(role, def) && def.permissions.update.includes(role);
export const canDelete = (role: Role, def: EntityDef) => canRead(role, def) && def.permissions.delete.includes(role);

/** Modules a role may open, in registry order. */
export function visibleEntities(role: Role): EntityDef[] {
  return entities.filter((e) => !e.hidden && canRead(role, e));
}

/** Sidebar groups: team → modules. A module in several teams appears under each. */
export function navGroups(role: Role): { team: Team; entities: EntityDef[] }[] {
  const mine = teamsForRole(role);
  const order: Team[] = ["property", "operations", "marketing", "accounts", "finance", "hr"];
  return order
    .filter((t) => mine.includes(t))
    .map((team) => ({ team, entities: visibleEntities(role).filter((e) => e.teams.includes(team)) }))
    .filter((g) => g.entities.length > 0);
}
