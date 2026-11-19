import { ClipboardList } from "lucide-react";
import { defineEntity, type FieldValues, type LiveHint } from "@/core/schema/types";
import type { DataStore } from "@/core/data/types";
import { todayISO } from "@/core/format";

/** Bijli: opening = yesterday's closing meter reading (filled when empty); shows units used today. */
async function electricityHint(values: FieldValues, store: DataStore): Promise<LiveHint | null> {
  const unit = values.business_unit_id;
  const date = String(values.date ?? todayISO());
  if (!unit) return null;
  const prev = (await store.list("daily-reports", { filter: { business_unit_id: unit }, range: { date: { lte: date } }, sort: { field: "date", dir: "desc" }, limit: 5 }))
    .find((r) => String(r.date) < date && r.electricity_closing != null);
  const open = values.electricity_opening != null && values.electricity_opening !== "" ? Number(values.electricity_opening) : prev ? Number(prev.electricity_closing) : null;
  const close = values.electricity_closing != null && values.electricity_closing !== "" ? Number(values.electricity_closing) : null;
  const patch = (values.electricity_opening == null || values.electricity_opening === "") && prev ? { electricity_opening: Number(prev.electricity_closing) } : undefined;
  if (open == null && close == null) return null;
  if (open != null && close != null) {
    const units = close - open;
    return { message: `⚡ Bijli used today: ${units.toLocaleString("en-IN")} units`, tone: units < 0 ? "warning" : "success", patch };
  }
  return prev ? { message: `⚡ Yesterday's closing reading: ${Number(prev.electricity_closing).toLocaleString("en-IN")} — enter tonight's meter reading`, tone: "info", patch } : null;
}

export const dailyReports = defineEntity({
  name: "daily-reports",
  label: "Daily reports",
  labelSingular: "Daily report",
  icon: ClipboardList,
  table: "daily_reports",
  teams: ["operations", "accounts", "finance"],
  unitField: "business_unit_id",
  titleField: "date",
  searchFields: ["remarks", "date"],
  defaultSort: { field: "date", dir: "desc" },
  unique: [["date", "business_unit_id"]],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "sales_cash", label: "Sales – cash", type: "money", min: 0, default: 0 },
    { name: "sales_online", label: "Sales – online", type: "money", min: 0, default: 0 },
    { name: "sales_total", label: "Sales – total", type: "money", computed: (v) => Number(v.sales_cash ?? 0) + Number(v.sales_online ?? 0) },
    { name: "occupancy_units", label: "Occupied units", type: "number", min: 0 },
    { name: "electricity_opening", label: "⚡ Bijli meter – opening", type: "number", min: 0, step: 0.01, help: "Filled from yesterday's closing reading" },
    { name: "electricity_closing", label: "⚡ Bijli meter – closing", type: "number", min: 0, step: 0.01 },
    {
      name: "electricity_units",
      label: "⚡ Bijli units used",
      type: "number",
      computed: (v) => (v.electricity_opening != null && v.electricity_closing != null && v.electricity_opening !== "" && v.electricity_closing !== "" ? Math.max(Number(v.electricity_closing) - Number(v.electricity_opening), 0) : null),
    },
    { name: "electricity_photo", label: "Meter photo", type: "files" },
    { name: "dg_hours", label: "Generator (DG) hours", type: "number", min: 0, step: 0.1 },
    { name: "submitted_by", label: "Submitted by", type: "relation", entity: "staff" },
    { name: "remarks", label: "Remarks", type: "textarea" },
  ],
  listColumns: ["date", "business_unit_id", "sales_cash", "sales_online", "sales_total", "occupancy_units", "electricity_units", "submitted_by"],
  liveHint: { watch: ["business_unit_id", "date", "electricity_opening", "electricity_closing"], compute: electricityHint },
});
