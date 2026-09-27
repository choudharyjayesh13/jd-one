/**
 * Route helpers. Static export cannot pre-render unknown ids, so detail pages
 * live at /[entity]/view/?id=… (query string, resolved client-side).
 */
export const listHref = (entity: string) => `/${entity}/`;
export const newHref = (entity: string, prefill?: Record<string, unknown>) => {
  const qs = prefill ? toQuery(prefill) : "";
  return `/${entity}/new/${qs ? `?${qs}` : ""}`;
};
export const viewHref = (entity: string, id: string, extra?: Record<string, unknown>) => `/${entity}/view/?${toQuery({ id, ...extra })}`;

function toQuery(obj: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
}
