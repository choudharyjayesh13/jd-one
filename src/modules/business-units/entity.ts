import { Building2 } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";

/** Seeded on first run; every other record points at one of these. */
export const BUSINESS_UNIT_SEED = [
  { name: "The Udaisarovar", short_code: "UDS", type: "Resort", city: "Udaipur" },
  { name: "Pronite", short_code: "PRN", type: "Events", city: "Udaipur" },
  { name: "CPC – Choudhary Properties & Consultancy", short_code: "CPC", type: "Consultancy", city: "Udaipur" },
  { name: "JD Group HQ", short_code: "HQ", type: "HQ", city: "Udaipur" },
  { name: "Hotel Kirti Plaza", short_code: "HKP", type: "Hotel", city: "Chittorgarh" },
  { name: "BPCL Petrol Pump", short_code: "BPCL", type: "Fuel station", city: "Chittorgarh" },
  { name: "BPCL Petrol Pump – Badi Sadi", short_code: "BPBS", type: "Fuel station", city: "Badi Sadi" },
  { name: "The Artist House", short_code: "TAH", type: "Hotel", city: "Udaipur" },
  { name: "House of Beauty", short_code: "HOB", type: "Salon", city: "Udaipur" },
];

export const BUSINESS_TYPES = ["Hotel", "Resort", "Fuel station", "Restaurant", "Shop / retail", "Events", "Consultancy", "Transport", "Salon", "Clinic", "Education", "Manufacturing", "Farm", "HQ", "Other"] as const;

export const HOTEL_AMENITIES = ["Swimming pool", "Lake view", "Garden", "Bonfire", "Restaurant", "Room service", "Free Wi-Fi", "Free parking", "Air conditioning", "Power backup", "Indoor games", "Pet-friendly", "Wedding lawn", "Banquet", "Camping", "Boating", "Spa", "Gym", "Bar"] as const;

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
    { name: "owner_id", label: "Owner", type: "relation", entity: "owners", help: "The network member who owns this business" },
    { name: "short_code", label: "Short code", type: "text", placeholder: "UDS" },
    { name: "type", label: "Type", type: "select", options: BUSINESS_TYPES },
    { name: "city", label: "City", type: "text", default: "Udaipur" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "email", label: "Email", type: "email" },
    { name: "website", label: "Website", type: "text", placeholder: "https://…" },
    { name: "active", label: "Active", type: "boolean", default: true, help: "Shown in filters and forms" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "description", label: "Property description", type: "textarea", wide: true, help: "As shown to guests (OTA listing text)" },
    { name: "star_category", label: "Category", type: "select", options: ["Homestay", "Resort", "3 star", "4 star", "5 star", "Boutique", "Other"] },
    { name: "checkin_time", label: "Check-in time", type: "text", placeholder: "14:00", default: "14:00" },
    { name: "checkout_time", label: "Check-out time", type: "text", placeholder: "11:00", default: "11:00" },
    { name: "gstin", label: "GSTIN", type: "text" },
    { name: "gst_rate", label: "GST on rooms (%)", type: "number", min: 0, max: 28, default: 12, help: "Used on rate sheets and payment requests" },
    { name: "upi_id", label: "UPI ID for payments", type: "text", placeholder: "name@bank", help: "Request money generates a UPI link to this ID" },
    { name: "amenities", label: "Amenities", type: "multiselect", options: HOTEL_AMENITIES, wide: true },
    { name: "policies", label: "Policies", type: "textarea", wide: true, help: "Cancellation, ID proof, couples, pets, smoking…" },
    { name: "maps_url", label: "Google Maps link", type: "text" },
    { name: "latitude", label: "Latitude", type: "number", step: 0.000001, help: "For attendance distance checks (Google Maps → right-click → copy coordinates)" },
    { name: "longitude", label: "Longitude", type: "number", step: 0.000001 },
    { name: "geofence_m", label: "Attendance radius (m)", type: "number", default: 300, help: "Check-ins farther than this are flagged" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "owner_id", "type", "short_code", "city", "active"],
  reverse: [
    { entity: "staff", field: "business_unit_id", label: "Staff" },
    { entity: "bookings", field: "business_unit_id", label: "Bookings" },
    { entity: "rooms", field: "business_unit_id", label: "Rooms" },
    { entity: "rates", field: "business_unit_id", label: "Rates" },
    { entity: "daily-reports", field: "business_unit_id", label: "Daily reports" },
  ],
});
