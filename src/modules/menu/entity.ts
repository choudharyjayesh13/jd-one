import { BookOpen } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { MenuToday } from "./MenuToday";

export const MENU_CATEGORIES = ["Combos", "Breakfast", "Soup & Chakna", "Starters", "Main Course", "Dal & Rice", "Breads", "Pizza, Pasta & Sandwich", "Fixed Meal", "Dessert", "Hot Beverages", "Cold Beverages", "Bar", "Other"] as const;

/** Restaurant menu (Lake City Cafe). KOT orders and the guest app menu read it live; the chef and office manage it. */
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
  // Chef (role "staff", designation Chef) edits too — the database only allows the chef + office (jdone.is_kitchen()).
  permissions: { create: ["owner", "manager", "hr", "staff"], update: ["owner", "manager", "hr", "staff"], delete: ["owner"] },
  listExtra: MenuToday,
  fields: [
    { name: "name", label: "Dish", type: "text", required: true },
    { name: "category", label: "Category", type: "select", options: MENU_CATEGORIES, required: true, default: "Main Course" },
    { name: "price", label: "Rate (₹)", type: "money", required: true, min: 0 },
    { name: "description", label: "What's included / notes", type: "textarea" },
    { name: "veg", label: "Veg", type: "boolean", default: true },
    { name: "active", label: "Available today", type: "boolean", default: true, help: "Switch off when a dish is not available — hides it from the guest app menu and KOT orders" },
    { name: "sort", label: "Order", type: "number", default: 100 },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["name", "category", "price", "active"],
});
