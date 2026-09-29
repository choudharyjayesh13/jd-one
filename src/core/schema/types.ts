/**
 * Entity registry types. Every business form in JD One is described by one
 * EntityDef; the generic list/form/detail pages render from these definitions,
 * so adding a form never requires per-form UI code.
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { DataStore } from "@/core/data/types";

/** Staff roles. JD One is internal-only; there is deliberately no customer role. */
export type Role = "owner" | "manager" | "hr" | "accounts" | "finance" | "marketing" | "staff";

/** Teams group modules in the sidebar and sections on the dashboard. */
export type Team = "property" | "hr" | "accounts" | "finance" | "marketing" | "operations";

export const TEAMS: { id: Team; label: string }[] = [
  { id: "property", label: "Property" },
  { id: "operations", label: "Operations" },
  { id: "marketing", label: "Sales & Marketing" },
  { id: "accounts", label: "Accounts" },
  { id: "finance", label: "Finance" },
  { id: "hr", label: "HR" },
];

/** Which teams a role belongs to. Owner and manager belong to every team. */
export function teamsForRole(role: Role): Team[] {
  switch (role) {
    case "owner":
    case "manager":
      return TEAMS.map((t) => t.id);
    case "hr":
      return ["hr"];
    case "accounts":
      return ["accounts"];
    case "finance":
      return ["finance"];
    case "marketing":
      // Sales & Marketing (one department): leads + pipeline, plus bookings/customers to convert them.
      return ["marketing", "operations"];
    default:
      return ["property", "operations"];
  }
}

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "boolean"
  | "phone"
  | "email"
  | "relation"
  | "file"
  | "files";

/** One item of a `files` field (photos/videos). LocalStore keeps data URLs; SupabaseStore uploads to Storage. */
export interface FileItem {
  url: string;
  type: "image" | "video";
  name: string;
  size: number;
}

/** A stored record. Every table has these columns; modules add their own. */
export type Row = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  [key: string]: unknown;
};

export type FieldValues = Record<string, unknown>;

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** select / multiselect options */
  options?: readonly string[];
  /** relation: target entity name (url slug) */
  entity?: string;
  /** relation(staff): new records default to the signed-in staff member unless this is false. */
  defaultToMe?: boolean;
  /** default value for new records; a function is evaluated at form open */
  default?: unknown | (() => unknown);
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Derived from other values of the same record; rendered read-only. */
  computed?: (values: FieldValues) => unknown;
  /** Display-only: computed when shown, never saved (no database column). */
  virtual?: boolean;
  /** Field is stored but not editable in the form (e.g. balance kept by hooks). */
  readOnly?: boolean;
  /** Hide from detail view (e.g. internal ids). */
  hidden?: boolean;
  /** Show the field on a full row in the form. */
  wide?: boolean;
}

/** Reverse relation: records of `entity` whose `field` points at this record. */
export interface ReverseRelation {
  entity: string;
  field: string;
  label: string;
}

export interface Permissions {
  read: Role[];
  create: Role[];
  update: Role[];
  delete: Role[];
}

export interface HookContext {
  store: DataStore;
  /** Staff id of the signed-in user, when known. */
  staffId: string | null;
}

/** A message computed live while the form is edited (e.g. "Existing customer: 3 stays"). */
export interface LiveHint {
  message: string;
  tone?: "info" | "success" | "warning";
  /** Values to apply to the form (e.g. link the matched customer). */
  patch?: FieldValues;
}

export interface EntityHooks {
  /** Adjust values before create/update (e.g. compute totals). */
  beforeSave?: (values: FieldValues, ctx: HookContext, id?: string) => Promise<FieldValues> | FieldValues;
  afterCreate?: (record: Row, ctx: HookContext) => Promise<void> | void;
  afterUpdate?: (record: Row, previous: Row, ctx: HookContext) => Promise<void> | void;
  afterRemove?: (record: Row, ctx: HookContext) => Promise<void> | void;
}

export interface ActionContext extends HookContext {
  record: Row;
  navigate: (href: string) => void;
  toast: (message: string, kind?: "success" | "error" | "info") => void;
  /** Re-load the record after the action changed data. */
  refresh: () => Promise<void>;
  /** Ask the user to confirm; resolves false when cancelled. */
  confirm: (message: string) => Promise<boolean>;
}

export interface EntityAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "danger";
  /** Show the action only when this returns true. */
  visible?: (record: Row) => boolean;
  /**
   * Ask for a few fields first (e.g. "Mark done" → resolution notes + photo):
   * the detail page opens the record's form limited to `fields`, applies
   * `patch` on top, saves through the normal hooks, then calls `run` (if any).
   */
  form?: { title?: string; fields: string[]; patch?: FieldValues; submitLabel?: string };
  run?: (ctx: ActionContext) => Promise<void> | void;
}

export interface EntityDef {
  /** URL slug + registry key, e.g. "daily-reports". */
  name: string;
  /** Plural label for lists/navigation. */
  label: string;
  /** Singular label for forms/buttons. */
  labelSingular: string;
  icon: LucideIcon;
  /** Database table / IndexedDB object store. */
  table: string;
  fields: FieldDef[];
  /** Field names shown as table columns in the list view. */
  listColumns: string[];
  /** Field used as the display title of a record (in links, selects). */
  titleField: string;
  /** Fields matched by the search box. */
  searchFields: string[];
  reverse?: ReverseRelation[];
  defaultSort: { field: string; dir: "asc" | "desc" };
  /** Tie-breaker applied after defaultSort (e.g. tickets: priority, then newest). */
  secondarySort?: { field: string; dir: "asc" | "desc" };
  permissions: Permissions;
  /** Combinations of fields that must be unique (checked before save). */
  unique?: string[][];
  hooks?: EntityHooks;
  actions?: EntityAction[];
  /** Teams that use this module; drives sidebar grouping and role visibility. */
  teams: Team[];
  /** Hide from the main navigation (still reachable by URL). */
  hidden?: boolean;
  /** Records of this entity are scoped by business unit through this field. */
  unitField?: string;
  /** Replaces the generic detail page (e.g. the customer 360° view). */
  customDetail?: ComponentType<{ id: string }>;
  /** Rendered above the generic list page (e.g. pending sign-ups on Staff). */
  listExtra?: ComponentType;
  /** Live hint shown in the form whenever one of `watch` fields changes. */
  liveHint?: { watch: string[]; compute: (values: FieldValues, store: DataStore) => Promise<LiveHint | null> };
}

export const ALL_ROLES: Role[] = ["owner", "manager", "hr", "accounts", "finance", "marketing", "staff"];
export const ADMIN_ROLES: Role[] = ["owner", "manager"];

export const defaultPermissions: Permissions = {
  read: ALL_ROLES,
  create: ALL_ROLES,
  update: ALL_ROLES,
  delete: ["owner"],
};

/** Convenience for module authors: an entity with the standard permissions. */
export function defineEntity(def: Omit<EntityDef, "permissions"> & { permissions?: Partial<Permissions> }): EntityDef {
  return { ...def, permissions: { ...defaultPermissions, ...(def.permissions ?? {}) } };
}
