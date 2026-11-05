import { Droplets } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const AMENITY_ITEMS = ["Water bottles", "Soap", "Shampoo & conditioner", "Dental kit", "Tea / coffee sachets", "Sugar & creamer", "Tissue box", "Toilet roll", "Slippers", "Shower cap", "Other"] as const;

/** What was refilled in which room (water, toiletries, tea tray…). */
export const amenityRefills = defineEntity({
  name: "amenity-refills",
  label: "Amenities refill",
  labelSingular: "Amenities refill",
  icon: Droplets,
  table: "amenity_refills",
  teams: ["property", "operations"],
  unitField: "business_unit_id",
  titleField: "room_id",
  searchFields: ["notes"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "room_id", label: "Room", type: "relation", entity: "rooms", required: true },
    { name: "items", label: "Refilled", type: "multiselect", options: AMENITY_ITEMS, required: true, wide: true },
    { name: "water_bottles", label: "Water bottles placed", type: "number", min: 0 },
    { name: "done_by", label: "Done by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "room_id", "items", "water_bottles", "done_by"],
});
