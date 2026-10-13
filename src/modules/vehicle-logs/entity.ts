import { Bike } from "lucide-react";
import { defineEntity, type FieldValues, type LiveHint } from "@/core/schema/types";
import type { DataStore } from "@/core/data/types";
import { todayISO } from "@/core/format";

/** Start km = the last recorded end km of the same vehicle (filled automatically when empty). */
async function lastKmHint(values: FieldValues, store: DataStore): Promise<LiveHint | null> {
  const vehicle = String(values.vehicle ?? "").trim();
  if (!vehicle) return null;
  const prev = (await store.list("vehicle-logs", { filter: { vehicle }, sort: { field: "date", dir: "desc" }, limit: 5 }))
    .find((r) => r.end_km != null && String(r.date) <= String(values.date ?? todayISO()));
  if (!prev) return { message: "First log for this vehicle — enter the start km from the meter.", tone: "info" };
  const last = Number(prev.end_km);
  const patch = values.start_km == null || values.start_km === "" ? { start_km: last } : undefined;
  const km = values.end_km != null && values.end_km !== "" ? Number(values.end_km) - Number(values.start_km ?? last) : null;
  return {
    message: `Last reading ${last.toLocaleString("en-IN")} km on ${String(prev.date)}${km != null ? ` · today ${km.toLocaleString("en-IN")} km` : ""}`,
    tone: km != null && km < 0 ? "warning" : "success",
    patch,
  };
}

/** Daily km + petrol for every scooty / car / generator. Filled at the evening shift close. */
export const vehicleLogs = defineEntity({
  name: "vehicle-logs",
  label: "Vehicle km & petrol",
  labelSingular: "Vehicle log",
  icon: Bike,
  table: "vehicle_logs",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "vehicle",
  searchFields: ["vehicle", "purpose", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "vehicle", label: "Vehicle", type: "text", required: true, placeholder: "Scooty RJ12 SZ 4657" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "driver", label: "Used by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "start_km", label: "Start km (meter)", type: "number", min: 0, step: 0.1 },
    { name: "end_km", label: "End km (meter)", type: "number", min: 0, step: 0.1, required: true },
    { name: "km", label: "Km today", type: "number", computed: (v) => (v.start_km != null && v.end_km != null && v.start_km !== "" && v.end_km !== "" ? Math.max(Number(v.end_km) - Number(v.start_km), 0) : null) },
    { name: "petrol_litres", label: "Petrol filled (litres)", type: "number", min: 0, step: 0.01 },
    { name: "petrol_amount", label: "Petrol amount (₹)", type: "money", min: 0 },
    { name: "purpose", label: "Trips / purpose", type: "text", placeholder: "Market, guest pick-up, bank…" },
    { name: "photos", label: "Meter / petrol bill photo", type: "files" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["date", "vehicle", "km", "end_km", "petrol_litres", "petrol_amount", "driver"],
  liveHint: { watch: ["vehicle", "date", "end_km"], compute: lastKmHint },
});
