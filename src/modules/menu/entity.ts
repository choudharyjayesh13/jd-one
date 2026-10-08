import { BookOpen } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

export const MENU_CATEGORIES = ["Breakfast", "Soup & Chakna", "Starters", "Main Course", "Dal & Rice", "Breads", "Pizza, Pasta & Sandwich", "Fixed Meal", "Dessert", "Hot Beverages", "Cold Beverages", "Bar", "Other"] as const;

/** Restaurant menu (Lake City Cafe). KOT orders pick dishes and rates from here; office staff update rates. */
export const menuItems = defineEntity({
  name: "menu",
  label: "Menu & rates",
  labelSingular: "Menu item",
  icon: BookOpen,
  table: "menu_items",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "category", "description"],
  defaultSort: { field: "sort", dir: "asc" },
  permissions: { create: ["owner", "manager", "hr"], update: ["owner", "manager", "hr"], delete: ["owner"] },
  fields: [
    { name: "name", label: "Dish", type: "text", required: true },
    { name: "category", label: "Category", type: "select", options: MENU_CATEGORIES, required: true, default: "Main Course" },
    { name: "price", label: "Rate (₹)", type: "money", required: true, min: 0 },
    { name: "description", label: "What's included / notes", type: "textarea" },
    { name: "veg", label: "Veg", type: "boolean", default: true },
    { name: "active", label: "On the menu", type: "boolean", default: true, help: "Switch off to hide a dish from KOT orders" },
    { name: "sort", label: "Order", type: "number", default: 100 },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["name", "category", "price", "active"],
});
