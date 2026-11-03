/** Ingredient lines of a recipe (recipes.lines) and its cost maths. */
export interface RecipeLine {
  stock_id: string | null;
  item: string;
  unit: string;
  /** Quantity for the whole batch (the recipe makes `portions` portions). */
  qty: number;
  /** ₹ per unit of the stock item. */
  cost: number;
}

export function recipeLines(r: Record<string, unknown>): RecipeLine[] {
  const raw = r.lines;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({ stock_id: l.stock_id ? String(l.stock_id) : null, item: String(l.item ?? ""), unit: String(l.unit ?? ""), qty: Number(l.qty) || 0, cost: Number(l.cost) || 0 }))
    .filter((l) => l.item && l.qty > 0);
}

export function batchCost(r: Record<string, unknown>): number {
  return recipeLines(r).reduce((s, l) => s + l.qty * l.cost, 0);
}

export function portionCost(r: Record<string, unknown>): number {
  return batchCost(r) / Math.max(1, Number(r.portions) || 1);
}

/** Food cost % of the selling price (null when no price). */
export function foodCostPct(r: Record<string, unknown>): number | null {
  const price = Number(r.menu_price) || 0;
  return price > 0 ? Math.round((portionCost(r) / price) * 1000) / 10 : null;
}
