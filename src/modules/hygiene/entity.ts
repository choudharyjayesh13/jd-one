import { ShieldCheck } from "lucide-react";
import { defineEntity, type FieldValues } from "@/core/schema/types";
import { todayISO } from "@/core/format";

/** All checks ticked and fridge ≤ 5 °C, freezer ≤ −15 °C. */
function allOk(v: FieldValues): boolean {
  const ticks = ["kitchen_clean", "utensils_clean", "staff_hygiene", "storage_ok", "pest_free"].every((k) => v[k] === true);
  const fridge = v.fridge_temp === null || v.fridge_temp === undefined || v.fridge_temp === "" || Number(v.fridge_temp) <= 5;
  const freezer = v.freezer_temp === null || v.freezer_temp === undefined || v.freezer_temp === "" || Number(v.freezer_temp) <= -15;
  return ticks && fridge && freezer;
}

/** Kitchen hygiene checklist, morning and evening (FSSAI-style). */
export const hygieneChecks = defineEntity({
  name: "hygiene-checks",
  label: "Hygiene checklist",
  labelSingular: "Hygiene check",
  icon: ShieldCheck,
  table: "hygiene_checks",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "date",
  searchFields: ["issues"],
  defaultSort: { field: "date", dir: "desc" },
  unique: [["business_unit_id", "date", "shift"]],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "shift", label: "Shift", type: "select", options: ["Morning", "Evening"], required: true, default: "Morning" },
    { name: "fridge_temp", label: "Fridge °C", type: "number", step: 0.5, help: "Should be 5 °C or below" },
    { name: "freezer_temp", label: "Freezer °C", type: "number", step: 0.5, help: "Should be −15 °C or below" },
    { name: "kitchen_clean", label: "Kitchen, slabs & floor clean", type: "boolean", default: false },
    { name: "utensils_clean", label: "Utensils washed & dried", type: "boolean", default: false },
    { name: "staff_hygiene", label: "Staff: cap, apron, gloves, clean hands", type: "boolean", default: false },
    { name: "storage_ok", label: "Food covered, labelled, raw & cooked apart", type: "boolean", default: false },
    { name: "pest_free", label: "No pests / pest control up to date", type: "boolean", default: false },
    { name: "all_ok", label: "All OK", type: "boolean", computed: allOk },
    { name: "issues", label: "Issues found", type: "textarea", wide: true },
    { name: "photo", label: "Photo", type: "file" },
    { name: "checked_by", label: "Checked by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "shift", "all_ok", "fridge_temp", "freezer_temp", "checked_by", "issues"],
});
