import { Truck } from "lucide-react";
import { ALL_ROLES, defineEntity } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";
import { INDIAN_STATES } from "@/modules/business-units/entity";

export const VENDOR_CATEGORIES = [
  "Milk & dairy", "Vegetables & fruits", "Groceries", "Meat & poultry", "Bakery", "Water / RO", "LPG gas", "Laundry", "Linen supply",
  "Cleaning & housekeeping", "Pest control", "Plumber", "Electrician", "Carpenter", "AC repair", "Generator / DG", "Painter",
  "Taxi / transport", "Tent & decor", "Florist", "Printing", "Hardware", "Furniture", "Security guards", "Waste pickup", "Other",
] as const;

/**
 * Vendor directory: day-to-day suppliers each city's members can call. Shared across
 * the network (not owned by one business), filtered State → District → City.
 */
export const vendors = defineEntity({
  name: "vendors",
  label: "Vendor directory",
  labelSingular: "Vendor",
  icon: Truck,
  table: "vendors",
  teams: ["property", "operations", "accounts"],
  titleField: "name",
  searchFields: ["name", "category", "contact_person", "phone", "city", "area"],
  defaultSort: { field: "category", dir: "asc" },
  secondarySort: { field: "name", dir: "asc" },
  permissions: { read: ALL_ROLES, create: ALL_ROLES, update: ALL_ROLES, delete: ["owner", "manager"] },
  fields: [
    { name: "name", label: "Vendor / shop name", type: "text", required: true },
    { name: "category", label: "Category", type: "select", options: VENDOR_CATEGORIES, required: true },
    { name: "contact_person", label: "Contact person", type: "text" },
    { name: "phone", label: "Mobile", type: "phone", required: true },
    { name: "whatsapp", label: "WhatsApp", type: "phone", help: "Leave empty if same as mobile" },
    { name: "state", label: "State", type: "select", options: INDIAN_STATES, required: true, default: "Rajasthan" },
    { name: "district", label: "District", type: "text", required: true, default: "Udaipur" },
    { name: "city", label: "City", type: "text", required: true, default: "Udaipur" },
    { name: "area", label: "Area / locality", type: "text" },
    { name: "delivers", label: "Delivers to site", type: "boolean", default: true },
    { name: "rating", label: "Our rating (1–5)", type: "number", min: 1, max: 5 },
    { name: "network_member_id", label: "Network member", type: "relation", entity: "business-units", help: "If this vendor is also a JD One member" },
    { name: "recommended_by", label: "Recommended by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "active", label: "Active", type: "boolean", default: true },
    { name: "notes", label: "Notes / rates", type: "textarea" },
  ],
  listColumns: ["name", "category", "phone", "city", "district", "state", "rating", "active"],
  hooks: {
    beforeSave: (v) => ({ ...v, phone: normalizePhone(v.phone) || v.phone, whatsapp: v.whatsapp ? normalizePhone(v.whatsapp) || v.whatsapp : null }),
  },
});
