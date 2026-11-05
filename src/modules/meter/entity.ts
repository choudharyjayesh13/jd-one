import { Gauge } from "lucide-react";
import { defineEntity, type FieldValues, type LiveHint } from "@/core/schema/types";
import type { DataStore } from "@/core/data/types";
import { addDays, todayISO } from "@/core/format";

/** Shows the units used since the last reading while the reading is typed. */
async function unitsHint(values: FieldValues, store: DataStore): Promise<LiveHint | null> {
  const date = String(values.date ?? todayISO());
  const meter = String(values.meter ?? "Main meter");
  const prev = (await store.list("meter-readings", { filter: { meter, ...(values.business_unit_id ? { business_unit_id: values.business_unit_id } : {}) }, range: { date: { lte: addDays(date, -1) } }, sort: { field: "date", dir: "desc" }, limit: 1 }))[0];
  if (!prev) return { message: "First reading for this meter – units start from the next one.", tone: "info" };
  const last = Number(prev.reading);
  if (values.reading == null || values.reading === "") return { message: `Last reading ${last.toLocaleString("en-IN")} on ${String(prev.date)}`, tone: "info" };
  const units = Number(values.reading) - last;
  const days = Math.round((Date.parse(date) - Date.parse(String(prev.date))) / 86400000);
  return {
    message: units < 0 ? `This is lower than the last reading (${last.toLocaleString("en-IN")}). Check the number.` : `Units used: ${units.toLocaleString("en-IN")}${days > 1 ? ` over ${days} days (about ${Math.round(units / days)} a day)` : " since yesterday"}`,
    tone: units < 0 ? "warning" : "success",
  };
}

/**
 * Maintenance → Electricity meter. One reading a day with a photo of the meter.
 * The database works out the units used since the previous reading; the night audit shows
 * today's units and the last 7 days with photos.
 */
export const meterReadings = defineEntity({
  name: "meter-readings",
  label: "Electricity meter",
  labelSingular: "Meter reading",
  icon: Gauge,
  table: "meter_readings",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "date",
  searchFields: ["meter", "note", "date"],
  defaultSort: { field: "date", dir: "desc" },
  unique: [["business_unit_id", "meter", "date"]],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "meter", label: "Meter", type: "text", required: true, default: "Main meter" },
    { name: "reading", label: "Meter reading (kWh)", type: "number", required: true, min: 0, step: 0.01 },
    { name: "photo", label: "Meter photo", type: "files", required: true, help: "A clear photo where the number can be read." },
    { name: "units", label: "Units used", type: "number", readOnly: true, help: "Worked out from the previous reading" },
    { name: "days", label: "Days since last reading", type: "number", readOnly: true },
    { name: "recorded_by", label: "Recorded by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "note", label: "Note", type: "text" },
  ],
  listColumns: ["date", "reading", "units", "photo", "recorded_by"],
  liveHint: { watch: ["date", "meter", "reading", "business_unit_id"], compute: unitsHint },
});
