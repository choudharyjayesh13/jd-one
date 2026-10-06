import { Building2 } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";

/** Seeded on first run; every other record points at one of these. */
export const BUSINESS_UNIT_SEED = [
  { name: "The Udaisarovar", short_code: "UDS", type: "Resort", city: "Udaipur" },
  { name: "Pronite", short_code: "PRN", type: "Events", city: "Udaipur" },
  { name: "CPC – Choudhary Properties & Consultancy", short_code: "CPC", type: "Consultancy", city: "Udaipur" },
  { name: "JD Group HQ", short_code: "HQ", type: "HQ", city: "Udaipur" },
  { name: "Hotel Kirti Plaza", short_code: "HKP", type: "Hotel", city: "Udaipur" },
  { name: "The Artist House", short_code: "TAH", type: "Hotel", city: "Udaipur" },
  { name: "House of Beauty", short_code: "HOB", type: "Salon", city: "Udaipur" },
];

export const businessUnits = defineEntity({
  name: "business-units",
  label: "Business units",
  labelSingular: "Business unit",
  icon: Building2,
  table: "business_units",
  teams: ["marketing"],
  titleField: "name",
  searchFields: ["name", "short_code", "city"],
  defaultSort: { field: "name", dir: "asc" },
  permissions: { create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["owner"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "short_code", label: "Short code", type: "text", placeholder: "UDS" },
    { name: "type", label: "Type", type: "select", options: ["Hotel", "Resort", "Events", "Consultancy", "HQ", "Salon", "Other"] },
    { name: "city", label: "City", type: "text", default: "Udaipur" },
    { name: "rooms", label: "Rooms (for occupancy)", type: "number", min: 0 },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "active", label: "Active", type: "boolean", default: true, help: "Shown in filters and forms" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "latitude", label: "Latitude", type: "number", step: 0.000001, help: "For attendance distance checks (Google Maps → right-click → copy coordinates)" },
    { name: "longitude", label: "Longitude", type: "number", step: 0.000001 },
    { name: "geofence_m", label: "Attendance radius (m)", type: "number", default: 300, help: "Check-ins farther than this are flagged" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "type", "short_code", "city", "active"],
  reverse: [
    { entity: "staff", field: "business_unit_id", label: "Staff" },
    { entity: "bookings", field: "business_unit_id", label: "Bookings" },
    { entity: "daily-reports", field: "business_unit_id", label: "Daily reports" },
  ],
});
