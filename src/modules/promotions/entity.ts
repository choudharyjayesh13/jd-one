import { BadgePercent } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { UNIT_TYPES } from "@/modules/bookings/entity";

const WRITE_ROLES = ["owner", "manager", "marketing"] as const;
/** The discount families AsiaTech offers, so every offer we run has a home here. */
export const OFFER_TYPES = ["Seasonal offer", "Coupon code", "Early bird", "Last minute", "Long stay", "Bulk booking", "Loyalty", "Meals", "Limited offer", "OTA discount", "Special user"] as const;

/** Offers / coupon codes (AsiaTech "Promotions"): applied by staff when quoting or on the website. */
export const promotions = defineEntity({
  name: "promotions",
  label: "Promotions",
  labelSingular: "Promotion",
  icon: BadgePercent,
  table: "promotions",
  teams: ["property", "marketing"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "code"],
  defaultSort: { field: "date_from", dir: "desc" },
  unique: [["code"]],
  permissions: { create: [...WRITE_ROLES], update: [...WRITE_ROLES], delete: ["owner", "manager"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true, placeholder: "Monsoon 10% off" },
    { name: "offer_type", label: "Offer type", type: "select", options: OFFER_TYPES, required: true, default: "Seasonal offer" },
    { name: "code", label: "Coupon code", type: "text", placeholder: "UDAISAROVAR10", help: "Only for Coupon code offers" },
    { name: "business_unit_id", label: "Property", type: "relation", entity: "business-units", required: true },
    { name: "kind", label: "Discount type", type: "select", options: ["Percent", "Flat per night", "Free night"], default: "Percent", required: true },
    { name: "value", label: "Value", type: "number", min: 0, help: "10 = 10% or ₹10 depending on type" },
    { name: "unit_type", label: "Room type", type: "select", options: ["All", ...UNIT_TYPES], default: "All" },
    { name: "date_from", label: "Stay from", type: "date", required: true, default: todayISO },
    { name: "date_to", label: "Stay to", type: "date", required: true },
    { name: "min_nights", label: "Minimum nights", type: "number", min: 1, default: 1 },
    { name: "channel", label: "Channel", type: "select", options: ["All channels", "Direct / website", "OTAs (AsiaTech)", "Walk-in"], default: "All channels" },
    { name: "active", label: "Active", type: "boolean", default: true },
    { name: "terms", label: "Terms", type: "textarea" },
  ],
  listColumns: ["name", "offer_type", "code", "kind", "value", "date_from", "date_to", "active"],
});
