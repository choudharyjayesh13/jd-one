import { Car } from "lucide-react";
import { defineEntity, type FieldValues } from "@/core/schema/types";
import { AssetsSummary } from "./AssetsSummary";
import { nextService } from "./service-due";

export const ASSET_TYPES = ["Car", "Scooty", "Motorbike", "Tempo / Loader", "Generator", "Equipment", "Other"] as const;
export const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric", "Not a vehicle"] as const;
export const TYRE_CONDITION = ["Good", "Average", "Worn – replace soon", "Needs replacement now"] as const;
export const ASSET_STATUS = ["In use", "In service / repair", "Idle", "Sold / disposed"] as const;
const WRITE_ROLES = ["owner", "manager", "staff", "accounts"] as const;

/**
 * Group assets: cars, scooties and other equipment owned by JD Group businesses.
 * Daily km, fuel and service logs point here and keep the odometer, last
 * refuel and next service due up to date (see their hooks).
 */
export const assets = defineEntity({
  name: "assets",
  label: "Group assets",
  labelSingular: "Asset",
  icon: Car,
  table: "assets",
  teams: ["operations", "property", "accounts"],
  titleField: "name",
  searchFields: ["name", "registration_no", "make_model", "asset_type"],
  defaultSort: { field: "asset_type", dir: "asc" },
  secondarySort: { field: "name", dir: "asc" },
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner"] },
  unique: [["registration_no"]],
  listExtra: AssetsSummary,
  reverse: [
    { entity: "vehicle-logs", field: "asset_id", label: "Daily km" },
    { entity: "fuel-logs", field: "asset_id", label: "Fuel refills" },
    { entity: "vehicle-services", field: "asset_id", label: "Services" },
  ],
  fields: [
    { name: "name", label: "Name", type: "text", required: true, placeholder: "Activa – Udaisarovar, Innova – Office…" },
    { name: "asset_type", label: "Type", type: "select", options: ASSET_TYPES, required: true, default: "Scooty" },
    { name: "registration_no", label: "Registration number", type: "text", placeholder: "RJ27 AB 1234", help: "Number plate as on the RC" },
    { name: "make_model", label: "Make & model", type: "text", placeholder: "Honda Activa 6G, Maruti Ertiga…" },
    { name: "year", label: "Year", type: "number", min: 1990, max: 2100 },
    { name: "colour", label: "Colour", type: "text" },
    { name: "fuel_type", label: "Fuel", type: "select", options: FUEL_TYPES, default: "Petrol" },
    { name: "business_unit_id", label: "Business", type: "relation", entity: "business-units" },
    { name: "assigned_to", label: "Assigned to", type: "relation", entity: "staff", defaultToMe: false },
    { name: "status", label: "Status", type: "select", options: ASSET_STATUS, default: "In use" },
    { name: "odometer_km", label: "Current odometer (km)", type: "number", min: 0, help: "Updates by itself from daily km, fuel and service entries" },
    { name: "service_interval_km", label: "Service every (km)", type: "number", min: 0, default: 3000, help: "Scooty ~3,000 km · car ~10,000 km" },
    { name: "service_interval_months", label: "Service every (months)", type: "number", min: 0, default: 6 },
    { name: "last_service_date", label: "Last service date", type: "date" },
    { name: "last_service_km", label: "Last service at (km)", type: "number", min: 0 },
    { name: "next_service_date", label: "Next service due (date)", type: "date", readOnly: true },
    { name: "next_service_km", label: "Next service due (km)", type: "number", readOnly: true },
    { name: "last_fuel_date", label: "Last refuelled", type: "date", readOnly: true },
    { name: "last_fuel_km", label: "Last refuel at (km)", type: "number", readOnly: true },
    { name: "tyre_condition", label: "Tyre condition", type: "select", options: TYRE_CONDITION },
    { name: "tyre_checked_on", label: "Tyres checked on", type: "date" },
    { name: "tyre_photos", label: "Tyre photos", type: "files", help: "Take a photo of each tyre" },
    { name: "insurance_expiry", label: "Insurance valid till", type: "date" },
    { name: "puc_expiry", label: "PUC valid till", type: "date" },
    { name: "purchase_date", label: "Purchase date", type: "date" },
    { name: "purchase_value", label: "Purchase value", type: "money" },
    { name: "photo", label: "Photo", type: "file" },
    { name: "rc_doc", label: "RC copy", type: "file" },
    { name: "insurance_doc", label: "Insurance copy", type: "file" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["name", "asset_type", "registration_no", "assigned_to", "odometer_km", "last_fuel_date", "next_service_date", "next_service_km", "tyre_condition", "status"],
  hooks: {
    beforeSave(values: FieldValues) {
      const reg = values.registration_no ? String(values.registration_no).toUpperCase().replace(/\s+/g, " ").trim() : values.registration_no;
      return { ...values, registration_no: reg || null, ...nextService(values) };
    },
  },
});
