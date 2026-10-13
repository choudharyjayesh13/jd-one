import { MoonStar } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

/**
 * Evening shift close (end of Shift 2). One per business unit per day: cash, gas, water,
 * the inventory check and anything broken/missing. Vehicles are logged in "Vehicle km & petrol";
 * the bijli meter reading also goes into the daily report.
 */
export const shiftCloses = defineEntity({
  name: "shift-closes",
  label: "Evening shift close",
  labelSingular: "Shift close",
  icon: MoonStar,
  table: "shift_closes",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "date",
  searchFields: ["date", "inventory_notes", "issues"],
  defaultSort: { field: "date", dir: "desc" },
  unique: [["date", "business_unit_id"]],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "closed_by", label: "Closed by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "cash_in_hand", label: "Cash in hand (₹)", type: "money", min: 0, required: true },
    { name: "rooms_occupied", label: "Rooms occupied tonight", type: "number", min: 0 },
    { name: "electricity_closing", label: "Bijli meter reading now", type: "number", min: 0, step: 0.01, help: "Same number goes into today's daily report (closing)." },
    { name: "gas_full", label: "Gas cylinders — full", type: "number", min: 0 },
    { name: "gas_empty", label: "Gas cylinders — empty", type: "number", min: 0 },
    { name: "water_jars", label: "Water jars in stock", type: "number", min: 0 },
    { name: "inventory_ok", label: "Inventory checked & all OK", type: "boolean", default: true },
    { name: "inventory_notes", label: "Inventory count / shortages", type: "textarea", wide: true, placeholder: "Towels 40, bedsheets 32, mineral water 3 cases, beer 2 cases…" },
    { name: "issues", label: "Broken / missing / problems", type: "textarea", wide: true },
    { name: "photos", label: "Photos", type: "files", help: "Cash, meter, store room, anything broken" },
  ],
  listColumns: ["date", "business_unit_id", "cash_in_hand", "electricity_closing", "gas_full", "inventory_ok", "closed_by"],
});
