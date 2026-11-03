import { Star } from "lucide-react";
import { defineEntity, type FieldValues } from "@/core/schema/types";
import { todayISO } from "@/core/format";

const rating = (name: string, label: string) => ({ name, label, type: "number" as const, min: 1, max: 5, help: "1 = poor · 5 = excellent" });
function average(v: FieldValues): number | null {
  const xs = ["rating_overall", "rating_food", "rating_room", "rating_service"].map((k) => Number(v[k])).filter((n) => n >= 1 && n <= 5);
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
}

/** What guests say: ratings out of 5, comments, and whether someone followed up. */
export const guestFeedback = defineEntity({
  name: "guest-feedback",
  label: "Guest feedback",
  labelSingular: "Guest feedback",
  icon: Star,
  table: "guest_feedback",
  teams: ["property", "operations", "marketing"],
  unitField: "business_unit_id",
  titleField: "guest_name",
  searchFields: ["guest_name", "comments"],
  defaultSort: { field: "date", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "booking_id", label: "Booking", type: "relation", entity: "bookings" },
    { name: "guest_name", label: "Guest", type: "text", required: true },
    { name: "source", label: "Given via", type: "select", options: ["In person", "WhatsApp", "Phone call", "Google review", "OTA review", "Guest app"], default: "In person" },
    rating("rating_overall", "Overall"),
    rating("rating_food", "Food"),
    rating("rating_room", "Room & cleanliness"),
    rating("rating_service", "Service & staff"),
    { name: "average", label: "Average", type: "number", computed: average },
    { name: "comments", label: "What they said", type: "textarea", wide: true },
    { name: "would_return", label: "Would come again / recommend", type: "boolean", default: true },
    { name: "follow_up", label: "Needs follow-up", type: "boolean", default: false },
    { name: "followed_up_by", label: "Followed up by", type: "relation", entity: "staff" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["date", "guest_name", "average", "rating_food", "rating_room", "rating_service", "follow_up"],
  hooks: {
    async beforeSave(values, ctx) {
      const out = { ...values };
      if (out.booking_id && !out.guest_name) {
        const b = await ctx.store.get("bookings", String(out.booking_id));
        if (b) out.guest_name = b.guest_name;
      }
      return out;
    },
  },
});
