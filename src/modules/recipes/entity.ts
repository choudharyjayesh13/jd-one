import { ChefHat } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { RecipeForm } from "./RecipeForm";
import { batchCost, foodCostPct, portionCost, recipeLines } from "./lines";

/**
 * Recipe of a menu dish: ingredients from stock for a batch of `portions`.
 * Shows cost per portion and food cost %. When a KOT with this dish is
 * Served, the database takes the ingredients off stock (per portion × qty).
 */
export const recipes = defineEntity({
  name: "recipes",
  label: "Recipes & costing",
  labelSingular: "Recipe",
  icon: ChefHat,
  table: "recipes",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "method"],
  defaultSort: { field: "name", dir: "asc" },
  unique: [["menu_id"]],
  customForm: RecipeForm,
  fields: [
    { name: "name", label: "Dish", type: "text", required: true },
    { name: "menu_id", label: "Menu dish", type: "relation", entity: "menu", help: "Link it so orders take ingredients off stock" },
    { name: "portions", label: "Makes (portions)", type: "number", min: 1, default: 1, required: true },
    { name: "lines", label: "Ingredients", type: "multiselect", options: [], hidden: true },
    { name: "ingredients", label: "Ingredients", type: "text", virtual: true, computed: (v) => recipeLines(v).map((l) => `${l.qty} ${l.unit} ${l.item}`.replace(/\s+/g, " ")).join(", ") },
    { name: "menu_price", label: "Selling price (₹)", type: "money", min: 0 },
    { name: "batch_cost", label: "Batch cost", type: "money", virtual: true, computed: (v) => Math.round(batchCost(v)) },
    { name: "portion_cost", label: "Cost / portion", type: "money", virtual: true, computed: (v) => Math.round(portionCost(v)) },
    { name: "food_cost_pct", label: "Food cost %", type: "number", virtual: true, computed: (v) => foodCostPct(v) },
    { name: "method", label: "Method / notes", type: "textarea", wide: true },
    { name: "active", label: "Use for stock", type: "boolean", default: true, help: "Off = costing only, no stock deduction" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["name", "portions", "portion_cost", "menu_price", "food_cost_pct", "active"],
});
