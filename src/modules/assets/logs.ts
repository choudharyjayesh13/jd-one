import { Fuel, Gauge, Wrench } from "lucide-react";
import { defineEntity, type FieldValues, type HookContext, type Row } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { higherOdometer, nextService } from "./service-due";

const ALL_STAFF = ["owner", "manager", "hr", "accounts", "finance", "marketing", "staff"] as const;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Push a reading onto the asset: odometer only ever goes up; extra fields are applied as given. */
async function touchAsset(ctx: HookContext, assetId: unknown, reading: unknown, extra: FieldValues = {}) {
  if (!assetId) return;
  const asset = await ctx.store.get("assets", String(assetId));
  if (!asset) return;
  const patch: FieldValues = { ...extra };
  const odo = higherOdometer(asset.odometer_km, reading);
  if (odo !== null) patch.odometer_km = odo;
  if (Object.keys(patch).length) await ctx.store.update("assets", asset.id, patch);
}

/** Live hint: start km defaults to the vehicle's current odometer. */
async function odometerHint(values: FieldValues, store: HookContext["store"], field: string) {
  if (!values.asset_id) return null;
  const a = await store.get("assets", String(values.asset_id));
  if (!a) return null;
  const odo = num(a.odometer_km);
  const reg = a.registration_no && !String(a.name).includes(String(a.registration_no)) ? ` (${a.registration_no})` : "";
  const msg = `${a.name}${reg}: odometer ${odo ?? "not set"} km`;
  return { message: msg, tone: "info" as const, patch: values[field] ? undefined : odo !== null ? { [field]: odo } : undefined };
}

/** Daily kilometres: one row per vehicle per trip/day. */
export const vehicleLogs = defineEntity({
  name: "vehicle-logs",
  label: "Daily km",
  labelSingular: "Daily km entry",
  icon: Gauge,
  table: "vehicle_logs",
  teams: ["operations", "property"],
  titleField: "purpose",
  searchFields: ["purpose", "route"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  permissions: { create: [...ALL_STAFF], update: ["owner", "manager", "accounts"], delete: ["owner"] },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "asset_id", label: "Vehicle", type: "relation", entity: "assets", required: true },
    { name: "driver_id", label: "Driven by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "start_km", label: "Start km (odometer)", type: "number", required: true, min: 0 },
    { name: "end_km", label: "End km (odometer)", type: "number", required: true, min: 0 },
    { name: "km", label: "Km driven", type: "number", readOnly: true, computed: (v) => (num(v.end_km) !== null && num(v.start_km) !== null ? Number(v.end_km) - Number(v.start_km) : null) },
    { name: "purpose", label: "Purpose", type: "text", required: true, placeholder: "Market run, guest pickup, bank…" },
    { name: "route", label: "Route", type: "text", placeholder: "Resort → Udaipur city → Resort" },
    { name: "business_unit_id", label: "For business", type: "relation", entity: "business-units" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["date", "asset_id", "driver_id", "start_km", "end_km", "km", "purpose"],
  liveHint: { watch: ["asset_id"], compute: (v, store) => odometerHint(v, store, "start_km") },
  hooks: {
    beforeSave(values) {
      const s = num(values.start_km), e = num(values.end_km);
      if (s !== null && e !== null && e < s) throw new Error("End km can't be less than start km.");
      return { ...values, km: s !== null && e !== null ? e - s : null };
    },
    afterCreate: (r: Row, ctx) => touchAsset(ctx, r.asset_id, r.end_km),
    afterUpdate: (r: Row, _p, ctx) => touchAsset(ctx, r.asset_id, r.end_km),
  },
});

/** Fuel refills: when, how much, at what odometer. */
export const fuelLogs = defineEntity({
  name: "fuel-logs",
  label: "Fuel refills",
  labelSingular: "Fuel refill",
  icon: Fuel,
  table: "fuel_logs",
  teams: ["operations", "property", "accounts"],
  titleField: "station",
  searchFields: ["station", "notes"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  permissions: { create: [...ALL_STAFF], update: ["owner", "manager", "accounts"], delete: ["owner"] },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "asset_id", label: "Vehicle", type: "relation", entity: "assets", required: true },
    { name: "odometer_km", label: "Odometer at refill (km)", type: "number", min: 0 },
    { name: "litres", label: "Litres", type: "number", min: 0, step: 0.01 },
    { name: "amount", label: "Amount", type: "money", required: true, min: 1 },
    { name: "rate", label: "Rate per litre", type: "money", readOnly: true, computed: (v) => (num(v.litres) ? Math.round((Number(v.amount ?? 0) / Number(v.litres)) * 100) / 100 : null) },
    { name: "full_tank", label: "Full tank", type: "boolean", default: false },
    { name: "station", label: "Petrol pump", type: "text", placeholder: "BPCL Badi Sadri, HP Dabok…" },
    { name: "paid_by", label: "Paid by", type: "select", options: ["Cash", "UPI", "Card", "Company account / credit"], default: "UPI" },
    { name: "filled_by", label: "Filled by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "business_unit_id", label: "Charge to business", type: "relation", entity: "business-units" },
    { name: "receipt", label: "Bill photo", type: "file" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["date", "asset_id", "litres", "amount", "odometer_km", "station", "filled_by"],
  liveHint: { watch: ["asset_id"], compute: (v, store) => odometerHint(v, store, "odometer_km") },
  hooks: {
    beforeSave: (values) => ({ ...values, rate: num(values.litres) ? Math.round((Number(values.amount ?? 0) / Number(values.litres)) * 100) / 100 : null }),
    afterCreate: async (r: Row, ctx) => {
      const asset = r.asset_id ? await ctx.store.get("assets", String(r.asset_id)) : null;
      // only move "last refuelled" forward (a back-dated bill shouldn't overwrite a newer one)
      const newer = !asset?.last_fuel_date || String(r.date) >= String(asset.last_fuel_date);
      await touchAsset(ctx, r.asset_id, r.odometer_km, newer ? { last_fuel_date: r.date, last_fuel_km: r.odometer_km ?? null } : {});
    },
  },
});

export const SERVICE_TYPES = ["Regular service", "Repair", "Tyres", "Battery", "Insurance renewal", "PUC check", "Washing / cleaning", "Other"] as const;

/** Service & repair history; a regular service resets the next-due date and km on the asset. */
export const vehicleServices = defineEntity({
  name: "vehicle-services",
  label: "Vehicle services",
  labelSingular: "Service entry",
  icon: Wrench,
  table: "vehicle_services",
  teams: ["operations", "property", "accounts"],
  titleField: "service_type",
  searchFields: ["service_type", "garage", "work_done"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  permissions: { create: ["owner", "manager", "staff", "accounts"], update: ["owner", "manager", "accounts"], delete: ["owner"] },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "asset_id", label: "Vehicle / asset", type: "relation", entity: "assets", required: true },
    { name: "service_type", label: "Type", type: "select", options: SERVICE_TYPES, required: true, default: "Regular service" },
    { name: "odometer_km", label: "Odometer (km)", type: "number", min: 0 },
    { name: "garage", label: "Garage / service centre", type: "text" },
    { name: "amount", label: "Cost", type: "money", min: 0 },
    { name: "work_done", label: "Work done", type: "textarea", wide: true, placeholder: "Oil change, brake pads, chain set…" },
    { name: "valid_till", label: "Valid till (insurance / PUC)", type: "date", help: "Only for insurance renewal or PUC check" },
    { name: "done_by", label: "Handled by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "bill", label: "Bill photo", type: "file" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["date", "asset_id", "service_type", "odometer_km", "amount", "garage"],
  liveHint: { watch: ["asset_id"], compute: (v, store) => odometerHint(v, store, "odometer_km") },
  hooks: {
    afterCreate: async (r: Row, ctx) => {
      if (!r.asset_id) return;
      const asset = await ctx.store.get("assets", String(r.asset_id));
      if (!asset) return;
      const extra: FieldValues = {};
      if (r.service_type === "Regular service" && (!asset.last_service_date || String(r.date) >= String(asset.last_service_date))) {
        const last = { ...asset, last_service_date: r.date, last_service_km: r.odometer_km ?? asset.odometer_km ?? null };
        Object.assign(extra, { last_service_date: last.last_service_date, last_service_km: last.last_service_km, ...nextService(last) });
      }
      if (r.service_type === "Insurance renewal" && r.valid_till) extra.insurance_expiry = r.valid_till;
      if (r.service_type === "PUC check" && r.valid_till) extra.puc_expiry = r.valid_till;
      if (r.service_type === "Repair" || r.service_type === "Regular service") extra.status = "In use";
      await touchAsset(ctx, r.asset_id, r.odometer_km, extra);
    },
  },
});
