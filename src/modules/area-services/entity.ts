import { Siren } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/**
 * Area help: the everyday and emergency services for each area of the JD One
 * network — which thana covers a locality (with its SHO/CI and beat SI),
 * hospitals, fire stations, electricity/water complaints. Filed State →
 * District → City like the rest of the network; lat/lng lets the app sort by
 * distance from the user's phone. Officer names are entered and verified by staff.
 */
export const SERVICE_TYPES = [
  "Police station",
  "Police control room",
  "Women police station",
  "Cyber police station",
  "Traffic police",
  "Hospital (govt)",
  "Hospital (private, 24x7 emergency)",
  "Ambulance",
  "Fire station",
  "Blood bank",
  "Electricity complaint",
  "Water complaint",
  "Municipal office",
  "Collectorate / tehsil",
  "Other",
] as const;

export const OFFICER_RANKS = ["SHO / CI (Inspector)", "SI (Sub-Inspector)", "ASI", "Head Constable (beat)", "In-charge", "Medical officer", "Other"] as const;

export const areaServices = defineEntity({
  name: "area-services",
  label: "Area help",
  labelSingular: "Area service",
  icon: Siren,
  table: "area_services",
  teams: ["operations", "property", "marketing"],
  hidden: true, // shown as the "Area help" tab of the Network page
  titleField: "name",
  searchFields: ["name", "area_covered", "address", "city", "type"],
  defaultSort: { field: "type", dir: "asc" },
  secondarySort: { field: "name", dir: "asc" },
  permissions: { create: ["owner", "manager", "staff", "marketing"], update: ["owner", "manager", "staff", "marketing"], delete: ["owner"] },
  fields: [
    { name: "type", label: "Type", type: "select", options: SERVICE_TYPES, required: true, default: "Police station" },
    { name: "name", label: "Name", type: "text", required: true, placeholder: "Thana Pratapnagar, MB Hospital…" },
    { name: "area_covered", label: "Areas covered", type: "textarea", wide: true, help: "Colonies / villages in this thana's or office's area — used to answer “which thana is this?”" },
    { name: "address", label: "Address", type: "textarea", wide: true },
    { name: "state", label: "State", type: "text", required: true, default: "Rajasthan" },
    { name: "district", label: "District", type: "text", required: true, default: "Udaipur" },
    { name: "city", label: "City / block", type: "text", required: true },
    { name: "lat", label: "Latitude", type: "number", step: 0.000001 },
    { name: "lng", label: "Longitude", type: "number", step: 0.000001 },
    { name: "phone", label: "Official phone", type: "phone" },
    { name: "phone2", label: "Other official phone", type: "phone" },
    { name: "hours", label: "Hours", type: "text", default: "24x7" },
    { name: "officer_name", label: "Officer in charge (SHO / CI)", type: "text" },
    { name: "officer_rank", label: "Rank", type: "select", options: OFFICER_RANKS },
    { name: "officer_phone", label: "Officer's official / CUG number", type: "phone" },
    { name: "beat_officer", label: "Area SI / beat officer", type: "text" },
    { name: "beat_rank", label: "Beat officer rank", type: "select", options: OFFICER_RANKS },
    { name: "beat_area", label: "Beat area", type: "text", placeholder: "Lakadwas, Naglaphala, Kanpur…" },
    { name: "beat_phone", label: "Beat officer's official number", type: "phone" },
    { name: "officers_checked_on", label: "Officer details checked on", type: "date", help: "Officers get transferred; re-check every few months" },
    { name: "verified", label: "Verified", type: "boolean", default: false },
    { name: "source_url", label: "Source", type: "text", wide: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["type", "name", "city", "phone", "officer_name", "verified"],
});
