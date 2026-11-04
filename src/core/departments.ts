/**
 * Hotel departments for JD Stays & Hospitality (The Udaisarovar), 3 Nov 2026.
 * The side menu, Team access and the permission checks all read this list.
 *
 * A module is one menu item. `key` is what Team access stores per staff member
 * (jdone.staff_access.module); for entity modules the key is the entity name,
 * so entity permissions can look their level up directly. `soon` modules are
 * planned (shown in Team access so access can be set up in advance) but are
 * not in the menu yet.
 */
export interface ModuleDef {
  key: string;
  label: string;
  /** Entity list page (generic pages). */
  entity?: string;
  /** Custom page path (with trailing slash). */
  href?: string;
  soon?: boolean;
}

export interface Department {
  id: string;
  label: string;
  modules: ModuleDef[];
  /** Only the Chairman and the Director see this department. */
  adminOnly?: boolean;
}

/** 0 No access · 1 View · 2 Edit (create and update) · 3 Manage (approve, cancel, delete, reports). */
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: { level: Level; label: string; hint: string }[] = [
  { level: 0, label: "No access", hint: "Hidden" },
  { level: 1, label: "View", hint: "Read only" },
  { level: 2, label: "Edit", hint: "Create and update entries" },
  { level: 3, label: "Manage", hint: "Approve, cancel, discount, delete, reports" },
];

export const DEPARTMENTS: Department[] = [
  {
    id: "front-office",
    label: "Front Office",
    modules: [
      { key: "room-chart", label: "Room chart", href: "/room-chart/" },
      { key: "checkins", label: "Check-in / Check-out", entity: "checkins" },
      { key: "customers", label: "Guests", entity: "customers" },
      { key: "guest-bill", label: "Guest bill", href: "/guest-bill/" },
      { key: "payment-requests", label: "Payment requests", entity: "payment-requests" },
      { key: "pay-qr", label: "Scan to pay (QR)", href: "/pay-qr/" },
      { key: "petty-cash", label: "Petty cash", entity: "petty-cash" },
      { key: "guest-requests", label: "Guest requests", entity: "guest-requests" },
      { key: "shift-closes", label: "Shift close", entity: "shift-closes" },
      { key: "guest-info", label: "Guest app content", entity: "guest-info" },
      { key: "rooms", label: "Rooms", entity: "rooms" },
      { key: "hotel-details", label: "Hotel details", href: "/hotel-details/" },
    ],
  },
  {
    id: "reservations",
    label: "Reservations",
    modules: [
      { key: "bookings", label: "Bookings", entity: "bookings" },
      { key: "availability", label: "Availability calendar", href: "/availability/" },
      { key: "rates", label: "Rates", entity: "rates" },
      { key: "rates-calendar", label: "Rate calendar", href: "/rates-calendar/" },
      { key: "add-ons", label: "Add-on services", entity: "add-ons" },
      { key: "ota-bookings", label: "OTA bookings", href: "/ota-bookings/" },
      { key: "agents", label: "Agents", entity: "agents" },
      { key: "promotions", label: "Promotions", entity: "promotions" },
    ],
  },
  {
    id: "sales",
    label: "Sales & Marketing",
    modules: [
      { key: "leads", label: "Leads", entity: "leads" },
      { key: "pipeline", label: "Sales pipeline", href: "/pipeline/" },
      { key: "deals", label: "Customer deals", entity: "deals" },
      { key: "activities", label: "Follow-ups", entity: "activities" },
      { key: "messages", label: "WhatsApp inbox", entity: "messages" },
      { key: "banquets", label: "Banquets & events", entity: "events" },
      { key: "sales-eod", label: "Sales EOD report", entity: "sales-eod" },
      { key: "targets", label: "Targets", entity: "targets" },
    ],
  },
  {
    id: "housekeeping",
    label: "Housekeeping",
    modules: [
      { key: "room-status", label: "Room status board", href: "/room-status/" },
      { key: "housekeeping-reports", label: "Housekeeping reports", entity: "housekeeping-reports" },
      { key: "room-checklist", label: "Room checklist", href: "/housekeeping-reports/new/" },
      { key: "linen", label: "Linen & laundry", entity: "linen-logs" },
      { key: "amenities", label: "Amenities refill", entity: "amenity-refills" },
      { key: "lost-found", label: "Lost & found", entity: "lost-found" },
    ],
  },
  {
    id: "fb-service",
    label: "F&B Service",
    modules: [
      { key: "kots", label: "Orders (KOT)", entity: "kots" },
      { key: "menu", label: "Menu & prices", entity: "menu" },
      { key: "room-charge", label: "Room charge & billing", href: "/fb-billing/" },
      { key: "fb-sales", label: "Daily F&B sales", href: "/fb-sales/" },
      { key: "guest-feedback", label: "Guest feedback", entity: "guest-feedback" },
    ],
  },
  {
    id: "fb-production",
    label: "F&B Production",
    modules: [
      { key: "kitchen-display", label: "Kitchen display (KOT)", href: "/kitchen/" },
      { key: "meal-counts", label: "Meal counts", href: "/meal-counts/" },
      { key: "prep-list", label: "Prep list", href: "/prep-list/" },
      { key: "recipes", label: "Recipes & costing", entity: "recipes" },
      { key: "indents", label: "Stock request (indent)", entity: "indents" },
      { key: "kitchen-stock", label: "Kitchen stock count", entity: "stock" },
      { key: "wastage", label: "Wastage", entity: "wastage" },
      { key: "hygiene", label: "Hygiene checklist", entity: "hygiene-checks" },
      { key: "gas", label: "Gas cylinders", entity: "gas-logs" },
    ],
  },
  {
    id: "stores",
    label: "Stores & Inventory",
    modules: [
      { key: "stock", label: "Stock levels", entity: "stock" },
      { key: "stock-movements", label: "Stock in / out", entity: "stock-movements" },
      { key: "indent-approvals", label: "Indent approvals", entity: "indents" },
      { key: "purchase-orders", label: "Purchase orders", entity: "purchase-orders" },
      { key: "purchases", label: "Goods received", entity: "purchases" },
      { key: "vendors", label: "Vendors", entity: "vendors" },
      { key: "consumption", label: "Consumption report", href: "/consumption/" },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    modules: [
      { key: "tickets", label: "Tickets", entity: "tickets" },
      { key: "property-assets", label: "Property assets", entity: "property-assets" },
      { key: "preventive", label: "Preventive service", entity: "service-schedules" },
      { key: "service-vendors", label: "Repair contacts", entity: "service-vendors" },
      { key: "daily-filings", label: "Electricity units", entity: "daily-filings" },
      { key: "vehicle-logs", label: "Vehicle log", entity: "vehicle-logs" },
    ],
  },
  {
    id: "activities",
    label: "Activities",
    modules: [
      { key: "activity-bookings", label: "Activity bookings", entity: "activity-bookings" },
      { key: "activity-slots", label: "Slots & capacity", href: "/activity-slots/" },
      { key: "activity-rates", label: "Activity rates", entity: "add-ons" },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    modules: [
      { key: "payments", label: "Payments", entity: "payments" },
      { key: "vouchers", label: "Vouchers", entity: "vouchers" },
      { key: "expenses", label: "Expenses", entity: "expenses" },
      { key: "daily-reports", label: "Daily report", entity: "daily-reports" },
      { key: "vendor-dues", label: "Vendor dues", href: "/vendor-dues/" },
      { key: "salary-payments", label: "Salaries paid", entity: "salary-payments" },
      { key: "reports", label: "Reports", href: "/reports/" },
      { key: "performance", label: "Sales & occupancy", href: "/performance/" },
    ],
  },
  {
    id: "hr",
    label: "HR",
    modules: [
      { key: "staff", label: "Employees", entity: "staff", href: "/employees/" },
      { key: "attendance", label: "Attendance", href: "/attendance/grid/" },
      { key: "rest-periods", label: "Leave & rest days", entity: "rest-periods" },
      { key: "staff-pay", label: "Salaries & pay", entity: "staff-pay" },
      { key: "candidates", label: "Hiring", entity: "candidates" },
      { key: "signup-requests", label: "Sign-up approvals", entity: "signup-requests" },
      { key: "scoreboard", label: "Scoreboard", href: "/scoreboard/" },
      { key: "task-board", label: "Task board", href: "/task-board/" },
      { key: "tasks", label: "Tasks", entity: "tasks" },
    ],
  },
  {
    id: "security",
    label: "Security",
    modules: [
      { key: "gate-register", label: "Gate register", entity: "gate-entries" },
      { key: "vehicle-entry", label: "Vehicle entry", entity: "vehicle-entries" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    modules: [
      { key: "dept-reports", label: "Department reports", href: "/reports/day/" },
      { key: "night-audit", label: "Night audit", href: "/night-audit/" },
      { key: "report-duty", label: "Report duty", href: "/reports/duty/" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    adminOnly: true,
    modules: [
      { key: "team-access", label: "Team access", href: "/team-access/" },
      { key: "director-changes", label: "Director changes", href: "/director-changes/" },
      { key: "settings", label: "Settings", href: "/settings/" },
    ],
  },
];

/** Departments staff can be given (Administration is tied to the posts). */
/** Departments in Team access (Reports is assigned separately, in Reports → Report duty). */
export const ASSIGNABLE_DEPARTMENTS = DEPARTMENTS.filter((d) => !d.adminOnly && d.id !== "reports");

/** Not used by The Udaisarovar: kept in the data, left out of the menu. */
export const HIDDEN_FOR_HOTEL = ["investors", "investments", "wallet-transactions", "business-units", "import-runs", "lead-stage-history", "attendance"];

/** Modules whose pages decide access themselves (department reports follow the departments a person works in). */
export const SELF_GUARDED_MODULES: readonly string[] = ["dept-reports", "night-audit", "report-duty"];

export const moduleHref = (m: ModuleDef): string | null => (m.soon ? null : m.href ?? (m.entity ? `/${m.entity}/` : null));

const allModules = DEPARTMENTS.flatMap((d) => d.modules.map((m) => ({ ...m, department: d.id })));

/** The module a page path belongs to (for the "no access" guard), longest match first. */
export function moduleForPath(pathname: string): string | null {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  let best: { key: string; len: number } | null = null;
  for (const m of allModules) {
    const href = moduleHref(m);
    if (href && href !== "/" && p.startsWith(href) && (!best || href.length > best.len)) best = { key: m.key, len: href.length };
  }
  return best?.key ?? null;
}

/** Module keys that point at an entity (entity name → module keys). */
export function modulesForEntity(entity: string): string[] {
  return allModules.filter((m) => m.entity === entity).map((m) => m.key);
}

/**
 * Starting access per post (Team access → "Role template"). Levels per module key;
 * "*" gives every live module of the department that level.
 */
export const ROLE_TEMPLATES: Record<string, Record<string, Level | Record<string, Level>>> = {
  "Front Office Executive": {
    "front-office": { "room-chart": 1, checkins: 2, customers: 1, "guest-bill": 2, "payment-requests": 2, "pay-qr": 2, "guest-requests": 2, "shift-closes": 2, "guest-info": 1 },
    reservations: { bookings: 2, availability: 1, "add-ons": 1 },
  },
  "Front Office Manager": {
    "front-office": 3,
    reservations: 3,
    sales: { leads: 2, pipeline: 1 },
    housekeeping: { "housekeeping-reports": 1 },
    accounts: { payments: 1, vouchers: 1, "daily-reports": 1 },
  },
  "Reservations Executive": {
    reservations: { bookings: 2, availability: 2, rates: 1, "rates-calendar": 1, "add-ons": 2, agents: 1, promotions: 1 },
    sales: { leads: 2, pipeline: 2, messages: 2, activities: 2 },
  },
  "Sales Executive": {
    sales: { leads: 2, pipeline: 2, deals: 2, activities: 2, messages: 2, banquets: 2, "sales-eod": 2 },
    reservations: { bookings: 1, availability: 1, rates: 1 },
  },
  Steward: { "fb-service": { kots: 2, menu: 1, "room-charge": 2, "fb-sales": 1, "guest-feedback": 2 }, "fb-production": { "meal-counts": 1 } },
  Chef: {
    "fb-production": { "kitchen-display": 3, "meal-counts": 3, "prep-list": 3, recipes: 3, indents: 2, "kitchen-stock": 2, wastage: 3, hygiene: 3, gas: 2 },
    "fb-service": { kots: 1, menu: 2 },
    stores: { stock: 1, "stock-movements": 2 },
  },
  Storekeeper: { stores: { stock: 3, "stock-movements": 3, "indent-approvals": 3, "purchase-orders": 3, purchases: 3, vendors: 2, consumption: 1 }, "fb-production": { indents: 1 } },
  "Housekeeping Attendant": {
    housekeeping: { "room-status": 2, "housekeeping-reports": 2, "room-checklist": 2, linen: 2, amenities: 2, "lost-found": 2 },
    maintenance: { tickets: 2 },
  },
  "Housekeeping Supervisor": { housekeeping: 3, maintenance: { tickets: 2 }, stores: { stock: 1 }, "fb-production": { indents: 2 } },
  "Activities In-charge": { activities: 3, reservations: { bookings: 1 }, "front-office": { customers: 1 } },
  "Security Guard": { security: 2 },
  "Maintenance Technician": { maintenance: { tickets: 2, "property-assets": 1, preventive: 2, "service-vendors": 1, "daily-filings": 2, "vehicle-logs": 2 } },
  Accountant: { accounts: { payments: 2, vouchers: 2, "vendor-dues": 2, expenses: 2, "daily-reports": 2, "salary-payments": 2, reports: 1, performance: 1 }, stores: { vendors: 1, purchases: 1 } },
  "General Manager": { "front-office": 3, reservations: 3, sales: 3, housekeeping: 3, "fb-service": 3, "fb-production": 3, stores: 3, activities: 3, security: 3, maintenance: 3, accounts: 1, hr: 2 },
  Custom: {},
};

/** Expand a template into module → level for every assignable module. */
export function levelsFromTemplate(name: string): Record<string, Level> {
  const t = ROLE_TEMPLATES[name] ?? {};
  const out: Record<string, Level> = {};
  for (const d of ASSIGNABLE_DEPARTMENTS) {
    const spec = t[d.id];
    for (const m of d.modules) {
      if (typeof spec === "number") out[m.key] = m.soon ? 0 : spec;
      else out[m.key] = (spec?.[m.key] as Level | undefined) ?? 0;
    }
  }
  return out;
}
