import { MapPin } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

const EVERYONE = ["owner", "manager", "hr", "accounts", "finance", "marketing", "staff"] as const;

/** Duty location points from the JD One Android app (only staff with track_location on). Read: Chairman / Director (database rule). */
export const locationPings = defineEntity({
  name: "location-pings",
  label: "Duty location",
  labelSingular: "Location point",
  icon: MapPin,
  table: "location_pings",
  teams: ["hr"],
  hidden: true,
  titleField: "at",
  searchFields: [],
  defaultSort: { field: "at", dir: "desc" },
  permissions: { read: [...EVERYONE], create: [...EVERYONE], update: ["owner"], delete: ["owner"] },
  fields: [
    { name: "staff_id", label: "Staff", type: "relation", entity: "staff", required: true },
    { name: "at", label: "Time", type: "datetime", required: true },
    { name: "latitude", label: "Latitude", type: "number", required: true },
    { name: "longitude", label: "Longitude", type: "number", required: true },
    { name: "accuracy_m", label: "Accuracy (m)", type: "number" },
    { name: "speed_kmh", label: "Speed (km/h)", type: "number" },
  ],
  listColumns: ["at", "staff_id", "latitude", "longitude"],
});
