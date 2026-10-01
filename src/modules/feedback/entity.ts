import { MessageSquareHeart } from "lucide-react";
import { ALL_ROLES, defineEntity, type Row } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { normalizePhone } from "@/core/phone";

export const FEEDBACK_ASPECTS = ["Service", "Product quality", "Cleanliness", "Food", "Staff behaviour", "Value for money", "Speed", "Ambience", "Location"] as const;
export const FEEDBACK_MOODS = ["Delighted", "Happy", "Okay", "Disappointed", "Upset"] as const;
export const FEEDBACK_STATUSES = ["Requested", "Received", "Actioned"] as const;

/** WhatsApp text asking a recently served customer for feedback (reply with 1–5 + a line). */
export function feedbackRequestMessage(customerName: unknown, businessName: unknown, what: unknown): string {
  const first = String(customerName ?? "").split(" ")[0] || "there";
  return [
    `Namaste ${first}, thank you for choosing ${String(businessName ?? "us")}${what ? ` (${what})` : ""}.`,
    ``,
    `How was it? Please reply with a rating from 1 to 5 and one line on what we should keep or improve.`,
    `Your feedback goes straight to the owner and helps the JD One network suggest the right places for you next time.`,
  ].join("\n");
}

/** Average network rating per business from received feedback. */
export function networkRatings(rows: Row[]): Map<string, { avg: number; count: number }> {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    if (r.status === "Requested" || !r.rating) continue;
    const k = String(r.business_unit_id);
    const a = acc.get(k) ?? { sum: 0, count: 0 };
    a.sum += Number(r.rating);
    a.count++;
    acc.set(k, a);
  }
  return new Map(Array.from(acc.entries()).map(([k, a]) => [k, { avg: Math.round((a.sum / a.count) * 10) / 10, count: a.count }]));
}

/**
 * Customer feedback after a stay, order or service. Requested from bookings and
 * network orders; the rating feeds the member's network score and the
 * recommendations shown to other customers.
 */
export const feedback = defineEntity({
  name: "feedback",
  label: "Customer feedback",
  labelSingular: "Feedback",
  icon: MessageSquareHeart,
  table: "feedback",
  teams: ["property", "operations", "marketing"],
  unitField: "business_unit_id",
  titleField: "customer_name",
  searchFields: ["customer_name", "phone", "comments", "what"],
  defaultSort: { field: "created_at", dir: "desc" },
  permissions: { read: ALL_ROLES, create: ALL_ROLES, update: ALL_ROLES, delete: ["owner", "manager"] },
  fields: [
    { name: "business_unit_id", label: "Business", type: "relation", entity: "business-units", required: true },
    { name: "customer_name", label: "Customer", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "customer_id", label: "Customer record", type: "relation", entity: "customers" },
    { name: "booking_id", label: "Booking", type: "relation", entity: "bookings" },
    { name: "order_id", label: "Order", type: "relation", entity: "orders" },
    { name: "what", label: "What they bought / used", type: "text", placeholder: "2-night stay, kids shoes, haircut…" },
    { name: "date", label: "Date served", type: "date", default: todayISO },
    { name: "status", label: "Status", type: "select", options: FEEDBACK_STATUSES, default: "Received", required: true },
    { name: "rating", label: "Rating (1–5)", type: "number", min: 1, max: 5 },
    { name: "mood", label: "How they felt", type: "select", options: FEEDBACK_MOODS },
    { name: "liked", label: "What they liked", type: "multiselect", options: FEEDBACK_ASPECTS, wide: true },
    { name: "improve", label: "What to improve", type: "multiselect", options: FEEDBACK_ASPECTS, wide: true },
    { name: "comments", label: "Their words", type: "textarea", wide: true },
    { name: "would_recommend", label: "Would recommend", type: "boolean" },
    { name: "action_taken", label: "Action taken", type: "textarea", help: "What the business changed because of this" },
  ],
  listColumns: ["date", "business_unit_id", "customer_name", "rating", "mood", "status", "what"],
  hooks: {
    beforeSave: (v) => ({ ...v, phone: v.phone ? normalizePhone(v.phone) || v.phone : null }),
    async afterCreate(r, ctx) {
      // Learn the customer's taste: remember what they liked for future recommendations.
      if (!r.customer_id || r.status === "Requested") return;
      const c = await ctx.store.get("customers", String(r.customer_id));
      if (!c) return;
      const unit = await ctx.store.get("business-units", String(r.business_unit_id));
      const note = `${todayISO()}: ${unit?.name ?? "business"} ${r.rating ? `${r.rating}/5` : ""}${Array.isArray(r.liked) && r.liked.length ? ` · liked ${r.liked.join(", ")}` : ""}${r.mood ? ` · ${r.mood}` : ""}`.trim();
      const interests = new Set<string>(Array.isArray(c.interests) ? (c.interests as string[]) : []);
      if (Number(r.rating) >= 4 && unit?.service_category) interests.add(String(unit.service_category));
      await ctx.store.update("customers", c.id, { preferences: [c.preferences, note].filter(Boolean).join("\n"), interests: Array.from(interests) });
    },
  },
});
