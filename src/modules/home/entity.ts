import { LayoutGrid, CalendarDays } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/** Which departments see each Home card (Administration → Home cards). */
export const homeCards = defineEntity({
  name: "home-cards",
  label: "Home cards",
  labelSingular: "Home card",
  icon: LayoutGrid,
  table: "home_cards",
  teams: ["operations"],
  hidden: true,
  titleField: "card",
  searchFields: ["card"],
  defaultSort: { field: "card", dir: "asc" },
  fields: [
    { name: "card", label: "Card", type: "text", required: true },
    { name: "departments", label: "Departments", type: "multiselect", hidden: true },
  ],
  listColumns: ["card"],
});

/** HR shift roster: one row per staff member per day that differs from their usual shifts (or is a day off). */
export const shiftRoster = defineEntity({
  name: "shift-roster",
  label: "Shift roster",
  labelSingular: "Roster day",
  icon: CalendarDays,
  table: "shift_roster",
  teams: ["hr"],
  hidden: true,
  titleField: "date",
  searchFields: ["note"],
  defaultSort: { field: "date", dir: "asc" },
  fields: [
    { name: "staff_id", label: "Staff", type: "relation", entity: "staff", required: true },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "off", label: "Day off", type: "boolean", default: false },
    { name: "shift1_start", label: "Shift 1 starts", type: "text" },
    { name: "shift1_end", label: "Shift 1 ends", type: "text" },
    { name: "shift2_start", label: "Shift 2 starts", type: "text" },
    { name: "shift2_end", label: "Shift 2 ends", type: "text" },
    { name: "note", label: "Note", type: "text" },
  ],
  listColumns: ["date", "staff_id", "off"],
});
