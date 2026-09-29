/**
 * The entity registry: one place that knows every module. Pages, stores and
 * the navigation read from here. To add a form, add a module folder with an
 * entity.ts and list it below (plus a SQL migration for Supabase).
 */
import type { EntityDef } from "./types";
import { businessUnits } from "@/modules/business-units/entity";
import { staff } from "@/modules/staff/entity";
import { customers } from "@/modules/customers/entity";
import { leads } from "@/modules/leads/entity";
import { activities } from "@/modules/activities/entity";
import { bookings } from "@/modules/bookings/entity";
import { payments } from "@/modules/payments/entity";
import { checkins } from "@/modules/checkins/entity";
import { dailyReports } from "@/modules/daily-reports/entity";
import { attendance } from "@/modules/attendance/entity";
import { expenses } from "@/modules/expenses/entity";
import { stock } from "@/modules/stock/entity";
import { tasks } from "@/modules/tasks/entity";
import { targets } from "@/modules/targets/entity";
import { importRuns } from "@/modules/import-runs/entity";
import { messages } from "@/modules/messages/entity";
import { candidates } from "@/modules/candidates/entity";
import { investors } from "@/modules/investors/entity";
import { investments } from "@/modules/investments/entity";
import { walletTransactions } from "@/modules/wallet-transactions/entity";
import { tickets } from "@/modules/tickets/entity";
import { signupRequests } from "@/modules/signup-requests/entity";

export const entities: EntityDef[] = [
  businessUnits,
  staff,
  customers,
  leads,
  activities,
  bookings,
  payments,
  checkins,
  dailyReports,
  attendance,
  expenses,
  stock,
  tasks,
  targets,
  importRuns,
  messages,
  candidates,
  investors,
  investments,
  walletTransactions,
  tickets,
  signupRequests,
];

const byName = new Map(entities.map((e) => [e.name, e]));
const byTable = new Map(entities.map((e) => [e.table, e]));

export function getEntity(name: string): EntityDef {
  const def = byName.get(name);
  if (!def) throw new Error(`Unknown entity: ${name}`);
  return def;
}

export function findEntity(name: string): EntityDef | undefined {
  return byName.get(name);
}

export function getEntityByTable(table: string): EntityDef | undefined {
  return byTable.get(table);
}

export const entityNames = entities.map((e) => e.name);
