import { IndianRupee } from "lucide-react";
import { defineEntity, type Row } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { UNIT_TYPES } from "@/modules/bookings/entity";

export const MEAL_PLANS = ["EP", "CP", "MAP", "AP"] as const;
export const MEAL_PLAN_LABELS: Record<string, string> = { EP: "Room only", CP: "With breakfast", MAP: "Breakfast + dinner", AP: "All meals" };
export const RATE_CHANNELS = ["All channels", "Direct / website", "OTAs (AsiaTech)", "Airbnb"] as const;

const WRITE_ROLES = ["owner", "manager"] as const;

/**
 * Rates = date-ranged prices per room type + meal plan (AsiaTech "Rate
 * Management"). Rows may overlap: the most recently created row wins, so a
 * bulk update for a festival simply adds a narrower row on top.
 */
export const rates = defineEntity({
  name: "rates",
  label: "Rates",
  labelSingular: "Rate",
  icon: IndianRupee,
  table: "rates",
  teams: ["property"],
  unitField: "business_unit_id",
  titleField: "unit_type",
  searchFields: ["unit_type", "meal_plan", "note"],
  defaultSort: { field: "date_from", dir: "desc" },
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner", "manager"] },
  fields: [
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "unit_type", label: "Room type", type: "select", options: UNIT_TYPES, required: true },
    { name: "meal_plan", label: "Meal plan", type: "select", options: MEAL_PLANS, required: true, default: "EP" },
    { name: "date_from", label: "From", type: "date", required: true, default: todayISO },
    { name: "date_to", label: "To", type: "date", required: true, help: "Inclusive" },
    { name: "rate", label: "Rate / night (excl. GST)", type: "money", required: true, min: 0 },
    { name: "extra_adult", label: "Extra adult", type: "money", min: 0 },
    { name: "extra_child", label: "Extra child", type: "money", min: 0 },
    { name: "channel", label: "Channel", type: "select", options: RATE_CHANNELS, default: "All channels", required: true },
    { name: "closed", label: "Stop sell", type: "boolean", default: false, help: "Close this room type online for these dates (shows Closed on the availability calendar)" },
    { name: "min_nights", label: "Minimum nights", type: "number", min: 1, default: 1 },
    { name: "note", label: "Note", type: "text", placeholder: "Diwali peak, long weekend…" },
  ],
  listColumns: ["date_from", "date_to", "unit_type", "meal_plan", "rate", "channel", "closed", "business_unit_id"],
  hooks: {
    beforeSave(values) {
      const from = String(values.date_from ?? "");
      const to = String(values.date_to ?? "");
      if (from && to && to < from) throw new Error("'To' must be on or after 'From'");
      return values;
    },
  },
});

/** The rate row in force for a type + plan on a date (latest created wins). */
export function resolveRate(rows: Row[], unitType: string, plan: string, date: string, channel?: string): Row | null {
  let best: Row | null = null;
  for (const r of rows) {
    if (r.unit_type !== unitType || r.meal_plan !== plan) continue;
    if (String(r.date_from) > date || String(r.date_to) < date) continue;
    if (channel && r.channel !== "All channels" && r.channel !== channel) continue;
    if (!best || String(r.created_at) > String(best.created_at)) best = r;
  }
  return best;
}

/** Stop-sell for a type on a date: any closed row covering the date (any plan). */
export function isClosed(rows: Row[], unitType: string, date: string): boolean {
  return rows.some((r) => r.closed === true && r.unit_type === unitType && String(r.date_from) <= date && String(r.date_to) >= date);
}
