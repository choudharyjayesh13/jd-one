/**
 * First-run seed for local mode: business units (always) plus a small demo
 * data set so the app is not empty. Demo ids are remembered so "Clear demo
 * data" removes exactly those records and nothing the user entered.
 */
import { getLocalStore, getStore, storeKind } from "./index";
import { BUSINESS_UNIT_SEED } from "@/modules/business-units/entity";
import { addDays, todayISO } from "@/core/format";
import type { FieldValues } from "@/core/schema/types";

const SEEDED_KEY = "jdone.seeded";
const DEMO_KEY = "jdone.demoIds";

type DemoIds = Record<string, string[]>;

function readDemoIds(): DemoIds {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "{}") as DemoIds;
  } catch {
    return {};
  }
}

export function hasDemoData(): boolean {
  return Object.values(readDemoIds()).some((ids) => ids.length > 0);
}

/** Business units are required by every form; make sure they exist (local mode). */
export async function ensureBusinessUnits(): Promise<Map<string, string>> {
  const store = getStore();
  const existing = await store.list("business-units");
  const byName = new Map(existing.map((u) => [String(u.name), u.id]));
  for (const u of BUSINESS_UNIT_SEED) {
    if (!byName.has(u.name)) {
      const row = await store.create("business-units", { ...u, active: true });
      byName.set(u.name, row.id);
    }
  }
  return byName;
}

export async function ensureSeeded(): Promise<void> {
  if (storeKind !== "local") return;
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    await ensureBusinessUnits();
    await seedDemoData();
    localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    /* IndexedDB unavailable (private mode) – the app still renders. */
  }
}

export async function seedDemoData(): Promise<void> {
  const store = getStore();
  const units = await ensureBusinessUnits();
  const uds = units.get("The Udaisarovar")!;
  const ids: DemoIds = readDemoIds();
  const add = async (entity: string, values: FieldValues) => {
    const row = await store.create(entity, values);
    (ids[entity] ??= []).push(row.id);
    return row;
  };
  const today = todayISO();

  const gm = await add("staff", { name: "Gaurav Saini", role: "manager", business_unit_id: uds, designation: "General Manager", active: true, phone: "9876543210", joined_on: "2024-04-01" });
  const fo = await add("staff", { name: "Ravi Front Office", role: "staff", business_unit_id: uds, designation: "Front office", active: true, joined_on: "2025-01-10" });
  const mk = await add("staff", { name: "Priya Marketing", role: "marketing", business_unit_id: units.get("JD Group HQ")!, designation: "Marketing executive", active: true, joined_on: "2025-06-01" });

  const c1 = await add("customers", { name: "Anita Sharma", phone: "9829012345", email: "anita@example.com", city: "Jaipur", tags: ["Family", "Repeat"], first_source: "Meta Ads", first_seen: addDays(today, -120), birthday: `1988-${today.slice(5, 7)}-15`, preferences: "Lake view, vegetarian, early check-in" });
  const c2 = await add("customers", { name: "Rohit Mehta", phone: "9898989898", city: "Ahmedabad", tags: ["Couple"], first_source: "Website", first_seen: addDays(today, -20) });
  const c3 = await add("customers", { name: "Karan Corporate Travels", phone: "9811111111", company: "KCT Pvt Ltd", city: "Delhi", tags: ["Corporate", "Agent"], first_source: "Referral", first_seen: addDays(today, -200) });

  await add("leads", { name: "Anita Sharma", phone: "9829012345", customer_id: c1.id, business_unit_id: uds, source: "Meta Ads", campaign: "Monsoon offer", requirement: "Stay: Lake View Cottage · With: family · Guests: 4", visit_from: addDays(today, 10), visit_to: addDays(today, 12), guests: 4, qualification: "Hot", stage: "Qualified", assigned_to: mk.id, next_follow_up: today });
  await add("leads", { name: "Rohit Mehta", phone: "9898989898", customer_id: c2.id, business_unit_id: uds, source: "Website", requirement: "Anniversary weekend, glass house", visit_from: addDays(today, 30), guests: 2, qualification: "Warm", stage: "Contacted", assigned_to: mk.id, next_follow_up: addDays(today, -2) });
  await add("leads", { name: "Sunil Verma", phone: "9000000001", business_unit_id: units.get("Pronite")!, source: "Instagram", requirement: "Corporate event for 80 pax", guests: 80, qualification: "Cold", stage: "New" });

  const b1 = await add("bookings", { guest_name: "Anita Sharma", phone: "9829012345", customer_id: c1.id, business_unit_id: uds, check_in: today, check_out: addDays(today, 2), unit_type: "Lake View Cottage", units: 1, adults: 2, children: 2, meal_plan: "MAP", rate: 9500, total: 19000, advance: 5000, paid: 5000, balance: 14000, source: "Direct", status: "Confirmed" });
  const b2 = await add("bookings", { guest_name: "Karan Corporate Travels", phone: "9811111111", customer_id: c3.id, business_unit_id: uds, check_in: addDays(today, -3), check_out: today, unit_type: "Family Suite", units: 2, adults: 4, children: 0, meal_plan: "CP", rate: 7500, total: 45000, advance: 45000, paid: 45000, balance: 0, source: "Corporate", status: "Checked-in" });
  await add("payments", { booking_id: b1.id, customer_id: c1.id, date: addDays(today, -5), amount: 5000, mode: "UPI", reference: "Advance", received_by: fo.id });
  await add("payments", { booking_id: b2.id, customer_id: c3.id, date: addDays(today, -3), amount: 45000, mode: "Bank", reference: "NEFT KCT", received_by: gm.id });
  await add("checkins", { booking_id: b2.id, actual_in: `${addDays(today, -3)}T14:10:00+05:30`, id_proof_type: "Aadhaar", id_number: "4321", room_numbers: "FS-1, FS-2", handled_by: fo.id });

  await add("daily-reports", { date: today, business_unit_id: uds, sales_cash: 12000, sales_online: 45000, sales_total: 57000, occupancy_units: 6, submitted_by: gm.id, remarks: "Demo report" });
  await add("targets", { business_unit_id: uds, month: today.slice(0, 7), target_amount: 1500000 });
  await add("stock", { item: "Mineral water (1L)", unit: "bottles", quantity: 24, min_quantity: 48, low_stock: true, business_unit_id: uds, last_counted: today });
  await add("stock", { item: "Bath towels", unit: "pcs", quantity: 60, min_quantity: 30, low_stock: false, business_unit_id: uds, last_counted: today });
  await add("tasks", { title: "Fix AC in Lake View Cottage 3", business_unit_id: uds, type: "Maintenance", priority: "High", assigned_to: fo.id, due: today, status: "Open" });
  await add("tasks", { title: "Order mineral water", business_unit_id: uds, type: "Purchase", priority: "Medium", assigned_to: gm.id, due: addDays(today, 1), status: "Open" });
  await add("attendance", { date: today, staff_id: gm.id, status: "P" });
  await add("attendance", { date: today, staff_id: fo.id, status: "P" });
  await add("expenses", { date: today, business_unit_id: uds, amount: 3200, category: "Kitchen & food", vendor: "Sabzi mandi", paid_by: gm.id, mode: "Cash" });

  localStorage.setItem(DEMO_KEY, JSON.stringify(ids));
}

export async function clearDemoData(): Promise<void> {
  const local = getLocalStore();
  const ids = readDemoIds();
  if (local) {
    for (const [entity, list] of Object.entries(ids)) {
      const { getEntity } = await import("@/core/schema/registry");
      await local.removeMany(getEntity(entity).table, list);
    }
  } else {
    const store = getStore();
    for (const [entity, list] of Object.entries(ids)) for (const id of list) await store.remove(entity, id).catch(() => undefined);
  }
  localStorage.removeItem(DEMO_KEY);
}
