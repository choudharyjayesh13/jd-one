import { Armchair } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const ASSET_CATEGORIES = ["Furniture", "Electronics & appliances", "Kitchen equipment", "Rooms & linen", "Pool & garden", "Office", "Bar & beverages", "Vehicles & generator", "Other"] as const;

/** Everything the property owns: count, condition, where it is, and photos of each item. */
export const propertyAssets = defineEntity({
  name: "property-assets",
  label: "Property assets",
  labelSingular: "Asset",
  icon: Armchair,
  table: "property_assets",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "category", "location", "notes"],
  defaultSort: { field: "item_no", dir: "asc" },
  permissions: { delete: ["owner"] },
  fields: [
    { name: "item_no", label: "No.", type: "number", min: 0 },
    { name: "name", label: "Item", type: "text", required: true },
    { name: "category", label: "Category", type: "select", options: ASSET_CATEGORIES, required: true, default: "Furniture" },
    { name: "quantity", label: "Quantity", type: "number", required: true, min: 0, default: 1 },
    { name: "unit", label: "Unit", type: "text", default: "pcs" },
    { name: "condition", label: "Condition", type: "select", options: ["Good", "Needs repair", "Damaged", "Missing"], required: true, default: "Good" },
    { name: "photos", label: "Photos", type: "files", help: "Take or upload photos of this item (all pieces if possible)" },
    { name: "location", label: "Where is it", type: "text", placeholder: "Kitchen, Cottage 2, Pool side…" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "last_checked", label: "Last checked", type: "date", default: todayISO },
    { name: "purchase_date", label: "Bought on", type: "date" },
    { name: "value", label: "Value (₹)", type: "money", min: 0 },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["item_no", "name", "quantity", "category", "condition", "location", "last_checked"],
});
