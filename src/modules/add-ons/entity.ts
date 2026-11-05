import { PackagePlus } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

const WRITE_ROLES = ["owner", "manager"] as const;

/** Add-on services sold with a stay (AsiaTech "Add On Services"): bonfire, boating, candle-light dinner, airport pickup… */
export const addOns = defineEntity({
  name: "add-ons",
  label: "Add-on services",
  labelSingular: "Add-on",
  icon: PackagePlus,
  table: "add_ons",
  teams: ["property"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "description"],
  defaultSort: { field: "name", dir: "asc" },
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner", "manager"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true, placeholder: "Bonfire, Candle-light dinner, Airport pickup" },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "price", label: "Price", type: "money", required: true, min: 0 },
    { name: "per", label: "Charged per", type: "select", options: ["Booking", "Night", "Person", "Person per night"], default: "Booking" },
    { name: "tax_pct", label: "GST %", type: "number", min: 0, max: 28, default: 18 },
    { name: "quantity", label: "Available per day", type: "number", min: 0, help: "Leave blank for unlimited" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "image", label: "Photo", type: "file" },
    { name: "active", label: "Active", type: "boolean", default: true },
  ],
  listColumns: ["name", "price", "per", "tax_pct", "business_unit_id", "active"],
});
