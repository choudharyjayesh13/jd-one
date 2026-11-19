import { Smartphone } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

const OFFICE = ["owner", "manager", "hr"] as const;

/** What guests see in the guest app (app.myjdgroup.com/guest/): properties, rules, timings, inclusions, experiences, today's combos. */
export const guestInfo = defineEntity({
  name: "guest-info",
  label: "Guest app content",
  labelSingular: "Guest app item",
  icon: Smartphone,
  table: "guest_info",
  teams: ["operations", "marketing"],
  unitField: "business_unit_id",
  titleField: "title",
  searchFields: ["title", "body", "section"],
  defaultSort: { field: "section", dir: "asc" },
  secondarySort: { field: "sort", dir: "asc" },
  permissions: { read: [...OFFICE], create: [...OFFICE], update: [...OFFICE], delete: ["owner"] },
  fields: [
    { name: "section", label: "Section", type: "select", options: ["Combo", "Experience", "Included", "Timing", "Rule", "How-to", "Property"], required: true, default: "Experience", help: "Combo = shown under Today (set dates for a one-day offer)" },
    { name: "title", label: "Title", type: "text", required: true },
    { name: "body", label: "Details", type: "textarea" },
    { name: "price", label: "Price", type: "text", placeholder: "₹2,500 · Price on request" },
    { name: "photo", label: "Photo", type: "file" },
    { name: "active", label: "Show to guests", type: "boolean", default: true, help: "Items marked [DRAFT] are hidden until you check and switch this on" },
    { name: "valid_from", label: "Show from", type: "date" },
    { name: "valid_to", label: "Show until", type: "date" },
    { name: "sort", label: "Order", type: "number", default: 100 },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units" },
  ],
  listColumns: ["section", "title", "price", "active", "valid_from", "valid_to"],
});
